/**
 * Found by "Training by source" on the sweep (2026-11-19), all in species of the Plane Shift and Eberron books:
 * a subrace that writes the whole language list again (the Mark of Finding's Common and Goblin, with no "overwrite"
 * mark) had the species' own languages on top; a field a subrace sets to nothing (its skills) kept the species';
 * and "other" where the text names two languages gave both instead of one.
 */
import { describe, expect, it } from "vitest";
import { convertFiveTools } from "./fivetools";
import { ARegistry } from "./registry";
import { resolve } from "./engine";
import { newCharacter } from "./character";
import { autoFill } from "./autofill";
import { conceptOf } from "../engine/concepts";

const files = {
  "languages.json": {
    language: ["Common", "Orc", "Goblin", "Itzocan", "Vampire", "Elvish", "Dwarvish"].map((name) => ({
      name,
      source: "PHB",
      type: "standard",
    })),
  },
  "races.json": {
    race: [
      {
        name: "Half-Orc",
        source: "PHB",
        size: ["M"],
        speed: 30,
        skillProficiencies: [{ intimidation: true }],
        languageProficiencies: [{ common: true, orc: true }],
        entries: [],
      },
      {
        name: "Brute",
        source: "PHB",
        size: ["M"],
        speed: 30,
        skillProficiencies: [{ intimidation: true }],
        languageProficiencies: [{ common: true }],
        entries: [{ name: "Menacing", type: "entries", entries: ["You gain proficiency in the Intimidation skill."] }],
      },
      {
        name: "Sun Human",
        source: "PSX",
        size: ["M"],
        speed: 30,
        languageProficiencies: [{ common: true, other: true }],
        entries: [
          { name: "Languages", type: "entries", entries: ["You can speak, read, and write Common and your choice of Itzocan or Vampire."] },
        ],
      },
    ],
    subrace: [
      { raceName: "Half-Orc", raceSource: "PHB", source: "PHB" },
      {
        name: "Variant; Mark of Finding",
        raceName: "Half-Orc",
        raceSource: "PHB",
        source: "ERLW",
        skillProficiencies: null,
        languageProficiencies: [{ common: true, goblin: true }],
        entries: [{ name: "Languages", type: "entries", entries: ["You can speak, read, and write Common and Goblin."] }],
      },
    ],
  },
};

function build(raceName: string, sub?: RegExp, options: string[] = []) {
  const reg = new ARegistry();
  reg.addElements(convertFiveTools({ files: files as never }));
  reg.build();
  const race = reg.ofType("Race").find((r) => r.name === raceName)!;
  let ch = { ...newCharacter(), race: race.id, options };
  if (sub) {
    const slot = resolve(ch, reg).slots.find((s) => s.options.some((o) => sub.test(o.name)))!;
    ch = { ...ch, selections: { ...ch.selections, [slot.key]: [slot.options.find((o) => sub.test(o.name))!.id] } };
  }
  const r = resolve(autoFill(ch, reg), reg);
  const has = (kind: string) =>
    r.active
      .map((a) => conceptOf(a.el))
      .filter((k) => k?.startsWith(`${kind}:`))
      .sort();
  return { languages: has("language"), skills: has("skill") };
}

describe("a subrace's own lists", () => {
  it("a language list written again replaces the species' list", () => {
    expect(build("Half-Orc", /Mark of Finding/).languages).toEqual(["language:common", "language:goblin"]);
    expect(build("Half-Orc", /standard|^Half-Orc$/i).languages).toEqual(["language:common", "language:orc"]);
  });
  it("a field set to nothing takes the species' away", () => {
    expect(build("Half-Orc", /Mark of Finding/).skills).toEqual([]);
    expect(build("Half-Orc", /standard|^Half-Orc$/i).skills).toEqual(["skill:intimidation"]);
  });
});

describe('"other" where the text names two languages', () => {
  it("is one of them, not both", () => {
    const got = build("Sun Human").languages;
    expect(got.length).toBe(2);
    expect(got).toContain("language:common");
  });
});

// Big batch, 2026-11-20: a Half-Orc with Tasha's customized proficiencies had the skill it chose and Intimidation too.
// The species' own grant steps aside for the choice; its trait Menacing, whose text gives the same skill, did not.
describe("a species' skill that its trait words as well", () => {
  it("is one skill, and one when Tasha's customized proficiencies swap it", () => {
    expect(build("Brute").skills).toEqual(["skill:intimidation"]);
    const swapped = build("Brute", undefined, ["ID_5ET_OPTION_TCE_CUSTOMIZED_PROFICIENCY"]).skills;
    expect(swapped.length).toBe(1);
    expect(swapped).not.toEqual(["skill:intimidation"]);
  });
});

describe.skipIf(!process.env.SOULFORGE_RULES)("the Half-Orc with Tasha's customized proficiencies", () => {
  it("has the one skill it chose, not Menacing's Intimidation as well", async () => {
    const { loadContentSet } = await import("../engine/testContent");
    const reg = loadContentSet(process.env.SOULFORGE_RULES!, "5etools");
    const skillsOf = (options: string[]) => {
      const ch = autoFill({ ...newCharacter(), race: "ID_5ET_RACE_PHB_HALF_ORC", options }, reg);
      return resolve(ch, reg)
        .active.filter((a) => a.root === "race")
        .map((a) => conceptOf(a.el))
        .filter((k) => k?.startsWith("skill:"));
    };
    expect(skillsOf([])).toEqual(["skill:intimidation"]);
    expect(skillsOf(["ID_5ET_OPTION_TCE_CUSTOMIZED_PROFICIENCY"]).length).toBe(1);
  }, 600000);
});
