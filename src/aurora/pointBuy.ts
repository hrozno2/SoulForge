/** Point buy with the standard 5e table by default and house rules a table can set: budget, lowest and highest score, cost of every score. */
import { ABILITY_IDS, type AbilityId } from "./character";

export interface PointBuyRules {
  budget: number;
  min: number;
  max: number;
  /** Total points a score costs, by score. The lowest score normally costs 0. */
  costs: Record<number, number>;
}

/** The 5e table: 8 to 15, 27 points. */
export const STANDARD_COSTS: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const STANDARD_RULES: PointBuyRules = { budget: 27, min: 8, max: 15, costs: STANDARD_COSTS };

export const SCORE_FLOOR = 1;
export const SCORE_CEILING = 30;

/** Cost to suggest for a score the standard table does not cover: one point a step below 8, three a step above 15. */
function suggested(score: number, known: (s: number) => number | undefined): number {
  const exact = STANDARD_COSTS[score];
  if (exact !== undefined) return exact;
  if (score < 8) return (known(score + 1) ?? 0) - 1;
  return (known(score - 1) ?? 9) + 3;
}

/** Fills in and tidies rules so every score from lowest to highest has a cost. */
export function normalizeRules(raw?: Partial<PointBuyRules>): PointBuyRules {
  const clamp = (n: unknown, lo: number, hi: number, d: number) => (Number.isFinite(Number(n)) ? Math.max(lo, Math.min(hi, Math.round(Number(n)))) : d);
  const min = clamp(raw?.min, SCORE_FLOOR, SCORE_CEILING, 8);
  const max = Math.max(min, clamp(raw?.max, SCORE_FLOOR, SCORE_CEILING, 15));
  const budget = clamp(raw?.budget, 0, 999, 27);
  const costs: Record<number, number> = {};
  // Build upward from the lowest score and downward below 8 so suggestions chain.
  const get = (s: number) => costs[s];
  for (let s = min; s <= max; s++) {
    const given = raw?.costs?.[s];
    costs[s] = Number.isFinite(Number(given)) && given !== undefined ? Math.round(Number(given)) : s === min && min >= 8 ? 0 : s < 8 ? 0 : suggested(s, get);
  }
  if (raw?.costs === undefined || raw.costs[min] === undefined) {
    // Below 8 the suggestion is a refund relative to the standard 8: work down from 8 if it is in range.
    for (let s = Math.min(7, max); s >= min; s--) if (raw?.costs?.[s] === undefined) costs[s] = (costs[s + 1] ?? 0) - 1;
    if (min > 8 && raw?.costs?.[min] === undefined) costs[min] = 0;
  }
  return { budget, min, max, costs };
}

export const costOf = (rules: PointBuyRules, score: number): number => rules.costs[score] ?? Number.POSITIVE_INFINITY;

export function spent(rules: PointBuyRules, base: Record<AbilityId, number>): number {
  return ABILITY_IDS.reduce((n, a) => n + costOf(rules, base[a]), 0);
}

export function canRaise(rules: PointBuyRules, base: Record<AbilityId, number>, a: AbilityId): boolean {
  const next = base[a] + 1;
  return next <= rules.max && spent(rules, base) - costOf(rules, base[a]) + costOf(rules, next) <= rules.budget;
}

export const canLower = (rules: PointBuyRules, base: Record<AbilityId, number>, a: AbilityId): boolean => base[a] - 1 >= rules.min;

/** Scores pulled into range, so changing the lowest or highest score never leaves an ability outside it. */
export function clampBase(rules: PointBuyRules, base: Record<AbilityId, number>): Record<AbilityId, number> {
  return Object.fromEntries(ABILITY_IDS.map((a) => [a, Math.max(rules.min, Math.min(rules.max, base[a]))])) as Record<AbilityId, number>;
}
