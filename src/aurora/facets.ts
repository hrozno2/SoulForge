import type { AElement } from "./types";
import { formatRelease, ruleSetOf, yearOf, type BookIndex } from "./books";

export interface FacetDef {
  id: string;
  label: string;
  /** Values this element has for the facet. Several values mean it matches any of them. */
  get(el: AElement, books: BookIndex): string[];
  /** How values sort in the filter bar. */
  order?: (a: string, b: string) => number;
}

const setter = (el: AElement, k: string) => el.setters[k]?.value ?? "";

const num = (a: string, b: string) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0);

const common: FacetDef[] = [
  { id: "ruleset", label: "Rule set", get: (e, b) => [ruleSetOf(b.info(e.source), e.source)] },
  { id: "source", label: "Source", get: (e) => [e.source || "Unknown"] },
  { id: "kind", label: "Kind", get: (e, b) => { const i = b.info(e.source); return [i.playtest ? "Playtest" : i.official ? "Official" : "Other"]; } },
  { id: "year", label: "Released", get: (e, b) => { const y = yearOf(b.info(e.source).release); return [y ? String(y) : "Undated"]; }, order: (a, b) => (b === "Undated" ? -1 : a === "Undated" ? 1 : num(b, a)) },
];

const ABILITY_ORDER = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
const abilityOrder = (a: string, b: string) => ABILITY_ORDER.indexOf(a) - ABILITY_ORDER.indexOf(b);

const levelLabel = (e: AElement) => (setter(e, "level") === "0" ? "C" : setter(e, "level") || "?");

function timeKind(t: string): string {
  const s = t.toLowerCase();
  if (/bonus/.test(s)) return "Bonus action";
  if (/reaction/.test(s)) return "Reaction";
  if (/^(1 )?action$/.test(s) || s === "action") return "Action";
  if (/minute|hour|day/.test(s)) return "1 minute or more";
  return t ? "Other" : "";
}

function rangeKind(r: string): string {
  const s = r.toLowerCase();
  if (/^self/.test(s)) return "Self";
  if (/touch/.test(s)) return "Touch";
  const m = s.match(/(\d+)\s*(feet|ft|mile)/);
  if (!m) return /sight|unlimited|special/.test(s) ? "Other" : "";
  const ft = m[2].startsWith("mile") ? parseInt(m[1], 10) * 5280 : parseInt(m[1], 10);
  return ft <= 30 ? "30 ft or less" : ft <= 120 ? "31 to 120 ft" : "More than 120 ft";
}

const SPELL: FacetDef[] = [
  { id: "level", label: "Level", get: (e) => [levelLabel(e)], order: (a, b) => (a === "C" ? -1 : b === "C" ? 1 : num(a, b)) },
  { id: "school", label: "School", get: (e) => (setter(e, "school") ? [setter(e, "school")] : []) },
  { id: "class", label: "Class", get: (e) => e.supports.filter((t) => /^(Artificer|Bard|Cleric|Druid|Paladin|Ranger|Sorcerer|Warlock|Wizard)$/i.test(t)) },
  { id: "components", label: "Components", get: (e) => [setter(e, "hasVerbalComponent") === "true" && "V", setter(e, "hasSomaticComponent") === "true" && "S", setter(e, "hasMaterialComponent") === "true" && "M"].filter((x): x is string => !!x) },
  { id: "concentration", label: "Concentration", get: (e) => [setter(e, "isConcentration") === "true" ? "Yes" : "No"] },
  { id: "ritual", label: "Ritual", get: (e) => [setter(e, "isRitual") === "true" ? "Yes" : "No"] },
  { id: "time", label: "Casting time", get: (e) => (timeKind(setter(e, "time")) ? [timeKind(setter(e, "time"))] : []) },
  { id: "range", label: "Range", get: (e) => (rangeKind(setter(e, "range")) ? [rangeKind(setter(e, "range"))] : []) },
];

const sizeOf = (e: AElement) => {
  const g = e.rules.find((r) => r.kind === "grant" && /SIZE|RACIAL_TRAIT_(TINY|SMALL|MEDIUM|LARGE)/.test(r.id));
  const m = g && g.kind === "grant" ? g.id.match(/(TINY|SMALL|MEDIUM|LARGE|HUGE)/) : null;
  return m ? m[1].charAt(0) + m[1].slice(1).toLowerCase() : "";
};

