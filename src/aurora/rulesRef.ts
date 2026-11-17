/**
 * The rules reference: the 5e.tools class data, condensed to numbers and names (hit dice, saving throws, spell
 * slots, cantrips, prepared and known spells, feature levels, multiclass requirements). It is never bundled with
 * the app: the app downloads it from 5e.tools on GitHub when content is loaded and keeps the condensed form, the
 * same way it loads AuroraLegacy. The test scripts use this same module, so the app and the tests judge a
 * character by the same numbers.
 *
 * This file has no imports, so the Node scripts can load it directly.
 */

export const RULES_REF_CLASSES = [
  "artificer",
  "barbarian",
  "bard",
  "cleric",
  "druid",
  "fighter",
  "monk",
  "paladin",
  "ranger",
  "rogue",
  "sorcerer",
  "warlock",
  "wizard",
];
export const RULES_REF_URL = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/class";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const AB: Record<string, string> = {
  str: "strength",
  dex: "dexterity",
  con: "constitution",
  int: "intelligence",
  wis: "wisdom",
  cha: "charisma",
};
const strip = (s: unknown) =>
  String(s)
    .replace(/\{@\w+ ([^|}]*)[^}]*\}/g, "$1")
    .trim();

function feat(f: string | Json): { name: string; optional: boolean; level: number; subclass: boolean } {
  const ref: string = typeof f === "string" ? f : (f.classFeature ?? f.subclassFeature);
  const p = ref.split("|");
  // Class features: name|class|classSource|level|source; a source of its own marks an optional feature (Tasha's).
  // Subclass features: name|class|classSource|subclass|subclassSource|level|source, the same way.
  const optional = typeof f === "string" ? (p.length === 5 && !!p[4]) || (p.length === 7 && !!p[6]) : false;
  const last = p[p.length - 1];
  return {
    name: strip(p[0]),
    optional,
    level: Number(/^\d+$/.test(last) ? last : p.find((x, i) => i > 0 && /^\d+$/.test(x))),
    subclass: typeof f === "object" && !!f.gainSubclassFeature,
  };
}

/**
 * Armor or weapon categories a class trains, from either way 5e.tools writes them: the structured
 * "armorProficiencies" (2024) or the words in "armor" ("light", "{@item shield|phb|shields}") in the older files.
 */
function startList(sp: Json | undefined, kind: "armor" | "weapon", allowed: string[]): string[] {
  if (!sp) return [];
  const keys = Object.keys(Object.assign({}, ...((sp[`${kind}Proficiencies`] ?? []) as Json[])));
  const words = ((sp[kind === "armor" ? "armor" : "weapons"] ?? []) as unknown[]).map((w) =>
    strip(typeof w === "string" ? w : ((w as Json).proficiency ?? ""))
      .toLowerCase()
      .replace(/s$/, ""),
  );
  return allowed.filter((a) => keys.includes(a) || words.includes(a));
}

/**
 * The single weapons a class trains by name, and the weapon properties it trains a kind by, read here apart from the
 * converter (which had the names wrong while this reference could not tell): "{@item longsword|phb|longswords}" is
 * "longsword"; "Martial weapons that have the {@filter Finesse or Light|items|type=martial weapon|property=
 * finesse;light} property" is martial weapons with finesse or light.
 */
function startWeaponDetail(sp: Json | undefined): { names: string[]; martialWith: string[] } {
  const names: string[] = [];
  const martialWith: string[] = [];
  for (const w of (sp?.weapons ?? []) as unknown[]) {
    if (w && typeof w === "object" && (w as Json).optional) continue;
    const text = String(typeof w === "string" ? w : ((w as Json).proficiency ?? ""));
    const filter = /\{@filter [^|}]*\|items\|([^}]*)\}/.exec(text)?.[1];
    if (filter) {
      if (/type=[^|]*martial/.test(filter))
        martialWith.push(
          ...(/property=([^|]*)/.exec(filter)?.[1] ?? "")
            .split(";")
            .map((x) => x.trim().toLowerCase())
            .filter(Boolean),
        );
      continue;
    }
    const item = /\{@item ([^|}]+)/.exec(text)?.[1];
    if (item) names.push(item.trim().toLowerCase());
  }
  for (const block of (sp?.weaponProficiencies ?? []) as Json[])
    for (const [k, v] of Object.entries(block)) if (v === true && k.includes("|")) names.push(k.split("|")[0].trim().toLowerCase());
  return { names: [...new Set(names)], martialWith: [...new Set(martialWith)] };
}

/**
 * A subclass's always-prepared spells by class level ("Life Domain Spells", "Oath of Devotion Spells"), names in lower
 * case, from 5e.tools' "additionalSpells"; null when it has none or several sets to choose from (Circle of the Land's
 * terrains), so the rules check judges only what is fixed (W5).
 */
function preparedSpells(sets: unknown): Record<string, string[]> | null {
  if (!Array.isArray(sets) || sets.length !== 1) return null;
  const prepared = (sets[0] as Json)?.prepared as Json | undefined;
  if (!prepared) return null;
  const out: Record<string, string[]> = {};
  for (const [level, list] of Object.entries(prepared)) {
    if (!Array.isArray(list)) continue;
    const names = list.filter((x): x is string => typeof x === "string").map((x) => x.split("|")[0].split("#")[0].trim().toLowerCase());
    if (names.length) out[level] = names;
  }
  return Object.keys(out).length ? out : null;
}

