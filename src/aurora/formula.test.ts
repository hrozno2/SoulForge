import { describe, expect, it } from "vitest";
import { evalFormula } from "./stats";

describe("formulas in stat values", () => {
  const stats: Record<string, number> = { level: 7, "dexterity:modifier": 3, proficiency: 3 };
  const f = (s: string) => evalFormula(s, (n) => stats[n] ?? 0);
  it("reads numbers, statistics and arithmetic", () => {
    expect(f("2 * {level}")).toBe(14);
    expect(f("10 + {dexterity:modifier}")).toBe(13);
    expect(f("-{proficiency}")).toBe(-3);
    expect(f("floor({level} / 2)")).toBe(3);
    expect(f("max(1, {dexterity:modifier} - 5)")).toBe(1);
    expect(f("(1 + 2) * 3")).toBe(9);
  });
  it("counts what it cannot read as 0, never runs it", () => {
    expect(f("alert('x')")).toBe(0);
    expect(f("")).toBe(0);
  });
});
