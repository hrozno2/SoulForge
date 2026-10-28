/**
 * A beast form worked out for the character (A2.6): what a druid in Wild Shape, a creature under Polymorph, or a
 * companion actually has, from the beast's stat block and the character.
 * - Wild Shape, 2014 rules (PHB): the beast's Strength, Dexterity and Constitution, hit points and AC; the character's
 *   Intelligence, Wisdom and Charisma; every skill and save the character is proficient in keeps the better bonus.
 * - Wild Shape, 2024 rules (PHB 2024): as above, but the character keeps their own hit points and gains temporary hit
 *   points equal to their druid level; Circle of the Moon (Circle Forms): AC is at least 13 + the Wisdom modifier,
 *   and three times the druid level in temporary hit points.
 * - Polymorph: the beast's statistics entirely, mental ones too.
 * - A companion: the beast's own block, with what the character's features add ("companion:" statistics).
 */
import type { AElement } from "./types";
import type { Resolved } from "./engine";
import { isModern } from "./edition";
import { buildSheet } from "./sheet";

export type FormKind = "wild shape" | "polymorph" | "companion";
const ABILITIES = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;
type Ability = (typeof ABILITIES)[number];

export interface FormBlock {
  name: string;
  kind: FormKind;
  rules: "2014" | "2024";
  ac: number;
  hp: number;
  tempHp: number;
  speed: string;
  abilities: Record<Ability, number>;
  saves: Record<Ability, number>;
  skills: { name: string; bonus: number }[];
  /** How each number came about, for the card. */
  notes: string[];
}

const mod = (score: number) => Math.floor((score - 10) / 2);
const num = (v: string | undefined) => Number(/-?\d+/.exec(v ?? "")?.[0] ?? 0);

export function formStats(r: Resolved, beast: AElement, kind: FormKind): FormBlock {
  const sh = buildSheet(r);
  const set = beast.setters;
  const druidClass = r.character.classes.map((c) => r.reg.get(c.classId)).find((e) => e?.name === "Druid");
  const druidLevel = r.character.classes.find((c) => r.reg.get(c.classId)?.name === "Druid")?.level ?? 0;
  const rules: "2014" | "2024" = druidClass ? (isModern(druidClass) ? "2024" : "2014") : "2024";
  const moon = r.active.some((a) => a.el.type === "Archetype" && /circle of the moon/i.test(a.el.name));
  const notes: string[] = [];
  const beastScore = (a: Ability) => num(set[a]?.value) || 10;
  const own = (a: Ability) => sh.abilities.find((x) => x.id === a)!;
  const keepsMind = kind === "wild shape";
  const abilities = Object.fromEntries(ABILITIES.map((a) => [a, keepsMind && /^(intelligence|wisdom|charisma)$/.test(a) ? own(a).score : beastScore(a)])) as Record<Ability, number>;
  if (keepsMind) notes.push("Intelligence, Wisdom and Charisma are yours.");

  // Saves and skills: the beast's, or for Wild Shape the better of the beast's and yours where you are proficient.
  const beastSkills = new Map((set.skills?.value ?? "").split(",").map((x) => /^\s*(.+?)\s*([+-]\d+)\s*$/.exec(x)).filter(Boolean).map((m) => [m![1].toLowerCase(), Number(m![2])] as [string, number]));
  const saves = Object.fromEntries(ABILITIES.map((a) => {
    const fromBeast = mod(abilities[a]);
    const mine = own(a);
    return [a, keepsMind && mine.saveProficient ? Math.max(fromBeast, mine.save) : fromBeast];
  })) as Record<Ability, number>;
  const skills = sh.skills.map((s) => {
    const beastBonus = beastSkills.get(s.name.toLowerCase()) ?? mod(abilities[s.ability as Ability] ?? 10);
    return { name: s.name, bonus: keepsMind && s.level !== "none" ? Math.max(beastBonus, s.bonus) : beastBonus };
  });
  if (keepsMind) notes.push("Skills and saves you are proficient in use your bonus when it is higher.");

  let ac = num(set.ac?.value);
  let hp = num(set.hp?.value);
  let tempHp = 0;
  if (kind === "wild shape" && rules === "2024") {
    hp = sh.hp;
    tempHp = druidLevel * (moon ? 3 : 1);
    notes.push(`You keep your hit points and gain ${tempHp} temporary hit points (${moon ? "three times " : ""}your druid level).`);
    if (moon) {
      const moonAc = 13 + mod(abilities.wisdom);
      if (moonAc > ac) { ac = moonAc; notes.push("AC 13 + your Wisdom modifier (Circle Forms)."); }
    }
  } else if (kind === "wild shape") notes.push("The beast's hit points; when they run out you return to your own.");
  if (kind === "companion") {
    // Aurora's companion statistics are the companion's own numbers worked out with the character's (the Steel
    // Defender's "2 + your Intelligence modifier + five times your artificer level"), not bonuses on top. They share
    // one name, so they are this companion's only when it is the character's only one; otherwise the stat block.
    const only = r.active.filter((a) => a.el.type === "Companion").map((a) => a.el.id);
    if (only.length === 1 && only[0] === beast.id) {
      const cac = r.stats.get("companion:ac"), chp = r.stats.get("companion:hp:max");
      if (cac > 0 && cac !== ac) { ac = cac; notes.push("AC worked out with your statistics."); }
      if (chp > 0) { if (chp !== hp) notes.push("Hit points worked out with your level and statistics."); hp = chp; }
    }
  }
  return { name: beast.name, kind, rules, ac, hp, tempHp, speed: set.speed?.value ?? "", abilities, saves, skills, notes };
}
