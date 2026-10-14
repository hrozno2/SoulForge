import { describe, expect, it } from "vitest";
import { parseDice, rollExpression, rollMath } from "./Dice";

describe("dice", () => {
  it("parses expressions", () => {
    expect(parseDice("2d6+3")!.terms).toHaveLength(2);
    expect(parseDice("d20")!.terms[0]).toMatchObject({ count: 1, sides: 20 });
    expect(parseDice("1d20 - 1")!.terms[1]).toMatchObject({ sign: -1, flat: 1 });
    expect(parseDice("fireball")).toBeNull();
    expect(parseDice("4d6kh3")!.terms[0]).toMatchObject({ count: 4, sides: 6, keep: 3 });
    const seq = [0.99, 0, 0.5, 0.5];
    const r = rollExpression("4d6kh3", "", () => seq.shift()!)!;
    expect(r.rolls).toEqual([6, 1, 4, 4]);
    expect(r.total).toBe(14);
    expect(rollMath(r)).toBe("(6 + 4 + 4) = 14");
    expect(parseDice("")).toBeNull();
  });
  it("rolls with a fixed generator", () => {
    const r = rollExpression("2d6+3", "x", () => 0.5)!;
    expect(r.rolls).toEqual([4, 4]);
    expect(r.total).toBe(11);
    expect(rollExpression("1d20-2", "", () => 0)!.total).toBe(-1);
  });
  it("writes the sum out with the bonuses", () => {
    expect(rollMath(rollExpression("2d6+3", "", () => 0.5)!)).toBe("(4 + 4) + 3 = 11");
    expect(rollMath(rollExpression("1d20-2", "", () => 0)!)).toBe("1 − 2 = -1");
  });
  it("refuses absurd rolls", () => {
    expect(rollExpression("500d6")).toBeNull();
  });
});