const FACETS: Record<string, FacetDef[]> = {
  Spell: SPELL,
  Race: [
    { id: "size", label: "Size", get: (e) => (sizeOf(e) ? [sizeOf(e)] : []) },
    { id: "speed", label: "Speed", get: (e) => { const r = e.rules.find((x) => x.kind === "stat" && x.name === "innate speed"); return r && r.kind === "stat" ? [`${r.value} ft`] : []; } },
    { id: "ability", label: "Ability increase", get: (e) => e.abilityTags ?? [], order: abilityOrder },
    { id: "flight", label: "Movement", get: (e) => e.rules.filter((r) => r.kind === "stat" && /^innate speed:(fly|swim|climb|burrow)/.test(r.name)).map((r) => (r.kind === "stat" ? r.name.split(":")[1] : "")) },
  ],
  Class: [
    { id: "hd", label: "Hit die", get: (e) => (setter(e, "hd") ? [setter(e, "hd").toLowerCase()] : []) },
    { id: "caster", label: "Spellcasting", get: (e) => [e.spellcasting ? "Caster" : e.description.match(/spellcasting/i) ? "Caster" : "Non-caster"] },
    { id: "primary", label: "Primary ability", get: (e) => { const m = e.description.match(/<b>\s*Primary Ability\s*<\/b>\s*<\/td>\s*<td[^>]*>([^<]+)/i); return m ? m[1].split(/ and |, | or /).map((s) => s.trim()).filter(Boolean) : []; } },
  ],
  Background: [
    { id: "ability", label: "Ability increase", get: (e) => e.abilityTags ?? [], order: abilityOrder },
    { id: "skills", label: "Skills", get: (e) => { const m = e.description.match(/Skill Proficienc(?:y|ies):<\/strong>\s*([^<]+)/i); return m ? m[1].split(/,| and /).map((s) => s.trim()).filter(Boolean) : []; } },
  ],
  Feat: [
    { id: "category", label: "Category", get: (e) => { const c = e.supports.find((s) => /^category /i.test(s)); const map: Record<string, string> = { O: "Origin", G: "General", FS: "Fighting Style", EB: "Epic Boon" }; return c ? [map[c.slice(9).toUpperCase()] ?? c.slice(9)] : e.supports.filter((s) => /origin|general|fighting style|epic boon/i.test(s)); } },
    { id: "prereq", label: "Prerequisite", get: (e) => [e.requirements ? "Has prerequisite" : "None"] },
  ],
  Language: [{ id: "kind2", label: "Kind", get: (e) => e.supports.filter((s) => /standard|exotic|secret/i.test(s)).map((s) => s.charAt(0).toUpperCase() + s.slice(1)) }],
  Item: [{ id: "category", label: "Category", get: (e) => (setter(e, "category") ? [setter(e, "category")] : []) }],
  Weapon: [{ id: "damage", label: "Damage type", get: (e) => (e.setters.damage?.attrs.type ? [e.setters.damage.attrs.type] : []) }],
  Armor: [{ id: "armor", label: "Armor type", get: (e) => (setter(e, "armor") ? [setter(e, "armor")] : []) }],
  Archetype: [],
};

export function facetsFor(type: string): FacetDef[] {
  const own = FACETS[type] ?? [];
  // Spells care most about their own facets; other lists put the book facets after theirs.
  return [...own, ...common];
}

export type Selected = Record<string, Set<string>>;

/** Keep elements that match every facet group that has something selected (any value inside a group). */
export function applyFacets(items: AElement[], defs: FacetDef[], sel: Selected, books: BookIndex): AElement[] {
  const active = defs.filter((d) => sel[d.id]?.size);
  if (!active.length) return items;
  return items.filter((e) => active.every((d) => { const vals = d.get(e, books); return vals.some((v) => sel[d.id].has(v)); }));
}

/** Values of a facet across a list, with counts, for the filter bar. */
export function facetCounts(items: AElement[], def: FacetDef, books: BookIndex): [string, number][] {
  const counts = new Map<string, number>();
  for (const e of items) for (const v of new Set(def.get(e, books))) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => (def.order ? def.order(a[0], b[0]) : a[0].localeCompare(b[0])));
}

export { formatRelease };
