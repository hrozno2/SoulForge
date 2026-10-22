import { browserXml, parseElementsXml, type XmlApi } from "./parse";
import { ARegistry } from "./registry";
import { crawlIndex, countFiles, flatten, syncFiles, type IndexNode, type Progress, type SourceConfig, type SyncResult, type TextFetcher } from "./sources";
import { idbFileCache, readFiles, saveSource } from "./storage";
import type { AElement } from "./types";
import { FIVETOOLS_CORE_FILES, FIVETOOLS_EXTRA_FILES, convertFiveTools } from "./fivetools";

export const DEFAULT_LINK = "https://raw.githubusercontent.com/AuroraLegacy/elements/master/AuroraLegacy.index";

export const fetchText: TextFetcher = async (url) => {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
};

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Parses every cached file of every enabled index, in load order, into one registry. */
declare const __BUILD_ID__: string;

/** A short hash of a text (FNV-1a), for cache keys. */
function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/** The time each step of the last content load took, in milliseconds. */
export let lastLoadTimes: Record<string, number> = {};

export async function buildRegistry(
  sources: SourceConfig[],
  xml: XmlApi = browserXml(),
  onProgress?: (done: number, total: number) => void,
): Promise<{ reg: ARegistry; errors: string[] }> {
  const reg = new ARegistry();
  const errors: string[] = [];
  // How long each step takes, for the launch-time budget (printed to the console, kept in lastLoadTimes).
  const t0 = performance.now();
  const times = { read: 0, parse: 0, convert: 0, build: 0 };
  const plan: { source: SourceConfig; urls: string[] }[] = [];
  let total = 0;
  for (const s of sources) {
    if (!s.tree) continue;
    const urls = flatten(s.tree, new Set(s.disabled)).flatMap((i) => i.files);
    plan.push({ source: s, urls });
    total += urls.length;
  }
  let n = 0;
  for (const { source, urls } of plan) {
    if (source.format === "5etools") {
      // The converted elements are kept, and reused while the source, its files and the app build are the same:
      // converting is most of a launch's work (a few seconds), reading the kept result a fraction of it.
      const cacheUrl = `${source.url}#converted`;
      const cacheKey = `${__BUILD_ID__}|${source.lastChecked}|${source.fileCount}|${urls.length}|${hashText(urls.join("\n"))}`;
      let t = performance.now();
      const kept = await idbFileCache.get(cacheUrl).catch(() => undefined);
      if (kept) {
        try {
          const saved = JSON.parse(kept) as { key: string; elements: AElement[] };
          if (saved.key === cacheKey) {
            reg.addElements(saved.elements);
            times.read += performance.now() - t;
            n += urls.length;
            onProgress?.(n, total);
            continue;
          }
        } catch {
          /* a damaged copy is converted again */
        }
      }
      // 5etools files are converted together, because classes refer to features and spell lists in other files.
      const files: Record<string, unknown> = {};
      t = performance.now();
      const texts = await readFiles(urls);
      times.read += performance.now() - t;
      t = performance.now();
      const prefix = `${source.url}/`;
      for (const u of urls) {
        const text = texts.get(u);
        if (!text) continue;
        try {
          files[u.startsWith(prefix) ? u.slice(prefix.length) : u] = JSON.parse(text);
        } catch (e) {
          errors.push(`${u.split("/").pop()}: ${(e as Error).message}`);
        }
        n++;
      }
      times.parse += performance.now() - t;
      onProgress?.(n, total);
      await tick();
      t = performance.now();
      try {
        const elements = convertFiveTools({ files });
        // Kept before the registry's build passes change them; written after the launch, off the critical path.
        const copy = JSON.stringify({ key: cacheKey, elements });
        globalThis.setTimeout(() => void idbFileCache.put(cacheUrl, copy, source.url).catch(() => undefined), 3000);
        reg.addElements(elements);
      } catch (e) {
        errors.push(`${source.name}: ${(e as Error).message}`);
      }
      times.convert += performance.now() - t;
      continue;
    }
    for (let i = 0; i < urls.length; i += 40) {
      const batch = urls.slice(i, i + 40);
      let t = performance.now();
      const texts = await readFiles(batch);
      times.read += performance.now() - t;
      t = performance.now();
      for (const u of batch) {
        const text = texts.get(u);
        if (!text) continue;
        try {
          reg.addFile(parseElementsXml(text, xml, u));
        } catch (e) {
          errors.push(`${u.split("/").pop()}: ${(e as Error).message}`);
        }
        n++;
      }
      times.parse += performance.now() - t;
      onProgress?.(n, total);
      await tick();
    }
  }
  const tb = performance.now();
  reg.build();
  times.build = performance.now() - tb;
  lastLoadTimes = { ...times, total: performance.now() - t0 };
  console.info(`[load] ${Object.entries(lastLoadTimes).map(([k, v]) => `${k} ${Math.round(v)} ms`).join(", ")}`);
  return { reg, errors };
}

