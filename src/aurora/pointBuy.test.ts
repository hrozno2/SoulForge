import { describe, expect, it } from "vitest";
import { canLower, canRaise, clampBase, costOf, normalizeRules, spent, STANDARD_RULES } from "./pointBuy";
import type { AbilityId } from "./character";

const all = (n: number) => ({ strength: n, dexterity: n, constitution: n, intelligence: n, wisdom: n, charisma: n }) as Record<AbilityId, number>;

describe("point buy", () => {
  it("uses the standard table: 27 points, 8 to 15", () => {
    const r = normalizeRules();
    expect(r).toEqual(STANDARD_RULES);
    expect([8, 9, 10, 11, 12, 13, 14, 15].map((s) => costOf(r, s))).toEqual([0, 1, 2, 3, 4, 5, 7, 9]);
    // The classic spreads all cost exactly 27.
    expect(spent(r, { strength: 15, dexterity: 15, constitution: 15, intelligence: 8, wisdom: 8, charisma: 8 })).toBe(27);
    expect(spent(r, { strength: 13, dexterity: 13, constitution: 13, intelligence: 12, wisdom: 12, charisma: 12 })).toBe(27);
    expect(spent(r, all(8))).toBe(0);
  });
  it("stops raising at the budget and at the highest score", () => {
    const r = normalizeRules();
    const full = { strength: 15, dexterity: 15, constitution: 15, intelligence: 8, wisdom: 8, charisma: 8 };
    expect(canRaise(r, full, "intelligence")).toBe(false);
    expect(canRaise(r, all(15), "strength")).toBe(false);
    expect(canRaise(r, all(8), "strength")).toBe(true);
    expect(canLower(r, all(8), "strength")).toBe(false);
  });
  it("follows custom budget, range and costs", () => {
    const r = normalizeRules({ budget: 30, min: 6, max: 18, costs: { 16: 12, 17: 15, 18: 19 } });
    expect(r.budget).toBe(30);
    expect(costOf(r, 8)).toBe(0);
    expect(costOf(r, 16)).toBe(12);
    expect(costOf(r, 7)).toBe(-1);
    expect(costOf(r, 6)).toBe(-2);
    expect(canRaise(r, { ...all(8), strength: 17 }, "strength")).toBe(true);
    expect(canRaise(r, { ...all(8), strength: 18 }, "strength")).toBe(false);
  });
  it("keeps rules sane", () => {
    const r = normalizeRules({ min: 12, max: 10, budget: -5 });
    expect(r.max).toBeGreaterThanOrEqual(r.min);
    expect(r.budget).toBe(0);
    expect(costOf(r, r.min)).toBe(0);
    expect(clampBase(normalizeRules({ min: 10, max: 14 }), { ...all(8), strength: 15 }).strength).toBe(14);
    expect(clampBase(normalizeRules({ min: 10, max: 14 }), all(8)).dexterity).toBe(10);
  });
});
