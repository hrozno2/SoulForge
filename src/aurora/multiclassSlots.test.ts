import { describe, expect, it } from "vitest";
import { multiclassCasterLevel } from "./engine";

type P = Parameters<typeof multiclassCasterLevel>[0];
const pass = (classes: [string, string, number][], stats: Record<string, number> = {}): P =>
  ({
    stats: { get: (k: string) => stats[k] ?? 0 },
    spellcasting: new Map(
      classes.map(([name, owner, level]) => [name.toLowerCase(), { name, owner, level, ability: "", prepare: true, lists: [] }]),
    ),
  }) as unknown as P;

describe("multiclass spell slots without a stated caster level", () => {
  it("rounds half casters up in the 2024 rules", () => {
    expect(
      multiclassCasterLevel(
        pass([
          ["Paladin", "ID_WOTC_PHB24_CLASS_PALADIN", 3],
          ["Sorcerer", "ID_WOTC_PHB24_CLASS_SORCERER", 2],
        ]),
      ),
    ).toBe(4);
  });
  it("rounds them down in the 2014 rules", () => {
    expect(
      multiclassCasterLevel(
        pass([
          ["Paladin", "ID_PHB_CLASS_PALADIN", 3],
          ["Wizard", "ID_PHB_CLASS_WIZARD", 2],
        ]),
      ),
    ).toBe(3);
  });
  it("counts a third for the Eldritch Knight", () => {
    expect(
      multiclassCasterLevel(
        pass(
          [
            ["Fighter", "ID_PHB_CLASS_FIGHTER", 7],
            ["Wizard", "ID_PHB_CLASS_WIZARD", 1],
          ],
          { "fighter:spellcasting:slots:1": 4 },
        ),
      ),
    ).toBe(3);
  });
  it("does not count a Fighter whose subclass only has a few spells", () => {
    expect(
      multiclassCasterLevel(
        pass([
          ["Fighter", "ID_PHB_CLASS_FIGHTER", 7],
          ["Wizard", "ID_PHB_CLASS_WIZARD", 1],
        ]),
      ),
    ).toBe(0);
  });
  it("leaves a single class and a stated level alone", () => {
    expect(multiclassCasterLevel(pass([["Wizard", "ID_PHB_CLASS_WIZARD", 5]]))).toBe(0);
    expect(
      multiclassCasterLevel(
        pass(
          [
            ["Paladin", "A", 3],
            ["Bard", "B", 2],
          ],
          { "multiclass:spellcasting:level": 3 },
        ),
      ),
    ).toBe(3);
  });
});

// Big batches on mixed content, 2026-11-19 and 20: an Aurora 2024 Ranger 17 with three levels of a 5e.tools Monk whose
// subclass casts (Warrior of the Mystic Arts) had two 1st-level slots, and a Monk 12 with one level of Sorcerer counted
// 4 for 5. Only the subclass stated a caster level, and the stated level stood for the whole character.
describe("a stated caster level beside classes the rules know", () => {
  const withParts = (classes: [string, string, number][], stats: Record<string, number>, parts: { from: string; value: number }[]) => {
    const p = pass(classes, stats) as unknown as { stats: { parts: (n: string) => typeof parts } };
    p.stats.parts = () => parts;
    return p as unknown as P;
  };
  const MONK: [string, string, number] = ["Mystic Arts", "ID_5ET_CLASS_XPHB_MONK", 3];
  it("counts the known classes by the rules and the unknown caster by its stated share", () => {
    expect(
      multiclassCasterLevel(
        withParts(
          [["Ranger", "ID_WOTC_PHB24_CLASS_RANGER", 17], MONK],
          { "multiclass:spellcasting:level": 1, "mystic arts:spellcasting:slots:1": 2 },
          [{ from: "Warrior of the Mystic Arts", value: 1 }],
        ),
      ),
    ).toBe(10);
    expect(
      multiclassCasterLevel(
        withParts(
          [
            ["Mystic Arts", "ID_5ET_CLASS_XPHB_MONK", 12],
            ["Sorcerer", "ID_WOTC_PHB24_CLASS_SORCERER", 1],
          ],
          { "multiclass:spellcasting:level": 4, "mystic arts:spellcasting:slots:1": 4, "mystic arts:spellcasting:slots:2": 3 },
          [{ from: "Warrior of the Mystic Arts", value: 4 }],
        ),
      ),
    ).toBe(5);
  });
  it("does not count a known class twice when its content states its share too", () => {
    expect(
      multiclassCasterLevel(
        withParts(
          [
            ["Ranger", "ID_5ET_CLASS_XPHB_RANGER", 5],
            ["Mystic Arts", "ID_5ET_CLASS_XPHB_MONK", 5],
          ],
          { "multiclass:spellcasting:level": 4, "mystic arts:spellcasting:slots:1": 3 },
          [
            { from: "Ranger (multiclass)", value: 3 },
            { from: "Warrior of the Mystic Arts", value: 1 },
          ],
        ),
      ),
    ).toBe(4);
  });
  it("lets the stated level stand whole where nothing tells its parts", () => {
    expect(
      multiclassCasterLevel(
        pass(
          [
            ["Wizard", "ID_PHB_CLASS_WIZARD", 3],
            ["Mystic", "ID_X_CLASS_MYSTIC", 6],
          ],
          { "multiclass:spellcasting:level": 9, "mystic:spellcasting:slots:1": 9 },
        ),
      ),
    ).toBe(9);
  });
});
