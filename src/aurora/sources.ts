import { parseIndexXml, type XmlApi } from "./parse";

export type TextFetcher = (url: string) => Promise<string>;

export interface IndexNode {
  url: string;
  name: string;
  description: string;
  version: string;
  /** Element file urls listed directly in this index. */
  files: string[];
  children: IndexNode[];
}

/** Everything the app remembers about a content link the user added. */
export interface SourceConfig {
  /** Url of the root .index file, for example .../AuroraLegacy.index. Local sources use local://name. */
  url: string;
  name: string;
  /** "link" sources update from their url, "local" ones come from files on this computer. */
  kind: "link" | "local";
  /** How the files are read. Aurora element XML is the default; "5etools" files are JSON converted on load. */
  format?: "aurora" | "5etools";
  /** For 5etools sources fetched from an address, so they can be refreshed from it. */
  baseUrl?: string;
  /** The crawled index tree, kept so the content loads offline. */
  tree?: IndexNode;
  /** Index urls the user switched off. A disabled index disables everything under it. */
  disabled: string[];
  /** Version of each index at the last sync, keyed by index url. */
  versions: Record<string, string>;
  lastChecked: number;
  fileCount: number;
}

export interface FileCache {
  get(url: string): Promise<string | undefined>;
  put(url: string, text: string, root: string): Promise<void>;
  /** All cached file urls for this source root. */
  keys(root: string): Promise<string[]>;
  remove(url: string): Promise<void>;
}

export interface Progress {
  phase: "indexes" | "files";
  done: number;
  total: number;
  note?: string;
}

const isIndex = (u: string) => u.split("?")[0].toLowerCase().endsWith(".index");

/** Walks an index and the indexes it lists. A failing sub-index is skipped, not fatal. */
export async function crawlIndex(
  url: string,
  fetchText: TextFetcher,
  xml: XmlApi,
  onProgress?: (p: Progress) => void,
  seen: Set<string> = new Set(),
): Promise<IndexNode> {
  seen.add(url);
  const parsed = parseIndexXml(await fetchText(url), xml);
  const node: IndexNode = {
    url,
    name: parsed.name || url.split("/").pop()!.replace(/\.index$/, ""),
    description: parsed.description,
    version: parsed.version,
    files: [],
    children: [],
  };
  onProgress?.({ phase: "indexes", done: seen.size, total: seen.size, note: node.name });
  const kids: string[] = [];
  for (const f of parsed.files) {
    if (isIndex(f.url)) {
      if (!seen.has(f.url) && f.url !== url) kids.push(f.url);
    } else node.files.push(f.url);
  }
  // Sub-indexes are fetched in parallel; each is independent.
  const results = await Promise.all(
    kids.map(async (k) => {
      if (seen.has(k)) return null;
      seen.add(k);
      try {
        return await crawlIndex(k, fetchText, xml, onProgress, seen);
      } catch {
        return null;
      }
    }),
  );
  node.children = results.filter((x): x is IndexNode => !!x);
  return node;
}

/** Enabled indexes in load order: an index's own files come before its children's. */
export function flatten(node: IndexNode, disabled: ReadonlySet<string>): IndexNode[] {
  if (disabled.has(node.url)) return [];
  return [node, ...node.children.flatMap((c) => flatten(c, disabled))];
}

export function countFiles(node: IndexNode, disabled: ReadonlySet<string> = new Set()): number {
  return flatten(node, disabled).reduce((n, i) => n + i.files.length, 0);
}

export interface SyncResult {
  downloaded: number;
  reused: number;
  failed: string[];
  /** Index urls whose version differed from the last sync. */
  changed: string[];
  versions: Record<string, string>;
}

async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Brings the cache in line with the index tree: downloads files of indexes whose version changed (or that
 * are missing from the cache), keeps the rest, and drops files no index lists any more.
 */
export async function syncFiles(opts: {
  root: IndexNode;
  disabled: string[];
  previousVersions: Record<string, string>;
  cache: FileCache;
  fetchText: TextFetcher;
  force?: boolean;
  concurrency?: number;
  onProgress?: (p: Progress) => void;
}): Promise<SyncResult> {
  const disabled = new Set(opts.disabled);
  const enabled = flatten(opts.root, disabled);
  const all = flatten(opts.root, new Set());
  const result: SyncResult = { downloaded: 0, reused: 0, failed: [], changed: [], versions: {} };
  const todo: string[] = [];
  const wanted = new Set<string>();

  for (const idx of enabled) {
    const stale = opts.force || opts.previousVersions[idx.url] !== idx.version;
    if (stale && opts.previousVersions[idx.url] !== undefined && opts.previousVersions[idx.url] !== idx.version) result.changed.push(idx.url);
    for (const f of idx.files) {
      wanted.add(f);
      if (stale || (await opts.cache.get(f)) === undefined) todo.push(f);
      else result.reused++;
    }
    result.versions[idx.url] = idx.version;
  }
  // Keep the version memory of switched-off indexes so re-enabling one does not look like an update.
  for (const idx of all) if (!(idx.url in result.versions) && idx.url in opts.previousVersions) result.versions[idx.url] = opts.previousVersions[idx.url];
  const listed = new Set(all.flatMap((i) => i.files));

  let done = 0;
  await pool([...new Set(todo)], opts.concurrency ?? 6, async (url) => {
    try {
      let text: string;
      try {
        text = await opts.fetchText(url);
      } catch {
        text = await opts.fetchText(url); // one retry
      }
      await opts.cache.put(url, text, opts.root.url);
      result.downloaded++;
    } catch {
      result.failed.push(url);
      // A failed refresh keeps the stale copy, but forget the version so the next check retries.
      for (const idx of enabled) if (idx.files.includes(url)) delete result.versions[idx.url];
    }
    opts.onProgress?.({ phase: "files", done: ++done, total: todo.length, note: url.split("/").pop() });
  });

  for (const key of await opts.cache.keys(opts.root.url)) if (!listed.has(key)) await opts.cache.remove(key);
  return result;
}
