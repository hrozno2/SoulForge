/**
 * Pick-and-import for 5etools data: search a data folder's spells, items, feats and so on, or paste 5e.tools links,
 * and bring only those entries in. Entries are kept as 5etools-format files so the normal converter handles them.
 */
import { fetchText, storeFiveTools } from "./content";
import { idbFileCache } from "./storage";
import type { SourceConfig } from "./sources";

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type Kind = "spell" | "item" | "feat" | "race" | "background" | "monster";

export const KINDS: { kind: Kind; label: string }[] = [
  { kind: "spell", label: "Spells" },
  { kind: "item", label: "Items" },
  { kind: "feat", label: "Feats" },
  { kind: "race", label: "Species" },
  { kind: "background", label: "Backgrounds" },
  { kind: "monster", label: "Creatures" },
];

export interface Entry {
  kind: Kind;
  name: string;
  source: string;
  level?: number;
  /** The array it lives in, for example "item" or "baseitem". */
  key: string;
  raw: J;
}

const PAGES: Record<string, Kind> = { spells: "spell", items: "item", feats: "feat", races: "race", backgrounds: "background", bestiary: "monster" };
const KEYS: Record<Kind, string[]> = { spell: ["spell"], item: ["item", "baseitem"], feat: ["feat"], race: ["race"], background: ["background"], monster: ["monster"] };

export interface ParsedLink {
  kind: Kind;
  name: string;
  source: string;
}

/** `https://5e.tools/spells.html#hunter%20sense_grimhollowpg24,flstlevel:0=1` -> spell "hunter sense" from grimhollowpg24. */
export function parseLink(raw: string): ParsedLink | "unsupported" | "list" | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const page = u.pathname.split("/").pop()?.replace(/\.html$/i, "").toLowerCase() ?? "";
  const hash = decodeURIComponent(u.hash.replace(/^#/, ""));
  const first = hash.split(",")[0];
  const cut = first.lastIndexOf("_");
  if (!page) return null;
  const kind = PAGES[page];
  if (!kind) return "unsupported";
  if (cut < 1) return "list";
  return { kind, name: first.slice(0, cut).toLowerCase(), source: first.slice(cut + 1).toLowerCase() };
}

const trim = (u: string) => u.trim().replace(/\/+$/, "");
const jget = async (base: string, path: string): Promise<J> => JSON.parse(await fetchText(`${trim(base)}/${path}`));

function entriesOf(kind: Kind, json: J): Entry[] {
  const out: Entry[] = [];
  for (const key of KEYS[kind]) for (const raw of json[key] ?? []) if (raw?.name && raw.source) out.push({ kind, name: raw.name, source: raw.source, level: kind === "spell" ? raw.level : undefined, key, raw });
  return out;
}

/** Files of a category, given by its index file where the data folder splits it per book. */
async function filesFor(base: string, kind: Kind): Promise<{ path: string; source?: string }[]> {
  if (kind === "spell" || kind === "monster") {
    const dir = kind === "spell" ? "spells" : "bestiary";
    const idx = (await jget(base, `${dir}/index.json`)) as Record<string, string>;
    return Object.entries(idx).map(([source, f]) => ({ path: `${dir}/${f}`, source }));
  }
  if (kind === "item") return [{ path: "items-base.json" }, { path: "items.json" }];
  return [{ path: `${kind === "race" ? "races" : kind === "feat" ? "feats" : "backgrounds"}.json` }];
}

/** Loads every entry of a category. Optionally only from one book (matched case-insensitively). */
export async function loadCategory(base: string, kind: Kind, onProgress?: (done: number, total: number) => void, onlySource?: string): Promise<Entry[]> {
  let files = await filesFor(base, kind);
  if (onlySource) files = files.filter((f) => !f.source || f.source.toLowerCase() === onlySource.toLowerCase());
  const out: Entry[] = [];
  let done = 0;
  const queue = [...files];
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const f = queue.shift()!;
      try {
        out.push(...entriesOf(kind, await jget(base, f.path)));
      } catch {
        /* a missing optional file is skipped */
      }
      onProgress?.(++done, files.length);
    }
  }));
  return out;
}

/** Finds the entries named by links. Returns what it found and what it could not. */
export async function resolveLinks(base: string, links: string[]): Promise<{ found: Entry[]; problems: string[] }> {
  const found: Entry[] = [];
  const problems: string[] = [];
  for (const l of links.map((x) => x.trim()).filter(Boolean)) {
    const p = parseLink(l);
    if (!p) {
      problems.push(`Not a 5e.tools link: ${l.slice(0, 60)}`);
      continue;
    }
    if (p === "list") {
      problems.push(`That link points at a whole list, not one entry. On 5e.tools click an entry's name first, then copy the address: ${l.slice(0, 60)}`);
      continue;
    }
    if (p === "unsupported") {
      problems.push(`Soul Forge cannot import from this page yet: ${l.slice(0, 60)}. Use Fetch the whole data folder for classes.`);
      continue;
    }
    try {
      const list = await loadCategory(base, p.kind, undefined, p.source);
      const hit = list.find((e) => e.name.toLowerCase() === p.name && e.source.toLowerCase() === p.source);
      if (hit) found.push(hit);
      else problems.push(`Not found in that data: ${p.name} (${p.source})`);
    } catch (e) {
      problems.push(`${p.name}: ${(e as Error).message}`);
    }
  }
  return { found, problems };
}

const ROOT = "5etools://Picked from 5etools";
const PICK_FILE = (kind: Kind) => `picked/${kind}.json`;

/** Adds entries to the "Picked from 5etools" source, keeping what was picked before. */
export async function savePicks(base: string, entries: Entry[]): Promise<{ cfg: SourceConfig; added: number }> {
  const files = new Map<string, string>();
  let added = 0;
  const wanted = new Set<Kind>(entries.map((e) => e.kind));
  for (const { kind } of KINDS) {
    const prev = await idbFileCache.get(`${ROOT}/${PICK_FILE(kind)}`);
    const stored: J = prev ? JSON.parse(prev) : {};
    const mine = entries.filter((e) => e.kind === kind);
    for (const e of mine) {
      const key = e.key;
      const bucket = (stored[key] ??= []) as J[];
      if (!bucket.some((x) => x.name === e.name && x.source === e.source)) {
        bucket.push(e.raw);
        added++;
      }
    }
    if (mine.length) {
      // A species pick brings its subraces along.
      if (kind === "race") {
        const all = (await jget(base, "races.json")).subrace as J[] | undefined;
        const have = (stored.subrace ??= []) as J[];
        for (const e of mine) for (const s of all ?? []) if (s.raceName === e.name && s.raceSource === e.source && !have.some((x) => x.name === s.name && x.source === s.source)) have.push(s);
      }
    }
    if (Object.keys(stored).length) files.set(PICK_FILE(kind), JSON.stringify(stored));
  }
  // The converter wants book names and release dates, and spell class lists.
  const support = async (path: string) => {
    const cached = await idbFileCache.get(`${ROOT}/${path}`);
    if (cached) return cached;
    try {
      return await fetchText(`${trim(base)}/${path}`);
    } catch {
      return undefined;
    }
  };
  for (const path of ["books.json", ...(wanted.has("spell") || files.has(PICK_FILE("spell")) ? ["spells/sources.json"] : []), ...(files.has(PICK_FILE("item")) ? ["items-base.json"] : [])]) {
    const t = await support(path);
    if (t) files.set(path, t);
  }
  const cfg = await storeFiveTools("Picked from 5etools", files, base);
  return { cfg, added };
}
