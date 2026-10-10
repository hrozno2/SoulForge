import type { CompanionFill, FillData } from "./data";
import { translatable, translateAll, type BatchTranslator } from "../pdf/translate";
import { lookup, type Glossary } from "../pdf/glossary";

export interface FillTranslation {
  target: string;
  translator: BatchTranslator;
  cache: { get(k: string): Promise<string | undefined>; put(k: string, v: string): Promise<void> };
  onProgress?: (done: number, total: number) => void;
  onResult?: (failed: number) => void;
  /** Keep names of spells, items and features as they are. Machine translation turns "Quarterstaff" into "quarterly staff". */
  keepNames?: boolean;
  /** Terms with fixed translations. A name found here is translated even when names are otherwise kept. */
  glossary?: Glossary;
}

/** Fields the player wrote or that are numbers and names; they are printed as they are. */
const KEEP = new Set(["name", "portrait", "backstory", "personality", "appearance", "alignment", "notes", "coins", "carryCapacity", "pushDrag", "hdMax", "profBonus", "initiative", "speed", "languages"]);

/** Fields that hold names, one per line or one per entry. */
const NAME_KEYS = new Set(["weaponsText", "otherGear", "armorWorn"]);
/** Lists of "Name: text" lines. The part before the colon is a feature name. */
const FEATURE_KEYS = new Set(["traits", "feats", "classFeatures"]);

const splitFeature = (s: string): [string, string] => {
  const m = s.match(/^([^:\n]{2,70}): ([\s\S]+)$/);
  return m ? [`${m[1]}: `, m[2]] : ["", s];
};

function walk(v: unknown, f: (s: string) => string, keep: boolean): unknown {
  if (typeof v === "string") return keep ? v : f(v);
  if (Array.isArray(v)) return v.map((x) => walk(x, f, keep));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, f, keep)]));
  return v;
}

/**
 * Returns a copy of the sheet data with its descriptive text translated: features, traits, feats, spell
 * names and notes, equipment and training. Names and anything the player typed stay as they are.
 */
export async function translateFill(d: FillData, t: FillTranslation): Promise<FillData> {
  const keepText = new Set<string>([d.name, d.background, d.className, d.species, d.subclass].map((x) => String(x ?? "").trim()).filter(Boolean));
  const seen = new Set<string>();
  const names = t.keepNames !== false;
  const nm = (x: string) => (t.glossary ? lookup(t.glossary, x) : undefined) ?? x;
  const nmLines = (v: unknown) => (typeof v === "string" ? v.split("\n").map(nm).join("\n") : v);
  const each = (f: (s: string) => string): FillData => {
    const out = Object.fromEntries(Object.entries(d).map(([k, v]) => {
      if (names && NAME_KEYS.has(k)) return [k, nmLines(v)];
      if (names && FEATURE_KEYS.has(k) && Array.isArray(v)) return [k, (v as string[]).map((line) => { const [head, body] = splitFeature(line); return (head ? `${nm(head.slice(0, -2))}: ` : "") + f(body); })];
      return [k, walk(v, f, KEEP.has(k))];
    })) as unknown as FillData;
    if (names) {
      out.spells = d.spells.map((sp) => ({ ...(walk(sp, f, false) as typeof sp), name: nm(sp.name) }));
      out.weapons = d.weapons.map((w) => ({ ...(walk(w, f, false) as typeof w), name: nm(w.name) }));
      out.magicItems = (d.magicItems ?? []).map((m) => ({ ...m, name: nm(m.name) }));
    }
    return out;
  };
  each((s) => {
    if (translatable(s, keepText)) seen.add(s);
    return s;
  });
  const { map, failed } = await translateAll(seen, t.target, t.translator, t.cache, t.onProgress, t.glossary);
  t.onResult?.(failed);
  return each((s) => map.get(s) ?? s);
}

/** The same for a companion sheet: its trait text, skills, senses and creature type. */
export async function translateCompanion(c: CompanionFill, t: FillTranslation): Promise<CompanionFill> {
  const keys = ["traits", "skills", "senses", "creature", "size"] as const;
  const seen = new Set<string>();
  for (const k of keys) if (translatable(c[k], new Set())) seen.add(c[k]);
  const { map, failed } = await translateAll(seen, t.target, t.translator, t.cache, t.onProgress);
  t.onResult?.(failed);
  const out = { ...c };
  for (const k of keys) out[k] = map.get(c[k]) ?? c[k];
  return out;
}
