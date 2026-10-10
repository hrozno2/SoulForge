import { describe, expect, it } from "vitest";
import { findDc, parseRollInfo, scaleDamage } from "./rollInfo";

const ctx = { spellDc: 15, proficiency: 3, mods: { charisma: 4, constitution: 2 } };

describe("roll info", () => {
  it("reads a spell like Fireball", () => {
    const i = parseRollInfo("<p>Each creature must make a Dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much on a success. When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd.</p>", ctx);
    expect(i.saves).toEqual([{ ability: "Dexterity", dc: undefined }]);
    expect(i.damage).toEqual([{ expr: "8d6", type: "fire" }]);
    expect(i.upcast?.dice).toBe("1d6");
  });
  it("reads attacks and healing", () => {
    expect(parseRollInfo("Make a ranged spell attack. On a hit, the target takes 1d10 fire damage.", ctx).attack).toBe("spell");
    expect(parseRollInfo("A creature regains 1d8 hit points.", ctx).healing).toEqual(["1d8"]);
  });
  it("works out DCs from the wording", () => {
    expect(findDc("The DC equals 8 + your proficiency bonus + your Charisma modifier.", ctx)).toBe(15);
    expect(findDc("It must succeed on a DC 13 Constitution saving throw.", ctx)).toBe(13);
    expect(findDc("against your spell save DC", ctx)).toBe(15);
    expect(findDc("no save here", ctx)).toBeUndefined();
  });
  it("scales cantrips and upcast spells", () => {
    const base = { cantrip: false, cantripScaling: false, characterLevel: 9, castLevel: 5, spellLevel: 3, upcast: { dice: "1d6", perLevel: true } };
    expect(scaleDamage("8d6", base)).toBe("10d6");
    expect(scaleDamage("1d10", { ...base, cantrip: true, cantripScaling: true, upcast: undefined })).toBe("2d10");
    expect(scaleDamage("1d10", { ...base, cantrip: true, cantripScaling: true, characterLevel: 17, upcast: undefined })).toBe("4d10");
  });
});
