import { describe, expect, it } from "vitest";
import { findDc, levelSteps, parseRollInfo, scaleDamage } from "./rollInfo";

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

  // Found 2026-11-10: a level-9 Dragonborn's breath weapon showed its first-level 2d6.
  it("raises a feature's dice by character level as its text says", () => {
    const breath = "<p>Each creature in the area takes 2d6 damage on a failed save, and half as much damage on a successful one. The damage increases to 3d6 at 6th level, 4d6 at 11th level, and 5d6 at 16th level.</p>";
    const at = (level: number) => parseRollInfo(breath, { ...ctx, level }).damage.map((d) => d.expr);
    expect(at(1)).toEqual(["2d6"]);
    expect(at(5)).toEqual(["2d6"]);
    expect(at(9)).toEqual(["3d6"]);
    expect(at(11)).toEqual(["4d6"]);
    expect(at(20)).toEqual(["5d6"]);
    // Without a level nothing is assumed.
    expect(parseRollInfo(breath, ctx).damage.map((d) => d.expr)).toContain("2d6");
    const modern = "<p>On a failed save, a creature takes 1d10 damage of the type determined by your Draconic Ancestry trait. This damage increases by 1d10 when you reach character levels 5 (2d10), 11 (3d10), and 17 (4d10).</p>";
    expect(parseRollInfo(modern, { ...ctx, level: 12 }).damage.map((d) => d.expr)).toEqual(["3d10"]);
    expect(levelSteps(modern)).toEqual([{ level: 5, expr: "2d10" }, { level: 11, expr: "3d10" }, { level: 17, expr: "4d10" }]);
  });

  // A cantrip is scaled once, whichever way its text states the tiers (found 2026-11-11: the Play sheet's cantrip rows
  // showed first-level dice, and reading the listed steps as well as the tiers would have doubled them).
  it("a cantrip's dice at level 9 are two dice in both wordings", () => {
    const old = "<p>On a hit, the target takes 1d8 lightning damage.</p><p>The spell's damage increases by 1d8 when you reach 5th level (2d8), 11th level (3d8), and 17th level (4d8).</p>";
    const modern = "<p>On a hit, the target takes 1d8 Lightning damage.</p><p>Cantrip Upgrade</p><p>The damage increases by 1d8 when you reach levels 5 (2d8), 11 (3d8), and 17 (4d8).</p>";
    for (const html of [old, modern]) for (const [level, want] of [[1, "1d8"], [5, "2d8"], [9, "2d8"], [11, "3d8"], [17, "4d8"]] as const) {
      const info = parseRollInfo(html, { ...ctx, level });
      const shown = info.damage.map((d) => scaleDamage(d.expr, { cantrip: true, cantripScaling: info.cantripScaling, characterLevel: level, castLevel: 0, spellLevel: 0, upcast: info.upcast }));
      expect(shown, `${html.includes("Upgrade") ? "2024" : "2014"} wording at level ${level}`).toEqual([want]);
    }
  });
});
