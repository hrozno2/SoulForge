/**
 * Converts 5etools-format JSON data (the format used by 5e.tools, its mirrors, and the Plutonium Foundry
 * module) into Soul Forge elements. The data describes content in prose plus structured fields, so this
 * maps the structured parts (proficiencies, saves, speeds, spell tables, hit dice, ability bonuses, items)
 * into rules and keeps the rest as description text.
 *
 * The data itself is never bundled with Soul Forge: it is read from files or a base address the user supplies.
 */
import { applyFoundry } from "./foundry";
import { applyLore } from "./lore";
import { applyTextAttacks, applyTextDc, applyTextUses } from "./textMechanics";
import type { AElement, ARule, SetterValue } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

const ABIL: Record<string, string> = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" };
const SKILLS = ["acrobatics", "animal handling", "arcana", "athletics", "deception", "history", "insight", "intimidation", "investigation", "medicine", "nature", "perception", "performance", "persuasion", "religion", "sleight of hand", "stealth", "survival"];
const SCHOOL: Record<string, string> = { A: "Abjuration", C: "Conjuration", D: "Divination", E: "Enchantment", V: "Evocation", I: "Illusion", N: "Necromancy", T: "Transmutation" };
const DMG: Record<string, string> = { B: "bludgeoning", P: "piercing", S: "slashing", F: "fire", C: "cold", L: "lightning", T: "thunder", N: "necrotic", R: "radiant", O: "force", A: "acid", I: "poison", Y: "psychic" };
const PROP: Record<string, string> = { F: "finesse", L: "light", H: "heavy", T: "thrown", V: "versatile", R: "reach", A: "ammunition", LD: "loading", "2H": "two-handed", S: "special", RLD: "reload", BF: "burst fire", AF: "ammunition (firearm)" };

const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
export const ftId = (kind: string, name: string, source: string, extra = "") => `ID_5ET_${kind}_${slug(source)}_${slug(name)}${extra ? `_${slug(extra)}` : ""}`;
const abilFull = (k: string) => ABIL[k] ?? k;
// A new word starts after a space or bracket, never after an apostrophe ("Alchemist's", not "Alchemist'S").
const cap = (s: string) => s.replace(/(^|[^\w'’])(\w)/g, (_, a, c) => a + c.toUpperCase());

// ---------------------------------------------------------------- text

function tag(raw: string): string {
  return raw
    .replace(/\{@h\}/g, "<i>Hit:</i> ")
    .replace(/\{@atk ([^}]*)\}/g, (_m, t: string) => {
      const map: Record<string, string> = { mw: "Melee Weapon Attack:", rw: "Ranged Weapon Attack:", "mw,rw": "Melee or Ranged Weapon Attack:", ms: "Melee Spell Attack:", rs: "Ranged Spell Attack:", m: "Melee Attack:", r: "Ranged Attack:" };
      return `<i>${map[t] ?? "Attack:"}</i>`;
    })
    .replace(/\{@(b|bold)\s+([^}]*)\}/g, "<b>$2</b>")
    .replace(/\{@(i|italic)\s+([^}]*)\}/g, "<i>$2</i>")
    .replace(/\{@dc\s+([^}|]*)[^}]*\}/g, "DC $1")
    .replace(/\{@hit\s+([^}|]*)[^}]*\}/g, (_m, n: string) => (/^[+-]/.test(n.trim()) ? n.trim() : `+${n.trim()}`))
    .replace(/\{@(?:damage|dice|scaledamage|scaledice|chance)\s+([^}|]*)(?:\|[^}]*)?\}/g, "$1")
    .replace(/\{@(\w+)\s+([^}]*)\}/g, (_m, _t: string, rest: string) => {
      const parts = rest.split("|");
      const shown = parts[2] ?? parts[0];
      return shown.replace(/\s*\[[^\]]*\]/g, "");
    });
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inlineHtml(s: string): string {
  // Escape first, then let the tag converter add its small set of safe tags.
  return tag(esc(s).replace(/\{@/g, "{@")).replace(/&lt;(\/?(?:i|b))&gt;/g, "<$1>");
}

export function entriesHtml(entries: J, depth = 0): string {
  if (entries === undefined || entries === null) return "";
  if (typeof entries === "string") return `<p>${inlineHtml(entries)}</p>`;
  if (typeof entries === "number") return `<p>${entries}</p>`;
  if (Array.isArray(entries)) return entries.map((e) => entriesHtml(e, depth)).join("");
  const e = entries as J;
  switch (e.type) {
    case "entries":
    case "section":
    case "inset":
    case "insetReadaloud":
    case "quote": {
      const head = e.name ? `<h5>${inlineHtml(e.name)}</h5>` : "";
      const body = entriesHtml(e.entries, depth + 1);
      return e.type === "inset" || e.type === "insetReadaloud" ? `<div class="sidebar">${head}${body}</div>` : head + body;
    }
    case "list":
      return `<ul>${(e.items ?? []).map((i: J) => (typeof i === "string" ? `<li>${inlineHtml(i)}</li>` : i.type === "item" ? `<li><b>${inlineHtml(i.name ?? "")}.</b> ${entriesHtml(i.entry ?? i.entries)}</li>` : `<li>${entriesHtml(i)}</li>`)).join("")}</ul>`;
    case "item":
    case "itemSub":
      return `<p><b>${inlineHtml(e.name ?? "")}.</b> ${inlineHtml(typeof e.entry === "string" ? e.entry : "")}</p>${e.entries ? entriesHtml(e.entries) : ""}`;
    case "table": {
      const cols = (e.colLabels ?? []).map((c: string) => `<th>${inlineHtml(c)}</th>`).join("");
      const rows = (e.rows ?? []).map((r: J[]) => `<tr>${r.map((c) => `<td>${typeof c === "object" && c ? entriesHtml(c.entry ?? c.entries ?? c.roll?.exact ?? "") : inlineHtml(String(c))}</td>`).join("")}</tr>`).join("");
      return `<table>${e.caption ? `<caption>${inlineHtml(e.caption)}</caption>` : ""}<thead><tr>${cols}</tr></thead><tbody>${rows}</tbody></table>`;
    }
    case "abilityDc":
      return `<p><b>${inlineHtml(e.name ?? "Spell")} save DC</b> = 8 + your proficiency bonus + your ${(e.attributes ?? []).map(abilFull).join("/")} modifier</p>`;
    case "abilityAttackMod":
      return `<p><b>${inlineHtml(e.name ?? "Spell")} attack modifier</b> = your proficiency bonus + your ${(e.attributes ?? []).map(abilFull).join("/")} modifier</p>`;
    default:
      return e.entries ? entriesHtml(e.entries, depth + 1) : e.entry ? entriesHtml(e.entry) : "";
  }
}


// ---------------------------------------------------------------- shared synthetic elements

/** 5e.tools markup left in a name ("{@item Hand Crossbow|phb}") becomes its plain text. */
const plainName = (s: string) => s.replace(/\{@\w+\s+([^|}]*)[^}]*\}?/g, "$1");

const base = (id: string, name: string, type: string, source: string, extra: Partial<AElement> = {}): AElement => ({
  id, name: plainName(name), type, source, supports: [], description: "", compendiumHidden: false, setters: {}, rules: [], origin: "5etools", ...extra,
  // A caller's "setters: undefined" must not leave an element without them (lookups read them).
  ...(extra.setters ? {} : { setters: {} }),
});

const set = (value: string, attrs: Record<string, string> = {}): SetterValue => ({ value, attrs });

/** Skills, languages, armor and weapon categories, and ability increases that the converted content refers to. */
/** Granted by a species or subrace that raises ability scores, so a background does not raise them a second time. */
export const MARK_SPECIES_ASI = "ID_5ET_MARK_SPECIES_ASI";

/** The ids of an element and its repeat copies: ID, ID_2, ID_3... (as Aurora names them). */
const repeatIds = (id: string, n: number) => Array.from({ length: n }, (_, i) => (i === 0 ? id : `${id}_${i + 1}`));

export function syntheticElements(): AElement[] {
  const out: AElement[] = [];
  out.push(base(MARK_SPECIES_ASI, "Species ability score increase", "Information", "5etools", { compendiumHidden: true, description: "Marks that the species already raises ability scores." }));
  // The damage defenses as elements: the content grants them as markers (the sheet reads the ids), and a choice of
  // one ("resistance to acid, cold or fire") needs them as options.
  for (const [kind, word] of [["RESISTANCE", "resistance"], ["IMMUNITY", "immunity"], ["VULNERABILITY", "vulnerability"]]) {
    for (const t of ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"]) {
      out.push(base(`ID_INTERNAL_CONDITION_DAMAGE_${kind}_${t.toUpperCase()}`, `${cap(t)} ${word}`, "Condition", "5etools", { compendiumHidden: true, description: `<p>${cap(t)} damage ${word}.</p>` }));
    }
  }
  // The 2014 Ability Score Improvement, as an option of the class's feat-or-improvement choice: +2 to one score or +1
  // to two. Taken again at each level that offers it.
  // The custom-lineage rule some species use instead of fixed increases (Van Richten's, Monsters of the Multiverse:
  // 5e.tools "lineage"): +2 to one score and +1 to another, or +1 to three different scores.
  out.push(base("ID_5ET_ASI_PATTERN_2_1", "+2 to one score and +1 to another", "Ability Score Improvement", "5etools", {
    compendiumHidden: true, supports: ["5et asi pattern"],
    rules: [
      { kind: "select", type: "Ability Score Improvement", name: "+2 to one score", supports: "5et asi one,amt2", number: 1 },
      { kind: "select", type: "Ability Score Improvement", name: "+1 to another score", supports: "5et asi one,amt1", number: 1 },
    ],
  }));
  out.push(base("ID_5ET_ASI_PATTERN_1_1_1", "+1 to three different scores", "Ability Score Improvement", "5etools", {
    compendiumHidden: true, supports: ["5et asi pattern"],
    rules: [{ kind: "select", type: "Ability Score Improvement", name: "+1 to three scores", supports: "5et asi one,amt1", number: 3 }],
  }));
  // One copy per time it can be taken (a class gives at most seven): each has its own choice of scores. An element
  // is counted once however often it is picked, so a repeat needs its own copy, as Aurora's content does it.
  for (const id of repeatIds("ID_5ET_ASI_CHOICE", 8)) {
    out.push(base(id, "Ability Score Improvement", "Feat", "5etools", {
      compendiumHidden: true, supports: ["5et asi choice"],
      description: "<p>Increase one ability score by 2, or two ability scores by 1. A score cannot go above 20 this way.</p>",
      rules: [{ kind: "select", type: "Ability Score Improvement", name: "Ability Score Improvement", supports: "5et asi", number: 1 }],
    }));
  }
  for (const s of SKILLS) {
    out.push(base(`ID_5ET_SKILL_${slug(s)}`, cap(s), "Proficiency", "5etools", {
      supports: ["5et skill"], compendiumHidden: true,
      rules: [{ kind: "stat", name: `${s}:proficiency`, value: "proficiency", bonus: "proficiency" }],
    }));
    out.push(base(`ID_5ET_EXPERTISE_${slug(s)}`, `${cap(s)} (expertise)`, "Proficiency", "5etools", {
      supports: ["5et expertise"], compendiumHidden: true,
      rules: [{ kind: "stat", name: `${s}:proficiency`, value: "proficiency", bonus: "double" }],
    }));
  }
  const cats: [string, string][] = [["ARMOR_LIGHT", "Armor Proficiency (Light Armor)"], ["ARMOR_MEDIUM", "Armor Proficiency (Medium Armor)"], ["ARMOR_HEAVY", "Armor Proficiency (Heavy Armor)"], ["ARMOR_SHIELD", "Armor Proficiency (Shields)"], ["WEAPON_SIMPLE", "Weapon Proficiency (Simple Weapons)"], ["WEAPON_MARTIAL", "Weapon Proficiency (Martial Weapons)"]];
  for (const [k, n] of cats) out.push(base(`ID_5ET_PROF_${k}`, n, "Proficiency", "5etools", { compendiumHidden: true }));
  out.push(base("ID_INTERNAL_GRANT_MULTICLASS", "Multiclass marker", "Grants", "5etools", { compendiumHidden: true }));
  for (const a of Object.values(ABIL)) {
    out.push(base(`ID_5ET_SAVE_${slug(a)}`, `Saving throw proficiency (${cap(a)})`, "Proficiency", "5etools", {
      compendiumHidden: true,
      rules: [{ kind: "stat", name: `${a}:save:proficiency`, value: "proficiency", bonus: "proficiency" }],
    }));
  }
  const keys = Object.keys(ABIL);
  const asi = (id: string, name: string, parts: [string, number][]) =>
    out.push(base(id, name, "Ability Score Improvement", "5etools", { supports: ["5et asi"], compendiumHidden: true, rules: parts.map(([a, n]) => ({ kind: "stat" as const, name: abilFull(a), value: String(n) })) }));
  for (const a of keys) asi(`ID_5ET_ASI_2_${a}`, `+2 ${cap(abilFull(a))}`, [[a, 2]]);
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) asi(`ID_5ET_ASI_1_${keys[i]}_${keys[j]}`, `+1 ${cap(abilFull(keys[i]))}, +1 ${cap(abilFull(keys[j]))}`, [[keys[i], 1], [keys[j], 1]]);
  // single-ability steps used by species and backgrounds
  for (const a of keys) for (const n of [1, 2]) out.push(base(`ID_5ET_ASIONE_${n}_${a}`, `+${n} ${cap(abilFull(a))}`, "Ability Score Improvement", "5etools", { supports: ["5et asi one", `amt${n}`, a.toUpperCase()], compendiumHidden: true, rules: [{ kind: "stat", name: abilFull(a), value: String(n) }] }));
  return out;
}

const skillIdOf = (s: string) => `ID_5ET_SKILL_${slug(s)}`;

/** `{ acrobatics: true, "athletics": true }` or a `choose` object, to rules. */
function skillRules(list: J[] | undefined, label: string): ARule[] {
  const rules: ARule[] = [];
  for (const entry of list ?? []) {
    for (const [k, v] of Object.entries(entry)) {
      if (k === "choose") {
        const from: string[] = (v as J).from ?? SKILLS;
        rules.push({ kind: "select", type: "Proficiency", name: `${label} skill`, supports: from.map(skillIdOf).join("|"), number: (v as J).count ?? 1 });
      } else if (k === "any") rules.push({ kind: "select", type: "Proficiency", name: `${label} skill`, supports: "5et skill", number: Number(v) || 1 });
      else if (v === true && SKILLS.includes(k)) rules.push({ kind: "grant", type: "Proficiency", id: skillIdOf(k) });
    }
  }
  return rules;
}

function langRules(list: J[] | undefined, label: string): { rules: ARule[]; languages: string[] } {
  const rules: ARule[] = [];
  const languages: string[] = [];
  for (const entry of list ?? []) {
    for (const [k, v] of Object.entries(entry)) {
      if (k === "anyStandard") rules.push({ kind: "select", type: "Language", name: `${label} language`, supports: "standard", number: Number(v) || 1 });
      else if (k === "any" || k === "other") rules.push({ kind: "select", type: "Language", name: `${label} language`, supports: "5et language", number: Number(v) || 1 });
      // "choose": {"from": ["elvish", "other"], "count": 1} (Simic Hybrid, the Ravnica backgrounds): one of these, and
      // "other" (or "any") opens it to any language, as Plutonium offers it.
      else if (k === "choose" && v && typeof v === "object") {
        const from = (((v as J).from as string[]) ?? []).map((x) => String(x).toLowerCase());
        const open = from.some((x) => x === "other" || x === "any" || x === "anystandard");
        rules.push({ kind: "select", type: "Language", name: `${label} language`, supports: open || !from.length ? "5et language" : from.map((x) => `ID_5ET_LANGUAGE_${slug(x)}`).join("|"), number: Number((v as J).count) || 1 });
      } else if (v === true) {
        languages.push(k);
        rules.push({ kind: "grant", type: "Language", id: `ID_5ET_LANGUAGE_${slug(k)}` });
      }
    }
  }
  return { rules, languages };
}

