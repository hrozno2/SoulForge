/**
 * Converts 5etools-format JSON data (the format used by 5e.tools, its mirrors, and the Plutonium Foundry
 * module) into Soul Forge elements. The data describes content in prose plus structured fields, so this
 * maps the structured parts (proficiencies, saves, speeds, spell tables, hit dice, ability bonuses, items)
 * into rules and keeps the rest as description text.
 *
 * The data itself is never bundled with Soul Forge: it is read from files or a base address the user supplies.
 */
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
const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

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

export function syntheticElements(): AElement[] {
  const out: AElement[] = [];
  out.push(base(MARK_SPECIES_ASI, "Species ability score increase", "Information", "5etools", { compendiumHidden: true, description: "Marks that the species already raises ability scores." }));
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
      else if (v === true) {
        languages.push(k);
        rules.push({ kind: "grant", type: "Language", id: `ID_5ET_LANGUAGE_${slug(k)}` });
      }
    }
  }
  return { rules, languages };
}

/** The standard tools by kind, for "any artisan's tool" style choices. */
const TOOL_KINDS: Record<string, string[]> = {
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

function abilityRules(list: J[] | undefined, label: string): ARule[] {
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

const srcName = (ctx: Ctx, code: string) => ctx.books[code] ?? code;

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
  const supports: string[] = [];
  if (m.weight !== undefined) setters.weight = set(`${m.weight} lb.`, { lb: String(m.weight) });
  const c = cost(m.value);
  if (c) setters.cost = c;
  if (magic) setters.rarity = set(`${cap(String(m.rarity))}${m.reqAttune ? " (requires attunement)" : ""}`);
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
  if (m.ability && typeof m.ability === "object") {
    for (const [k, v] of Object.entries(m.ability.static ?? {})) rules.push({ kind: "stat", name: `${abilFull(k)}:score:set`, value: String(v) });
    for (const [k, v] of Object.entries(m.ability)) if (k in ABIL && typeof v === "number") rules.push({ kind: "stat", name: abilFull(k), value: String(v) });
  }
  const desc = entriesHtml(m.entries) || (m.type ? "" : "");
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
    const ability = g.ability?.choose ? undefined : g.ability;
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
  const rules = [...abilityRules(f.ability, f.name), ...trainingRules(f, f.name, out, ctx, ftId("FEAT", f.name, f.source)), ...defenseRules(f)];
  const spells = additionalSpellRules(f.additionalSpells, f.name, f.source);
  rules.push(...spells.rules);
  const html = entriesHtml(f.entries);
  return base(ftId("FEAT", f.name, f.source), f.name, "Feat", srcName(ctx, f.source), {
    spellcasting: spells.rules.length ? castingFor(f.name, spells.ability) : undefined,
    supports: ["5et feat", ...(f.category ? [`category ${f.category}`] : [])], rules,
    requirements: reqs.length ? reqs.join(",") : undefined, description: html,
    sheet: { display: true, descriptions: [{ text: html }] },
  });
}

function featureElement(f: J, kind: string, type: string, id: string, ctx: Ctx, hide = false): AElement {
  const html = entriesHtml(f.entries);
  return base(id, f.name, type, srcName(ctx, f.source), { description: html, sheet: { display: !hide, descriptions: [{ text: html }] }, supports: [kind] });
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
function defenseRules(r: J): ARule[] {
  const rules: ARule[] = [];
  const add = (list: unknown, kind: string) => {
    for (const x of (Array.isArray(list) ? list : []) as unknown[]) {
      if (typeof x === "string") rules.push({ kind: "grant", type: "Condition", id: `ID_INTERNAL_CONDITION_${kind}_${slug(x)}` });
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
  const rules: ARule[] = [...speedRules(r.speed), ...abilityRules(r.ability, r.name), ...trainingRules(r, r.name, out, ctx, id), ...defenseRules(r)];
  // A species that lists no languages (the Ravenloft lineages, for one) leaves them to the character's origin: under
  // the 2024 rules, Common and two standard languages.
  if (!r.languageProficiencies?.length) {
    rules.push({ kind: "grant", type: "Language", id: "ID_5ET_LANGUAGE_COMMON" });
    rules.push({ kind: "select", type: "Language", name: `${r.name} language`, supports: "standard", number: 2 });
  }
  // Older (2014) species carry their own ability score increases. The 2024 background's would count a second time.
  if (abilityRules(r.ability, r.name).length) rules.push({ kind: "grant", type: "Information", id: MARK_SPECIES_ASI });
  if (r.darkvision) {
    const vid = `${id}_DARKVISION`;
    out.push(base(vid, `Darkvision (${r.darkvision} ft.)`, "Vision", srcName(ctx, r.source), { compendiumHidden: true }));
    rules.push({ kind: "grant", type: "Vision", id: vid });
  }
  const racialSpells = additionalSpellRules(r.additionalSpells, r.name, r.source);
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
  // A subrace is required. A subrace without a name is, in 5e.tools, the species as it is (the standard Human next
  // to the Variant Human); it is one of the options, "Human (standard)", so what it adds is not lost.
  if (mine.length) rules.push({ kind: "select", type: "Sub Race", name: "Subrace", supports: `5et subrace of ${id}`, number: 1 });
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
      const vrules: ARule[] = [...speedRules(v.speed), ...abilityRules(v.ability, vname), ...trainingRules(v, vname, out, ctx, vid), ...defenseRules(v)].filter((x) => !baseIds.has(JSON.stringify(x)));
      if (v.darkvision && v.darkvision !== r.darkvision) {
        const dv = `${vid}_DARKVISION`;
        out.push(base(dv, `Darkvision (${v.darkvision} ft.)`, "Vision", srcName(ctx, r.source), { compendiumHidden: true }));
        vrules.push({ kind: "grant", type: "Vision", id: dv });
      }
      const vSpells = JSON.stringify(v.additionalSpells) !== JSON.stringify(r.additionalSpells) ? additionalSpellRules(v.additionalSpells, vname, v.source ?? r.source) : { rules: [] as ARule[], ability: undefined };
      vrules.push(...vSpells.rules);
      const changed = ((v.entries as J[]) ?? []).filter((e) => !baseTraits.has(JSON.stringify(e)));
      vrules.push(...traitList(changed, vid, ctx, v.source ?? r.source, out, "5et trait", "Racial Trait"));
      out.push(base(vid, vname, "Sub Race", srcName(ctx, v.source ?? r.source), { supports: [`5et version of ${id}`], rules: vrules, spellcasting: vSpells.rules.length ? castingFor(vname, vSpells.ability) : undefined, description: entriesHtml(changed) }));
    }
  }
  out.push(base(id, r.name, "Race", srcName(ctx, r.source), { rules, spellcasting: racialSpells.rules.length ? castingFor(r.name, racialSpells.ability) : undefined, description: entriesHtml(r.entries), supports: [] }));
  for (const s of mine) {
    const sid = ftId("SUBRACE", `${r.name} ${s.name ?? "Base"}`, s.source);
    const srules: ARule[] = [...abilityRules(s.ability, s.name ?? r.name), ...trainingRules(s, s.name ?? r.name, out, ctx, sid), ...defenseRules(s)];
    if (abilityRules(s.ability, s.name ?? r.name).length) srules.push({ kind: "grant", type: "Information", id: MARK_SPECIES_ASI });
    if (s.speed) srules.push(...speedRules(s.speed));
    srules.push(...traitList(s.entries, sid, ctx, s.source, out, "5et trait", "Racial Trait"));
    const subSpells = additionalSpellRules(s.additionalSpells, s.name ?? r.name, s.source);
    srules.push(...subSpells.rules);
    out.push(base(sid, s.name ? `${s.name} ${r.name}` : `${r.name} (standard)`, "Sub Race", srcName(ctx, s.source), { spellcasting: subSpells.rules.length ? castingFor(s.name ?? r.name, subSpells.ability) : undefined, supports: [`5et subrace of ${id}`], rules: srules, description: entriesHtml(s.entries) }));
  }
}

function convertBackground(b: J, ctx: Ctx, out: AElement[]): void {
  const id = ftId("BG", b.name, b.source);
  const rules: ARule[] = [...trainingRules(b, b.name, out, ctx, id), ...abilityRules(b.ability, "Ability score increase").map((x) => ({ ...x, requirements: x.requirements ?? `!${MARK_SPECIES_ASI}` }))];
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
  out.push(base(id, b.name, "Background", srcName(ctx, b.source), { rules, description: entriesHtml(b.entries) }));
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
function castingRules(c: J, name: string, lists: string[], classLevel: string): { spellcasting?: AElement["spellcasting"]; rules: ARule[]; shares: boolean } {
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
    if (knownSteps) knownSteps.forEach((n, i) => { if (n > 0) rules.push({ kind: "select", type: "Spell", name: prepared && fixed ? `Spellbook (${name})` : `Spell known (${name})`, supports: "$(spellcasting:list), $(spellcasting:slots)", number: n, level: i + 1, spellcasting: name }); });
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
  const weaponGrant = (w: unknown): string | undefined => {
    const k = String(typeof w === "string" ? w : (w as J).proficiency ?? "").split("|")[0].toLowerCase();
    if (k === "simple") return "ID_5ET_PROF_WEAPON_SIMPLE";
    if (k === "martial") return "ID_5ET_PROF_WEAPON_MARTIAL";
    const wid = ftId("PROF_WEAPON", k, "ALL");
    if (k && !out.some((o) => o.id === wid)) out.push(base(wid, `Weapon Proficiency (${cap(k)})`, "Proficiency", "5etools", { compendiumHidden: true }));
    return k ? wid : undefined;
  };
  for (const w of sp.weapons ?? []) { const g = weaponGrant(w); if (g) rules.push({ kind: "grant", type: "Proficiency", id: g, ...first }); }
  for (const r of skillRules(sp.skills, c.name)) rules.push({ ...r, ...first } as ARule);
  for (const r of profRules({ toolProficiencies: sp.toolProficiencies }, c.name, out)) rules.push({ ...r, ...first } as ARule);
  for (const r of profRules({ toolProficiencies: mc.proficienciesGained?.toolProficiencies }, c.name, out)) gained.push(r);
  for (const a of mc.proficienciesGained?.armor ?? []) { const g = armorGrant(a); if (g) gained.push({ kind: "grant", type: "Proficiency", id: g }); }
  for (const w of mc.proficienciesGained?.weapons ?? []) { const g = weaponGrant(w); if (g) gained.push({ kind: "grant", type: "Proficiency", id: g }); }
  for (const r of skillRules(mc.proficienciesGained?.skills, c.name)) gained.push(r);

  // Features by level, and the subclass choice.
  const subTag = `5et subclass of ${id}`;
  let subLevel: number | undefined;
  const asiLevels: number[] = [];
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
    out.push(featureElement(feat, "5et class feature", "Class Feature", fid, ctx, generic));
    rules.push({ kind: "grant", type: "Class Feature", id: fid, level });
  }
  for (const level of asiLevels) {
    rules.push({ kind: "select", type: "Ability Score Improvement", name: `Ability Score Improvement (level ${level})`, supports: "5et asi", number: 1, level, optional: true });
    rules.push({ kind: "select", type: "Feat", name: `Feat instead of ability increase (level ${level})`, supports: "5et feat", number: 1, level, optional: true });
  }
  rules.push(...optionalFeatureRules(c));
  if (subLevel !== undefined) rules.push({ kind: "select", type: "Archetype", name: c.subclassTitle ?? `${c.name} Subclass`, supports: subTag, number: 1, level: subLevel });

  // Spellcasting: tables become per-level stat steps so everything flows through the same rules.
  const casting = castingRules(c, c.name, [c.name], lname);
  const spellcasting = casting.spellcasting;
  rules.push(...casting.rules);
  if (casting.shares) gained.push({ kind: "grant", type: "Grants", id: "ID_INTERNAL_GRANT_MULTICLASS" });
  rules.push({ kind: "grant", type: "Grants", id: "ID_INTERNAL_GRANT_MULTICLASS", requirements: mcId });

  const reqObj = (mc.requirements ?? {}) as J;
  const reqParts = Object.entries(reqObj).filter(([k]) => k in ABIL).map(([k, v]) => `[${k}:${v}]`);
  const el = base(id, c.name, "Class", srcName(ctx, c.source), {
    setters, rules, spellcasting,
    // Sidekicks (Tasha's) are companions the DM runs, not classes a player character takes.
    compendiumHidden: !!c.isSidekick,
    description: `<p>${esc(c.name)}, from ${esc(srcName(ctx, c.source))}. Hit die d${c.hd?.faces ?? "?"}.</p>`,
    multiclass: { id: mcId, requirements: reqParts.length ? `(${reqParts.join(",")})` : undefined, prerequisite: reqParts.length ? Object.entries(reqObj).filter(([k]) => k in ABIL).map(([k, v]) => `${cap(abilFull(k))} ${v}`).join(" and ") : undefined, setters: {}, rules: gained },
  });
  out.push(el);

  for (const s of data.sc.filter((x) => x.className === c.name && (x.classSource ?? c.source) === c.source)) {
    // 5e.tools lists the 2014 subclasses under the 2014 and the 2024 class alike; one id for both let the second
    // replace the first, and the 2014 class lost its subclasses. The class's book joins the id when it differs.
    const sid = ftId("SUBCLASS", `${c.name} ${s.shortName ?? s.name}`, s.source, c.source !== s.source ? `for ${c.source}` : "");
    const srules: ARule[] = [];
    for (const f of data.sf.filter((x) => x.className === c.name && x.subclassShortName === (s.shortName ?? s.name) && (x.subclassSource ?? s.source) === s.source && (x.classSource ?? c.source) === c.source)) {
      const fid = ftId("SF", `${s.shortName ?? s.name} ${f.name}`, f.source, `${f.level}${f.header ?? ""}`);
      if (out.some((o) => o.id === fid)) continue;
      out.push(featureElement(f, "5et subclass feature", "Archetype Feature", fid, ctx, f.name === (s.name)));
      srules.push({ kind: "grant", type: "Archetype Feature", id: fid, level: f.level });
    }
    srules.push(...additionalSpellRules(s.additionalSpells, s.name, s.source).rules);
    // A subclass that casts (Eldritch Knight, Arcane Trickster): its list is the class whose spells it expands with.
    const expandedFrom = [...JSON.stringify(s.additionalSpells ?? []).matchAll(/class=([A-Za-z ]+)/g)].map((m) => m[1].trim());
    const subCasting = castingRules(s, s.shortName ?? s.name, expandedFrom.length ? [...new Set(expandedFrom)] : [c.name], lname);
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

/** Rules for the spells a race, feat or feature adds. Fixed spells are resolved to element ids after conversion. */
export function additionalSpellRules(adds: J[] | undefined, owner: string, ownerSource: string): { rules: ARule[]; ability?: string } {
  const rules: ARule[] = [];
  let ability: string | undefined;
  for (const a of adds ?? []) {
    const ab = a.ability;
    if (!ability && ab) ability = typeof ab === "string" ? ab : Array.isArray(ab?.choose) ? ab.choose[0] : undefined;
    for (const kind of ["innate", "known", "prepared"] as const) {
      for (const { level, refs } of spellRefs(a[kind])) {
        for (const r of refs) {
          if (typeof r === "string") {
            const [name, src] = r.split("#")[0].split("|");
            rules.push({ kind: "grant", type: "Spell", id: `SPELLREF:${name.trim().toLowerCase()}|${(src ?? "").toLowerCase()}|${ownerSource.toLowerCase()}`, level, spellcasting: owner } as ARule);
          } else if (r && typeof (r as J).choose === "string") {
            const crit = Object.fromEntries(String((r as J).choose).split("|").map((p) => p.split("=")).filter((p) => p.length === 2)) as Record<string, string>;
            // 5e.tools separates alternatives with ";" (class=Cleric;Wizard); the filter syntax here uses "||".
            const anyOf = (v?: string) => (v ? (v.includes(";") ? `(${v.split(";").map((x) => x.trim()).filter(Boolean).join("||")})` : v.trim()) : "");
            const school = crit.school ? crit.school.split(";").map((x) => SCHOOL[x.trim().toUpperCase()] ?? x).join(";") : "";
            const parts = [anyOf(crit.class), anyOf(crit.level), anyOf(school)].filter(Boolean) as string[];
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
  return base(ftId("OPT", o.name, o.source), o.name, "Optional Feature", srcName(ctx, o.source), {
    supports: ["5et optional feature", ...types], rules, description: html,
    sheet: { display: true, descriptions: [{ text: html }] },
    setters: lv ? { level: set(String(lv)) } : {},
  });
}

/** Select rules for the optional features a class gains (fighting styles, invocations, maneuvers and so on). */
function optionalFeatureRules(c: J): ARule[] {
  const rules: ARule[] = [];
  for (const p of (c.optionalfeatureProgression as J[]) ?? []) {
    const types: string[] = p.featureType ?? [];
    if (!types.length) continue;
    const prog = p.progression;
    const counts: number[] = Array.isArray(prog) ? prog : Array.from({ length: 20 }, (_, i) => {
      const keys = Object.keys(prog ?? {}).map(Number).sort((x, y) => x - y);
      const k = keys.filter((n) => n <= i + 1).pop();
      return k === undefined ? 0 : Number(prog[String(k)]);
    });
    deltas(counts).forEach((n, i) => {
      if (n > 0) rules.push({ kind: "select", type: "Optional Feature", name: String(p.name ?? "Optional feature"), supports: types.map(optTag).join("|"), number: n, level: i + 1 });
    });
  }
  return rules;
}

// ---------------------------------------------------------------- entry points

export interface FiveToolsInput {
  /** Parsed JSON by file path, for example "races.json" or "class/class-wizard.json". */
  files: Record<string, J>;
}

/** Converts every recognised file. Unknown files are ignored. */
export function convertFiveTools(input: FiveToolsInput): AElement[] {
  const ctx: Ctx = { books: {}, spellClasses: {}, baseItems: new Map() };
  const all = Object.entries(resolveCopies(input.files as Record<string, J>));
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
        setters: { release: set(rel), official: set(/^(UA|HB|Unearthed)/i.test(b.id ?? "") ? "false" : "true"), abbreviation: set(String(b.id ?? "")) },
      }));
    }
  }
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
    for (const i of json.baseitem ?? []) { const e = convertItem(i, ctx); if (e) out.push(e); }
    for (const i of json.item ?? []) { const e = convertItem(i, ctx); if (e) out.push(e); }
    for (const f of json.feat ?? []) if (!featVariants(f, ctx, out)) out.push(convertFeat(f, ctx, out));
    for (const o of json.optionalfeature ?? []) out.push(convertOptionalFeature(o, ctx));
    for (const l of json.language ?? []) out.push(languageElement(l, ctx));
    for (const r of json.race ?? []) convertRace(r, ctx, subraces, out);
    for (const b of json.background ?? []) convertBackground(b, ctx, out);
    for (const m of json.monster ?? []) out.push(convertMonster(m, ctx));
  }
  for (const c of classes) convertClass(c, { cf, sc, sf }, ctx, out);
  resolveSpellRefs(out, spellIds);
  resolveLooseRefs(out);
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
export const FIVETOOLS_CORE_FILES = ["books.json", "races.json", "backgrounds.json", "feats.json", "items-base.json", "items.json", "languages.json", "optionalfeatures.json", "spells/sources.json"];
