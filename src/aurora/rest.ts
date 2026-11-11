/**
 * Rests, spell slots and hit dice at the table (docs/AUDIT-2026-11-10.md, R1 to R3), in one place: Play, Export and
 * the Magic tab each had their own long rest with a different result, Pact Magic and ordinary spell slots of one
 * level shared a counter, and a multiclass character's hit dice were one pool of its largest die.
 *
 * The rules, as both Player's Handbooks state them:
 * - Short rest: Pact Magic slots return; features and counters that say "short rest" return; hit dice may be spent.
 * - Long rest: hit points, every spell slot and Pact Magic slot, features and counters return; temporary hit points
 *   and forms end; exhaustion drops by one. Spent hit dice: the 2014 rules return up to half the character's total
 *   (at least one), the 2024 rules return all of them.
 */
import type { Character, PlayState } from "./character";
import type { SheetData } from "./sheet";

export type RestRules = "2014" | "2024";

export interface HitDicePool { die: number; total: number }

/** The character's hit dice by size, largest first (a Fighter 3 / Wizard 2: 3d10 and 2d6). */
export function hitDicePools(sheet: Pick<SheetData, "hitDice">): HitDicePool[] {
  const by = new Map<number, number>();
  for (const h of sheet.hitDice) if (h.die > 0 && h.count > 0) by.set(h.die, (by.get(h.die) ?? 0) + h.count);
  return [...by].map(([die, total]) => ({ die, total })).sort((a, b) => b.die - a.die);
}

/**
 * Hit dice spent, by size. A save from before they were kept by size has one number: it is read as the largest dice
 * first, which is what the app then spent.
 */
export function hitDiceSpent(play: Pick<PlayState, "hitDiceUsed" | "hitDiceByDie">, pools: HitDicePool[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (play.hitDiceByDie) {
    for (const p of pools) out[String(p.die)] = Math.max(0, Math.min(p.total, Math.floor(play.hitDiceByDie[String(p.die)] ?? 0)));
    return out;
  }
  let left = Math.max(0, Math.floor(play.hitDiceUsed ?? 0));
  for (const p of pools) { const n = Math.min(p.total, left); out[String(p.die)] = n; left -= n; }
  return out;
}

/** The play state with these hit dice spent; the one total other screens and the sheets read is kept in step. */
export function withHitDiceSpent(play: PlayState, pools: HitDicePool[], spent: Record<string, number>): PlayState {
  const byDie: Record<string, number> = {};
  let sum = 0;
  for (const p of pools) { const n = Math.max(0, Math.min(p.total, Math.floor(spent[String(p.die)] ?? 0))); byDie[String(p.die)] = n; sum += n; }
  return { ...play, hitDiceByDie: byDie, hitDiceUsed: sum };
}

/** The play state with `count` hit dice spent in all (a plain counter, as on Export): the largest dice first. */
export function withHitDiceCount(play: PlayState, pools: HitDicePool[], count: number): PlayState {
  const spent: Record<string, number> = {};
  let left = Math.max(0, Math.floor(count));
  for (const p of pools) { const n = Math.min(p.total, left); spent[String(p.die)] = n; left -= n; }
  return withHitDiceSpent(play, pools, spent);
}

/** Hit dice left to spend, by size, largest first. */
export function hitDiceLeft(play: Pick<PlayState, "hitDiceUsed" | "hitDiceByDie">, pools: HitDicePool[]): { die: number; left: number; total: number }[] {
  const spent = hitDiceSpent(play, pools);
  return pools.map((p) => ({ die: p.die, total: p.total, left: p.total - (spent[String(p.die)] ?? 0) }));
}

/** One hit die of this size spent; unchanged when none of that size is left. */
export function spendHitDie(play: PlayState, pools: HitDicePool[], die: number): PlayState {
  const spent = hitDiceSpent(play, pools);
  const pool = pools.find((p) => p.die === die);
  if (!pool || (spent[String(die)] ?? 0) >= pool.total) return play;
  return withHitDiceSpent(play, pools, { ...spent, [String(die)]: (spent[String(die)] ?? 0) + 1 });
}

/** `count` spent hit dice returned, the largest first. */
function returnHitDice(play: PlayState, pools: HitDicePool[], count: number): PlayState {
  const spent = hitDiceSpent(play, pools);
  let left = count;
  for (const p of pools) { const n = Math.min(spent[String(p.die)] ?? 0, left); spent[String(p.die)] = (spent[String(p.die)] ?? 0) - n; left -= n; }
  return withHitDiceSpent(play, pools, spent);
}

/** A row of spell slots as the sheet gives it: Pact Magic's slots are counted apart from the others. */
export interface SlotRow { level: number; pact?: boolean }

/** The play state with `used` slots spent in that row. */
export function withSlotUsed(play: PlayState, row: SlotRow, used: number): PlayState {
  const n = Math.max(0, Math.floor(used));
  return row.pact ? { ...play, pactUsed: n } : { ...play, slotsUsed: { ...play.slotsUsed, [String(row.level)]: n } };
}

/** Every spell slot back, Pact Magic's too. */
export const restoreSlots = (play: PlayState): PlayState => ({ ...play, slotsUsed: {}, pactUsed: 0 });

export function shortRest(ch: Character, sheet: SheetData): Character {
  const uses = { ...ch.play.featureUses };
  for (const f of sheet.features) {
    // "Long Rest (one on a Short Rest)": a 2024 Rage, Second Wind, Wild Shape or Channel Divinity returns one use.
    if (/one on a short rest/i.test(f.usage ?? "")) { if ((uses[f.id] ?? 0) > 1) uses[f.id] -= 1; else delete uses[f.id]; }
    else if (/short rest/i.test(f.usage ?? "")) delete uses[f.id];
  }
  // Pact Magic's slots return. A save from before they were counted apart has them under their spell level: that
  // count is cleared too, unless ordinary slots of the same level share it.
  const slots = { ...ch.play.slotsUsed };
  const ordinary = new Set(sheet.casting.filter((c) => !c.pactLevel).flatMap((c) => c.slots.map((s) => s.level)));
  if (ch.play.pactUsed === undefined) for (const c of sheet.casting) if (c.pactLevel) for (const s of c.slots) if (!ordinary.has(s.level)) delete slots[String(s.level)];
  const hasPact = sheet.casting.some((c) => c.pactLevel);
  return {
    ...ch,
    resources: (ch.resources ?? []).map((x) => (x.refresh === "short" ? { ...x, current: x.max } : x)),
    play: { ...ch.play, featureUses: uses, slotsUsed: slots, ...(hasPact ? { pactUsed: 0 } : {}) },
  };
}

export function longRest(ch: Character, sheet: SheetData, rules: RestRules): Character {
  const pools = hitDicePools(sheet);
  const total = pools.reduce((n, p) => n + p.total, 0);
  const back = rules === "2024" ? total : Math.max(1, Math.floor(total / 2));
  const play = returnHitDice(
    {
      ...ch.play,
      hp: sheet.hp, tempHp: 0, wildShape: undefined, companionHp: undefined, slotsUsed: {}, pactUsed: 0, featureUses: {},
      deathSaves: { success: 0, fail: 0 }, exhaustion: Math.max(0, (ch.play.exhaustion ?? 0) - 1), concentration: undefined,
    },
    pools,
    back,
  );
  return { ...ch, resources: (ch.resources ?? []).map((x) => (x.refresh === "none" ? x : { ...x, current: x.max })), play };
}
