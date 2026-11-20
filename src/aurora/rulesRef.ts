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
export const RULES_REF_SPECIES_URL = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/races.json";
export const RULES_REF_BACKGROUNDS_URL = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/backgrounds.json";

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

/** How many proficiencies one block of 5e.tools' structured lists gives: each named one, each "any" count, each choice. */
function profCount(block: Json | undefined): number {
  let n = 0;
  for (const [k, v] of Object.entries(block ?? {})) {
    if (v === true) n++;
    else if (typeof v === "number") n += v;
    else if (k === "choose" && v && typeof v === "object") n += Number((v as Json).count ?? 1);
  }
  return n;
}
/** The count of each alternative a list offers (a Monk: one artisan's tool, or one musical instrument); [0] for none. */
const profCounts = (list: unknown): number[] => {
  const blocks = Array.isArray(list) ? (list as Json[]) : [];
  return blocks.length ? [...new Set(blocks.map(profCount))] : [0];
};
/** A class's skills: how many, and from which list (null: any skill). Named skills count and join the list. */
function skillRule(list: unknown): { count: number; from: string[] | null } {
  const block = (Array.isArray(list) ? (list as Json[])[0] : undefined) ?? {};
  const named = Object.entries(block)
    .filter(([, v]) => v === true)
    .map(([k]) => k.toLowerCase());
  const choose = block.choose as Json | undefined;
  const any = typeof block.any === "number";
  return {
    count: profCount(block),
    from: any ? null : [...named, ...((choose?.from ?? []) as string[]).map((x) => String(x).toLowerCase())],
  };
}

/**
 * The backgrounds of 5e.tools condensed to what each trains by count: skills, tools, languages (W5: training judged
 * per source). A copy ("Baldur's Gate Acolyte" of Acolyte) takes what it does not write itself from its original.
 */
/**
 * Where the book's text and 5e.tools' structured list part, the text holds. The Feylost: "Languages: One of your
 * choice of Elvish, Gnomish, Goblin, or Sylvan" (The Wild Beyond the Witchlight); the list holds that choice and one
 * standard language besides.
 */
const BACKGROUND_BY_THE_BOOK: Record<string, { languages?: number[]; tools?: number[]; skills?: number[] }> = {
  "Feylost|WBtW": { languages: [1] },
};

export function condenseBackgrounds(file: Json): Json[] {
  const all = (file.background ?? []) as Json[];
  const find = (name: string, source: string) => all.find((b) => b.name === name && b.source === source);
  const field = (b: Json | undefined, key: string, depth = 0): unknown =>
    !b || depth > 5 ? undefined : (b[key] ?? (b._copy ? field(find(b._copy.name, b._copy.source), key, depth + 1) : undefined));
  return all.map((b) => ({
    name: b.name,
    source: b.source,
    edition: field(b, "edition") === "one" ? "one" : "classic",
    skills: profCounts(field(b, "skillProficiencies")),
    tools: profCounts(field(b, "toolProficiencies")),
    languages: profCounts(field(b, "languageProficiencies")),
    ...BACKGROUND_BY_THE_BOOK[`${b.name}|${b.source}`],
  }));
}

/**
 * The species of 5e.tools condensed to what each trains by count, as the backgrounds are: one entry per species and
 * one per subrace ("Elf (High)"), a subrace's own list standing in place of its species' (5e.tools writes the whole
 * list on it: the High Elf's languages are Common, Elvish and one more). `base` is the species' name without a subrace.
 */
/**
 * Species entries read with the book beside them. The Githyanki's Astral Knowledge (Monsters of the Multiverse) gives
 * a skill and a weapon or tool chosen anew after each long rest: content may leave them to the player.
 */
