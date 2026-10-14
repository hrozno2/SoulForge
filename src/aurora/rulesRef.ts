/**
 * The rules reference: the 5e.tools class data, condensed to numbers and names (hit dice, saving throws, spell
 * slots, cantrips, prepared and known spells, feature levels, multiclass requirements). It is never bundled with
 * the app: the app downloads it from 5e.tools on GitHub when content is loaded and keeps the condensed form, the
 * same way it loads AuroraLegacy. The test scripts use this same module, so the app and the tests judge a
 * character by the same numbers.
 *
 * This file has no imports, so the Node scripts can load it directly.
 */

export const RULES_REF_CLASSES = ["artificer", "barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"];
export const RULES_REF_URL = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/class";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const AB: Record<string, string> = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" };
const strip = (s: unknown) => String(s).replace(/\{@\w+ ([^|}]*)[^}]*\}/g, "$1").trim();

function feat(f: string | Json): { name: string; optional: boolean; level: number; subclass: boolean } {
  const ref: string = typeof f === "string" ? f : f.classFeature ?? f.subclassFeature;
  const p = ref.split("|");
  // Class features: name|class|classSource|level|source; a source of its own marks an optional feature (Tasha's).
  // Subclass features: name|class|classSource|subclass|subclassSource|level|source, the same way.
  const optional = typeof f === "string" ? (p.length === 5 && !!p[4]) || (p.length === 7 && !!p[6]) : false;
  const last = p[p.length - 1];
  return { name: strip(p[0]), optional, level: Number(/^\d+$/.test(last) ? last : p.find((x, i) => i > 0 && /^\d+$/.test(x))), subclass: typeof f === "object" && !!f.gainSubclassFeature };
}

/** One 5e.tools class file (data/class/class-*.json) to the reference entries for its classes. */
export function condenseClassFile(file: Json): Json[] {
  const out: Json[] = [];
  for (const c of (file.class ?? []) as Json[]) {
    const groups: Json[] = c.classTableGroups ?? [];
    const slotGroup = groups.find((g) => g.rowsSpellProgression);
    const flat = groups.find((g) => g.colLabels?.some((l: string) => /^Spell Slots$/i.test(strip(l))) && g.colLabels?.some((l: string) => /Slot Level/i.test(strip(l))));
    let pact: Json | null = null;
    if (flat) {
      const si = flat.colLabels.findIndex((l: string) => /^Spell Slots$/i.test(strip(l)));
      const li = flat.colLabels.findIndex((l: string) => /Slot Level/i.test(strip(l)));
      pact = { slots: flat.rows.map((r: unknown[]) => Number(r[si])), level: flat.rows.map((r: unknown[]) => Number(String(strip(r[li])).match(/\d/)?.[0])) };
    }
    const features = ((c.classFeatures ?? []) as (string | Json)[]).map(feat);
    const req: Json | undefined = c.multiclassing?.requirements;
    const progression = (c.featProgression as Json[] | undefined)?.find((p) => /epic boon/i.test(p.name))?.progression;
    out.push({
      name: c.name, source: c.source, edition: c.edition ?? (c.source === "XPHB" ? "one" : "classic"),
      hd: c.hd?.faces, saves: ((c.proficiency ?? []) as string[]).map((a) => AB[a]),
      caster: c.casterProgression ?? null,
      cantrips: c.cantripProgression ?? null,
      prepared: c.preparedSpellsProgression ?? null,
      preparedFormula: typeof c.preparedSpells === "string" ? c.preparedSpells : null,
      known: c.spellsKnownProgression ?? null,
      slots: slotGroup ? slotGroup.rowsSpellProgression : null,
      pact,
      features,
      subclassLevel: features.find((f) => f.subclass)?.level ?? null,
      asiLevels: features.filter((f) => /^Ability Score Improvement$/i.test(f.name)).map((f) => f.level),
      epicBoon: progression ? Number(Object.keys(progression)[0]) : null,
      multiclass: req ? Object.fromEntries(Object.entries(req).filter(([k]) => AB[k]).map(([k, v]) => [AB[k], v])) : null,
      multiclassOr: req?.or ? (req.or as Json[]).map((o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [AB[k], v]))) : null,
      primaryAbility: c.primaryAbility ? (c.primaryAbility as Json[]).map((o) => Object.keys(o).map((k) => AB[k])) : null,
      subclasses: ((file.subclass ?? []) as Json[]).filter((s) => s.className === c.name && s.classSource === c.source).map((s) => ({ name: s.name, shortName: s.shortName, source: s.source, caster: s.casterProgression ?? null, features: ((s.subclassFeatures ?? []) as (string | Json)[]).map(feat) })),
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
