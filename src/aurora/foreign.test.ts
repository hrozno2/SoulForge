/**
 * Imports real exported characters and checks what comes through.
 *   AURORA_FIXTURES_2014=<content folder>  FOREIGN_FIXTURES=<folder with the .json files>
 */
import { readFileSync } from "node:fs";
import { isRoll20Store, storeToAttribs } from "./roll20Store";
import { describe, expect, it } from "vitest";
import { loadRegistry } from "./fixture";
import { detectCharacterFormat, importForeignCharacter } from "./foreign";
import { resolve } from "./engine";

const CONTENT = process.env.AURORA_FIXTURES_2014;
const DIR = process.env.FOREIGN_FIXTURES;
const CONTENT24 = process.env.AURORA_FIXTURES_2024;

describe.skipIf(!CONTENT || !DIR)("foreign character import", () => {
  const reg = CONTENT ? loadRegistry(CONTENT) : undefined;
  const load = (f: string) => JSON.parse(readFileSync(`${DIR}/${f}`, "utf8"));

  it("Roll20: Talaan, a level 13 College of Whispers bard", () => {
    const res = importForeignCharacter(load("Talaan Istodaewl(1).json"), reg!);
    if (process.env.SHOW) console.log(JSON.stringify({ notes: res.notes, missing: res.missing, matched: res.matched.length, ch: { ...res.character, inventory: res.character.inventory.length } }, null, 1));
    const ch = res.character;
    expect(ch.name).toBe("Talaan Istodaewl");
    expect(ch.classes[0].level).toBe(13);
    expect(reg!.get(ch.classes[0].classId)?.name).toBe("Bard");
    const r = resolve(ch, reg!);
    expect(r.stats.get("charisma")).toBe(20);
    expect(r.stats.get("dexterity")).toBe(18);
    expect(ch.coins.gp).toBe(263);
    expect(ch.info.alignment).toBe("Lawful Neutral");
    expect(reg!.get(ch.race ?? "")?.name).toBe("Elf");
    expect(ch.info.traits).toMatch(/larger pattern/);
    expect(ch.info.age).toBe("215");
    expect(ch.coins.sp).toBe(20);
    expect(ch.play.hp).toBe(105);
    // Rapier +1 falls back to the base Rapier.
    expect(ch.inventory.some((i) => i.id && reg!.get(i.id)?.name === "Rapier")).toBe(true);
    // Spells the content knows are placed; ones it does not know are reported, not lost silently.
    const placed = [...r.ids].filter((i) => reg!.get(i)?.type === "Spell").length;
    expect(placed).toBeGreaterThan(15);
    expect(res.missing.join()).toMatch(/Silvery Barbs/);
    // These come from books outside the PHB-only test content.
    expect(res.missing.join()).toMatch(/College of Whispers/);
  });

  it("Foundry: Waldrom Brahms", () => {
    const res = importForeignCharacter(load("fvtt-Actor-waldrom-brahms-Be4NGiw22hg7gVBb(1).json"), reg!);
    if (process.env.SHOW) console.log(JSON.stringify({ notes: res.notes, missing: res.missing, matched: res.matched.length, ch: { ...res.character, inventory: res.character.inventory.length } }, null, 1));
    expect(res.character.name).toMatch(/Waldrom/i);
    const ch = res.character;
    expect(reg!.get(ch.classes[0].classId)?.name).toBe("Fighter");
    expect(ch.classes[0].level).toBe(14);
    expect(reg!.get(ch.race ?? "")?.name).toBe("Human");
    expect(ch.xp).toBe(23000);
    expect(ch.info.alignment).toBe("Lawful Evil");
    expect(ch.info.age).toBe("61");
    expect(ch.info.hair).toBe("Silvery Grey");
    expect(ch.coins.sp).toBe(2);
    expect(ch.play.hp).toBe(117);
    const r = resolve(ch, reg!);
    expect(r.stats.get("strength")).toBe(20);
    expect(r.stats.get("constitution")).toBe(18);
    // "+1 Shield" and "Requital (+1 Longsword)" resolve to the base items.
    const names = ch.inventory.map((i) => (i.id ? reg!.get(i.id)?.name : undefined));
    expect(names).toContain("Shield");
    expect(names).toContain("Longsword");
    // Class features are not reported as missing feats.
    expect(res.missing.join()).not.toMatch(/Second Wind|Action Surge/);
  });
});