/** The standard tools by kind, for "any artisan's tool" style choices. */
/** The standard tools of each kind, by name (also the options for gear that names only a kind). */
export const TOOL_KINDS: Record<string, string[]> = {
  artisan: ["alchemist's supplies", "brewer's supplies", "calligrapher's supplies", "carpenter's tools", "cartographer's tools", "cobbler's tools", "cook's utensils", "glassblower's tools", "jeweler's tools", "leatherworker's tools", "mason's tools", "painter's supplies", "potter's tools", "smith's tools", "tinker's tools", "weaver's tools", "woodcarver's tools"],
  gaming: ["dice set", "dragonchess set", "playing card set", "three-dragon ante set"],
  instrument: ["bagpipes", "drum", "dulcimer", "flute", "horn", "lute", "lyre", "pan flute", "shawm", "viol"],
  other: ["disguise kit", "forgery kit", "herbalism kit", "navigator's tools", "poisoner's kit", "thieves' tools", "vehicles (land)", "vehicles (water)"],
};
const GENERIC_TOOL: Record<string, string> = { "artisan's tools": "artisan", "gaming set": "gaming", "musical instrument": "instrument" };

/** The tool proficiency element for a name, made once (its name maps to the tool:x concept). */
function toolId(name: string, out: AElement[]): string {
  const n = plainName(name).toLowerCase();
  const kind = Object.entries(TOOL_KINDS).find(([, l]) => l.includes(n))?.[0] ?? "other";
  const id = `ID_5ET_TOOL_${slug(n)}`;
  if (!out.some((o) => o.id === id)) out.push(base(id, `Tool Proficiency (${cap(n)})`, "Proficiency", "5etools", { compendiumHidden: true, supports: ["5et tool", `5et tool ${kind}`] }));
  return id;
}

function weaponId(k: string, out: AElement[]): string | undefined {
  const w = k.split("|")[0].toLowerCase().trim();
  if (!w) return undefined;
  if (w === "simple") return "ID_5ET_PROF_WEAPON_SIMPLE";
  if (w === "martial") return "ID_5ET_PROF_WEAPON_MARTIAL";
  const wid = ftId("PROF_WEAPON", w, "ALL");
  if (!out.some((o) => o.id === wid)) out.push(base(wid, `Weapon Proficiency (${cap(w)})`, "Proficiency", "5etools", { compendiumHidden: true, supports: ["5et weapon"] }));
  return wid;
}

const ARMOR_IDS: Record<string, string> = { light: "ID_5ET_PROF_ARMOR_LIGHT", medium: "ID_5ET_PROF_ARMOR_MEDIUM", heavy: "ID_5ET_PROF_ARMOR_HEAVY", shield: "ID_5ET_PROF_ARMOR_SHIELD" };

/**
 * Every proficiency-like field a 5e.tools entry can carry, read the same way for species, subraces, lineages,
 * backgrounds, feats and class proficiencies: tools, weapons, armor, saving throws, the mixed skill/tool/language
 * choices, expertise and senses. Skills, languages and ability scores have their own readers above.
 */
function profRules(e: J, label: string, out: AElement[]): ARule[] {
  const rules: ARule[] = [];
  const grant = (id: string | undefined) => { if (id) rules.push({ kind: "grant", type: "Proficiency", id }); };
  const pick = (name: string, supports: string, number: number) => rules.push({ kind: "select", type: "Proficiency", name, supports, number });
  for (const entry of (e.toolProficiencies as J[]) ?? []) for (const [k, v] of Object.entries(entry ?? {})) {
    if (k === "choose") pick(`${label} tool`, ((v as J).from as string[] ?? []).map((t) => GENERIC_TOOL[plainName(t).toLowerCase()] ? `5et tool ${GENERIC_TOOL[plainName(t).toLowerCase()]}` : toolId(t, out)).join("|"), Number((v as J).count) || 1);
    else if (k === "any") pick(`${label} tool`, "5et tool", Number(v) || 1);
    else if (k === "anyArtisansTool") pick(`${label} artisan's tool`, "5et tool artisan", Number(v) || 1);
    else if (k === "anyGamingSet") pick(`${label} gaming set`, "5et tool gaming", Number(v) || 1);
    else if (k === "anyMusicalInstrument") pick(`${label} musical instrument`, "5et tool instrument", Number(v) || 1);
    else if (GENERIC_TOOL[plainName(k).toLowerCase()]) pick(`${label} ${plainName(k).toLowerCase()}`, `5et tool ${GENERIC_TOOL[plainName(k).toLowerCase()]}`, 1);
    else if (v) grant(toolId(k, out));
  }
  for (const entry of (e.weaponProficiencies as J[]) ?? []) for (const [k, v] of Object.entries(entry ?? {})) {
    if (k === "choose") {
      const c = v as J;
      const from = ((c.fromFilter ? [] : c.from) as string[] ?? []).map((w) => weaponId(w, out)).filter(Boolean) as string[];
      pick(`${label} weapon`, from.length ? from.join("|") : "5et weapon", Number(c.count) || 1);
    } else if (k === "firearms" || k === "improvised") {
      // Proficiency with firearms (an optional rule) or with improvised weapons (Tavern Brawler).
      const wid = `ID_5ET_PROF_WEAPON_${k.toUpperCase()}`;
      if (!out.some((o) => o.id === wid)) out.push(base(wid, `Weapon Proficiency (${k === "improvised" ? "Improvised Weapons" : "Firearms"})`, "Proficiency", "5etools", { compendiumHidden: true }));
      grant(wid);
    } else if (v) grant(weaponId(k, out));
  }
  for (const entry of (e.armorProficiencies as J[]) ?? []) for (const [k, v] of Object.entries(entry ?? {})) if (v && ARMOR_IDS[k.split("|")[0]]) grant(ARMOR_IDS[k.split("|")[0]]);
  for (const entry of (e.savingThrowProficiencies as J[]) ?? []) for (const [k, v] of Object.entries(entry ?? {})) {
    if (k === "choose") pick(`${label} saving throw`, ((v as J).from as string[] ?? Object.keys(ABIL)).map((a) => `ID_5ET_SAVE_${slug(abilFull(a))}`).join("|"), Number((v as J).count) || 1);
    else if (v && k in ABIL) grant(`ID_5ET_SAVE_${slug(abilFull(k))}`);
  }
  for (const entry of (e.skillToolLanguageProficiencies as J[]) ?? []) {
    for (const c of [].concat((entry as J)?.choose ?? []) as J[]) {
      const kinds = (c.from as string[]) ?? [];
      const sup = kinds.map((k) => (k === "anySkill" ? "5et skill" : k === "anyTool" ? "5et tool" : k === "anyLanguage" ? "5et language" : "")).filter(Boolean);
      if (sup.includes("5et language")) rules.push({ kind: "select", type: "Language", name: `${label} language`, supports: "5et language", number: Number(c.count) || 1 });
      const other = sup.filter((x) => x !== "5et language");
      if (other.length) pick(`${label} skill or tool`, other.join("|"), Number(c.count) || 1);
    }
    for (const [k, v] of Object.entries(entry ?? {})) {
      if (k === "anyTool") pick(`${label} tool`, "5et tool", Number(v) || 1);
      else if (k === "anyLanguage") rules.push({ kind: "select", type: "Language", name: `${label} language`, supports: "5et language", number: Number(v) || 1 });
      else if (k === "anySkill") pick(`${label} skill`, "5et skill", Number(v) || 1);
    }
  }
  for (const entry of (e.expertise as J[]) ?? []) for (const [k, v] of Object.entries(entry ?? {})) {
    if (k === "anyProficientSkill") pick(`${label} expertise`, "5et expertise", Number(v) || 1);
    else if (v && SKILLS.includes(k)) grant(`ID_5ET_EXPERTISE_${slug(k)}`);
  }
  for (const f of ["senses", "bonusSenses"]) for (const entry of (e[f] as J[]) ?? []) for (const [k, v] of Object.entries(entry ?? {})) {
    const range = typeof v === "number" ? v : Number((v as J)?.range) || 0;
    if (!range || !/^(darkvision|blindsight|truesight|tremorsense)$/.test(k)) continue;
    const vid = `ID_5ET_SENSE_${slug(k)}_${range}`;
    if (!out.some((o) => o.id === vid)) out.push(base(vid, `${cap(k)} (${range} ft.)`, "Vision", "5etools", { compendiumHidden: true }));
    rules.push({ kind: "grant", type: "Vision", id: vid });
  }
  return rules;
}

