import type { CompanionFill, FillData } from "./data";
import { translatable, translateAll, type BatchTranslator } from "../pdf/translate";

export interface FillTranslation {
  target: string;
  translator: BatchTranslator;
  cache: { get(k: string): Promise<string | undefined>; put(k: string, v: string): Promise<void> };
  onProgress?: (done: number, total: number) => void;
  onResult?: (failed: number) => void;
}

/** Fields the player wrote or that are numbers and names; they are printed as they are. */
const KEEP = new Set(["name", "portrait", "backstory", "personality", "appearance", "alignment", "notes", "coins", "carryCapacity", "pushDrag", "hdMax", "profBonus", "initiative", "speed", "languages"]);

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
  const each = (f: (s: string) => string): FillData =>
    Object.fromEntries(Object.entries(d).map(([k, v]) => [k, walk(v, f, KEEP.has(k))])) as unknown as FillData;
  each((s) => {
    if (translatable(s, keepText)) seen.add(s);
    return s;
  });
  const { map, failed } = await translateAll(seen, t.target, t.translator, t.cache, t.onProgress);
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
