import { describe, expect, it } from "vitest";
import { isAvailable, usedAfterClick } from "./pips";

describe("pips", () => {
  it("shows what is left from the left", () => {
    // 4 slots, 1 used: three filled, one empty on the right
    expect([0, 1, 2, 3].map((i) => isAvailable(4, 1, i))).toEqual([true, true, true, false]);
  });
  it("spends from the right edge of what is left", () => {
    expect(usedAfterClick(4, 0, 3)).toBe(1); // click the last filled pip: one spent
    expect(usedAfterClick(4, 0, 1)).toBe(3); // click the second pip: it and those after it are spent
    expect(usedAfterClick(4, 1, 3)).toBe(0); // click the empty pip: restore it
    expect(usedAfterClick(4, 4, 0)).toBe(3); // all spent, click first: one back
  });
});
