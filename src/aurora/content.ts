import { browserXml, parseElementsXml, type XmlApi } from "./parse";
import { ARegistry } from "./registry";
import { crawlIndex, countFiles, flatten, syncFiles, type IndexNode, type Progress, type SourceConfig, type SyncResult, type TextFetcher } from "./sources";
import { idbFileCache, readFiles, saveSource } from "./storage";
import { FIVETOOLS_CORE_FILES, FIVETOOLS_EXTRA_FILES, convertFiveTools } from "./fivetools";

export const DEFAULT_LINK = "https://raw.githubusercontent.com/AuroraLegacy/elements/master/AuroraLegacy.index";

export const fetchText: TextFetcher = async (url) => {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
};

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Parses every cached file of every enabled index, in load order, into one registry. */
export async function buildRegistry(
  sources: SourceConfig[],
  xml: XmlApi = browserXml(),
  onProgress?: (done: number, total: number) => void,
): Promise<{ reg: ARegistry; errors: string[] }> {
  const reg = new ARegistry();
  const errors: string[] = [];
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
      // 5etools files are converted together, because classes refer to features and spell lists in other files.
      const files: Record<string, unknown> = {};
      const texts = await readFiles(urls);
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
      onProgress?.(n, total);
      await tick();
      try {
        reg.addElements(convertFiveTools({ files }));
      } catch (e) {
        errors.push(`${source.name}: ${(e as Error).message}`);
      }
      continue;
    }
    for (let i = 0; i < urls.length; i += 40) {
      const batch = urls.slice(i, i + 40);
      const texts = await readFiles(batch);
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
      onProgress?.(n, total);
      await tick();
    }
  }
  reg.build();
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
  return { url: root, name, kind: "local", format: "5etools", baseUrl, tree, disabled: [], versions: {}, lastChecked: Date.now(), fileCount: urls.length };
}
