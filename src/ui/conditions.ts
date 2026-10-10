/** What the standard conditions do to d20 rolls, so rolls can apply them and say so. */
export type RollKind = "attack" | "check" | "save" | "damage" | "other";

export const CONDITIONS = ["Blinded", "Charmed", "Deafened", "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed", "Petrified", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious"];

export const MAX_EXHAUSTION = 6;

/** A short reminder of each condition's effect, shown next to it. */
export const CONDITION_TEXT: Record<string, string> = {
  Blinded: "Your attacks have disadvantage; attacks against you have advantage; you fail checks that need sight.",
  Charmed: "You cannot attack or target the charmer with harmful effects.",
  Deafened: "You fail checks that need hearing.",
  Frightened: "Disadvantage on attacks and ability checks while the source is in sight.",
  Grappled: "Your speed is 0. Disadvantage on attacks against anyone but the grappler.",
  Incapacitated: "You cannot take actions or reactions.",
  Invisible: "Advantage on your attacks; attacks against you have disadvantage.",
  Paralyzed: "Incapacitated. You fail Strength and Dexterity saves. Attacks against you have advantage.",
  Petrified: "Incapacitated. You fail Strength and Dexterity saves. Resistance to all damage.",
  Poisoned: "Disadvantage on attack rolls and ability checks.",
  Prone: "Disadvantage on your attacks. Melee attacks against you have advantage, ranged have disadvantage.",
  Restrained: "Speed 0. Disadvantage on your attacks and Dexterity saves. Attacks against you have advantage.",
  Stunned: "Incapacitated. You fail Strength and Dexterity saves. Attacks against you have advantage.",
  Unconscious: "Incapacitated and prone. You fail Strength and Dexterity saves. Attacks against you have advantage.",
};

export interface RollEffect {
  mode: "adv" | "dis" | "none";
  /** Flat penalty from exhaustion, negative or zero. */
  penalty: number;
  notes: string[];
  /** Set when the roll is an automatic failure, such as a Dexterity save while paralyzed. */
  autoFail?: string;
}

const ATTACK_DIS = ["Blinded", "Frightened", "Poisoned", "Prone", "Restrained"];
const CHECK_DIS = ["Frightened", "Poisoned"];
const FAIL_SAVES = ["Paralyzed", "Petrified", "Stunned", "Unconscious"];
const INCAPACITATED = ["Incapacitated", "Paralyzed", "Petrified", "Stunned", "Unconscious"];

/** Combines several sources: any advantage and any disadvantage cancel out, however many there are. */
export function combine(adv: number, dis: number): "adv" | "dis" | "none" {
  if (adv > 0 && dis > 0) return "none";
  return adv > 0 ? "adv" : dis > 0 ? "dis" : "none";
}

export function effectsFor(kind: RollKind, ability: string | undefined, conditions: readonly string[], exhaustion: number): RollEffect {
  const out: RollEffect = { mode: "none", penalty: 0, notes: [] };
  if (kind !== "attack" && kind !== "check" && kind !== "save") return out;
  const has = (c: string) => conditions.includes(c);
  let adv = 0;
  let dis = 0;
  const why: string[] = [];
  if (kind === "attack") {
    for (const c of ATTACK_DIS) if (has(c)) { dis++; why.push(`${c}: disadvantage`); }
    if (has("Invisible")) { adv++; why.push("Invisible: advantage"); }
    if (has("Grappled")) why.push("Grappled: disadvantage unless you attack the grappler");
    if (has("Charmed")) why.push("Charmed: you cannot attack the charmer");
  } else if (kind === "check") {
    for (const c of CHECK_DIS) if (has(c)) { dis++; why.push(`${c}: disadvantage`); }
    if (has("Blinded")) why.push("Blinded: fails checks that need sight");
    if (has("Deafened")) why.push("Deafened: fails checks that need hearing");
  } else {
    if (has("Restrained") && ability === "dexterity") { dis++; why.push("Restrained: disadvantage"); }
    const bad = FAIL_SAVES.find(has);
    if (bad && (ability === "strength" || ability === "dexterity")) out.autoFail = `${bad}: automatically fails ${ability === "strength" ? "Strength" : "Dexterity"} saves`;
  }
  if (INCAPACITATED.some(has) && kind === "attack") why.push("Incapacitated: you cannot take actions");
  if (exhaustion > 0) {
    out.penalty = -2 * exhaustion;
    why.push(`Exhaustion ${exhaustion}: ${out.penalty}`);
  }
  out.mode = combine(adv, dis);
  if (adv > 0 && dis > 0) why.push("Advantage and disadvantage cancel out");
  out.notes = why;
  return out;
}

/** Speed after exhaustion, never below zero. */
export const speedAfterExhaustion = (speed: number, exhaustion: number): number => Math.max(0, speed - 5 * exhaustion);
