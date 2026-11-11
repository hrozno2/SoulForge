/**
 * How many uses a feature has, on the bundled SRD content. Found 2026-11-10 on the Play screen: a Monk 9 had 1 ki
 * point, and Spellcasting showed as "1 use a long rest", because any text that mentions finishing a rest was given
 * one use. Pools are sized by the class table's column; a pool nothing sizes gets no use count.
 */
import { describe, expect, it } from "vitest";
import { loadContentSet } from "../engine/testContent";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { buildSheet } from "./sheet";

const reg = loadContentSet("", "srd");
function features(cls: string, year: "2014" | "2024", level: number) {
  const c = reg.ofType("Class").find((x) => x.name === cls && x.source.includes(year));
  if (!c) throw new Error(`${cls} (${year}) is not in the SRD bundle`);
  const sheet = buildSheet(resolve({ ...newCharacter(), classes: [{ classId: c.id, level }] }, reg));
  return (name: string) => sheet.features.find((f) => f.name === name);
}

describe("pools follow the class table", () => {
  it.each([
    ["Monk", "2014", "Ki", 9, "9/Short Rest"],
    ["Monk", "2014", "Ki", 2, "2/Short Rest"],
    ["Monk", "2024", "Monk's Focus", 9, "9/Short Rest"],
    ["Sorcerer", "2024", "Font of Magic", 7, "7/Long Rest"],
  ] as const)("%s (%s) %s at level %i", (cls, year, name, level, usage) => {
    expect(features(cls, year, level)(name)?.usage).toBe(usage);
  });

  it("a Barbarian's rages still follow their column", () => {
    expect(features("Barbarian", "2014", 1)("Rage")?.usage).toBe("2/Long Rest");
    expect(features("Barbarian", "2014", 6)("Rage")?.usage).toBe("4/Long Rest");
  });
});

describe("what is not a use count gets none", () => {
  it.each([["Wizard", "2014"], ["Cleric", "2014"], ["Ranger", "2014"], ["Wizard", "2024"], ["Paladin", "2024"]] as const)("%s (%s): Spellcasting", (cls, year) => {
    const f = features(cls, year, 5)("Spellcasting");
    expect(f?.usage ?? "").toBe("");
  });

  it("no feature of any SRD class at any level claims one use because its text mentions spell slots", () => {
    const bad: string[] = [];
    for (const c of reg.ofType("Class")) {
      const sheet = buildSheet(resolve({ ...newCharacter(), classes: [{ classId: c.id, level: 20 }] }, reg));
      for (const f of sheet.features) if (/^1\//.test(f.usage ?? "") && /^(Spellcasting|Pact Magic)$/.test(f.name)) bad.push(`${c.name} (${c.source}): ${f.name} ${f.usage}`);
    }
    expect(bad).toEqual([]);
  });
});

describe("when uses come back", () => {
  it("Arcane Recovery is once a day, used on a short rest", () => {
    expect(features("Wizard", "2014", 1)("Arcane Recovery")?.usage).toBe("1/Long Rest");
  });
  it("a 2014 Druid's Wild Shape: twice a short rest", () => {
    expect(features("Druid", "2014", 2)("Wild Shape")?.usage).toBe("2/Short Rest");
  });
  // A later feature raises an earlier one's count: "Beginning at 6th level, you can use your Channel Divinity twice
  // between rests." A 2014 Cleric stayed at one use.
  it.each([[2, "1/Short Rest"], [6, "2/Short Rest"], [18, "3/Short Rest"]] as const)("a 2014 Cleric's Channel Divinity at level %i", (level, usage) => {
    expect(features("Cleric", "2014", level)("Channel Divinity")?.usage).toBe(usage);
  });
  it("a 2024 Cleric's Channel Divinity returns one on a short rest, all on a long rest", () => {
    expect(features("Cleric", "2024", 6)("Channel Divinity")?.usage).toBe("3/Long Rest (one on a Short Rest)");
  });
});
