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

import { changePool, diceCount } from "./Dice";

describe("dice pool", () => {
  it("adds dice of the same size together and keeps the bonus last", () => {
    let e = "";
    e = changePool(e, 6, 1);
    e = changePool(e, 6, 1);
    expect(e).toBe("2d6");
    e = changePool(e, 8, 1);
    e = changePool(e, 0, 3);
    expect(e).toBe("2d6+1d8+3");
    expect(diceCount(e, 6)).toBe(2);
  });
  it("removes one at a time and drops empty terms", () => {
    expect(changePool("2d6+1d8", 8, -1)).toBe("2d6");
    expect(changePool("1d6", 6, -1)).toBe("");
    expect(changePool("1d6+2", 0, -1)).toBe("1d6+1");
    expect(changePool("1d6", 0, -2)).toBe("1d6-2");
  });
  it("keeps what the player typed when it is valid", () => {
    expect(changePool("3d4+2", 4, 1)).toBe("4d4+2");
  });
});

import { normalizeCharacter } from "../aurora/character";

describe("older saved characters", () => {
  it("get every field the current version expects", () => {
    const old = { version: 2, name: "Old", info: { alignment: "LG" }, play: { hp: 5 } } as never;
    const c = normalizeCharacter(old);
    expect(c.resources).toEqual([]);
    expect(c.info.alignment).toBe("LG");
    expect(c.info.backstory).toBe("");
    expect(c.play.hp).toBe(5);
    expect(c.play.deathSaves).toEqual({ success: 0, fail: 0 });
    expect(c.coins.gp).toBe(0);
    expect(c.abilityBase.strength).toBeGreaterThan(0);
  });
});
