import { describe, expect, it } from "vitest";
import { multiclassCasterLevel } from "./engine";

type P = Parameters<typeof multiclassCasterLevel>[0];
const pass = (classes: [string, string, number][], stats: Record<string, number> = {}): P =>
  ({
    stats: { get: (k: string) => stats[k] ?? 0 },
    spellcasting: new Map(classes.map(([name, owner, level]) => [name.toLowerCase(), { name, owner, level, ability: "", prepare: true, lists: [] }])),
  }) as unknown as P;

describe("multiclass spell slots without a stated caster level", () => {
  it("rounds half casters up in the 2024 rules", () => {
    expect(multiclassCasterLevel(pass([["Paladin", "ID_WOTC_PHB24_CLASS_PALADIN", 3], ["Sorcerer", "ID_WOTC_PHB24_CLASS_SORCERER", 2]]))).toBe(4);
  });
  it("rounds them down in the 2014 rules", () => {
    expect(multiclassCasterLevel(pass([["Paladin", "ID_PHB_CLASS_PALADIN", 3], ["Wizard", "ID_PHB_CLASS_WIZARD", 2]]))).toBe(3);
  });
  it("counts a third for the Eldritch Knight", () => {
    expect(multiclassCasterLevel(pass([["Fighter", "ID_PHB_CLASS_FIGHTER", 7], ["Wizard", "ID_PHB_CLASS_WIZARD", 1]]))).toBe(3);
  });
  it("leaves a single class and a stated level alone", () => {
    expect(multiclassCasterLevel(pass([["Wizard", "ID_PHB_CLASS_WIZARD", 5]]))).toBe(0);
    expect(multiclassCasterLevel(pass([["Paladin", "A", 3], ["Bard", "B", 2]], { "multiclass:spellcasting:level": 3 }))).toBe(3);
  });
});