export interface UpdateSummary extends SyncResult {
  config: SourceConfig;
  indexChanged: boolean;
}

/** Fetches the index tree for a link and brings the cached files up to date. */
export async function updateSource(
  cfg: SourceConfig,
  opts: { force?: boolean; onProgress?: (p: Progress) => void; xml?: XmlApi } = {},
): Promise<UpdateSummary> {
  if (cfg.kind !== "link") throw new Error("Only link sources can be updated");
  const xml = opts.xml ?? browserXml();
  const tree: IndexNode = await crawlIndex(cfg.url, fetchText, xml, opts.onProgress);
  const res = await syncFiles({
    root: tree,
    disabled: cfg.disabled,
    previousVersions: cfg.versions,
    cache: idbFileCache,
    fetchText,
    force: opts.force,
    onProgress: opts.onProgress,
  });
  const next: SourceConfig = {
    ...cfg,
    name: tree.name || cfg.name,
    tree,
    versions: res.versions,
    lastChecked: Date.now(),
    fileCount: countFiles(tree, new Set(cfg.disabled)),
  };
  await saveSource(next);
  const indexChanged = res.downloaded > 0;
  return { ...res, config: next, indexChanged };
}

export function newLinkSource(url: string): SourceConfig {
  return { url, name: url.split("/").pop() ?? url, kind: "link", disabled: [], versions: {}, lastChecked: 0, fileCount: 0 };
}

/** Auto-update is due when it has been this long since the last check. */
export const AUTO_UPDATE_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------- 5etools data

const trimSlash = (u: string) => u.replace(/\/+$/, "");

/**
 * A bestiary file cut down to its beasts (Wild Shape's forms, companions): the rest of the bestiary is for the DM and
 * would only fill the cache. Copies ("_copy") stay, since what they copy decides what they are.
 */
function beastsOnly(text: string): string {
  try {
    const json = JSON.parse(text) as { monster?: { type?: unknown; _copy?: unknown }[] };
    const isBeast = (m: { type?: unknown; _copy?: unknown }) => !!m._copy || /^beast$/i.test(String(typeof m.type === "object" && m.type ? (m.type as { type?: unknown }).type : m.type));
    return JSON.stringify({ monster: (json.monster ?? []).filter(isBeast) });
  } catch {
    return text;
  }
}

