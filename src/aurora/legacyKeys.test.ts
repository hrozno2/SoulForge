/**
 * Picks saved before stable keys ("<element>|<position>") survive the content moving its rules (2026-10-29, Chris's
 * library: 2024 species lost their size and languages). SOULFORGE_RULES=<folder>.
 */
import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import { resolve, stillToChoose } from "./engine";
import { loadTestContent } from "../engine/testContent";

describe.skipIf(!process.env.SOULFORGE_RULES)("old position keys", () => {
  const reg = process.env.SOULFORGE_RULES ? loadTestContent(process.env.SOULFORGE_RULES) : undefined!;
  const species = (race: string, selections: Record<string, string[]>) => {
    const ch = newCharacter();
    ch.race = race;
    ch.classes = [{ classId: "ID_WOTC_PHB24_CLASS_FIGHTER", level: 1 }];
    ch.selections = selections;
    return resolve(ch, reg).slots.filter((s) => s.root === "race");
  };
  it("finds a moved size and languages (Aasimar)", () => {
    const slots = species("ID_WOTC_PHB24_RACE_AASIMAR", {
      "ID_WOTC_PHB24_RACE_AASIMAR|1": ["ID_INTERNAL_RACIAL_TRAIT_SMALL"],
      "ID_WOTC_PHB24_RACE_AASIMAR|5": ["ID_WOTC_ERLW_LANGUAGE_RIEDRAN", "ID_WOTC_DSDQ_LANGUAGE_KENDERSPEAK"],
    });
    expect(slots.find((s) => /^Size/.test(s.rule.name))?.chosen).toEqual(["ID_INTERNAL_RACIAL_TRAIT_SMALL"]);
    expect(slots.find((s) => s.rule.name === "Language (Aasimar)")?.chosen).toEqual([
      "ID_WOTC_ERLW_LANGUAGE_RIEDRAN",
      "ID_WOTC_DSDQ_LANGUAGE_KENDERSPEAK",
    ]);
  }, 600000);
  it("gives languages both lists offer to the species' own choice, not the switched-off customized one (Elf)", () => {
    const slots = species("ID_WOTC_PHB24_RACE_ELF", { "ID_WOTC_PHB24_RACE_ELF|5": ["ID_LANGUAGE_ELVISH", "ID_LANGUAGE_DWARVISH"] });
    const lang = slots.find((s) => s.rule.name === "Language (Elf)")!;
    expect(lang.chosen).toEqual(["ID_LANGUAGE_ELVISH", "ID_LANGUAGE_DWARVISH"]);
    expect(stillToChoose(lang)).toBe(false);
  }, 600000);
  // Audit E1's proof (2026-11-20) found the one place the first upgrade missed: a class's multiclass block is walked
  // as an element of its own, though the registry holds none.
  it("finds a pick saved under a class's multiclass block (a Barbarian who took Rogue)", () => {
    const ch = newCharacter();
    ch.classes = [
      { classId: "ID_WOTC_PHB24_CLASS_BARBARIAN", level: 1 },
      { classId: "ID_WOTC_PHB24_CLASS_ROGUE", level: 1 },
    ];
    ch.selections = { "ID_WOTC_PHB24_MULTICLASS_ROGUE|1": ["ID_PROFICIENCY_SKILL_ACROBATICS"] };
    const slot = resolve(ch, reg).slots.find(
      (s) => s.owner.id === "ID_WOTC_PHB24_MULTICLASS_ROGUE" && s.rule.type === "Proficiency" && s.chosen.length,
    );
    expect(slot?.chosen).toEqual(["ID_PROFICIENCY_SKILL_ACROBATICS"]);
  }, 600000);
  it("lets a pick under the choice's own key win over an old position key", () => {
    const ch = newCharacter();
    ch.race = "ID_WOTC_PHB24_RACE_AASIMAR";
    ch.classes = [{ classId: "ID_WOTC_PHB24_CLASS_FIGHTER", level: 1 }];
    ch.selections = { "ID_WOTC_PHB24_RACE_AASIMAR|1": ["ID_INTERNAL_RACIAL_TRAIT_SMALL"] };
    const size = resolve(ch, reg).slots.find((s) => s.root === "race" && /^Size/.test(s.rule.name))!;
    expect(size.chosen).toEqual(["ID_INTERNAL_RACIAL_TRAIT_SMALL"]);
    const other = size.options.find((o) => o.id !== "ID_INTERNAL_RACIAL_TRAIT_SMALL")!;
    ch.selections = { ...ch.selections, [size.key]: [other.id] };
    expect(resolve(ch, reg).slots.find((s) => s.key === size.key)!.chosen).toEqual([other.id]);
  }, 600000);
});
