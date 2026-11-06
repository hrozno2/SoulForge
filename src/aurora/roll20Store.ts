/**
 * Roll20's 2024 sheet keeps a character in one attribute, `store`: a map of typed "integrants" (Class, Class Level,
 * Species, Features, Spell, Item, Ability Score...), each pointing at its parent. The older OGL sheet keeps one attribute
 * per field. This turns a store into the OGL sheet's attributes, so one reader handles both.
 *
 * The shape comes from reading betterR20 (docs/BETTERR20.md), which writes these stores; no file saved by Roll20's own
 * builder has been tried yet, so what is not understood is skipped rather than guessed.
 */
export interface Attrib { name: string; current?: unknown; max?: unknown }
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const parseJson = (v: unknown): Json | undefined => {
  if (v && typeof v === "object") return v as Json;
  if (typeof v !== "string" || !v.trim().startsWith("{")) return undefined;
  try { return JSON.parse(v) as Json; } catch { return undefined; }
};

export const isRoll20Store = (v: unknown): boolean => !!parseJson(v)?.integrants?.integrants;

const SKILLS = ["acrobatics", "animal handling", "arcana", "athletics", "deception", "history", "insight", "intimidation", "investigation", "medicine", "nature", "perception", "performance", "persuasion", "religion", "sleight of hand", "stealth", "survival"];

export function storeToAttribs(value: unknown): Attrib[] {
  const store = parseJson(value);
  const raw = store?.integrants?.integrants as Record<string, Json> | undefined;
  if (!store || !raw) return [];
  const all: Json[] = Object.entries(raw).map(([id, x]): Json => ({ ...x, id })).filter((x) => x._enabled !== false && !x.parentDisabled).sort((a, b) => (a.arrayPosition ?? 0) - (b.arrayPosition ?? 0));
  const byId = new Map(all.map((x) => [x.id, x]));
  const out: Attrib[] = [];
  const set = (name: string, current: unknown, max?: unknown) => out.push({ name, current, ...(max !== undefined ? { max } : {}) });
  let row = 0;
  const addRow = (section: string, fields: Record<string, unknown>) => { const id = `-store${row++}`; for (const [k, v] of Object.entries(fields)) set(`repeating_${section}_${id}_${k}`, v); };
  const ofType = (...t: string[]) => all.filter((x) => t.includes(x.type));
  /** The topmost thing an integrant hangs from: what says where a feature comes from. */
  const root = (x: Json): Json => { let n = x; for (let i = 0; i < 20 && n.parentID && byId.has(n.parentID); i++) n = byId.get(n.parentID)!; return n; };
  const flat = (x: Json) => Number(x.valueFormula?.flatValue);

  // Scores: what sets one, then what adds to it.
  for (const name of ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"]) {
    const lines = ofType("Ability Score").filter((x) => x.ability === name && Number.isFinite(flat(x)));
    const base = lines.filter((x) => /^Set/.test(x.calculation ?? "Set")).reduce((n, x) => Math.max(n, flat(x)), 0);
    const added = lines.filter((x) => !/^Set/.test(x.calculation ?? "Set")).reduce((n, x) => n + flat(x), 0);
    if (base) set(name.toLowerCase(), base + added);
  }

  // Classes, in the order they were taken; the level is the highest Class Level under each.
  const classes = ofType("Class").map((c) => {
    const levels = ofType("Class Level").filter((l) => l.classID === c.id || l.parentID === c.id);
    return { name: String(c.name ?? ""), level: levels.reduce((n, l) => Math.max(n, Number(l.level) || 0), 0) || levels.length || 1, sub: levels.map((l) => byId.get(l.subClassID)?.name).find(Boolean) };
  }).filter((c) => c.name);
  if (classes[0]) { set("class", classes[0].name); set("base_level", classes[0].level); set("level", classes.reduce((n, c) => n + c.level, 0)); }
  classes.slice(1, 4).forEach((c, i) => { set(`multiclass${i + 1}`, c.name); set(`multiclass${i + 1}_lvl`, c.level); set(`multiclass${i + 1}_flag`, "1"); });
  const subclass = classes.map((c) => c.sub).find(Boolean) ?? ofType("Subclass")[0]?.name;
  if (subclass) set("subclass", subclass);
  const species = ofType("Species")[0]?.name;
  if (species) set("race", species);
  const background = ofType("Background")[0]?.name;
  if (background) set("background", background);

  // Features, sorted by where they hang: what the OGL sheet calls a trait's source.
  for (const f of ofType("Features", "Feature", "Feat")) {
    const top = root(f);
    const source = f.type === "Feat" || f.source === "Feat" || top.type === "Feat" ? "Feat" : top.type === "Class" || f.source === "Class" ? "Class" : top.type === "Species" ? "Racial" : top.type === "Background" ? "Background" : "Other";
    addRow("traits", { name: f.name, source, description: f.description ?? "" });
  }
  for (const s of ofType("Spell")) {
    const level = Number(s.level) || 0;
    // An always-prepared spell is marked the way Roll20 players mark it in the older sheet: "(A)".
    addRow(level === 0 ? "spell-cantrip" : `spell-${level}`, { spellname: `${s.name}${s.alwaysPrepared ? " (A)" : ""}`, spelllevel: level || "cantrip", spellprepared: s._prepared ? "1" : "0" });
  }
  for (const i of ofType("Item")) addRow("inventory", { itemname: i.name, itemcount: i.quantity ?? 1, equipped: i.equipData?.equipped ? "1" : "0", itemweight: i.weight ?? "" });
  for (const l of ofType("Language")) if (l.name) addRow("proficiencies", { name: l.name, prof_type: "LANGUAGE" });
  for (const p of ofType("Proficiency")) {
    const what = String(p.proficiency ?? "");
    const lower = what.toLowerCase();
    const expert = /expert/i.test(String(p.proficiencyLevel ?? ""));
    const category = String(p.category ?? "");
    if (/saving/i.test(category)) set(`${lower}_save_prof`, "(@{pb})");
    else if (SKILLS.includes(lower)) { const k = lower.replace(/ /g, "_"); set(`${k}_prof`, `(@{pb}*@{${k}_type})`); set(`${k}_type`, expert ? 2 : 1); }
    else if (/armor|shield/i.test(category)) addRow("proficiencies", { name: what, prof_type: "ARMOR" });
    else if (/weapon/i.test(category)) addRow("proficiencies", { name: what, prof_type: "WEAPON" });
    else if (/tool|instrument|gaming/i.test(category)) addRow("tool", { toolname: what });
  }

  // Details the store keeps apart from its integrants.
  const hpMax = ofType("Hit Points").filter((x) => x.hitpointType === "Maximum" && /^Set Value/.test(x.calculation ?? "")).map(flat).find(Number.isFinite);
  const hp = Number(store.hitpoints?.currentHP);
  if (Number.isFinite(hp) && hp > 0) set("hp", hp, hpMax);
  else if (hpMax) set("hp", hpMax, hpMax);
  const xp = Number(store.classLevel?.currentExp);
  if (xp > 0) set("xp", xp);
  for (const k of ["cp", "sp", "ep", "gp", "pp"]) { const n = Number(store.currencies?.[k]); if (n > 0) set(k, n); }
  if (store.about?.characteristics?.alignment) set("alignment", store.about.characteristics.alignment);
  return out;
}
