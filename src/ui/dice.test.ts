import { describe, expect, it } from "vitest";
import { parseDice, rollExpression } from "./Dice";

describe("dice", () => {
  it("parses expressions", () => {
    expect(parseDice("2d6+3")!.terms).toHaveLength(2);
    expect(parseDice("d20")!.terms[0]).toMatchObject({ count: 1, sides: 20 });
    expect(parseDice("1d20 - 1")!.terms[1]).toMatchObject({ sign: -1, flat: 1 });
    expect(parseDice("fireball")).toBeNull();
    expect(parseDice("")).toBeNull();
  });
  it("rolls with a fixed generator", () => {
    const r = rollExpression("2d6+3", "x", () => 0.5)!;
    expect(r.rolls).toEqual([4, 4]);
    expect(r.total).toBe(11);
    expect(rollExpression("1d20-2", "", () => 0)!.total).toBe(-1);
  });
  it("refuses absurd rolls", () => {
    expect(rollExpression("500d6")).toBeNull();
  });
});
