import { describe, expect, it } from "vitest";
import { applyDamage, applyHealing, statBlockHp, trackedHp } from "./hpModel";

describe("hit points", () => {
  it("takes temporary hit points first", () => {
    expect(applyDamage({ hp: 10, tempHp: 4 }, 6)).toMatchObject({ hp: 8, tempHp: 0 });
  });
  it("never goes below zero", () => {
    expect(applyDamage({ hp: 3, tempHp: 0 }, 9).hp).toBe(0);
  });
  it("wild shape absorbs damage and carries the rest over", () => {
    const s = applyDamage({ hp: 20, tempHp: 0, wildShape: { name: "Wolf", hp: 5, maxHp: 11 } }, 8);
    expect(s.wildShape).toBeUndefined();
    expect(s.hp).toBe(17);
  });
  it("keeps the form while it has hit points left", () => {
    expect(applyDamage({ hp: 20, tempHp: 0, wildShape: { name: "Wolf", hp: 11, maxHp: 11 } }, 4)).toMatchObject({ hp: 20, wildShape: { hp: 7 } });
  });
  it("heals the form while shaped, the character otherwise", () => {
    expect(applyHealing({ hp: 5, tempHp: 0, wildShape: { name: "Wolf", hp: 2, maxHp: 11 } }, 20, 30).wildShape?.hp).toBe(11);
    expect(applyHealing({ hp: 5, tempHp: 0 }, 99, 30).hp).toBe(30);
  });
  it("reads stat block hit points and defaults trackers to full", () => {
    expect(statBlockHp("11 (2d8 + 2)")).toBe(11);
    expect(statBlockHp(undefined)).toBe(0);
    expect(trackedHp({}, "a", 9)).toBe(9);
    expect(trackedHp({ a: 4 }, "a", 9)).toBe(4);
  });

  it("leaves a 2024 Wild Shape (own hit points) alone: damage takes temporary, then real hit points, and never reverts it", () => {
    const ws = { name: "Wolf", hp: 0, maxHp: 0, ownHp: true };
    const s = applyDamage({ hp: 20, tempHp: 5, wildShape: ws }, 8);
    expect(s).toMatchObject({ hp: 17, tempHp: 0, wildShape: ws });
    expect(applyHealing({ hp: 17, tempHp: 0, wildShape: ws }, 2, 20)).toMatchObject({ hp: 19, wildShape: ws });
  });
});
