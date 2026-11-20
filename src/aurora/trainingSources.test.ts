/**
 * W5 (E2.1): skills, tools and languages judged by count per source. What a class gives at first level, what it gives
 * by multiclassing, and what the background gives, counted from where each comes and compared with the reference's
 * numbers (5e.tools' class and background data, condensed apart from the converter).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolve } from "./engine";
import { buildSheet } from "./sheet";
import { normalizeCharacter } from "./character";
import { checkCharacter, type RefClass } from "./rulesCheck";
import { condenseBackgrounds, condenseClassFile, condenseSpecies } from "./rulesRef";
import { loadContentSet } from "../engine/testContent";

const RULE = "Training by source";
const cls = (name: string, skills: unknown, mcSkills?: unknown, tools?: unknown) => ({
  name,
  source: "XPHB",
  edition: "one",
  hd: { faces: 6 },
  proficiency: ["con", "cha"],
  classFeatures: [],
  startingProficiencies: { skills, toolProficiencies: tools },
  multiclassing: { proficienciesGained: mcSkills ? { skills: mcSkills } : {} },
});
const SORCERER = ["arcana", "deception", "insight", "intimidation", "persuasion", "religion"];

describe("the reference's training counts", () => {
  it("reads a class's skills and tools, at first level and by multiclassing", () => {
    const [bard, monk] = condenseClassFile({
      class: [
        cls("Bard", [{ any: 3 }], [{ choose: { from: ["arcana", "stealth"], count: 1 } }], [{ anyMusicalInstrument: 3 }]),
        cls("Monk", [{ choose: { from: ["acrobatics", "stealth"], count: 2 } }], undefined, [
          { anyArtisansTool: 1 },
          { anyMusicalInstrument: 1 },
        ]),
      ],
    }) as unknown as RefClass[];
    expect(bard.startSkills).toEqual({ count: 3, from: null });
    expect(bard.mcSkills).toEqual({ count: 1, from: ["arcana", "stealth"] });
    expect(bard.startToolCounts).toEqual([3]);
    expect(monk.startSkills).toEqual({ count: 2, from: ["acrobatics", "stealth"] });
    expect(monk.mcSkills).toEqual({ count: 0, from: [] });
    expect(monk.startToolCounts).toEqual([1]);
    expect(monk.mcToolCounts).toEqual([0]);
  });

  it("reads a background's counts, a copy taking them from its original", () => {
    const out = condenseBackgrounds({
      background: [
        {
          name: "Acolyte",
          source: "PHB",
          skillProficiencies: [{ insight: true, religion: true }],
          languageProficiencies: [{ anyStandard: 2 }],
        },
        { name: "Town Acolyte", source: "X", _copy: { name: "Acolyte", source: "PHB" } },
        {
          name: "Feylost",
          source: "WBtW",
          languageProficiencies: [{ anyStandard: 1, choose: { from: ["elvish", "gnomish", "goblin", "sylvan"] } }],
        },
        {
          name: "Urban Bounty Hunter",
          source: "SCAG",
          skillProficiencies: [{ choose: { from: ["a", "b", "c"], count: 2 } }],
          toolProficiencies: [{ choose: { from: ["x", "y", "z"], count: 2 } }],
        },
        {
          name: "Artisan",
          source: "XPHB",
          edition: "one",
          skillProficiencies: [{ investigation: true, persuasion: true }],
          toolProficiencies: [{ anyArtisansTool: 1 }],
        },
      ],
    });
    expect(out.map((b) => [b.name, b.edition, b.skills, b.tools, b.languages])).toEqual([
      ["Acolyte", "classic", [2], [0], [2]],
      ["Town Acolyte", "classic", [2], [0], [2]],
      // The book's text over the list: one language of four.
      ["Feylost", "classic", [0], [0], [1]],
      ["Urban Bounty Hunter", "classic", [2], [2], [0]],
      ["Artisan", "one", [2], [1], [0]],
    ]);
  });
});

describe("the reference's species", () => {
  it("reads a species and its subraces, a subrace's own list in place of the species'", () => {
    const out = condenseSpecies({
      race: [
        { name: "Elf", source: "PHB", skillProficiencies: [{ perception: true }], languageProficiencies: [{ common: true, elvish: true }] },
        { name: "Wood Elf Kin", source: "X", _copy: { name: "Elf", source: "PHB" } },
        { name: "Human", source: "XPHB", edition: "one", skillProficiencies: [{ any: 1 }] },
      ],
      subrace: [
        {
          name: "High",
          raceName: "Elf",
          raceSource: "PHB",
          source: "PHB",
          languageProficiencies: [{ common: true, elvish: true, anyStandard: 1 }],
        },
        { name: "Rock", raceName: "Gnome", raceSource: "PHB", source: "PHB" },
      ],
    });
    expect(out.map((b) => [b.name, b.base, b.edition, b.skills, b.tools, b.languages])).toEqual([
      ["Elf", "Elf", "classic", [1], [0], [2]],
      ["Wood Elf Kin", "Wood Elf Kin", "classic", [1], [0], [2]],
      ["Human", "Human", "one", [1], [0], [0]],
      ["Elf (High)", "Elf", "classic", [1], [0], [3]],
    ]);
  });
});

describe("training by source", () => {
  // A Sorcerer who multiclassed into Warlock, on the bundled SRD 5.2: two Sorcerer skills, none from Warlock.
  const reg = loadContentSet("", "srd");
  const ch = normalizeCharacter(JSON.parse(readFileSync(join(__dirname, "fixtures/sorcerer-warlock-srd.json"), "utf8")));
  const r = resolve(ch, reg);
  const sh = buildSheet(r);
  const first = reg.get(ch.classes[0].classId)!.name;
  const second = reg.get(ch.classes[1].classId)!.name;
  const check = (ref: unknown[]) => checkCharacter(r, sh, ref as RefClass[]).filter((f) => f.rule === RULE);
  const refWith = (firstSkills: unknown, secondMc?: unknown, bg?: unknown[]) => {
    const ref = condenseClassFile({ class: [cls(first, firstSkills), cls(second, [{ any: 2 }], secondMc)] });
    if (bg) ref[0].backgrounds = bg;
    return ref;
  };

  it("passes a character whose classes gave what the reference says", () => {
    expect([first, second]).toEqual(["Sorcerer", "Warlock"]);
    expect(check(refWith([{ choose: { from: SORCERER, count: 2 } }]))).toEqual([]);
  });

  it("finds a first class that gave another number of skills", () => {
    const found = check(refWith([{ choose: { from: SORCERER, count: 3 } }]));
    expect(found.map((f) => f.detail.replace(/ \(.*\)$/, ""))).toEqual(["Sorcerer: 2 skills at first level, the class gives 3"]);
  });

  it("finds a skill the class's list does not name", () => {
    const found = check(refWith([{ choose: { from: ["athletics", "stealth"], count: 2 } }]));
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((f) => /^Sorcerer: .+ is not among the class's skills$/.test(f.detail))).toBe(true);
  });

  it("finds a second class that gave another number than multiclassing gives", () => {
    const found = check(refWith([{ choose: { from: SORCERER, count: 2 } }], [{ any: 1 }]));
    expect(found.map((f) => f.detail.replace(/ \(.*\)$/, ""))).toEqual(["Warlock: 0 skills by multiclassing, the class gives 1"]);
  });

  it("finds a species that gave another number than its own entry", () => {
    const sp = reg.get(ch.race!)!;
    const ref = refWith([{ choose: { from: SORCERER, count: 2 } }]);
    const entry = { name: sp.name, base: sp.name, source: "XPHB", edition: "one", skills: [5], tools: [0], languages: [0] };
    ref[0].species = [entry];
    const got = check(ref);
    expect(got.length).toBe(1);
    expect(got[0].detail).toMatch(new RegExp(`^${sp.name}: \\d skills, 0 tools, \\d languages; the species gives 5, 0 and `));
    ref[0].species = [{ ...entry, skills: [0, 1, 2] }];
    expect(check(ref)).toEqual([]);
  });

  it("finds a background that gave another number than its own lines", () => {
    const bg = reg.get(ch.background!)!;
    const got = check(
      refWith([{ choose: { from: SORCERER, count: 2 } }], undefined, [
        { name: bg.name, source: "XPHB", edition: "one", skills: [3], tools: [1], languages: [0] },
      ]),
    );
    expect(got.length).toBe(1);
    expect(got[0].detail).toMatch(new RegExp(`^${bg.name}: 2 skills, \\d tools, \\d languages; the background gives 3, 1 and 0$`));
  });
});

// Found by "Training by source" (2026-11-19): the Variant Noble (Knight) had no gaming set and no language, the Spy
// and the Gladiator one tool of two. Their choices are labelled with the background's name, and "Variant" in a
// choice's name made it one the player may turn down, so none was ever asked.
describe("a choice of an element named Variant", () => {
  it("is required like any other; a variant choice stays the player's to turn down", async () => {
    const { skippable } = await import("./engine");
    const knight = { type: "Background", name: "Variant Noble (Knight)" };
    expect(skippable({ name: "Variant Noble (Knight) language" }, knight)).toBe(false);
    expect(skippable({ name: "Variant Noble (Knight) gaming set" }, knight)).toBe(false);
    expect(skippable({ name: "Variant Feature" }, { type: "Background", name: "Noble" })).toBe(true);
    expect(skippable({ name: "Variant Feature" }, knight)).toBe(true);
    expect(skippable({ name: "Optional class feature: Favored Foe (Ranger 1)" }, { type: "Class", name: "Ranger" })).toBe(true);
  });
});

// Found by "Training by source" (2026-11-19): a 5e.tools Monk had an artisan's tool and a musical instrument; both
// Player's Handbooks give one or the other.
describe.skipIf(!process.env.SOULFORGE_RULES)("a class's tool sets written side by side", () => {
  it("are a choice of one set: a Monk's artisan's tools or musical instrument", () => {
    const reg = loadContentSet(process.env.SOULFORGE_RULES!, "5etools");
    for (const monk of reg.ofType("Class").filter((c) => c.name === "Monk" && c.id.startsWith("ID_5ET_"))) {
      const tools = monk.rules.filter((r) => r.kind === "select" && /tool|instrument|set/i.test(`${r.name} ${r.supports}`));
      expect(tools.map((r) => (r as { type: string }).type)).toEqual(["Training Option"]);
    }
  }, 600000);
});
