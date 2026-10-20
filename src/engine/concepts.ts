/**
 * The canonical vocabulary (docs/ENGINE-PLAN.md, 3.1): one key per game concept, whatever content source names it.
 * Aurora and 5e.tools both name these "Weapon Proficiency (Longsword)", "Saving Throw Proficiency (Strength)" and
 * so on, so the key comes from the element's type and normalized name, never from a table of ids.
 */

export const ABILITIES = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;
export type Ability = (typeof ABILITIES)[number];
export const ABILITY_KEY: Record<Ability, string> = { strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha" };

export const SKILLS = [
  "acrobatics", "animal handling", "arcana", "athletics", "deception", "history", "insight", "intimidation", "investigation",
  "medicine", "nature", "perception", "performance", "persuasion", "religion", "sleight of hand", "stealth", "survival",
] as const;

/** Lower case, markup removed ("{@item Dagger|phb}" -> "dagger"), curly quotes straightened, spaces single. */
export function plain(s: string): string {
  return s
    .replace(/\{@\w+\s+([^|}]*)[^}]*\}?/g, "$1")
    .replace(/[‘’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export const slugOf = (s: string) => plain(s).replace(/'/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const SKILL_BY_SQUASHED = new Map(SKILLS.map((s) => [s.replace(/\s+/g, ""), s]));
const skillOf = (s: string) => SKILL_BY_SQUASHED.get(plain(s).replace(/[^a-z]/g, ""));

/** Weapon proficiency names to one key: "Simple Weapons" and "Simple" -> weapon:simple; "Shields" -> armor:shield. */
function weaponKey(what: string): string {
  const w = plain(what).replace(/\s+weapons?$/, "");
  if (w === "simple" || w === "martial") return `weapon:${w}`;
  return `weapon:${slugOf(w)}`;
}

function armorKey(what: string): string {
  const a = plain(what).replace(/\s+armou?r$/, "");
  if (a === "shields" || a === "shield") return "armor:shield";
  return `armor:${slugOf(a)}`;
}

/**
 * The concept an element stands for, or undefined when it is not one of the shared concepts. `type` and `name` are
 * the element's; the id only helps tell expertise from proficiency where the name does not.
 */
export function conceptOf(el: { type: string; id: string; name: string }): string | undefined {
  const name = el.name ?? "";
  if (el.type === "Language") return `language:${slugOf(name.replace(/\s*\(.*\)\s*$/, ""))}`;
  if (el.type === "Size") return `size:${slugOf(name)}`;
  if (el.type === "Vision") {
    const m = plain(name).match(/^(darkvision|blindsight|truesight|tremorsense|superior darkvision)/);
    return m ? `sense:${slugOf(m[1])}` : undefined;
  }
  if (el.type !== "Proficiency") return undefined;
  const p = plain(name);
  let m = p.match(/^saving throw proficiency \((\w+)\)$/);
  if (m && (ABILITIES as readonly string[]).includes(m[1])) return `save:${ABILITY_KEY[m[1] as Ability]}`;
  m = p.match(/^armou?r proficiency \((.+)\)$/);
  if (m) return armorKey(m[1]);
  m = p.match(/^weapon proficiency \((.+)\)$/);
  if (m) return weaponKey(m[1]);
  m = p.match(/^tool expertise \((.+)\)$/);
  if (m) return `tool-expertise:${slugOf(m[1])}`;
  m = p.match(/^(?:tool|gaming set|musical instrument|vehicle) proficiency \((.+)\)$/);
  if (m) return `tool:${slugOf(m[1])}`;
  const expertise = /expertise/i.test(el.id) || /\(expertise\)$/.test(p);
  const skill = skillOf(p.replace(/\s*\(expertise\)$/, "").replace(/^skill (?:proficiency|expertise) \((.+)\)$/, "$1"));
  if (skill) return `${expertise ? "expertise" : "skill"}:${slugOf(skill)}`;
  return undefined;
}

/**
 * Concepts some content names only by a marker id, with no element behind it (Aurora's sizes: "ID_SIZE_MEDIUM").
 * Returns the concept, or undefined when the id is not such a marker.
 */
export function conceptOfMarker(id: string): string | undefined {
  const m = id.match(/^ID_(?:SIZE|5ET_SIZE)_(TINY|SMALL|MEDIUM|LARGE|HUGE|GARGANTUAN|COLOSSAL)$/);
  return m ? `size:${m[1].toLowerCase()}` : undefined;
}
