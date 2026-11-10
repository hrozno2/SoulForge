import { describe, expect, it } from "vitest";
import { StatBook, type StatInputs } from "./stats";

const inputs: StatInputs = {
  abilityBase: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  totalLevel: 1, classLevels: {}, attunedCount: 0, spellAbility: {}, baseHp: () => 0,
};
const book = () => {
  const b = new StatBook(inputs);
  // a is b plus 1, b is a plus 2: each needs the other.
  b.add("a", { value: "b", from: "x" });
  b.add("a", { value: "1", from: "x" });
  b.add("b", { value: "a", from: "y" });
  b.add("b", { value: "2", from: "y" });
  // c is outside the loop and reads into it.
  b.add("c", { value: "a", from: "z" });
  return b;
};

// The audit's R5: the value worked out on the loop's cut was kept, so the answer depended on who asked first.
describe("statistics that refer to each other", () => {
  it("give the same values whichever is asked first", () => {
    const first = book();
    const a1 = first.get("a"), b1 = first.get("b"), c1 = first.get("c");
    for (const order of [["c", "b", "a"], ["b", "a", "c"], ["b", "c", "a"], ["a", "c", "b"]]) {
      const other = book();
      const got: Record<string, number> = {};
      for (const n of order) got[n] = other.get(n);
      // Asked again, the same again.
      for (const n of order) expect(other.get(n)).toBe(got[n]);
      expect([got.a, got.b, got.c], order.join()).toEqual([a1, b1, c1]);
    }
    // Each is its own value with the other read as started from nothing: a = (0 + 2) + 1, b = (0 + 1) + 2.
    expect([a1, b1, c1]).toEqual([3, 3, 3]);
  });

  it("names the loop once", () => {
    const b = book();
    b.get("a");
    b.get("a");
    expect([...b.cycles]).toEqual(["a > b > a"]);
    b.get("b");
    expect(b.cycles.size).toBeLessThanOrEqual(2);
  });

  it("statistics without a loop are kept as before", () => {
    const b = new StatBook(inputs);
    b.add("x", { value: "y", from: "f" });
    b.add("y", { value: "4", from: "f" });
    expect(b.get("x")).toBe(4);
    expect(b.cycles.size).toBe(0);
  });
});