/** Fetches the files of a 5etools `data` folder from an address. Missing optional files are skipped. */
export async function fetchFiveTools(baseUrl: string, onProgress?: (p: Progress) => void): Promise<{ files: Map<string, string>; failed: string[] }> {
  const base = trimSlash(baseUrl.trim());
  const files = new Map<string, string>();
  const failed: string[] = [];
  const get = async (path: string, required = false) => {
    try {
      const text = await fetchText(`${base}/${path}`);
      files.set(path, path.startsWith("bestiary/") ? beastsOnly(text) : text);
      return true;
    } catch (e) {
      if (required) throw e;
      // The extra files are not in every copy of the data (older mirrors, trimmed sets): missing is fine.
      if (!FIVETOOLS_EXTRA_FILES.includes(path) && !/(^|\/)fluff-|^bestiary\//.test(path)) failed.push(path);
      return false;
    }
  };
  // The class and spell files are listed by index files, one entry per book.
  await get("races.json", true);
  const queue: string[] = [...FIVETOOLS_CORE_FILES.filter((f) => f !== "races.json"), ...FIVETOOLS_EXTRA_FILES];
  for (const idx of ["class/index.json", "spells/index.json", "class/fluff-index.json", "spells/fluff-index.json", "bestiary/index.json"]) {
    try {
      const list = JSON.parse(await fetchText(`${base}/${idx}`)) as Record<string, string>;
      const dir = idx.split("/")[0];
      for (const f of Object.values(list)) queue.push(`${dir}/${f}`);
    } catch {
      if (!/fluff-|bestiary/.test(idx)) failed.push(idx);
    }
  }
  let done = 0;
  const workers = Array.from({ length: 5 }, async () => {
    while (queue.length) {
      const path = queue.shift()!;
      await get(path);
      onProgress?.({ phase: "files", done: ++done, total: done + queue.length, note: path });
    }
  });
  await Promise.all(workers);
  return { files, failed };
}

/** Stores 5etools files in the cache and returns the source entry for them. */
export async function storeFiveTools(name: string, files: Map<string, string>, baseUrl?: string): Promise<SourceConfig> {
  const root = `5etools://${name}`;
  const urls: string[] = [];
  const groups = new Map<string, string[]>();
  for (const [path, text] of files) {
    const url = `${root}/${path}`;
    await idbFileCache.put(url, text, root);
    urls.push(url);
    const g = path.includes("/") ? path.split("/")[0] : "core lists";
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(url);
  }
  const children: IndexNode[] = [...groups.entries()].map(([g, list]) => ({ url: `${root}#${g}`, name: g, description: "", version: "local", files: list, children: [] }));
  const tree: IndexNode = { url: root, name, description: "5etools data", version: "local", files: [], children };
  return { url: root, name, kind: "local", format: "5etools", importFormat: FIVETOOLS_IMPORT_FORMAT, baseUrl, tree, disabled: [], versions: {}, lastChecked: Date.now(), fileCount: urls.length };
}

/**
 * The 5e.tools importer's format. Raise it when the importer starts fetching files it did not before; a full import
 * of an older format is then out of date, and the app asks the user to import it again.
 *   2: magic variants, lore (fluff), bestiary beasts and Plutonium's Foundry files (2026-10-22)
 */
export const FIVETOOLS_IMPORT_FORMAT = 2;

/**
 * Full 5e.tools imports made by an older importer: they lack files this version reads. A source without a stamp
 * (imported before stamps existed) counts as current when it already holds the format 2 files. Picked entries
 * (single items from the 5e.tools picker) are not full imports.
 */
export function outdatedFiveTools(sources: SourceConfig[]): SourceConfig[] {
  const files = (s: SourceConfig) => { const out: string[] = []; const walk = (n?: IndexNode) => { if (!n) return; out.push(...n.files); n.children.forEach(walk); }; walk(s.tree); return out; };
  return sources.filter((s) => {
    if (s.format !== "5etools" || s.disabled.includes(s.url)) return false;
    const list = files(s);
    if (!list.some((f) => /\/races\.json$/.test(f))) return false;
    const format = s.importFormat ?? (list.some((f) => /\/magicvariants\.json$/.test(f)) && list.some((f) => /\/foundry-races\.json$/.test(f)) ? 2 : 1);
    return format < FIVETOOLS_IMPORT_FORMAT;
  });
}