describe.skipIf(!CONTENT24 || !DIR)("foreign import against the 2024 rules", () => {
  it("settles species, class and feat choices from a Roll20 bard", () => {
    const reg = loadRegistry(CONTENT24!);
    const res = importForeignCharacter(JSON.parse(readFileSync(`${DIR}/Talaan Istodaewl(1).json`, "utf8")), reg);
    const r = resolve(res.character, reg);
    const open = r.slots.filter((s) => !s.rule.optional && !s.defaulted && s.chosen.length < s.rule.number && s.options.length);
    // Only a subclass the content does not have may stay open.
    expect(open.map((s) => s.options[0].type)).toEqual(["Archetype"]);
    const names = (id: string) => r.slots.filter((s) => s.key.includes(id)).flatMap((s) => s.chosen.map((c) => reg.get(c)?.name));
    expect(names("ELVEN_LINEAGE|")).toContain("Drow");
    expect(names("CLASS_FEATURE_BARD_EXPERTISE")).toEqual(expect.arrayContaining(["Skill Expertise (Perception)", "Skill Expertise (Stealth)"]));
    expect(names("CLASS_BARD|5")).toEqual(expect.arrayContaining(["Tool Proficiency (Lute)", "Tool Proficiency (Lyre)"]));
    // Resilient goes to the one saving throw the class does not already give.
    expect(names("FEAT_RESILIENT")).toEqual(["Constitution"]);
    expect(r.stats.get("charisma")).toBe(20);
  });

  it("settles the choices of a Foundry fighter", () => {
    const reg = loadRegistry(CONTENT24!);
    const res = importForeignCharacter(JSON.parse(readFileSync(`${DIR}/fvtt-Actor-waldrom-brahms-Be4NGiw22hg7gVBb(1).json`, "utf8")), reg);
    const r = resolve(res.character, reg);
    // Spell choices the file does not fill are left for the player; everything else is settled.
    const open = r.slots.filter((s) => s.rule.type !== "Spell" && !s.rule.optional && !s.defaulted && s.chosen.length < s.rule.number && s.options.length);
    expect(open.map((s) => s.rule.name)).toEqual([]);
    const names = (id: string) => r.slots.filter((s) => s.key.includes(id)).flatMap((s) => s.chosen.map((c) => reg.get(c)?.name));
    expect(names("RACE_HUMAN|2")).toEqual(["Medium"]);
    expect(names("FIGHTER_SUBCLASS")).toEqual(["Eldritch Knight"]);
    expect(names("FIGHTING_STYLE")).toContain("Dueling");
    // Level 4 and later choices are score improvements, not arbitrary feats.
    expect(names("FIGHTER_ABILITY_SCORE_IMPROVEMENT")).toEqual(Array(5).fill("Ability Score Improvement"));
    expect(r.stats.get("strength")).toBe(20);
  });
});

describe("Roll20's 2024 sheet and betterR20's file", () => {
  const int = (type: string, fields: Record<string, unknown>) => ({ _enabled: true, type, arrayPosition: 1, childIDs: "[]", parentID: "", ...fields });
  const store = {
    integrants: { integrants: {
      a1: int("Ability Score", { ability: "Strength", calculation: "Set Value", valueFormula: { flatValue: 15 } }),
      a2: int("Ability Score", { ability: "Strength", calculation: "Modify", valueFormula: { flatValue: 1 } }),
      off: int("Ability Score", { _enabled: false, ability: "Wisdom", calculation: "Set Value", valueFormula: { flatValue: 18 } }),
      c1: int("Class", { name: "Fighter", arrayPosition: 1 }), l1: int("Class Level", { classID: "c1", level: 1, parentID: "c1" }), l2: int("Class Level", { classID: "c1", level: 2, parentID: "c1" }),
      c2: int("Class", { name: "Wizard", arrayPosition: 2 }), l3: int("Class Level", { classID: "c2", level: 1 }),
      s1: int("Species", { name: "Dwarf" }),
      f1: int("Features", { name: "Second Wind", parentID: "l1" }), f2: int("Features", { name: "Alert", source: "Feat" }), f3: int("Features", { name: "Stonecunning", parentID: "s1" }),
      sp: int("Spell", { name: "Shield", level: 1, _prepared: true }), sa: int("Spell", { name: "Bless", level: 1, alwaysPrepared: true }),
      it: int("Item", { name: "Longsword", quantity: 2, equipData: { equipped: true } }),
      la: int("Language", { name: "Dwarvish" }),
      p1: int("Proficiency", { category: "Saving Throw", proficiency: "Strength", proficiencyLevel: "Proficient" }),
      p2: int("Proficiency", { category: "Skill", proficiency: "Sleight of Hand", proficiencyLevel: "Expertise" }),
    } },
    hitpoints: { currentHP: 12 }, classLevel: { currentExp: 300 }, currencies: { gp: 7 }, about: { characteristics: { alignment: "Good" } },
  };
  const attrs = storeToAttribs(JSON.stringify(store));
  const get = (n: string) => attrs.find((a) => a.name === n)?.current;
  const rows = (re: RegExp) => attrs.filter((a) => re.test(a.name)).map((a) => a.current);
  it("reads the store as the older sheet's attributes", () => {
    expect(get("strength")).toBe(16);
    expect(get("wisdom")).toBeUndefined();
    expect([get("class"), get("base_level"), get("level"), get("multiclass1"), get("multiclass1_lvl"), get("race")]).toEqual(["Fighter", 2, 3, "Wizard", 1, "Dwarf"]);
    expect(rows(/_spellname$/)).toEqual(["Shield", "Bless (A)"]);
    expect(rows(/_itemname$/)).toEqual(["Longsword"]);
    expect(get("strength_save_prof")).toBe("(@{pb})");
    expect(get("sleight_of_hand_type")).toBe(2);
    expect([get("hp"), get("xp"), get("gp"), get("alignment")]).toEqual([12, 300, 7, "Good"]);
  });
  it("sorts features by where they hang", () => {
    const by = (name: string) => { const id = attrs.find((a) => a.name.endsWith("_name") && a.current === name)!.name.split("_")[2]; return attrs.find((a) => a.name === `repeating_traits_${id}_source`)!.current; };
    expect([by("Second Wind"), by("Alert"), by("Stonecunning")]).toEqual(["Class", "Feat", "Racial"]);
  });
  it("leaves alone what is not a store", () => {
    expect(isRoll20Store("")).toBe(false);
    expect(isRoll20Store("{}")).toBe(false);
    expect(storeToAttribs("not json")).toEqual([]);
  });
  it("a file of betterR20's is known, with or without a list", () => {
    expect(detectCharacterFormat({ schema_version: 1, character: { attributes: { name: "X" }, attribs: [] } })).toBe("roll20");
    expect(detectCharacterFormat({ characters: [{ attributes: { name: "X" }, attribs: [] }] })).toBe("roll20");
  });
});
