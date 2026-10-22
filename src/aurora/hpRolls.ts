/**
 * Hit point rolls: which die each character level uses, setting a roll with a record of who made it, the hit point
 * calculation level by level, and a check of the rolls Soul Forge made (are they in range, and is their average what
 * the dice should give).
 */
import type { Character } from "./character";
import { hitDieOf } from "./engine";
import type { ARegistry } from "./registry";

/** The hit die of a character level (1 to total), by the classes in the order they were taken. */
export function dieForLevel(ch: Character, reg: ARegistry, n: number): number {
  let left = n;
  for (const c of ch.classes) {
    if (left <= c.level) return hitDieOf(reg.get(c.classId));
    left -= c.level;
  }
  return 0;
}

/** The character with a roll set for a level (or removed, with no value), and the record of who made it. */
export function withHpRoll(c: Character, level: number, value: number | undefined, by: "app" | "player", die: number, at = Date.now()): Character {
  const key = String(level);
  const rolls = { ...c.hpRolls };
  const log = { ...(c.hpRollLog ?? {}) };
  if (!value) { delete rolls[key]; delete log[key]; return { ...c, hpRolls: rolls, hpRollLog: log }; }
  const v = Math.min(die, Math.max(1, Math.round(value)));
  rolls[key] = v;
  log[key] = { value: v, die, by, at };
  return { ...c, hpMode: "roll", hpRolls: rolls, hpRollLog: log };
}

export interface HpLine {
  level: number;
  className: string;
  die: number;
  /** What the die gave: the maximum at level 1, a roll, or the fixed average. */
  value: number;
  how: "maximum" | "rolled by Soul Forge" | "entered by you" | "average";
  con: number;
}

/** The hit points level by level, as the engine counts them (src/aurora/engine.ts baseHitPoints). */
export function hpBreakdown(ch: Character, reg: ARegistry, conMod: number): HpLine[] {
  const out: HpLine[] = [];
  let n = 0;
  for (const c of ch.classes) {
    const cls = reg.get(c.classId);
    const die = hitDieOf(cls);
    for (let i = 0; i < c.level; i++) {
      n++;
      const roll = ch.hpMode === "roll" ? ch.hpRolls[String(n)] : undefined;
      const by = ch.hpRollLog?.[String(n)]?.by;
      out.push(n === 1
        ? { level: n, className: cls?.name ?? "", die, value: die, how: "maximum", con: conMod }
        : roll !== undefined
          ? { level: n, className: cls?.name ?? "", die, value: roll, how: by === "app" ? "rolled by Soul Forge" : "entered by you", con: conMod }
          : { level: n, className: cls?.name ?? "", die, value: Math.floor(die / 2) + 1, how: "average", con: conMod });
    }
  }
  return out;
}

export interface RollAudit {
  /** Rolls Soul Forge made. */
  count: number;
  /** Their average, and what the same dice average in theory ((die + 1) / 2 each). */
  mean: number;
  expected: number;
  /** Rolls outside 1 to the die's size (should be none). */
  outOfRange: number;
  /** How often each face came up, per die size: faces[die][face - 1]. */
  faces: Record<number, number[]>;
}

/** A check of the rolls Soul Forge made for one or more characters. */
export function rollAudit(chars: Character[]): RollAudit {
  let count = 0, sum = 0, exp = 0, outOfRange = 0;
  const faces: Record<number, number[]> = {};
  for (const ch of chars) for (const r of Object.values(ch.hpRollLog ?? {})) {
    if (r.by !== "app" || !r.die) continue;
    count++;
    sum += r.value;
    exp += (r.die + 1) / 2;
    if (r.value < 1 || r.value > r.die || !Number.isInteger(r.value)) { outOfRange++; continue; }
    (faces[r.die] ??= Array.from({ length: r.die }, () => 0))[r.value - 1]++;
  }
  return { count, mean: count ? sum / count : 0, expected: count ? exp / count : 0, outOfRange, faces };
}