const SPECIES_BY_THE_BOOK: Record<string, { languages?: number[]; tools?: number[]; skills?: number[] }> = {
  "Githyanki|MPMM": { skills: [0, 1], tools: [0, 1] },
  // Mordenkainen's Tome of Foes, Githyanki, Decadent Mastery: "one language of your choice, and ... one skill or tool
  // of your choice"; 5e.tools holds it as text only.
  "Gith (Githyanki)|MTF": { skills: [0, 1], tools: [0, 1], languages: [3] },
  // One Grung Above names no tool; Aurora's file trains the Grung's whistle-stick. Left open either way (the book was
  // not at hand to settle it).
  "Grung|OGA": { tools: [0, 1] },
  // Tasha's Custom Lineage, Variable Trait: darkvision, or one skill.
  "Custom Lineage|TCE": { skills: [0, 1] },
  // Van Richten's lineages, Ancestral Legacy: two skills, unless the lineage replaces a species whose own are kept.
  "Dhampir|VRGR": { skills: [0, 2] },
  "Hexblood|VRGR": { skills: [0, 2] },
  "Reborn|VRGR": { skills: [0, 2] },
  // The Khoravar's Skill Versatility (Eberron: Forge of the Artificer): one skill or tool.
  "Khoravar|EFA": { skills: [0, 1], tools: [0, 1] },
  // Sword Coast Adventurer's Guide, Half-Elf Variants: a trait "in place of" Skill Versatility (Keen Senses gives one).
  "Half-Elf (Variant; Aquatic Elf Descent)|SCAG": { skills: [0, 1] },
  "Half-Elf (Variant; Drow Descent)|SCAG": { skills: [0, 1] },
  "Half-Elf (Variant; Moon Elf or Sun Elf Descent)|SCAG": { skills: [0, 1] },
  "Half-Elf (Variant; Wood Elf Descent)|SCAG": { skills: [0, 1] },
  // Plane Shift: the Tajuru's "any combination of two skills or tools", Nephalia's "any combination of four".
  "Elf (Zendikar) (Tajuru Nation)|PSZ": { skills: [1, 2, 3], tools: [0, 1, 2] },
  "Human (Innistrad) (Nephalia)|PSI": { skills: [0, 1, 2, 3, 4], tools: [0, 1, 2, 3, 4] },
};

export function condenseSpecies(file: Json): Json[] {
  const races = (file.race ?? []) as Json[];
  const find = (name: string, source: string) => races.find((r) => r.name === name && r.source === source);
  const field = (r: Json | undefined, key: string, depth = 0): unknown =>
    !r || depth > 5 ? undefined : (r[key] ?? (r._copy ? field(find(r._copy.name, r._copy.source), key, depth + 1) : undefined));
  const entry = (name: string, base: string, source: string, edition: unknown, get: (key: string) => unknown) => ({
    name,
    base,
    source,
    edition: edition === "one" ? "one" : "classic",
    skills: profCounts(get("skillProficiencies")),
    tools: profCounts(get("toolProficiencies")),
    languages: profCounts(get("languageProficiencies")),
    ...SPECIES_BY_THE_BOOK[`${name}|${source}`],
  });
  const out = races.map((r) => entry(r.name, r.name, r.source, field(r, "edition"), (k) => field(r, k)));
  for (const s of (file.subrace ?? []) as Json[]) {
    const parent = find(s.raceName, s.raceSource);
    if (!parent) continue;
    out.push(
      entry(
        s.name ? `${s.raceName} (${s.name})` : s.raceName,
        s.raceName,
        s.source ?? s.raceSource,
        s.edition ?? field(parent, "edition"),
        // Set to nothing on the subrace: the species' own is taken away.
        (k) => (k in s ? (s[k] ?? undefined) : field(parent, k)),
      ),
    );
  }
  return out;
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
      // Skills and tools by count (W5): at first level, and what a character gains by multiclassing into the class.
      startSkills: skillRule(c.startingProficiencies?.skills),
      mcSkills: skillRule(c.multiclassing?.proficienciesGained?.skills),
      startToolCounts: profCounts(c.startingProficiencies?.toolProficiencies),
      mcToolCounts: profCounts(c.multiclassing?.proficienciesGained?.toolProficiencies),
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
  // The backgrounds ride on the first entry, so the reference stays one list of classes wherever it is kept.
  if (all.length) all[0].backgrounds = condenseBackgrounds(await get(RULES_REF_BACKGROUNDS_URL));
  if (all.length) all[0].species = condenseSpecies(await get(RULES_REF_SPECIES_URL));
  return all;
}