const NUMBER_WORDS = ["", "one", "two", "three", "four"];
/** One option of a "choose one set" list, as the book words it: "Thieves' tools and one gaming set". */
function describeSet(entry: J): string {
  const parts: string[] = [];
  const n = (v: unknown) => NUMBER_WORDS[Number(v) || 1] ?? String(v);
  for (const [k, v] of Object.entries(entry ?? {})) {
    if (k === "choose") parts.push(`one of ${(((v as J).from as string[]) ?? []).map((x) => plainName(x).toLowerCase()).join(", ")}`);
    else if (k === "any" || k === "anyStandard" || k === "anyLanguage") parts.push(`${n(v)} of your choice`);
    else if (k === "anyArtisansTool") parts.push(`${n(v)} artisan's tool${Number(v) > 1 ? "s" : ""}`);
    else if (k === "anyGamingSet") parts.push(`${n(v)} gaming set${Number(v) > 1 ? "s" : ""}`);
    else if (k === "anyMusicalInstrument") parts.push(`${n(v)} musical instrument${Number(v) > 1 ? "s" : ""}`);
    else if (k === "anyTool") parts.push(`${n(v)} tool${Number(v) > 1 ? "s" : ""}`);
    else if (v) parts.push(plainName(k.split("|")[0]));
  }
  const t = parts.join(" and ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const TRAINING_FIELDS = ["skillProficiencies", "languageProficiencies", "toolProficiencies", "weaponProficiencies", "armorProficiencies", "savingThrowProficiencies", "skillToolLanguageProficiencies", "expertise"];

/**
 * Everything an entry trains: skills, languages, tools, weapons, armor, saves, expertise, senses. In 5e.tools a list
 * with more than one entry is a choice between them ("Thieves' tools, or one gaming set and one musical
 * instrument"), so each entry becomes an option of its own and the character takes one. A language given as
 * "other" is the one the entry's text names (the Kalashtar's Quori); only when the text names none is it a choice.
 */
function trainingRules(e: J, label: string, out: AElement[], ctx: Ctx, idBase: string): ARule[] {
  const rules: ARule[] = [];
  const single: J = { ...e };
  for (const f of TRAINING_FIELDS) {
    const list = e[f] as J[] | undefined;
    if (!Array.isArray(list) || list.length < 2) continue;
    delete single[f];
    const ids = list.map((entry, i) => {
      const oid = `${idBase}_${slug(f)}_OPTION_${i + 1}`;
      const optRules = trainingRules({ [f]: [entry], entries: e.entries }, label, out, ctx, oid);
      out.push(base(oid, describeSet(entry) || `Option ${i + 1}`, "Training Option", "5etools", { compendiumHidden: true, supports: [`${idBase} ${f} options`], rules: optRules }));
      return oid;
    });
    rules.push({ kind: "select", type: "Training Option", name: `${label}: ${f.replace(/Proficiencies$/, "").replace(/([A-Z])/g, " $1").toLowerCase()} (choose one set)`, supports: ids.join("|"), number: 1 });
  }
  rules.push(...skillRules(single.skillProficiencies, label));
  // "other": the language the entry's own text names.
  const langs = (single.languageProficiencies as J[] | undefined)?.map((entry) => {
    if (!entry?.other) return entry;
    const text = stripTags(JSON.stringify(e.entries ?? "")).toLowerCase();
    const named = (ctx.languageNames ?? []).filter((n) => n.length > 3 && !(n in entry) && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text));
    if (!named.length) return entry;
    const { other, ...rest } = entry;
    void other;
    return { ...rest, ...Object.fromEntries(named.map((n) => [n, true])) };
  });
  rules.push(...langRules(langs, label).rules);
  rules.push(...profRules(single, label, out));
  return rules;
}

/**
 * Ability score increases. A list of more than one entry is a choice between them (the 2024 backgrounds: +2 and +1,
 * or +1 to three; the 2024 Ability Score Improvement feat: +2 to one, or +1 to two), as 5e.tools lists alternatives
 * everywhere; given `sets`, each becomes an option and the character takes one.
 */
function abilityRules(list: J[] | undefined, label: string, sets?: { out: AElement[]; idBase: string }): ARule[] {
  if (sets && Array.isArray(list) && list.length > 1) {
    const words = (entry: J) => {
      const c = entry.choose as J | undefined;
      if (c?.weighted) { const w = c.weighted.weights as number[]; return w.every((x) => x === 1) ? `+1 to ${w.length} scores` : w.map((x, i) => `+${x} to ${i ? "another score" : "one score"}`).join(" and "); }
      if (c) return `+${c.amount ?? 1} to ${(c.count ?? 1) > 1 ? `${c.count} scores` : "one score"}`;
      return Object.entries(entry).filter(([k]) => k in ABIL).map(([k, v]) => `${cap(abilFull(k))} +${v}`).join(", ");
    };
    const ids = list.map((entry, i) => {
      const oid = `${sets.idBase}_ABILITY_OPTION_${i + 1}`;
      if (!sets.out.some((o) => o.id === oid)) sets.out.push(base(oid, words(entry) || `Option ${i + 1}`, "Ability Score Improvement", "5etools", { compendiumHidden: true, supports: [`${sets.idBase} ability options`], rules: abilityRules([entry], label) }));
      return oid;
    });
    return [{ kind: "select", type: "Ability Score Improvement", name: `${label}: ability score increases (choose one)`, supports: ids.join("|"), number: 1 }];
  }
  const rules: ARule[] = [];
  for (const entry of list ?? []) {
    for (const [k, v] of Object.entries(entry)) {
      if (k in ABIL && typeof v === "number") rules.push({ kind: "stat", name: abilFull(k), value: String(v) });
      else if (k === "choose") {
        const c = v as J;
        if (c.weighted) {
          const from = (c.weighted.from as string[]).map((a) => a.toUpperCase());
          for (const w of c.weighted.weights as number[]) rules.push({ kind: "select", type: "Ability Score Improvement", name: `${label} (+${w})`, supports: `5et asi one,amt${w},(${from.join("||")})`, number: 1 });
        } else {
          const from = ((c.from as string[]) ?? Object.keys(ABIL)).map((a) => a.toUpperCase());
          rules.push({ kind: "select", type: "Ability Score Improvement", name: `${label} (+${c.amount ?? 1})`, supports: `5et asi one,amt${c.amount ?? 1},(${from.join("||")})`, number: c.count ?? 1 });
        }
      }
    }
  }
  return rules;
}

// ---------------------------------------------------------------- converters

interface Ctx {
  books: Record<string, string>;
  /** Every language the data lists, lower case, for "other" languages a species names only in its text. */
  languageNames?: string[];
  spellClasses: Record<string, Record<string, string[]>>;
  /** Base items by "name|source" for items that build on one. */
  baseItems: Map<string, J>;
}

/**
 * A book's name from its 5e.tools code. A playtest code the book list does not name ("UATheMysticClass") becomes
 * "Unearthed Arcana: The Mystic Class", so it counts as playtest material and meets Aurora's copy of the same article.
 */
// Playtest codes as Plutonium tells them: "UA..." (Unearthed Arcana) and "XUA..." (the One D&D playtest).
const srcName = (ctx: Ctx, code: string) => ctx.books[code] ?? (/^X?UA[A-Z0-9]/.test(code) ? `Unearthed Arcana: ${code.replace(/^X?UA/, "").replace(/([a-z])([A-Z0-9])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")}` : code);

function convertSpell(s: J, ctx: Ctx): AElement {
  const comp = s.components ?? {};
  const time = (s.time?.[0] ? `${s.time[0].number ?? 1} ${s.time[0].unit}` : "").replace(/^1 action$/, "Action").replace(/^1 bonus$/, "Bonus Action").replace(/^1 reaction$/, "Reaction");
  const r = s.range;
  const range = r?.type === "special" ? "Special" : r?.distance ? (r.distance.type === "self" || r.type === "self" ? "Self" : `${r.distance.amount ?? ""} ${r.distance.type}`.trim()) : "";
  const d = s.duration?.[0];
  const dur = d ? (d.type === "instant" ? "Instantaneous" : d.type === "permanent" ? "Until dispelled" : d.type === "special" ? "Special" : `${d.concentration ? "Concentration, up to " : ""}${d.duration?.amount ?? ""} ${d.duration?.type ?? ""}`.trim()) : "";
  const classes = ctx.spellClasses[s.source]?.[String(s.name).toLowerCase()] ?? s.classes?.fromClassList?.map((c: J) => c.name) ?? [];
  const mat = comp.m ? (typeof comp.m === "string" ? comp.m : comp.m.text ?? "") : "";
  const setters: Record<string, SetterValue> = {
    level: set(String(s.level ?? 0)), school: set(SCHOOL[s.school] ?? s.school ?? ""), time: set(time), range: set(range), duration: set(dur),
    hasVerbalComponent: set(comp.v ? "true" : "false"), hasSomaticComponent: set(comp.s ? "true" : "false"), hasMaterialComponent: set(comp.m ? "true" : "false"),
    isConcentration: set(d?.concentration ? "true" : "false"), isRitual: set(s.meta?.ritual ? "true" : "false"),
  };
  if (mat) setters.materialComponent = set(mat);
  return base(ftId("SPELL", s.name, s.source), s.name, "Spell", srcName(ctx, s.source), {
    supports: [...new Set<string>(classes)], setters,
    description: entriesHtml(s.entries) + entriesHtml(s.entriesHigherLevel),
  });
}

const cost = (cp: number | undefined): SetterValue | undefined => {
  if (!cp) return undefined;
  if (cp >= 100) return set(String(cp / 100), { currency: "gp" });
  if (cp >= 10) return set(String(cp / 10), { currency: "sp" });
  return set(String(cp), { currency: "cp" });
};

function convertItem(i: J, ctx: Ctx): AElement | null {
  if (!i.name) return null;
  // Magic variants and many entries reuse a base item for their weapon or armor statistics.
  const b: J = i.baseItem ? (ctx.baseItems.get(String(i.baseItem).toLowerCase()) ?? {}) : {};
  const m: J = { ...b, ...i };
  const t = String(m.type ?? "").split("|")[0];
  const weapon = t === "M" || t === "R" || !!m.weaponCategory || !!m.weapon;
  const armor = ["LA", "MA", "HA", "S"].includes(t);
  const magic = m.rarity && m.rarity !== "none" && m.rarity !== "unknown" && !(!i.baseItem && (weapon || armor) && m.source === (b.source ?? m.source) && !i.reqAttune && !i.bonusWeapon && !i.bonusAc);
  const type = weapon ? "Weapon" : armor ? "Armor" : magic ? "Magic Item" : "Item";
  const setters: Record<string, SetterValue> = { category: set(weapon ? "Weapons" : armor ? "Armor" : magic ? "Magic Items" : "Adventuring Gear") };
  const rules: ARule[] = [];
  // Futuristic technology (5e.tools' "age": laser rifles, powered armor) is "scifi" and renaissance or modern technology
  // (pistols, muskets, revolvers, rifles, modern vehicles) is "modern", each for its own global filter; a magic item
  // built on one ("+1 Laser Rifle") takes its base item's age.
  const supports: string[] = /^futuristic$/i.test(String(m.age ?? "")) ? ["scifi"] : /^(modern|renaissance)$/i.test(String(m.age ?? "")) ? ["modern"] : [];
  // Something that holds other things (a backpack, a pouch, a bag of holding), for "Kept in" in the inventory.
  // Only one that holds gear: a weight, or a volume of half a cubic foot or more (a bucket, a barrel). A liquid's small
  // measure (a waterskin, a flask, a vial) holds no gear; a quiver or a scroll case holds only what it is made for (C7.3).
  const holdsCap = m.containerCapacity as { weight?: number[]; volume?: number[]; item?: Record<string, number>[] } | undefined;
  if (holdsCap) {
    if (holdsCap.weight?.length || Math.max(0, ...(holdsCap.volume ?? [])) >= 0.5) supports.push("container");
    else if (holdsCap.item?.length) {
      supports.push("container-for");
      setters.holds = set([...new Set(holdsCap.item.flatMap((g) => Object.keys(g).map((k) => k.split("|")[0].replace(/\s*\(.*\)$/, ""))))].join("; "));
    }
  }
  // A spellcasting focus is filed in its group, as Aurora files it (C7.7: "an arcane focus" in starting gear offers them).
  const scf = ({ arcane: "Arcane Focus", druid: "Druidic Focus", holy: "Holy Symbol" } as Record<string, string>)[String(m.scfType ?? "")];
  if (scf) setters.container = set(scf);
  if (m.weight !== undefined) setters.weight = set(`${m.weight} lb.`, { lb: String(m.weight) });
  // A magic item without a price of its own keeps its base item's as "base cost" (a +1 Longsword is not 15 gp); the
  // shop prices it by rarity on top when the character uses rarity prices, as Plutonium does (src/aurora/shop.ts).
  const ownless = magic && i.value == null && b.value != null;
  const c = cost(ownless ? undefined : m.value);
  if (c) setters.cost = c;
  const bc = ownless ? cost(b.value) : undefined;
  if (bc) setters["base cost"] = bc;
  if (magic && (m.miscTags ?? []).includes("CNS")) setters.consumable = set("true");
  // Every item with a real rarity keeps it, the common magic weapons too (a Staff of Adornment is not a plain staff:
  // starting gear's "any simple weapon" offered it, Chris 2026-10-29).
  if (magic || (m.rarity && m.rarity !== "none" && m.rarity !== "unknown")) setters.rarity = set(`${cap(String(m.rarity))}${m.reqAttune ? " (requires attunement)" : ""}`);
  if (weapon) {
    if (m.dmg1) setters.damage = set(String(m.dmg1), { type: DMG[m.dmgType] ?? "" });
    if (m.dmg2) setters.versatile = set(String(m.dmg2));
    const props = ((m.property as string[]) ?? []).map((p) => String(p).split("|")[0]);
    for (const p of props) supports.push(PROP[p] ?? p.toLowerCase());
    if (t === "R" || props.includes("A")) supports.push("ranged");
    const cat = m.weaponCategory === "martial" ? "MARTIAL" : "SIMPLE";
    supports.push(cat.toLowerCase());
    setters.proficiency = set(`ID_5ET_PROF_WEAPON_${cat},${ftId("PROF_WEAPON", m.name.replace(/^[+-]\d+ /, ""), "ALL")}`);
    setters.slot = set("onehand");
    // The 2024 mastery property ("Topple|XPHB"), in the id the sheet reads masteries by.
    for (const ms of (m.mastery as string[]) ?? []) supports.push(`ID_WOTC_PHB24_WEAPON_PROPERTY_${String(ms).split("|")[0].toUpperCase().replace(/[^A-Z]+/g, "_")}`);
    if (m.bonusWeapon) setters.attackBonus = set(String(parseInt(m.bonusWeapon, 10) || 0));
    if (m.bonusWeaponDamage || m.bonusWeapon) setters.damageBonus = set(String(parseInt(m.bonusWeaponDamage ?? m.bonusWeapon, 10) || 0));
  }
  if (armor) {
    const kind = t === "LA" ? "Light" : t === "MA" ? "Medium" : t === "HA" ? "Heavy" : "Shield";
    setters.armor = set(kind);
    setters.armorClass = set(t === "S" ? `+${m.ac ?? 2}` : String(m.ac ?? ""));
    setters.slot = set(t === "S" ? "onehand,secondary" : "body");
    if (m.strength) setters.strength = set(String(m.strength));
    if (m.stealth) setters.stealth = set("Disadvantage");
    if (t === "S") rules.push({ kind: "stat", name: "ac:shield", value: String(m.ac ?? 2), bonus: "shield" });
    else if (m.ac) rules.push({ kind: "stat", name: "ac:armored:armor", value: String(m.ac) });
  }
  // Magic bonuses that apply while the item is worn or wielded.
  const bonus = (v: unknown) => (typeof v === "string" ? parseInt(v, 10) || 0 : Number(v) || 0);
  if (m.bonusAc) rules.push({ kind: "stat", name: "ac:misc", value: String(bonus(m.bonusAc)), bonus: "magic" });
  if (m.bonusSavingThrow) for (const a of Object.values(ABIL)) rules.push({ kind: "stat", name: `${a}:save:misc`, value: String(bonus(m.bonusSavingThrow)) });
  if (m.bonusSpellAttack) rules.push({ kind: "stat", name: "spellcasting:attack", value: String(bonus(m.bonusSpellAttack)) }); // the name Aurora content and the engine use
  if (m.bonusSpellSaveDc) rules.push({ kind: "stat", name: "spellcasting:dc", value: String(bonus(m.bonusSpellSaveDc)) });
  // Charges, as Aurora's items keep them, and how they come back.
  if (m.charges !== undefined) setters.charges = set(String(m.charges));
  if (m.recharge) setters.recharge = set(`${m.recharge}${m.rechargeAmount ? ` (${stripTags(String(m.rechargeAmount))})` : ""}`);
  // Who may attune: any one of the tags (a class, any spellcaster); in the requirement syntax the checker reads.
  const attune = ((m.reqAttuneTags as J[]) ?? []).map((t) => (t.class ? `[level:${String(t.class).split("|")[0].toLowerCase()}:1]` : t.spellcasting ? "[type:spell]" : "")).filter(Boolean);
  if (attune.length) setters["attune requirements"] = set(attune.length > 1 ? `(${attune.join("||")})` : attune[0]);
  if (m.critThreshold) setters.critRange = set(String(m.critThreshold));
  if (m.dexterityMax !== undefined && m.dexterityMax !== null) setters["dexterity max"] = set(String(m.dexterityMax));

  if (m.bonusWeaponAttack) setters.attackBonus = set(String((parseInt(setters.attackBonus?.value ?? "0", 10) || 0) + bonus(m.bonusWeaponAttack)));
  if (m.bonusProficiencyBonus) rules.push({ kind: "stat", name: "proficiency", value: String(bonus(m.bonusProficiencyBonus)) });
  // A bonus to every ability check: every skill, and initiative (a Dexterity check).
  if (m.bonusAbilityCheck) for (const sk of [...SKILLS, "initiative"]) rules.push({ kind: "stat", name: sk === "initiative" ? "initiative" : `${sk}:misc`, value: String(bonus(m.bonusAbilityCheck)) });
  // Speeds an item sets or adds: {static: {fly: 30}}, {bonus: {"*": 5}}, {equal: {fly: "walk"}}.
  const sp = m.modifySpeed as J | undefined;
  if (sp) {
    for (const [mode, v] of Object.entries((sp.static as J) ?? {})) rules.push({ kind: "stat", name: mode === "walk" ? "innate speed" : `innate speed:${mode}`, value: String(v), bonus: "item speed" });
    for (const [mode, v] of Object.entries((sp.bonus as J) ?? {})) for (const md of mode === "*" ? ["walk", "climb", "fly", "swim", "burrow"] : [mode]) rules.push({ kind: "stat", name: md === "walk" ? "speed:misc" : `speed:${md}:misc`, value: String(v) });
    for (const [mode, v] of Object.entries((sp.equal as J) ?? {})) if (v === "walk") rules.push({ kind: "stat", name: `innate speed:${mode}`, value: "speed", bonus: "item speed" });
  }
  if (m.ability && typeof m.ability === "object") {
    for (const [k, v] of Object.entries(m.ability.static ?? {})) rules.push({ kind: "stat", name: `${abilFull(k)}:score:set`, value: String(v) });
    for (const [k, v] of Object.entries(m.ability)) if (k in ABIL && typeof v === "number") rules.push({ kind: "stat", name: abilFull(k), value: String(v) });
  }
  // The spells an item lets its wearer cast, listed with the item (casting them uses the item's own rules).
  const attached = m.attachedSpells as J | string[] | undefined;
  const spellNames = Array.isArray(attached) ? attached : attached ? Object.values(attached).flatMap((x) => (Array.isArray(x) ? x : Object.values(x as J).flat())) : [];
  const desc = (entriesHtml(m.entries) || (m.type ? "" : "")) + (spellNames.length ? `<p><b>Spells:</b> ${esc(spellNames.map((x) => titleCase(plainName(String(x).split("|")[0].split("#")[0]))).join(", "))}</p>` : "");
  return base(ftId("ITEM", i.name, i.source ?? m.source), i.name, type, srcName(ctx, i.source ?? m.source), { supports, setters, rules, description: desc });
}

/** Feats like Magic Initiate offer one variant per spell list; each becomes its own feat. */
function featVariants(f: J, ctx: Ctx, out: AElement[]): boolean {
  const adds = (f.additionalSpells as J[] | undefined) ?? [];
  const groups = adds.filter((a) => /spells$/i.test(String(a.name ?? "")) && (a.known?._ || a.innate?._));
  if (groups.length < 2) return false;
  for (const g of groups) {
    const list = String(g.name).replace(/\s*spells$/i, "");
    const rules: ARule[] = [];
    // A chosen ability (Intelligence, Wisdom or Charisma): its first is the default until the player picks.
    const ability = Array.isArray(g.ability?.choose) ? g.ability.choose[0] : g.ability;
    rules.push(...castingAbilityChoice(g.ability, `${f.name} (${list})`, f.source, out));
    const known = (g.known?._ as J[]) ?? [];
    for (const k of known) if (k.choose) rules.push({ kind: "select", type: "Spell", name: `${list} cantrip`, supports: `${list}, 0`, number: k.count ?? 1, spellcasting: `${f.name} (${list})` });
    const inn = Object.values(g.innate?._?.daily ?? {}).flat() as J[];
    for (const k of inn) if (k.choose) rules.push({ kind: "select", type: "Spell", name: `${list} level 1 spell`, supports: `${list}, 1`, number: 1, spellcasting: `${f.name} (${list})` });
    const name = `${f.name} (${list})`;
    const html = entriesHtml(f.entries);
    out.push({
      ...base(ftId("FEAT", name, f.source), name, "Feat", srcName(ctx, f.source), { supports: ["5et feat", ...(f.category ? [`category ${f.category}`] : [])], rules, description: html, sheet: { display: true, descriptions: [{ text: html }] } }),
      spellcasting: { name: `${f.name} (${list})`, ability: ability ? cap(abilFull(ability)) : "Intelligence", prepare: false, list: [list], extendLists: [] },
    });
  }
  return true;
}

function convertFeat(f: J, ctx: Ctx, out: AElement[]): AElement {
  const reqs: string[] = [];
  for (const p of (f.prerequisite as J[]) ?? []) {
    const ab = p.ability as J[] | undefined;
    if (ab) reqs.push(`(${ab.map((o) => Object.entries(o).map(([k, v]) => `[${k}:${v}]`).join(",")).join("||")})`);
    if (p.level) reqs.push(`[level:${typeof p.level === "object" ? p.level.level : p.level}]`);
  }
  const rules = [...abilityRules(f.ability, f.name, { out, idBase: ftId("FEAT", f.name, f.source) }), ...trainingRules(f, f.name, out, ctx, ftId("FEAT", f.name, f.source)), ...defenseRules(f)];
  const spells = additionalSpellRules(f.additionalSpells, f.name, f.source, out);
  rules.push(...spells.rules);
  // The options a feat teaches (Martial Adept's maneuvers, Metamagic Adept's options, Fighting Initiate's style).
  rules.push(...optionalFeatureRules(f, rules));
  const html = entriesHtml(f.entries);
  return base(ftId("FEAT", f.name, f.source), f.name, "Feat", srcName(ctx, f.source), {
    // A feat the rules let a character take more than once (Elemental Adept, Ability Score Improvement).
    ...(f.repeatable ? { setters: { "allow duplicate": set("true") } } : {}),
    spellcasting: spells.rules.length ? castingFor(f.name, spells.ability) : undefined,
    supports: ["5et feat", ...(f.category ? [`category ${f.category}`] : [])], rules,
    requirements: reqs.length ? reqs.join(",") : undefined, description: html,
    sheet: { display: true, descriptions: [{ text: html }] },
  });
}

/**
 * Proficiencies a feature's text gives that 5e.tools (and Plutonium's Foundry data) keep only as text: "You gain
 * proficiency in Wisdom saving throws", "with heavy armor and smith's tools", "in the Performance skill" (Forge Domain,
 * Bladesinging, Gloom Stalker, Samurai: their Aurora twins grant these). Only sentences naming exactly what they give;
 * "one type of weapon of your choice" and "you instead gain" are left alone.
 */
function textProficiencies(entries: unknown, out?: AElement[]): ARule[] {
  if (!out) return [];
  const rules: ARule[] = [];
  const text = stripTags(JSON.stringify(entries ?? [])).replace(/\\"/g, '"');
  const TOOLS = new Set(Object.values(TOOL_KINDS).flat());
  for (const m of text.matchAll(/\byou (?:also )?gain proficiency (?:in|with) (.+?)(?:\.|,? (?:and you|if|but|while|when|which)\b|"|$)/gi)) {
    for (const raw of m[1].split(/,\s*(?:and\s+)?|\s+and\s+/)) {
      const x = raw.trim().toLowerCase().replace(/[’‘`]/g, "'").replace(/^the\s+/, "");
      let r: RegExpExecArray | null;
      if ((r = /^(strength|dexterity|constitution|intelligence|wisdom|charisma) saving throws?$/.exec(x))) rules.push({ kind: "grant", type: "Proficiency", id: `ID_5ET_SAVE_${slug(r[1])}` });
      else if ((r = /^(light|medium|heavy) armor$/.exec(x))) rules.push({ kind: "grant", type: "Proficiency", id: ARMOR_IDS[r[1]] });
      else if (x === "shields") rules.push({ kind: "grant", type: "Proficiency", id: ARMOR_IDS.shield });
      else if (x === "martial weapons") { const w = weaponId("martial", out); if (w) rules.push({ kind: "grant", type: "Proficiency", id: w }); }
      else if ((r = /^([a-z ]+) skill$/.exec(x)) && SKILLS.includes(r[1])) rules.push({ kind: "grant", type: "Proficiency", id: skillIdOf(r[1]) });
      else if (TOOLS.has(x)) rules.push({ kind: "grant", type: "Proficiency", id: toolId(x, out) });
    }
  }
  return rules;
}

function featureElement(f: J, kind: string, type: string, id: string, ctx: Ctx, hide = false, out?: AElement[]): AElement {
  const html = entriesHtml(f.entries);
  // What a use of this feature spends ("consumes": Turn Undead spends a Channel Divinity), as Plutonium links them.
  const c = f.consumes as J | undefined;
  const setters = c?.name ? { consumes: set(String(c.name), { amount: String(Number(c.amount) || 1) }) } : undefined;
  // A feature named after the creature it tags ("Steel Defender" and its {@creature steel defender|tce}) gives that
  // creature as a companion (found by name and book once all content is in: registry.ts resolveCreatureRefs).
  const own = [...JSON.stringify(f.entries ?? []).matchAll(/@creature ([^|}]+)(?:\|([^|}]*))?/g)].find((m) => m[1].trim().toLowerCase() === String(f.name).toLowerCase());
  const rules: ARule[] = [...(own ? [{ kind: "grant", type: "Companion", id: `CREATUREREF:${own[1].trim().toLowerCase()}|${(own[2] ?? "").trim().toLowerCase()}` } as ARule] : []), ...textProficiencies(f.entries, out)];
  return base(id, f.name, type, srcName(ctx, f.source), { description: html, sheet: { display: !hide, descriptions: [{ text: html }] }, supports: [kind], rules, ...(setters ? { setters } : {}) });
}

function languageElement(l: J, ctx: Ctx): AElement {
  return base(`ID_5ET_LANGUAGE_${slug(l.name)}`, l.name, "Language", srcName(ctx, l.source ?? "PHB"), {
    supports: [String(l.type ?? "standard").toLowerCase(), "5et language"], description: entriesHtml(l.entries),
    setters: { script: set(l.script ?? ""), speakers: set(Array.isArray(l.typicalSpeakers) ? l.typicalSpeakers.join(", ") : "") },
  });
}

function speedRules(sp: J): ARule[] {
  const rules: ARule[] = [];
  const walk = typeof sp === "number" ? sp : sp?.walk;
  rules.push({ kind: "stat", name: "innate speed", value: String(walk ?? 30), bonus: "base" });
  if (sp && typeof sp === "object") for (const k of ["fly", "swim", "climb", "burrow"]) {
    const v = sp[k];
    if (v === true) rules.push({ kind: "stat", name: `innate speed:${k}`, value: "innate speed", bonus: "base" });
    else if (typeof v === "number") rules.push({ kind: "stat", name: `innate speed:${k}`, value: String(v), bonus: "base" });
  }
  return rules;
}

function traitList(entries: J[] | undefined, parentId: string, ctx: Ctx, source: string, out: AElement[], kind: string, type: string): ARule[] {
  const rules: ARule[] = [];
  for (const e of entries ?? []) {
    if (!e || typeof e !== "object" || !e.name) continue;
    const id = `${parentId}_T_${slug(e.name)}`;
    out.push(featureElement({ name: e.name, source, entries: e.entries ?? [] }, kind, type, id, ctx));
    rules.push({ kind: "grant", type, id });
  }
  return rules;
}

/** Versions written as a template (the Dragonborn colours: "_abstract" plus "_implementations"), one per implementation. */
function expandVersions(list: J[]): J[] {
  const out: J[] = [];
  for (const v of list) {
    if (!v?._abstract || !Array.isArray(v._implementations)) { out.push(v); continue; }
    for (const impl of v._implementations as J[]) {
      const vars = (impl._variables as Record<string, string>) ?? {};
      const filled = JSON.parse(JSON.stringify(v._abstract).replace(/\{\{(\w+)\}\}/g, (m, k) => vars[k] ?? m));
      const { _variables, ...rest } = impl;
      void _variables;
      out.push({ ...filled, ...rest });
    }
  }
  return out;
}

/** Damage resistances, immunities and condition immunities, as the entries Aurora content grants for them. */
function defenseRules(r: J, owner = String(r.name ?? "")): ARule[] {
  const rules: ARule[] = [];
  const LABEL: Record<string, string> = { DAMAGE_RESISTANCE: "Damage resistance", DAMAGE_IMMUNITY: "Damage immunity", DAMAGE_VULNERABILITY: "Damage vulnerability", CONDITION_IMMUNITY: "Condition immunity" };
  const add = (list: unknown, kind: string) => {
    for (const x of (Array.isArray(list) ? list : []) as unknown[]) {
      if (typeof x === "string") rules.push({ kind: "grant", type: "Condition", id: `ID_INTERNAL_CONDITION_${kind}_${slug(x)}` });
      // {"choose": {"from": [...], "count": 2}}: the player picks (Boon of Energy Resistance, the Dragonborn's type).
      else if (x && typeof x === "object" && Array.isArray((x as J).choose?.from)) {
        const ids = ((x as J).choose.from as string[]).map((t) => `ID_INTERNAL_CONDITION_${kind}_${slug(t)}`);
        rules.push({ kind: "select", type: "Condition", name: `${LABEL[kind]} (${owner})`, supports: ids.join("||"), number: Number((x as J).choose.count) || 1 } as ARule);
      }
    }
  };
  add(r.resist, "DAMAGE_RESISTANCE");
  add(r.immune, "DAMAGE_IMMUNITY");
  add(r.vulnerable, "DAMAGE_VULNERABILITY");
  add(r.conditionImmune, "CONDITION_IMMUNITY");
  return rules;
}

/**
 * A species "_version" merged onto the species, the way 5e.tools does: plain fields replace the species' own, and
 * "_mod" edits its lists ("replaceArr" swaps the entry of that name, "appendArr", "insertArr", "removeArr").
 */
function applyVersion(r: J, v: J): J | undefined {
  if (!v || typeof v !== "object") return undefined;
  const out: J = { ...r, ...v };
  delete out._versions;
  applyMods(out, v._mod as J);
  delete out._mod;
  return out;
}

/**
 * 5e.tools' "_mod" changes, applied to `out` in place: per field, arrays edited by the entry name (replaceArr,
 * appendArr, prependArr, insertArr, removeArr) and text replaced across the field (replaceTxt). "*" applies the
 * text replacement to every field.
 */
function applyMods(out: J, mods: J | undefined): void {
  for (const [field, raw] of Object.entries(mods ?? {})) {
    for (const m of Array.isArray(raw) ? raw : [raw]) {
      if (m === "remove") { delete out[field]; continue; }
      if (m?.mode === "replaceTxt") {
        const re = new RegExp(String(m.replace ?? ""), String(m.flags ?? "g"));
        const swap = (x: unknown): unknown => (typeof x === "string" ? x.replace(re, String(m.with ?? "")) : Array.isArray(x) ? x.map(swap) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x as J).map(([k, y]) => [k, k === "name" ? y : swap(y)])) : x);
        for (const f of field === "*" ? Object.keys(out).filter((k) => !k.startsWith("_") && k !== "name" && k !== "source") : [field]) if (out[f] !== undefined) out[f] = swap(out[f]);
        continue;
      }
      let list: J[] = Array.isArray(out[field]) ? [...out[field]] : out[field] !== undefined ? [out[field]] : [];
      const items = m?.items === undefined ? [] : Array.isArray(m.items) ? m.items : [m.items];
      const at = (name: unknown) => list.findIndex((e) => (e && typeof e === "object" ? e.name : e) === name);
      if (m?.mode === "replaceArr") { const i = at(m.replace); if (i >= 0) list.splice(i, 1, ...items); else list.push(...items); }
      else if (m?.mode === "appendArr") list.push(...items);
      else if (m?.mode === "prependArr") list.unshift(...items);
      else if (m?.mode === "insertArr") list.splice(Math.max(0, Number(m.index) || 0), 0, ...items);
      else if (m?.mode === "removeArr") { for (const n of [].concat(m.names ?? m.items ?? [])) { const i = at(typeof n === "object" && n ? (n as J).name : n); if (i >= 0) list.splice(i, 1); } }
      else continue;
      out[field] = list;
    }
  }
}

/** What a copy does not take from its original unless "_preserve" says so: where and how the original was published. */
const NOT_COPIED = ["page", "srd", "srd52", "basicRules", "basicRules2024", "reprintedAs", "otherSources", "additionalSources", "hasFluff", "hasFluffImages", "_versions"];

/**
 * Resolves "_copy" everywhere in the data, before anything is converted: a reprint written as "the VGM Goblin, with
 * these changes" (the GGR and ERLW Goblins, many subclasses, items and backgrounds) becomes a whole entry. The
 * original is found in the same list by every identifying field the copy names (name, source, className...).
 */
export function resolveCopies(files: Record<string, J>): Record<string, J> {
  const lists = new Map<string, J[]>();
  for (const json of Object.values(files)) {
    if (!json || typeof json !== "object" || Array.isArray(json)) continue;
    for (const [kind, v] of Object.entries(json)) if (Array.isArray(v)) (lists.get(kind) ?? lists.set(kind, []).get(kind)!).push(...v);
  }
  const lc = (x: unknown) => String(x ?? "").toLowerCase();
  const done = new Map<J, J>();
  const resolveOne = (kind: string, e: J, depth: number): J => {
    if (!e?._copy || depth > 8) return e;
    const hit = done.get(e);
    if (hit) return hit;
    const ref = e._copy as J;
    const keys = Object.keys(ref).filter((k) => !k.startsWith("_"));
    const original = (lists.get(kind) ?? []).find((o) => o !== e && keys.every((k) => lc(o[k]) === lc(ref[k])));
    if (!original) return e;
    const base: J = JSON.parse(JSON.stringify(resolveOne(kind, original, depth + 1)));
    const keep = (ref._preserve as J) ?? {};
    for (const f of NOT_COPIED) if (!keep[f] && !keep["*"]) delete base[f];
    const { _copy, ...own } = e;
    void _copy;
    const out: J = { ...base, ...own };
    applyMods(out, ref._mod as J);
    done.set(e, out);
    return out;
  };
  const result: Record<string, J> = {};
  for (const [path, json] of Object.entries(files)) {
    if (!json || typeof json !== "object" || Array.isArray(json)) { result[path] = json; continue; }
    result[path] = Object.fromEntries(Object.entries(json).map(([kind, v]) => [kind, Array.isArray(v) ? v.map((x) => (x && typeof x === "object" && x._copy ? resolveOne(kind, x, 0) : x)) : v]));
  }
  return result;
}

function convertRace(r: J, ctx: Ctx, subs: J[], out: AElement[]): void {
  const id = ftId("RACE", r.name, r.source);
  const rules: ARule[] = [...speedRules(r.speed), ...abilityRules(r.ability, r.name, { out, idBase: id }), ...trainingRules(r, r.name, out, ctx, id), ...defenseRules(r)];
  // A species that lists no languages (the Ravenloft lineages, for one) leaves them to the character's origin: under
  // the 2024 rules, Common and two standard languages.
  if (!r.languageProficiencies?.length) {
    rules.push({ kind: "grant", type: "Language", id: "ID_5ET_LANGUAGE_COMMON" });
    rules.push({ kind: "select", type: "Language", name: `${r.name} language`, supports: "standard", number: 2 });
  }
  // A species on the custom-lineage rule chooses its increases (the background's, under the 2024 rules, instead).
  if (r.lineage && !abilityRules(r.ability, r.name).length) {
    rules.push({ kind: "select", type: "Ability Score Improvement", name: `Ability score increases (${r.name})`, supports: "5et asi pattern", number: 1, requirements: "!ID_INTERNAL_GRANTS_BACKGROUND_ASI" });
    rules.push({ kind: "grant", type: "Information", id: MARK_SPECIES_ASI, requirements: "!ID_INTERNAL_GRANTS_BACKGROUND_ASI" });
  }
  // Older (2014) species carry their own ability score increases. The 2024 background's would count a second time.
  if (abilityRules(r.ability, r.name).length) rules.push({ kind: "grant", type: "Information", id: MARK_SPECIES_ASI });
  // Creature types ("humanoid", or a choice such as fey or humanoid), shown with the species.
  const types = ((r.creatureTypes as string[]) ?? []).map((t) => cap(String(t)));
  const raceSetters: Record<string, SetterValue> = types.length ? { "creature type": set(types.join(" or ")) } : {};
  if (r.blindsight) {
    const bid = `${id}_BLINDSIGHT`;
    out.push(base(bid, `Blindsight (${r.blindsight} ft.)`, "Vision", srcName(ctx, r.source), { compendiumHidden: true }));
    rules.push({ kind: "grant", type: "Vision", id: bid });
  }
  if (r.darkvision) {
    const vid = `${id}_DARKVISION`;
    out.push(base(vid, `Darkvision (${r.darkvision} ft.)`, "Vision", srcName(ctx, r.source), { compendiumHidden: true }));
    rules.push({ kind: "grant", type: "Vision", id: vid });
  }
  // A species whose versions each carry one of its spell sets (the 2024 Elf's lineages, the Tiefling's legacies)
  // gives them with the version; the species itself gives none.
  const setsInVersions = (r.additionalSpells?.length ?? 0) > 1 && ((r._versions as J[]) ?? []).length > 0;
  const racialSpells = setsInVersions ? { rules: [] as ARule[], ability: undefined } : additionalSpellRules(r.additionalSpells, r.name, r.source, out);
  rules.push(...racialSpells.rules);
  // Its own ids: Aurora's ID_INTERNAL_RACIAL_TRAIT_* are a different kind of entry (a size choice), and loading these
  // after Aurora replaced them (the 2024 Aasimar's size choice lost its options). A species of more than one size
  // (the Dhampir: Small or Medium) lets the player choose.
  const SIZE_NAMES: Record<string, string> = { T: "Tiny", S: "Small", M: "Medium", L: "Large" };
  const sizeIds = (Array.isArray(r.size) ? r.size : [r.size]).filter((x: string) => SIZE_NAMES[x]).map((x: string) => {
    const sid = `ID_5ET_SIZE_${SIZE_NAMES[x].toUpperCase()}`;
    if (!out.some((o) => o.id === sid)) out.push(base(sid, SIZE_NAMES[x], "Size", "5etools", { compendiumHidden: true, supports: ["5et size"] }));
    return sid;
  });
  if (sizeIds.length === 1) rules.push({ kind: "grant", type: "Size", id: sizeIds[0] });
  else if (sizeIds.length > 1) rules.push({ kind: "select", type: "Size", name: `Size (${r.name})`, supports: sizeIds.join("|"), number: 1 });
  const replacedByVersions = new Set<string>();
  for (const v of expandVersions((r._versions as J[]) ?? [])) {
    const mods = (v?._mod?.entries ?? v?._abstract?._mod?.entries) as J;
    for (const m of Array.isArray(mods) ? mods : mods ? [mods] : []) {
      if (m?.mode === "replaceArr" && typeof m.replace === "string") replacedByVersions.add(m.replace);
      if (m?.mode === "removeArr") for (const n of [].concat(m.names ?? [])) replacedByVersions.add(n);
    }
  }
  const baseEntries = ((r.entries as J[]) ?? []).filter((e) => !(e && typeof e === "object" && replacedByVersions.has(e.name)));
  rules.push(...traitList(baseEntries, id, ctx, r.source, out, "5et trait", "Racial Trait"));
  const mine = subs.filter((s) => s.raceName === r.name && (s.raceSource ?? r.source) === r.source);
  // A subrace that overwrites a field (Duergar: languages; Draconblood: ability scores) replaces the species' own:
  // the species' rules from that field do not apply with it.
  const overwriting = (field: string) => mine.filter((s) => s.overwrite?.[field]).map((s) => ftId("SUBRACE", `${r.name} ${s.name ?? "Base"}`, s.source));
  const gate = (pick: (x: ARule) => boolean, ids: string[]) => {
    if (!ids.length) return;
    const not = ids.map((x) => `!${x}`).join(",");
    for (let i = 0; i < rules.length; i++) if (pick(rules[i])) rules[i] = { ...rules[i], requirements: rules[i].requirements ? `${rules[i].requirements},${not}` : not } as ARule;
  };
  gate((x) => (x.kind === "stat" && Object.values(ABIL).includes(x.name as never)) || (x.kind === "select" && x.type === "Ability Score Improvement") || (x.kind === "grant" && x.id === MARK_SPECIES_ASI), overwriting("ability"));
  gate((x) => (x.kind === "grant" || x.kind === "select") && x.type === "Language", overwriting("languageProficiencies"));
  gate((x) => (x.kind === "grant" || x.kind === "select") && x.type === "Proficiency" && /SKILL|skill/.test(x.kind === "grant" ? x.id : x.supports), overwriting("skillProficiencies"));
  // A subrace is required. A subrace without a name is, in 5e.tools, the species as it is (the standard Human next
  // to the Variant Human); it is one of the options, "Human (standard)", so what it adds is not lost.
  // It starts on the standard one when there is one, so a fresh pick leaves nothing open; the player can change it.
  const standard = mine.find((s) => !s.name);
  if (mine.length) rules.push({ kind: "select", type: "Sub Race", name: "Subrace", supports: `5et subrace of ${id}`, number: 1, ...(standard ? { default: ftId("SUBRACE", `${r.name} Base`, standard.source) } : {}) } as ARule);
  // Lineages, legacies and ancestries kept as "_versions" of the species (the 2024 Elf's Drow, High Elf and Wood Elf).
  // Each becomes a required choice; it carries only what differs from the base species.
  const versions = expandVersions((r._versions as J[]) ?? []).map((v) => applyVersion(r, v)).filter(Boolean) as J[];
  if (versions.length) {
    const baseIds = new Set(rules.filter((x) => x.kind !== "grant" || x.type !== "Racial Trait").map((x) => JSON.stringify(x)));
    const baseTraits = new Set(((r.entries as J[]) ?? []).map((e) => JSON.stringify(e)));
    rules.push({ kind: "select", type: "Sub Race", name: `${r.name} ${/legacy/i.test(versions[0].name) ? "legacy" : /ancestry/i.test(versions[0].name) ? "ancestry" : "lineage"}`, supports: `5et version of ${id}`, number: 1 });
    for (const v of versions) {
      const vname = String(v.name).split(";").pop()!.trim() || String(v.name);
      const vid = ftId("RACEVERSION", `${r.name} ${vname}`, v.source ?? r.source);
      const vrules: ARule[] = [...speedRules(v.speed), ...abilityRules(v.ability, vname, { out, idBase: vid }), ...trainingRules(v, vname, out, ctx, vid), ...defenseRules(v, r.name)].filter((x) => !baseIds.has(JSON.stringify(x)));
      if (v.darkvision && v.darkvision !== r.darkvision) {
        const dv = `${vid}_DARKVISION`;
        out.push(base(dv, `Darkvision (${v.darkvision} ft.)`, "Vision", srcName(ctx, r.source), { compendiumHidden: true }));
        vrules.push({ kind: "grant", type: "Vision", id: dv });
      }
      const vSpells = JSON.stringify(v.additionalSpells) !== JSON.stringify(r.additionalSpells) ? additionalSpellRules(v.additionalSpells, vname, v.source ?? r.source, out) : { rules: [] as ARule[], ability: undefined };
      vrules.push(...vSpells.rules);
      const changed = ((v.entries as J[]) ?? []).filter((e) => !baseTraits.has(JSON.stringify(e)));
      vrules.push(...traitList(changed, vid, ctx, v.source ?? r.source, out, "5et trait", "Racial Trait"));
      out.push(base(vid, vname, "Sub Race", srcName(ctx, v.source ?? r.source), { supports: [`5et version of ${id}`], rules: vrules, spellcasting: vSpells.rules.length ? castingFor(vname, vSpells.ability) : undefined, description: entriesHtml(changed) }));
    }
  }
  // NPC races (the DMG's monsters played as NPCs) are not species a player character takes.
  out.push(base(id, r.name, "Race", srcName(ctx, r.source), { rules, setters: raceSetters, compendiumHidden: ((r.traitTags as string[]) ?? []).includes("NPC Race"), spellcasting: racialSpells.rules.length ? castingFor(r.name, racialSpells.ability) : undefined, description: entriesHtml(r.entries), supports: [] }));
  for (const s of mine) {
    const sid = ftId("SUBRACE", `${r.name} ${s.name ?? "Base"}`, s.source);
    const srules: ARule[] = [...abilityRules(s.ability, s.name ?? r.name, { out, idBase: sid }), ...trainingRules(s, s.name ?? r.name, out, ctx, sid), ...defenseRules(s)];
    if (abilityRules(s.ability, s.name ?? r.name).length) srules.push({ kind: "grant", type: "Information", id: MARK_SPECIES_ASI });
    if (s.speed) srules.push(...speedRules(s.speed));
    srules.push(...traitList(s.entries, sid, ctx, s.source, out, "5et trait", "Racial Trait"));
    const subSpells = additionalSpellRules(s.additionalSpells, s.name ?? r.name, s.source, out);
    srules.push(...subSpells.rules);
    out.push(base(sid, s.name ? `${s.name} ${r.name}` : `${r.name} (standard)`, "Sub Race", srcName(ctx, s.source), { spellcasting: subSpells.rules.length ? castingFor(s.name ?? r.name, subSpells.ability) : undefined, supports: [`5et subrace of ${id}`], rules: srules, description: entriesHtml(s.entries) }));
  }
}

const EQUIPMENT_TYPES: Record<string, string> = {
  setGaming: "gaming set", toolArtisan: "artisan's tools", instrumentMusical: "musical instrument",
  weaponSimple: "simple weapon", weaponMartial: "martial weapon", weaponSimpleMelee: "simple melee weapon",
  weaponMartialMelee: "martial melee weapon", weaponSimpleRanged: "simple ranged weapon", weaponMartialRanged: "martial ranged weapon",
  focusSpellcastingArcane: "arcane focus", focusSpellcastingHoly: "holy symbol", focusSpellcastingDruidic: "druidic focus",
};
/** "dungeoneer's pack" to "Dungeoneer's Pack": capitals at word starts only, not after an apostrophe. */
const titleCase = (t: string) => t.replace(/(^|[\s(-])([a-z])/g, (_, a, b) => a + b.toUpperCase());

/** One item of a 5e.tools starting-gear list, as a book writes it: "8 Javelins", "a gaming set", "14 GP". */
function gearText(it: unknown): string {
  if (typeof it === "string") return titleCase(plainName(it.split("|")[0]));
  const x = (it ?? {}) as J;
  const q = Number(x.quantity) || 1;
  if (x.value !== undefined) return `${Math.round(Number(x.value) / 100)} GP`;
  const worth = x.containsValue ? ` (with ${Math.round(Number(x.containsValue) / 100)} GP)` : "";
  if (x.equipmentType && !x.displayName) {
    const noun = EQUIPMENT_TYPES[String(x.equipmentType)] ?? String(x.equipmentType);
    return `${q > 1 ? `${q} ${noun}s` : `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`}${worth}`;
  }
  const name = x.displayName ? plainName(String(x.displayName)) : x.item ? titleCase(plainName(String(x.item).split("|")[0])) : x.special ? String(x.special) : "";
  return `${q > 1 ? `${q} ` : ""}${name}${worth}`;
}

/**
 * 5e.tools starting gear (`startingEquipment.defaultData`) as the text the starting-equipment builder reads: lettered
 * options "(A) ...; or (B) ..." (2024), or one list item per choice, "(a) ... or (b) ...", with fixed items on their
 * own (2014).
 */
function equipmentHtml(se: unknown): string {
  const data = (Array.isArray(se) ? se : (se as J)?.defaultData) as J[] | undefined;
  if (!Array.isArray(data) || !data.length) return "";
  const lettered = data.length === 1 && Object.keys(data[0]).every((k) => /^[A-Z]$/.test(k));
  if (lettered) {
    const parts = Object.entries(data[0]).map(([k, items]) => `(${k}) ${(items as unknown[]).map(gearText).filter(Boolean).join(", ")}`);
    return `<ul><li><strong>Equipment:</strong> ${esc(`Choose ${Object.keys(data[0]).join(" or ")}: ${parts.join("; or ")}`)}</li></ul>`;
  }
  const lis = data.map((group) => {
    const fixed = group._ as unknown[] | undefined;
    if (fixed) return esc(fixed.map(gearText).filter(Boolean).join(", "));
    return Object.entries(group).map(([k, items]) => `<i>(${k})</i> ${esc((items as unknown[]).map(gearText).filter(Boolean).join(", "))}`).join(" or ");
  });
  return `<h5>EQUIPMENT</h5><ul>${lis.map((l) => `<li>${l}</li>`).join("")}</ul>`;
}

function convertBackground(b: J, ctx: Ctx, out: AElement[]): void {
  const id = ftId("BG", b.name, b.source);
  const rules: ARule[] = [...trainingRules(b, b.name, out, ctx, id), ...abilityRules(b.ability, "Ability score increase", { out, idBase: id }).map((x) => ({ ...x, requirements: x.requirements ?? `!${MARK_SPECIES_ASI}` }))];
  for (const f of (b.feats as J[]) ?? []) for (const k of Object.keys(f)) {
    // "Any feat of a category" (the Haunted One's Dark Gift) is a choice limited to that category.
    if (k === "anyFromCategory") {
      const cats = ((f[k]?.category as string[]) ?? []).map((c) => `category ${c}`);
      rules.push({ kind: "select", type: "Feat", name: `${b.name} feat`, supports: cats.length ? `5et feat,(${cats.join("||")})` : "5et feat", number: f[k]?.count ?? 1 });
      continue;
    }
    if (k === "any") continue;
    const [fname, fsrc] = k.split("|");
    const [fbase, variant] = fname.split(";").map((x) => x.trim());
    rules.push({ kind: "grant", type: "Feat", id: ftId("FEAT", variant ? `${cap(fbase)} (${cap(variant)})` : cap(fbase), (fsrc ?? "PHB").toUpperCase()) });
  }
  for (const f of (b.feats as J[]) ?? []) if (f.any) rules.push({ kind: "select", type: "Feat", name: "Origin feat", supports: "5et feat", number: 1 });
  rules.push(...traitList(b.entries, id, ctx, b.source, out, "5et trait", "Background Feature"));
  out.push(base(id, b.name, "Background", srcName(ctx, b.source), { rules, description: entriesHtml(b.entries) + equipmentHtml(b.startingEquipment) }));
}

function mod(h: J): string {
  return String(h);
}

function convertMonster(m: J, ctx: Ctx): AElement {
  const ac = Array.isArray(m.ac) ? (typeof m.ac[0] === "object" ? m.ac[0].ac : m.ac[0]) : m.ac;
  const speed = m.speed ? Object.entries(m.speed).map(([k, v]) => `${k === "walk" ? "" : `${k} `}${typeof v === "object" ? (v as J).number : v} ft.`.trim()).join(", ") : "";
  const type = typeof m.type === "object" ? m.type.type : m.type;
  const act = (m.action ?? []).map((a: J) => `<p><b>${inlineHtml(a.name)}.</b> ${entriesHtml(a.entries).replace(/^<p>|<\/p>$/g, "")}</p>`).join("");
  const traits = (m.trait ?? []).map((a: J) => `<p><b>${inlineHtml(a.name)}.</b> ${entriesHtml(a.entries).replace(/^<p>|<\/p>$/g, "")}</p>`).join("");
  const setters: Record<string, SetterValue> = {
    size: set(Array.isArray(m.size) ? m.size[0] : m.size ?? ""), type: set(String(type ?? "")), ac: set(String(ac ?? "")), hp: set(m.hp?.average ? `${m.hp.average} (${m.hp.formula ?? ""})` : ""),
    speed: set(speed), strength: set(mod(m.str)), dexterity: set(mod(m.dex)), constitution: set(mod(m.con)), intelligence: set(mod(m.int)), wisdom: set(mod(m.wis)), charisma: set(mod(m.cha)),
    senses: set([...(m.senses ?? []), m.passive ? `passive Perception ${m.passive}` : ""].filter(Boolean).join(", ")), languages: set((m.languages ?? []).join(", ")), challenge: set(String(m.cr?.cr ?? m.cr ?? "")),
    traits: set(traits), actions: set(act),
  };
  return base(ftId("CREATURE", m.name, m.source), m.name, "Companion", srcName(ctx, m.source), { setters, supports: ["5et creature", String(type ?? "")], description: "" });
}

// classes -------------------------------------------------------------

const stripTags = (s: string) => s.replace(/\{@[^}|]*\s([^}|]*)[^}]*\}/g, "$1").trim().toLowerCase();

/**
 * A class table cell as a number. 5e.tools writes cells as numbers, as text with links ("{@filter 3rd|spells|...}"),
 * or as objects ({type: "bonus", value: 2}); "3rd", "+2" and "—" all read the way the table shows them.
 */
function cellNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object") return cellNumber((v as J).value ?? (v as J).entry ?? (v as J).toRoll?.[0]?.number);
  const m = /-?\d+/.exec(stripTags(String(v ?? "")));
  return m ? Number(m[0]) : 0;
}

function tableColumn(c: J, re: RegExp): number[] | undefined {
  for (const g of [...((c.classTableGroups as J[]) ?? []), ...((c.subclassTableGroups as J[]) ?? [])]) {
    const idx = (g.colLabels ?? []).findIndex((l: string) => re.test(stripTags(l)));
    if (idx >= 0 && g.rows) return (g.rows as J[]).map((r) => cellNumber(r[idx]));
  }
  return undefined;
}

function deltas(totals: number[]): number[] {
  return totals.map((v, i) => v - (i === 0 ? 0 : totals[i - 1]));
}

/**
 * A class's or a subclass's spellcasting (the Eldritch Knight and the Arcane Trickster cast too), from the same
 * fields: the ability, the caster progression, the cantrip, known and prepared progressions, and the slot table.
 * Tables become per-level stat steps so everything flows through the same rules. `shares`: the caster's levels
 * count toward the multiclass spell slots.
 */
/**
 * A subclass that learns spells of two schools only, with "any school" picks at set levels (the Eldritch Knight's
 * abjuration and evocation, the Arcane Trickster's enchantment and illusion): read from its Spellcasting text, as
 * 5e.tools gives it only there (Chris 2026-10-29: keep the limits the Aurora copies have).
 */
export function schoolLimit(text: string): { schools: string[]; anyAt: number[] } | undefined {
  const m = /must (?:choose from|be) (?:the |an? )?(\w+) (?:and|or) (\w+) spells?/i.exec(text);
  if (!m) return undefined;
  const any = /(?:gained|learn) at ((?:\d+(?:st|nd|rd|th),?\s*(?:and |or )?)+)level[^.]*any school/i.exec(text);
  const anyAt = any ? [...any[1].matchAll(/(\d+)/g)].map((x) => Number(x[1])) : [];
  // "Three 1st-level wizard spells of your choice, two of which you must choose from...": the first one is free.
  const first = /know (\w+) 1st-level [\w ]*spells of your choice, (\w+) of which/i.exec(text);
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };
  if (first && words[first[1].toLowerCase()] - words[first[2].toLowerCase()] > 0 && !anyAt.includes(3)) anyAt.unshift(3);
  const cap1 = (x: string) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
  return { schools: [cap1(m[1]), cap1(m[2])], anyAt: [...new Set(anyAt)].sort((a, b) => a - b) };
}

function castingRules(c: J, name: string, lists: string[], classLevel: string, limit?: { schools: string[]; anyAt: number[] }): { spellcasting?: AElement["spellcasting"]; rules: ARule[]; shares: boolean } {
  const rules: ARule[] = [];
  if (!c.spellcastingAbility && !c.casterProgression) return { rules, shares: false };
  const lname = name.toLowerCase();
  let spellcasting: AElement["spellcasting"];
  {
    const prepared = !!(c.preparedSpells || c.preparedSpellsProgression);
    spellcasting = { name, ability: cap(abilFull(c.spellcastingAbility ?? "int")), prepare: prepared, list: lists, extendLists: [] };
    const key = `${lname}:spellcasting`;
    const rows = ([...((c.classTableGroups as J[]) ?? []), ...((c.subclassTableGroups as J[]) ?? [])]).find((g) => g.rowsSpellProgression)?.rowsSpellProgression as number[][] | undefined;
    if (c.casterProgression === "pact" || tableColumn(c, /^slot level/)) {
      const count = tableColumn(c, /^spell slots/) ?? [];
      const slotLevel = tableColumn(c, /^slot level/) ?? [];
      let prevVec = Array(9).fill(0) as number[];
      count.forEach((n, i) => {
        const level = i + 1;
        const vec = Array(9).fill(0) as number[];
        if (slotLevel[i]) vec[slotLevel[i] - 1] = n;
        vec.forEach((v, j) => { if (v - prevVec[j]) rules.push({ kind: "stat", name: `${key}:slots:${j + 1}`, value: String(v - prevVec[j]), level }); });
        const dc = n - (i ? count[i - 1] : 0); if (dc) rules.push({ kind: "stat", name: `${key}:slots:count`, value: String(dc), level });
        const dl = (slotLevel[i] ?? 0) - (i ? (slotLevel[i - 1] ?? 0) : 0); if (dl) rules.push({ kind: "stat", name: `${key}:slot`, value: String(dl), level });
        prevVec = vec;
      });
    } else if (rows) {
      let prev = Array(9).fill(0) as number[];
      rows.forEach((row, i) => {
        row.forEach((v, j) => { if (v - prev[j]) rules.push({ kind: "stat", name: `${key}:slots:${j + 1}`, value: String(v - prev[j]), level: i + 1 }); });
        prev = row;
      });
    }
    const cant = (c.cantripProgression as number[] | undefined) ?? tableColumn(c, /^cantrips/);
    if (cant) deltas(cant).forEach((n, i) => { if (n > 0) rules.push({ kind: "select", type: "Spell", name: `Cantrip (${name})`, supports: "$(spellcasting:list), 0", number: n, level: i + 1, spellcasting: name }); });
    const known = (c.spellsKnownProgression as number[] | undefined) ?? tableColumn(c, /^spells known/);
    const fixed = c.spellsKnownProgressionFixed as number[] | undefined;
    const knownSteps = fixed ?? (known ? deltas(known) : undefined);
    if (knownSteps) knownSteps.forEach((n, i) => {
      if (n <= 0) return;
      const label = prepared && fixed ? `Spellbook (${name})` : `Spell known (${name})`;
      if (!limit) { rules.push({ kind: "select", type: "Spell", name: label, supports: "$(spellcasting:list), $(spellcasting:slots)", number: n, level: i + 1, spellcasting: name }); return; }
      // A school-limited subclass: its picks of its two schools, and the one "any school" pick at the levels it has one.
      const free = limit.anyAt.includes(i + 1) ? Math.min(1, n) : 0;
      const schools = limit.schools.map((x) => `${x} School`).join("||");
      if (n - free > 0) rules.push({ kind: "select", type: "Spell", name: `Spell known (${name}: ${limit.schools.join(" or ").toLowerCase()})`, supports: `$(spellcasting:list), $(spellcasting:slots), (${schools})`, number: n - free, level: i + 1, spellcasting: name });
      if (free) rules.push({ kind: "select", type: "Spell", name: `Spell known (${name}: any school)`, supports: "$(spellcasting:list), $(spellcasting:slots)", number: free, level: i + 1, spellcasting: name });
    });
    // Spells of a set level learned at set class levels (the Warlock's Mystic Arcanum: one 6th-level spell at 11...).
    for (const [lv, byLevel] of Object.entries((c.spellsKnownProgressionFixedByLevel as Record<string, Record<string, number>>) ?? {})) {
      for (const [spellLevel, n] of Object.entries(byLevel)) rules.push({ kind: "select", type: "Spell", name: `Level ${spellLevel} spell (${name} ${lv})`, supports: `$(spellcasting:list), ${spellLevel}`, number: Number(n) || 1, level: Number(lv), spellcasting: name });
    }
    const prep = (c.preparedSpellsProgression as number[] | undefined) ?? tableColumn(c, /^prepared spells/);
    if (prep) deltas(prep).forEach((n, i) => { if (n) rules.push({ kind: "stat", name: `${key}:prepare`, value: String(n), level: i + 1 }); });
    else if (typeof c.preparedSpells === "string") {
      for (const tok of String(c.preparedSpells).split("+")) {
        const t = tok.trim();
        if (/<\$level\$>\s*\/\s*2/.test(t)) rules.push({ kind: "stat", name: `${key}:prepare`, value: `level:${classLevel}:half` });
        else if (/<\$level\$>/.test(t)) rules.push({ kind: "stat", name: `${key}:prepare`, value: `level:${classLevel}` });
        else { const m = t.match(/<\$(\w+)_mod\$>/); if (m) rules.push({ kind: "stat", name: `${key}:prepare`, value: `${abilFull(m[1])}:modifier` }); }
      }
    }
    // Share slots with other classes when multiclassing.
    const prog = c.casterProgression as string | undefined;
    if (prog === "full" || prog === "1/2" || prog === "1/3" || prog === "artificer") {
      for (let l = 1; l <= 20; l++) {
        const cnt = (lvl: number) => (prog === "full" ? lvl : prog === "1/2" ? (c.edition === "one" ? Math.ceil(lvl / 2) : Math.floor(lvl / 2)) : prog === "artificer" ? Math.ceil(lvl / 2) : lvl < 3 ? 0 : Math.floor(lvl / 3));
        const d = cnt(l) - cnt(l - 1);
        if (d) rules.push({ kind: "stat", name: "multiclass:spellcasting:level", value: String(d), level: l, requirements: "ID_INTERNAL_GRANT_MULTICLASS" });
      }
    }
  }
  const prog = c.casterProgression as string | undefined;
  return { spellcasting, rules, shares: prog === "full" || prog === "1/2" || prog === "1/3" || prog === "artificer" };
}

/**
 * The features an entry refers to: in a "choose N" block (type "options") they are a choice; outside one, a class
 * feature it names is given with it. Refers by 5e.tools' refClassFeature ("Name|Class|ClassSource|Level|Source"),
 * refSubclassFeature ("Name|Class|ClassSource|Subclass|SubclassSource|Level|Source") and refOptionalfeature
 * ("Name|Source"). With `optionsOnly`, plain references are left alone (the subclass loop converts those already).
 */
function refRules(entries: unknown, label: string, level: number, data: { cf: J[]; sf: J[]; ctx: Ctx; out: AElement[] }, optionsOnly = false): ARule[] {
  const rules: ARule[] = [];
  const idOf = (ref: J): { id: string; type: string } | undefined => {
    if (ref.type === "refClassFeature") {
      const [name, cls, csrc, lv, src] = String(ref.classFeature).split("|");
      const f = data.cf.find((x) => x.name === name && x.className === cls && (x.classSource ?? "PHB") === (csrc || x.classSource) && String(x.level) === lv && x.source === (src || csrc || "PHB"));
      if (!f) return undefined;
      const id = ftId("CF", `${cls} ${name}`, f.source, String(f.level));
      if (!data.out.some((o) => o.id === id)) data.out.push(featureElement(f, "5et class feature", "Class Feature", id, data.ctx, false, data.out));
      return { id, type: "Class Feature" };
    }
    if (ref.type === "refSubclassFeature") {
      const [name, , csrc, short, ssrc, lv, src] = String(ref.subclassFeature).split("|");
      const book = src || ssrc || csrc || "PHB";
      const hit = data.out.find((o) => ["", "1", "2", "3", "4"].some((h) => o.id === ftId("SF", `${short ?? ""} ${name}`, book, `${lv ?? ""}${h}`)));
      return hit ? { id: hit.id, type: "Archetype Feature" } : undefined;
    }
    if (ref.type === "refOptionalfeature") {
      const [name, src] = String(ref.optionalfeature).split("|");
      return { id: ftId("OPT", name, src || "PHB"), type: "Optional Feature" };
    }
    return undefined;
  };
  const walk = (x: unknown, inOptions: boolean) => {
    if (Array.isArray(x)) { for (const y of x) walk(y, inOptions); return; }
    if (!x || typeof x !== "object") return;
    const e = x as J;
    if (e.type === "options" && Array.isArray(e.entries)) {
      const refs = (e.entries as J[]).map(idOf).filter(Boolean) as { id: string; type: string }[];
      if (refs.length) {
        const types = [...new Set(refs.map((r) => r.type))];
        rules.push({ kind: "select", type: types[0], name: `${label}: choose ${e.count ?? 1}`, supports: refs.filter((r) => r.type === types[0]).map((r) => r.id).join("|"), number: Number(e.count) || 1, level });
      }
      return;
    }
    if (!inOptions && !optionsOnly && e.type === "refClassFeature") { const r = idOf(e); if (r) rules.push({ kind: "grant", type: r.type, id: r.id, level }); return; }
    if (e.entries) walk(e.entries, inOptions);
  };
  walk(entries, false);
  return rules;
}

function convertClass(c: J, data: { cf: J[]; sc: J[]; sf: J[] }, ctx: Ctx, out: AElement[]): void {
  const id = ftId("CLASS", c.name, c.source);
  const mcId = `${id}_MULTICLASS`;
  const lname = String(c.name).toLowerCase();
  const first = { requirements: `!${mcId}` };
  const rules: ARule[] = [];
  const setters: Record<string, SetterValue> = { hd: set(`d${c.hd?.faces ?? 8}`) };
  const gained: ARule[] = [];

  for (const a of (c.proficiency as string[]) ?? []) rules.push({ kind: "grant", type: "Proficiency", id: `ID_5ET_SAVE_${slug(abilFull(a))}`, ...first });
  const sp = c.startingProficiencies ?? {};
  const mc = c.multiclassing ?? {};
  const armorGrant = (a: string): string | undefined => {
    const k = String(typeof a === "string" ? a : (a as J).proficiency ?? "").split("|")[0].toLowerCase();
    return k === "light" ? "ID_5ET_PROF_ARMOR_LIGHT" : k === "medium" ? "ID_5ET_PROF_ARMOR_MEDIUM" : k === "heavy" ? "ID_5ET_PROF_ARMOR_HEAVY" : k === "shield" ? "ID_5ET_PROF_ARMOR_SHIELD" : undefined;
  };
  for (const a of sp.armor ?? []) { const g = armorGrant(a); if (g) rules.push({ kind: "grant", type: "Proficiency", id: g, ...first }); }
  const weaponId = (k: string) => {
    const wid = ftId("PROF_WEAPON", k, "ALL");
    if (!out.some((o) => o.id === wid)) out.push(base(wid, `Weapon Proficiency (${cap(k)})`, "Proficiency", "5etools", { compendiumHidden: true }));
    return wid;
  };
  // Weapons by kind and property: "Martial weapons that have the {@filter Finesse or Light|items|type=martial
  // weapon|property=finesse;light} property" (the 2024 Rogue and Monk) is every such weapon, not one named that.
  const PROPERTY: Record<string, string> = { finesse: "F", light: "L", heavy: "H", reach: "R", thrown: "T", "two-handed": "2H", versatile: "V", ammunition: "A", loading: "LD" };
  const byFilter = (text: string): string[] | undefined => {
    const f = /\{@filter [^|}]*\|items\|([^}]*)\}/.exec(text)?.[1];
    if (!f) return undefined;
    const params = new Map(f.split("|").map((x) => x.split("=") as [string, string]));
    const cat = /\b(simple|martial)\b/.exec(params.get("type") ?? "")?.[1];
    const props = new Set((params.get("property") ?? "").split(";").map((x) => PROPERTY[x.trim().toLowerCase()]).filter(Boolean));
    const names = new Set<string>();
    for (const b of ctx.baseItems.values()) {
      if (!b.weaponCategory || (cat && b.weaponCategory !== cat)) continue;
      const has = ((b.property ?? []) as unknown[]).map((x) => String(typeof x === "string" ? x : (x as J).uid ?? "").split("|")[0]);
      if (!props.size || has.some((x) => props.has(x))) names.add(String(b.name).toLowerCase());
    }
    return [...names].sort();
  };
  const weaponGrants = (w: unknown): string[] => {
    // An optional proficiency is the DM's to give (the Artificer's firearms), not the class's.
    if (w && typeof w === "object" && (w as J).optional) return [];
    const text = String(typeof w === "string" ? w : (w as J).proficiency ?? "");
    const filtered = byFilter(text);
    if (filtered) return filtered.map(weaponId);
    const k = text.split("|")[0].toLowerCase();
    if (k === "simple") return ["ID_5ET_PROF_WEAPON_SIMPLE"];
    if (k === "martial") return ["ID_5ET_PROF_WEAPON_MARTIAL"];
    return k ? [weaponId(k)] : [];
  };
  for (const w of sp.weapons ?? []) for (const g of weaponGrants(w)) rules.push({ kind: "grant", type: "Proficiency", id: g, ...first });
  for (const r of skillRules(sp.skills, c.name)) rules.push({ ...r, ...first } as ARule);
  for (const r of profRules({ toolProficiencies: sp.toolProficiencies }, c.name, out)) rules.push({ ...r, ...first } as ARule);
  for (const r of profRules({ toolProficiencies: mc.proficienciesGained?.toolProficiencies }, c.name, out)) gained.push(r);
  for (const a of mc.proficienciesGained?.armor ?? []) { const g = armorGrant(a); if (g) gained.push({ kind: "grant", type: "Proficiency", id: g }); }
  for (const w of mc.proficienciesGained?.weapons ?? []) for (const g of weaponGrants(w)) gained.push({ kind: "grant", type: "Proficiency", id: g });
  for (const r of skillRules(mc.proficienciesGained?.skills, c.name)) gained.push(r);

  // Features by level, and the subclass choice.
  const subTag = `5et subclass of ${id}`;
  let subLevel: number | undefined;
  const asiLevels: number[] = [];
  const variants = new Map<string, string>();
  const replacements: { name: string; by: string }[] = [];
  const granted = new Map<string, string>();
  for (const ref of (c.classFeatures as J[]) ?? []) {
    const str: string = typeof ref === "string" ? ref : ref.classFeature;
    const [name, , csrc, lv] = str.split("|");
    const level = parseInt(lv, 10);
    const gainSub = typeof ref === "object" && ref.gainSubclassFeature;
    if (gainSub && subLevel === undefined) subLevel = level;
    const feat = data.cf.find((f) => f.name === name && f.className === c.name && f.level === level && (f.classSource ?? c.source) === (csrc || c.source));
    if (/^Ability Score Improvement$/i.test(name)) {
      asiLevels.push(level);
      continue;
    }
    if (!feat) continue;
    const fid = ftId("CF", `${c.name} ${name}`, feat.source, String(level));
    const generic = name === "Subclass Feature" || name === c.subclassTitle;
    out.push(featureElement(feat, "5et class feature", "Class Feature", fid, ctx, generic, out));
    // An optional class feature (Tasha's: Deft Explorer, Favored Foe) is a choice, not a given; its later parts
    // ("Deft Explorer Improvement") come with it, and the feature it replaces goes when it is taken.
    if (feat.isClassFeatureVariant) {
      const base = [...variants.keys()].find((v) => name !== v && name.startsWith(v));
      if (base) { rules.push({ kind: "grant", type: "Class Feature", id: fid, level, requirements: variants.get(base) }); continue; }
      variants.set(name, fid);
      rules.push({ kind: "select", type: "Class Feature", name: `Optional class feature: ${name} (${c.name} ${level})`, supports: fid, number: 1, level, optional: true });
      const replaced = /replaces the (.+?) feature/i.exec(stripTags(JSON.stringify(feat.entries ?? [])))?.[1];
      if (replaced) replacements.push({ name: replaced, by: fid });
      continue;
    }
    granted.set(fid, name);
    rules.push({ kind: "grant", type: "Class Feature", id: fid, level });
    // "Choose one of these" blocks inside the feature (the 2024 Cleric's Divine Order: Protector or Thaumaturge) are
    // a choice; a feature it simply refers to (Monk's Focus: Flurry of Blows) is given with it.
    rules.push(...refRules(feat.entries, `${name} (${c.name} ${level})`, level, { cf: data.cf, sf: data.sf, ctx, out }));
  }
  // The replaced feature itself requires the optional one's absence, as Aurora's content does (a requirement on the
  // class's own grant would not see a choice the class itself offers).
  for (const { name, by } of replacements) {
    for (const [fid, fname] of granted) {
      if (fname.toLowerCase() !== name.toLowerCase()) continue;
      const el = out.find((o) => o.id === fid);
      if (el) el.requirements = el.requirements ? `${el.requirements},!${by}` : `!${by}`;
    }
  }
  // An Ability Score Improvement is one choice: a feat, or the improvement itself (2014: +2 to one score or +1 to two;
  // 2024: the Ability Score Improvement feat among the feats). Before, both could be taken.
  for (const level of asiLevels) {
    rules.push({ kind: "select", type: "Feat", name: `Ability Score Improvement or feat (level ${level})`, supports: c.edition === "one" ? "5et feat" : "5et feat||5et asi choice", number: 1, level });
  }
  rules.push(...optionalFeatureRules(c));
  // Feats a class takes at set levels, by category (2024: the Fighting Style feat at 1, the Epic Boon at 19).
  for (const fp of (c.featProgression as J[]) ?? []) {
    const cats = ((fp.category as string[]) ?? []).map((x) => `category ${x}`);
    for (const [lv, n] of Object.entries((fp.progression as J) ?? {})) rules.push({ kind: "select", type: "Feat", name: `${fp.name ?? "Feat"} (${c.name} ${lv})`, supports: cats.length ? `5et feat,(${cats.join("||")})` : "5et feat", number: Number(n) || 1, level: Number(lv) });
  }
  // Weapon Mastery (2024): the masteries known at each level, chosen from the weapons that have one.
  const mastery = c.itemMasteriesProgression as Record<string, number> | undefined;
  if (mastery) {
    let had = 0;
    for (const [lv, n] of Object.entries(mastery).sort((a, b) => Number(a[0]) - Number(b[0]))) {
      if (Number(n) > had) rules.push({ kind: "select", type: "Class Feature", name: `Weapon Mastery (${c.name} ${lv})`, supports: "5et weapon mastery", number: Number(n) - had, level: Number(lv) });
      had = Math.max(had, Number(n));
    }
  }
  if (subLevel !== undefined) rules.push({ kind: "select", type: "Archetype", name: c.subclassTitle ?? `${c.name} Subclass`, supports: subTag, number: 1, level: subLevel });

  // Spellcasting: tables become per-level stat steps so everything flows through the same rules.
  const casting = castingRules(c, c.name, [c.name], lname);
  const spellcasting = casting.spellcasting;
  rules.push(...casting.rules);
  if (casting.shares) gained.push({ kind: "grant", type: "Grants", id: "ID_INTERNAL_GRANT_MULTICLASS" });
  rules.push({ kind: "grant", type: "Grants", id: "ID_INTERNAL_GRANT_MULTICLASS", requirements: mcId });

  // Multiclass requirements: 2014 states them ({str: 13, or: [{str: 13, dex: 13}]}, "or" meaning any one of the
  // group); 2024 has them as the primary ability, 13 in it ([{str: true}, {dex: true}]: Strength or Dexterity).
  const reqObj = (mc.requirements ?? {}) as J;
  const reqParts = Object.entries(reqObj).filter(([k]) => k in ABIL).map(([k, v]) => `[${k}:${v}]`);
  const words: string[] = Object.entries(reqObj).filter(([k]) => k in ABIL).map(([k, v]) => `${cap(abilFull(k))} ${v}`);
  for (const group of (reqObj.or as J[]) ?? []) {
    const alts = Object.entries(group).filter(([k]) => k in ABIL);
    if (!alts.length) continue;
    reqParts.push(`(${alts.map(([k, v]) => `[${k}:${v}]`).join("||")})`);
    words.push(alts.map(([k, v]) => `${cap(abilFull(k))} ${v}`).join(" or "));
  }
  if (!reqParts.length && Array.isArray(c.primaryAbility) && c.primaryAbility.length) {
    const alts = (c.primaryAbility as J[]).map((o) => Object.keys(o).filter((k) => k in ABIL)).filter((ks) => ks.length);
    if (alts.length) {
      reqParts.push(`(${alts.map((ks) => ks.map((k) => `[${k}:13]`).join(",")).join("||")})`);
      words.push(alts.map((ks) => ks.map((k) => `${cap(abilFull(k))} 13`).join(" and ")).join(" or "));
    }
  }
  // The 2014 rolled alternative to the starting gear ("{@dice 5d4 × 10|...}"), as Plutonium offers it.
  const goldAlt = /\{@dice ([^|}]+)/.exec(String(c.startingEquipment?.goldAlternative ?? ""))?.[1]?.trim();
  if (goldAlt) setters["starting gold"] = set(goldAlt.replace(/\s*[×x*]\s*/g, " × "));
  const el = base(id, c.name, "Class", srcName(ctx, c.source), {
    setters, rules, spellcasting,
    // Sidekicks (Tasha's) are companions the DM runs, not classes a player character takes.
    compendiumHidden: !!c.isSidekick,
    description: `<p>${esc(c.name)}, from ${esc(srcName(ctx, c.source))}. Hit die d${c.hd?.faces ?? "?"}.</p>${equipmentHtml(c.startingEquipment)}`,
    multiclass: { id: mcId, requirements: reqParts.length ? `(${reqParts.join(",")})` : undefined, prerequisite: words.length ? words.join(", ") : undefined, setters: {}, rules: gained },
  });
  out.push(el);

  for (const s of data.sc.filter((x) => x.className === c.name && (x.classSource ?? c.source) === c.source)) {
    // 5e.tools lists the 2014 subclasses under the 2014 and the 2024 class alike; one id for both let the second
    // replace the first, and the 2014 class lost its subclasses. The class's book joins the id when it differs.
    const sid = ftId("SUBCLASS", `${c.name} ${s.shortName ?? s.name}`, s.source, c.source !== s.source ? `for ${c.source}` : "");
    const srules: ARule[] = [];
    // The subclass's features, as its own list names them ("Undead Thralls|Wizard||Necromancy||6"): a 2014 subclass
    // copied onto a 2024 class keeps its PHB features, which the class's source alone would not find (as Plutonium
    // reads these references: an empty class or subclass source is the PHB, an empty feature source the subclass's).
    // Without a list, the features that name this class and subclass.
    const refs = ((s.subclassFeatures as unknown[]) ?? []).map((x) => String(typeof x === "string" ? x : (x as J).subclassFeature ?? "")).filter(Boolean);
    const lookup = (uid: string): J | undefined => {
      const [name, className, classSource, shortName, subSource, level, source] = uid.split("|").map((p) => p.trim());
      const cs = (classSource || "PHB").toLowerCase(), ss = (subSource || "PHB").toLowerCase(), fs = (source || subSource || "PHB").toLowerCase();
      return data.sf.find((x) => x.name.toLowerCase() === name.toLowerCase() && String(x.className).toLowerCase() === className.toLowerCase() && String(x.classSource ?? "PHB").toLowerCase() === cs && String(x.subclassShortName).toLowerCase() === shortName.toLowerCase() && String(x.subclassSource ?? "PHB").toLowerCase() === ss && Number(x.level) === Number(level) && String(x.source).toLowerCase() === fs);
    };
    // The listed features, then every feature they refer to outside a "choose" block ("Battle Smith" at level 3 holds
    // Steel Defender, Battle Ready and the tool proficiency as references): those are part of the subclass too.
    const byRef: J[] = [];
    const queue = refs.map(lookup).filter((x): x is J => !!x);
    while (queue.length) {
      const f = queue.shift()!;
      if (byRef.includes(f)) continue;
      byRef.push(f);
      const walk = (x: unknown) => {
        if (Array.isArray(x)) { for (const y of x) walk(y); return; }
        if (!x || typeof x !== "object") return;
        const e = x as J;
        if (e.type === "options") return;
        if (e.type === "refSubclassFeature") { const g = lookup(String(e.subclassFeature)); if (g && !byRef.includes(g)) queue.push(g); return; }
        if (e.entries) walk(e.entries);
      };
      walk(f.entries);
    }
    const features = byRef.length ? byRef : data.sf.filter((x) => x.className === c.name && x.subclassShortName === (s.shortName ?? s.name) && (x.subclassSource ?? s.source) === s.source && (x.classSource ?? c.source) === c.source);
    for (const f of features) {
      const fid = ftId("SF", `${s.shortName ?? s.name} ${f.name}`, f.source, `${f.level}${f.header ?? ""}`);
      // A feature two copies of one subclass share (the PHB subclass and its copy for the 2024 class) is one element,
      // granted by both.
      const had = out.some((o) => o.id === fid);
      if (!had) out.push(featureElement(f, "5et subclass feature", "Archetype Feature", fid, ctx, f.name === (s.name), out));
      srules.push({ kind: "grant", type: "Archetype Feature", id: fid, level: f.level });
      srules.push(...refRules(f.entries, `${f.name} (${s.shortName ?? s.name} ${f.level})`, f.level, { cf: data.cf, sf: data.sf, ctx, out }, true));
    }
    srules.push(...additionalSpellRules(s.additionalSpells, s.name, s.source, out).rules);
    srules.push(...optionalFeatureRules(s, srules));
    // A subclass that casts (Eldritch Knight, Arcane Trickster): its list is the class whose spells it expands with.
    const expandedFrom = [...JSON.stringify(s.additionalSpells ?? []).matchAll(/class=([A-Za-z ]+)/g)].map((m) => m[1].trim());
    const castText = features.filter((f) => /spellcasting/i.test(String(f.name))).map((f) => JSON.stringify(f.entries ?? "")).join(" ").replace(/\{@\w+ ([^|}]*)[^}]*\}/g, "$1");
    const subCasting = castingRules(s, s.shortName ?? s.name, expandedFrom.length ? [...new Set(expandedFrom)] : [c.name], lname, schoolLimit(castText));
    srules.push(...subCasting.rules);
    out.push(base(sid, s.name, "Archetype", srcName(ctx, s.source), { supports: [subTag], rules: srules, spellcasting: subCasting.spellcasting, description: entriesHtml(s.entries ?? []) }));
  }
}


// ---------------------------------------------------------------- additional spells and optional features

/** Collects the spell references under one additionalSpells section (innate/known/prepared), keyed by character level. */
function spellRefs(section: J | undefined): { level?: number; refs: unknown[] }[] {
  const out: { level?: number; refs: unknown[] }[] = [];
  for (const [k, v] of Object.entries(section ?? {})) {
    const level = k === "_" ? undefined : parseInt(k, 10);
    const refs: unknown[] = [];
    const walk = (x: unknown): void => {
      if (Array.isArray(x)) refs.push(...x);
      else if (x && typeof x === "object") for (const y of Object.values(x as J)) walk(y);
    };
    walk(v);
    if (refs.length) out.push({ level: Number.isNaN(level) ? undefined : level, refs });
  }
  return out;
}

/**
 * "ability": {"choose": ["int", "wis", "cha"]}: the player picks the spellcasting ability for these spells (the first
 * is the default), as Plutonium asks. Each pick sets "<casting>:spellcasting:ability:<ability>", which the engine
 * reads for the spell DC and attack. One place for every owner: species, feats (each spell-list version of Magic
 * Initiate too) and optional features.
 */
function castingAbilityChoice(ab: J, casting: string, ownerSource: string, out: AElement[]): ARule[] {
  if (!Array.isArray(ab?.choose) || ab.choose.length < 2) return [];
  const tag = `5et spell ability ${slug(ownerSource)} ${slug(casting)}`.toLowerCase();
  for (const k of ab.choose as string[]) {
    const full = abilFull(k);
    const oid = `ID_5ET_SPELLABILITY_${slug(ownerSource)}_${slug(casting)}_${slug(full)}`;
    if (!out.some((o) => o.id === oid)) out.push(base(oid, cap(full), "Spellcasting Ability", "5etools", { compendiumHidden: true, supports: [tag], rules: [{ kind: "stat", name: `${casting.toLowerCase()}:spellcasting:ability:${full.toLowerCase()}`, value: "1" } as ARule], description: `<p>${esc(cap(full))} is the spellcasting ability for ${esc(casting)}'s spells.</p>` }));
  }
  return [{ kind: "select", type: "Spellcasting Ability", name: `Spellcasting ability (${casting})`, supports: tag, number: 1 } as ARule];
}

/**
 * Rules for the spells a race, feat or feature adds. Fixed spells are resolved to element ids after conversion.
 * More than one entry in `additionalSpells` is a choice of one of them, as 5e.tools and Plutonium read it (Circle of
 * the Land's lands, Strixhaven Initiate's colleges, Divinely Favored's alignments): with `out`, each set becomes a
 * hidden option holding its own spells and spell choices, and the owner gets one choice among them.
 */
export function additionalSpellRules(adds: J[] | undefined, owner: string, ownerSource: string, out?: AElement[]): { rules: ARule[]; ability?: string } {
  if (out && (adds?.length ?? 0) > 1) {
    const tag = `5et spell set ${slug(ownerSource)} ${slug(owner)}`.toLowerCase();
    let ability: string | undefined;
    adds!.forEach((set, i) => {
      const own = additionalSpellRules([set], owner, ownerSource, out);
      ability ??= own.ability;
      // An unnamed set is named by its first spells ("Light, Sacred Flame").
      const first = JSON.stringify(set).match(/"([a-z][a-z' /-]+)(?:\|[a-z0-9]+)?(?:#c)?"/gi)?.slice(0, 2).map((x) => titleCase(plainName(x.replace(/"/g, "").split("|")[0].split("#")[0]))) ?? [];
      const label = set.name ? String(set.name) : first.join(", ") || `Option ${i + 1}`;
      out.push(base(`ID_5ET_SPELLSET_${slug(ownerSource)}_${slug(owner)}_${i + 1}`, `${owner}: ${label}`, "Spell Set", "5etools", { compendiumHidden: true, supports: [tag], rules: own.rules, description: `<p>${esc(label)}: the spells this choice of ${esc(owner)} gives.</p>` }));
    });
    return { rules: [{ kind: "select", type: "Spell Set", name: `${owner} spells`, supports: tag, number: 1 } as ARule], ability };
  }
  const rules: ARule[] = [];
  let ability: string | undefined;
  for (const a of adds ?? []) {
    const ab = a.ability;
    if (!ability && ab) ability = typeof ab === "string" ? ab : Array.isArray(ab?.choose) ? ab.choose[0] : undefined;
    if (out && !rules.some((r) => r.kind === "select" && r.type === "Spellcasting Ability")) rules.push(...castingAbilityChoice(ab, owner, ownerSource, out));
    for (const kind of ["innate", "known", "prepared"] as const) {
      for (const { level, refs } of spellRefs(a[kind])) {
        for (const r of refs) {
          if (typeof r === "string") {
            const [name, src] = r.split("#")[0].split("|");
            rules.push({ kind: "grant", type: "Spell", id: `SPELLREF:${name.trim().toLowerCase()}|${(src ?? "").toLowerCase()}|${ownerSource.toLowerCase()}`, level, spellcasting: owner } as ARule);
          } else if (r && typeof (r as J).choose === "string") {
            const crit = Object.fromEntries(String((r as J).choose).split("|").map((p) => p.split("=")).filter((p) => p.length === 2).map(([k, v]) => [k.trim().toLowerCase(), v])) as Record<string, string>;
            // 5e.tools separates alternatives with ";" (class=Cleric;Wizard); the filter syntax here uses "||".
            const anyOf = (v?: string) => (v ? (v.includes(";") ? `(${v.split(";").map((x) => x.trim()).filter(Boolean).join("||")})` : v.trim()) : "");
            const school = crit.school ? crit.school.split(";").map((x) => SCHOOL[x.trim().toUpperCase()] ?? x).join(";") : "";
            // "components & miscellaneous=ritual" (Ritual Caster, Magic Initiate's rituals): spells that are rituals, or
            // concentration spells; the registry offers both as tags.
            const misc = (crit["components & miscellaneous"] ?? "").split(";").map((x) => x.trim().toLowerCase()).filter((x) => x === "ritual" || x === "concentration");
            const parts = [anyOf(crit.class), anyOf(crit.level), anyOf(school), ...misc].filter(Boolean) as string[];
            rules.push({ kind: "select", type: "Spell", name: `${owner} spell`, supports: parts.join(", ") || "0", number: (r as J).count ?? 1, level, spellcasting: owner } as ARule);
          }
        }
      }
    }
  }
  return { rules, ability };
}

/** Innate casting for a species or feat: no spell list of its own, just the ability that sets the save DC. */
function castingFor(name: string, ability?: string): AElement["spellcasting"] {
  return { name, ability: cap(abilFull(ability ?? "int")), prepare: false, list: [], extendLists: [] };
}

/** Tag an optional feature offers for one feature type such as "FS:F" or "EI". */
const optTag = (t: string) => `opt-${t}`;

function convertOptionalFeature(o: J, ctx: Ctx): AElement {
  const types = ((o.featureType as string[]) ?? []).map(optTag);
  const html = entriesHtml(o.entries);
  const pre = (o.prerequisite as J[] | undefined) ?? [];
  const lv = pre.map((p) => p.level?.level).find((n) => typeof n === "number") as number | undefined;
  const rules = additionalSpellRules(o.additionalSpells, o.name, o.source).rules;
  rules.push(...optionalFeatureRules(o, rules));
  return base(ftId("OPT", o.name, o.source), o.name, "Optional Feature", srcName(ctx, o.source), {
    supports: ["5et optional feature", ...types], rules, description: html,
    sheet: { display: true, descriptions: [{ text: html }] },
    setters: lv ? { level: set(String(lv)) } : {},
  });
}

/**
 * Select rules for the optional features a class, subclass, feat or option gains (fighting styles, invocations,
 * maneuvers, metamagic). A progression of {"*": 2} is "when you take it" (Martial Adept's two maneuvers): one choice
 * with no level. `have`: rules already there; a kind of option already offered (from the text's option blocks) is
 * not offered twice.
 */
function optionalFeatureRules(c: J, have: ARule[] = []): ARule[] {
  const rules: ARule[] = [];
  for (const p of (c.optionalfeatureProgression as J[]) ?? []) {
    const types: string[] = p.featureType ?? [];
    if (!types.length) continue;
    const tags = types.map(optTag);
    if (have.some((r) => r.kind === "select" && r.type === "Optional Feature" && tags.some((t) => r.supports.split("|").includes(t)))) continue;
    const prog = p.progression;
    if (prog && !Array.isArray(prog) && prog["*"] !== undefined) {
      rules.push({ kind: "select", type: "Optional Feature", name: String(p.name ?? "Optional feature"), supports: tags.join("|"), number: Number(prog["*"]) || 1 });
      continue;
    }
    const counts: number[] = Array.isArray(prog) ? prog : Array.from({ length: 20 }, (_, i) => {
      const keys = Object.keys(prog ?? {}).map(Number).sort((x, y) => x - y);
      const k = keys.filter((n) => n <= i + 1).pop();
      return k === undefined ? 0 : Number(prog[String(k)]);
    });
    // "required": {"3": ["Elemental Attunement|PHB"]}: options the character must take at that level. They are given,
    // and the choice at that level is that many smaller (Way of the Four Elements knows Elemental Attunement and one more).
    const required = (p.required ?? {}) as Record<string, string[]>;
    deltas(counts).forEach((n, i) => {
      const must = (required[String(i + 1)] ?? []).map((r) => { const [name, src] = String(r).split("|"); return ftId("OPT", name, src || "PHB"); });
      for (const id of must) rules.push({ kind: "grant", type: "Optional Feature", id, level: i + 1 });
      const left = n - must.length;
      if (left > 0) rules.push({ kind: "select", type: "Optional Feature", name: String(p.name ?? "Optional feature"), supports: types.map(optTag).join("|"), number: left, level: i + 1 });
    });
  }
  return rules;
}

// ---------------------------------------------------------------- entry points

export interface FiveToolsInput {
  /** Parsed JSON by file path, for example "races.json" or "class/class-wizard.json". */
  files: Record<string, J>;
}

/** What the last conversion did with the lore files: how many matched, and the ones that matched nothing. */
export let lastLoreReport: { applied: number; unmatched: string[] } = { applied: 0, unmatched: [] };

/**
 * The specific items of one magic variant ("Flame Tongue" over every sword it fits), as 5e.tools builds them at run
 * time from magicvariants.json: each base item that meets one of the variant's `requires` (every field equal; a list
 * means any of it) and none of its `excludes` gets the variant's `inherits`, named with its prefix and suffix and
 * with the text's {=...} templates filled in. A 2024 variant prefers the 2024 base item where both fit with one name.
 */
function expandVariant(v: J, ctx: Ctx): J[] {
  const inh: J = v.inherits;
  if (!inh || !Array.isArray(v.requires)) return [];
  const lc = (x: unknown) => String(x ?? "").toLowerCase();
  const fits = (b: J, o: J) => Object.entries(o).every(([k, want]) => (Array.isArray(want) ? want.some((w) => lc(w) === lc(b[k])) : typeof want === "boolean" ? !!b[k] === want : lc(want) === lc(b[k])));
  const excludes: J[] = Array.isArray(v.excludes) ? v.excludes : v.excludes ? [v.excludes] : [];
  const modern = /^(XPHB|XDMG|XMM)$/i.test(String(inh.source ?? ""));
  const bases = [...ctx.baseItems.values()]
    .filter((b) => (v.requires as J[]).some((o) => fits(b, o)) && !excludes.some((o) => Object.entries(o).some(([k, x]) => fits(b, { [k]: x }))))
    .sort((a, b) => Number(/^XPHB$/i.test(b.source) === modern) - Number(/^XPHB$/i.test(a.source) === modern));
  const { namePrefix = "", nameSuffix = "", lootTables, tier, ...rest } = inh;
  void lootTables; void tier;
  return bases.map((b) => {
    const item: J = { ...rest, name: `${namePrefix}${b.name}${nameSuffix}`, source: inh.source ?? v.source ?? b.source, baseItem: `${b.name}|${b.source}`, _variant: `${v.name}|${inh.source ?? v.source ?? ""}` };
    const fill = (t: string) => t.replace(/\{=(\w+)(?:\/(\w+))?\}/g, (_m, key: string, mod?: string) => {
      const val = key === "baseName" ? b.name : key === "dmgType" ? ({ S: "slashing", P: "piercing", B: "bludgeoning" } as Record<string, string>)[String(b.dmgType)] ?? "" : String(item[key] ?? b[key] ?? "");
      if (mod === "l") return val.toLowerCase();
      if (mod === "u") return val.toUpperCase();
      if (mod === "a" || mod === "at") return `${/^[aeiou]/i.test(val) ? "an" : "a"} ${mod === "at" ? val.toLowerCase() : val}`;
      return val;
    });
    if (item.entries) item.entries = JSON.parse(fill(JSON.stringify(item.entries)));
    return item;
  });
}

/** Converts every recognised file. Unknown files are ignored. */
export function convertFiveTools(input: FiveToolsInput): AElement[] {
  const ctx: Ctx = { books: {}, spellClasses: {}, baseItems: new Map() };
  // The Foundry files (Plutonium's mechanics) hold "feat", "item", "classFeature"... lists of mechanics, not content:
  // set aside here and applied to the converted elements at the end (foundry.ts).
  const isFoundry = (p: string) => /(^|\/)foundry(-[a-z]+)?\.json$/i.test(p);
  const foundryFiles = Object.entries(input.files as Record<string, J>).filter(([p]) => isFoundry(p));
  const all = Object.entries(resolveCopies(Object.fromEntries(Object.entries(input.files as Record<string, J>).filter(([p]) => !isFoundry(p)))));
  for (const [path, json] of all) {
    if (json?.book && Array.isArray(json.book)) for (const b of json.book) if (b.id) ctx.books[b.id] = b.name;
    if (json?.adventure && Array.isArray(json.adventure)) for (const b of json.adventure) if (b.id) ctx.books[b.id] = b.name;
    if (/(^|\/)sources\.json$/.test(path) && json && typeof json === "object" && !Array.isArray(json)) {
      for (const [src, spells] of Object.entries(json as J)) {
        const bucket = (ctx.spellClasses[src] ??= {});
        for (const [spell, v] of Object.entries(spells as J)) bucket[spell.toLowerCase()] = (((v as J).class ?? []) as J[]).map((c) => c.name);
      }
    }
    for (const b of json?.baseitem ?? []) ctx.baseItems.set(`${b.name}|${b.source}`.toLowerCase(), b);
    for (const l of json?.language ?? []) if (l?.name) (ctx.languageNames ??= []).push(String(l.name).toLowerCase());
  }
  const out: AElement[] = syntheticElements();
  // Every standard tool exists, so "any musical instrument" has its options even when nothing names one.
  for (const names of Object.values(TOOL_KINDS)) for (const n of names) toolId(n, out);
  const spellIds: Record<string, { id: string; source: string }[]> = {};
  // One Source element per book, so lists can show release dates the way the Aurora content does.
  for (const [, json] of all) {
    for (const b of json?.book ?? []) {
      if (!b.name) continue;
      const rel = typeof b.published === "string" ? b.published.replace(/-/g, "").slice(0, 8) : "";
      out.push(base(`ID_5ET_SOURCE_${slug(b.id ?? b.name)}`, b.name, "Source", "5etools", {
        compendiumHidden: true,
        // 5e.tools' own classification of the book: core, supplement, setting, prerelease, homebrew...
        setters: { release: set(rel), official: set(/^(UA|HB|Unearthed)/i.test(b.id ?? "") ? "false" : "true"), abbreviation: set(String(b.id ?? "")), group: set(String(b.group ?? "")) },
      }));
    }
  }
  const variantItems: J[] = [];
  const cf: J[] = [];
  const sc: J[] = [];
  const sf: J[] = [];
  const classes: J[] = [];
  const subraces: J[] = [];
  for (const [, json] of all) {
    for (const x of json?.classFeature ?? []) cf.push(x);
    for (const x of json?.subclass ?? []) sc.push(x);
    for (const x of json?.subclassFeature ?? []) sf.push(x);
    for (const x of json?.class ?? []) classes.push(x);
    for (const x of json?.subrace ?? []) subraces.push(x);
  }
  for (const [, json] of all) {
    if (!json || typeof json !== "object") continue;
    for (const s of json.spell ?? []) { out.push(convertSpell(s, ctx)); (spellIds[String(s.name).toLowerCase()] ??= []).push({ id: ftId("SPELL", s.name, s.source), source: String(s.source).toLowerCase() }); }
    for (const i of json.baseitem ?? []) {
      const e = convertItem(i, ctx);
      if (e) out.push(e);
      // A weapon mastery option, "Longbow (Slow)", as the 2024 classes choose them.
      for (const ms of (i.mastery as string[]) ?? []) {
        const mname = `${i.name} (${cap(String(ms).split("|")[0])})`;
        const mid = ftId("MASTERY", mname, i.source);
        if (!out.some((o) => o.id === mid)) out.push(base(mid, mname, "Class Feature", srcName(ctx, i.source), { compendiumHidden: true, supports: ["5et weapon mastery", "Weapon Mastery"], description: `<p>You can use the ${esc(cap(String(ms).split("|")[0]))} mastery property of the ${esc(i.name)}.</p>` }));
      }
    }
    for (const i of json.item ?? []) { const e = convertItem(i, ctx); if (e) out.push(e); }
    for (const v of json.magicvariant ?? []) variantItems.push(...expandVariant(v, ctx));
    for (const f of json.feat ?? []) {
      if (featVariants(f, ctx, out)) continue;
      const el = convertFeat(f, ctx, out);
      out.push(el);
      // A feat taken more than once (the 2024 Ability Score Improvement, Elemental Adept): numbered copies, each
      // needing the one before, so each taking counts and keeps its own choices.
      if (f.repeatable) {
        const ids = repeatIds(el.id, 8);
        // Each copy has its own option elements (an element counts once, so copies cannot share them).
        const opts = out.filter((o) => o.id.startsWith(`${el.id}_ABILITY_OPTION_`));
        for (let i = 1; i < ids.length; i++) {
          for (const o of opts) out.push({ ...o, id: o.id.replace(el.id, ids[i]), supports: o.supports.map((t) => t.replace(el.id, ids[i])), rules: [...o.rules] });
          const rules = el.rules.map((r) => (r.kind === "select" && r.supports.includes(`${el.id}_ABILITY_OPTION_`) ? { ...r, supports: r.supports.split(el.id).join(ids[i]) } : r));
          out.push({ ...el, id: ids[i], rules, compendiumHidden: true, requirements: el.requirements ? `${el.requirements},${ids[i - 1]}` : ids[i - 1], setters: { ...el.setters } });
        }
      }
    }
    for (const o of json.optionalfeature ?? []) out.push(convertOptionalFeature(o, ctx));
    for (const l of json.language ?? []) out.push(languageElement(l, ctx));
    for (const r of json.race ?? []) convertRace(r, ctx, subraces, out);
    for (const b of json.background ?? []) convertBackground(b, ctx, out);
    for (const m of json.monster ?? []) out.push(convertMonster(m, ctx));
  }
  // The magic items 5e.tools builds from its variants, unless the data already lists one by that name and book.
  const haveIds = new Set(out.map((e) => e.id));
  for (const it of variantItems) {
    const e = convertItem(it, ctx);
    if (!e || haveIds.has(e.id)) continue;
    haveIds.add(e.id);
    e.supports = [...e.supports, `5et variant ${String(it._variant).toLowerCase()}`];
    out.push(e);
  }
  for (const c of classes) convertClass(c, { cf, sc, sf }, ctx, out);
  // Foundry mechanics first, so the reference passes below also mend what they grant (Auran becomes Primordial).
  if (foundryFiles.length) applyFoundry(foundryFiles, out, ftId);
  // What the side data does not give, from the feature's own text (limited uses, save DCs, attacks).
  applyTextUses(out);
  applyTextDc(out);
  applyTextAttacks(out);
  resolveSpellRefs(out, spellIds);
  resolveLooseRefs(out);
  const fluff = new Map<string, J[]>();
  for (const [, json] of all) if (json && typeof json === "object" && !Array.isArray(json)) for (const [k, v] of Object.entries(json as J)) if (/Fluff$/.test(k) && Array.isArray(v)) (fluff.get(k) ?? fluff.set(k, []).get(k)!).push(...v);
  if (fluff.size) lastLoreReport = applyLore(fluff, out, ftId, entriesHtml);
  return out;
}

/**
 * References the data makes to things it names differently: a feat given only by its base name where the data holds
 * variants (Magic Initiate as Cleric, Druid or Wizard) becomes a choice among them; the elemental languages folded
 * into Primordial in 2024 (Auran, Aquan, Ignan, Terran) point at Primordial when the data no longer lists them.
 */
function resolveLooseRefs(out: AElement[]): void {
  const ids = new Set(out.map((e) => e.id));
  const ELEMENTAL = /^ID_5ET_LANGUAGE_(AURAN|AQUAN|IGNAN|TERRAN)$/;
  for (const el of out) {
    if (!el.rules.some((r) => r.kind === "grant" && !ids.has(r.id))) continue;
    el.rules = el.rules.map((r) => {
      if (r.kind !== "grant" || ids.has(r.id)) return r;
      if (r.type === "Feat") {
        const variants = out.filter((e) => e.type === "Feat" && e.id.startsWith(`${r.id}_`)).map((e) => e.id);
        if (variants.length) return { kind: "select", type: "Feat", name: `${variants.length > 1 ? "Feat version" : "Feat"}`, supports: variants.join("||"), number: 1, requirements: r.requirements } as ARule;
      }
      if (r.type === "Language" && ELEMENTAL.test(r.id) && ids.has("ID_5ET_LANGUAGE_PRIMORDIAL")) return { ...r, id: "ID_5ET_LANGUAGE_PRIMORDIAL" };
      return r;
    });
  }
}

/** Turns SPELLREF placeholders into spell element ids; a spell that was not imported is dropped quietly. */
function resolveSpellRefs(out: AElement[], spellIds: Record<string, { id: string; source: string }[]>): void {
  for (const el of out) {
    if (!el.rules.some((r) => r.kind === "grant" && String(r.id).startsWith("SPELLREF:"))) continue;
    el.rules = el.rules.flatMap((r) => {
      if (r.kind !== "grant" || !String(r.id).startsWith("SPELLREF:")) return [r];
      const [name, src, owner] = String(r.id).slice(9).split("|");
      const list = spellIds[name] ?? [];
      const hit = list.find((x) => src && x.source === src) ?? list.find((x) => x.source === owner) ?? list.find((x) => x.source === "xphb") ?? list.find((x) => x.source === "phb") ?? list[0];
      return hit ? [{ ...r, id: hit.id }] : [];
    });
  }
}

/** Files a 5etools data folder offers, for a base address. Index files list the book-specific parts. */
export const FIVETOOLS_CORE_FILES = ["books.json", "races.json", "backgrounds.json", "feats.json", "items-base.json", "items.json", "magicvariants.json", "languages.json", "optionalfeatures.json", "spells/sources.json"];
/** Plutonium's Foundry mechanics (foundry.ts) and the lore files (lore.ts), fetched with the core files when there. */
export const FIVETOOLS_EXTRA_FILES = [
  "foundry-feats.json", "foundry-items.json", "foundry-optionalfeatures.json", "foundry-races.json", "foundry-actions.json", "foundry-backgrounds.json",
  "class/foundry.json", "spells/foundry.json",
  "fluff-races.json", "fluff-backgrounds.json", "fluff-feats.json", "fluff-items.json", "fluff-optionalfeatures.json", "fluff-languages.json",
];