/** One 5e.tools class file (data/class/class-*.json) to the reference entries for its classes. */
export function condenseClassFile(file: Json): Json[] {
  const out: Json[] = [];
  for (const c of (file.class ?? []) as Json[]) {
    const groups: Json[] = c.classTableGroups ?? [];
    const slotGroup = groups.find((g) => g.rowsSpellProgression);
    const flat = groups.find(
      (g) =>
        g.colLabels?.some((l: string) => /^Spell Slots$/i.test(strip(l))) && g.colLabels?.some((l: string) => /Slot Level/i.test(strip(l))),
    );
    let pact: Json | null = null;
    if (flat) {
      const si = flat.colLabels.findIndex((l: string) => /^Spell Slots$/i.test(strip(l)));
      const li = flat.colLabels.findIndex((l: string) => /Slot Level/i.test(strip(l)));
      pact = {
        slots: flat.rows.map((r: unknown[]) => Number(r[si])),
        level: flat.rows.map((r: unknown[]) => Number(String(strip(r[li])).match(/\d/)?.[0])),
      };
    }
    const features = ((c.classFeatures ?? []) as (string | Json)[]).map(feat);
    // The class table's other columns, by label and level: uses (Rages, Focus Points, Channel Divinity, Wild Shape,
    // Second Wind), bonuses (Rage Damage) and dice (Martial Arts), for the rules check to judge on its own (W5).
    const counters: Record<string, (number | string | null)[]> = {};
    for (const g of groups) {
      if (g.rowsSpellProgression || g === flat) continue;
      ((g.colLabels as string[]) ?? []).forEach((label, i) => {
        counters[strip(label)] = ((g.rows as unknown[][]) ?? []).map((row) => {
          const v = row[i] as unknown;
          if (typeof v === "number") return v;
          if (v && typeof v === "object") {
            const o = v as Json;
            if (typeof o.value === "number") return o.value;
            const die = (o.toRoll as Json[] | undefined)?.[0];
            if (die) return `${die.number}d${die.faces}`;
          }
          const t = strip(v ?? "");
          return /^\d+$/.test(t) ? Number(t) : t || null;
        });
      });
    }
    const req: Json | undefined = c.multiclassing?.requirements;
    const progression = (c.featProgression as Json[] | undefined)?.find((p) => /epic boon/i.test(p.name))?.progression;
    out.push({
      name: c.name,
      source: c.source,
      edition: c.edition ?? (c.source === "XPHB" ? "one" : "classic"),
      hd: c.hd?.faces,
      saves: ((c.proficiency ?? []) as string[]).map((a) => AB[a]),
      caster: c.casterProgression ?? null,
      cantrips: c.cantripProgression ?? null,
      prepared: c.preparedSpellsProgression ?? null,
      preparedFormula: typeof c.preparedSpells === "string" ? c.preparedSpells : null,
      known: c.spellsKnownProgression ?? null,
      slots: slotGroup ? slotGroup.rowsSpellProgression : null,
      pact,
      features,
      subclassLevel: features.find((f) => f.subclass)?.level ?? null,
      counters,
      asiLevels: features.filter((f) => /^Ability Score Improvement$/i.test(f.name)).map((f) => f.level),
      epicBoon: progression ? Number(Object.keys(progression)[0]) : null,
      multiclass: req
        ? Object.fromEntries(
            Object.entries(req)
              .filter(([k]) => AB[k])
              .map(([k, v]) => [AB[k], v]),
          )
        : null,
      multiclassOr: req?.or ? (req.or as Json[]).map((o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [AB[k], v]))) : null,
      primaryAbility: c.primaryAbility ? (c.primaryAbility as Json[]).map((o) => Object.keys(o).map((k) => AB[k])) : null,
      // What the class itself trains (a first-level character): armor and weapon categories, named tools.
      startArmor: startList(c.startingProficiencies, "armor", ["light", "medium", "heavy", "shield"]),
      startWeapons: startList(c.startingProficiencies, "weapon", ["simple", "martial"]),
      startWeaponNames: startWeaponDetail(c.startingProficiencies).names,
      startMartialWith: startWeaponDetail(c.startingProficiencies).martialWith,
      startTools: Object.entries(Object.assign({}, ...((c.startingProficiencies?.toolProficiencies ?? []) as Json[])))
        .filter(([k, v]) => v === true && !/^any/.test(k))
        .map(([k]) => k),
      subclasses: ((file.subclass ?? []) as Json[])
        .filter((s) => s.className === c.name && s.classSource === c.source)
        .map((s) => ({
          name: s.name,
          shortName: s.shortName,
          source: s.source,
          caster: s.casterProgression ?? null,
          features: ((s.subclassFeatures ?? []) as (string | Json)[]).map(feat),
          spells: preparedSpells(s.additionalSpells),
        })),
    });
  }
  return out;
}

/** Downloads the class files and condenses them. `get` fetches a URL as JSON (so the app and Node can each use their own). */
export async function downloadRulesRef(get: (url: string) => Promise<Json>): Promise<Json[]> {
  const all: Json[] = [];
  for (const c of RULES_REF_CLASSES) all.push(...condenseClassFile(await get(`${RULES_REF_URL}/class-${c}.json`)));
  return all;
}
