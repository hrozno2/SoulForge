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
    const ch = newCharacter(); ch.race = race; ch.classes = [{ classId: "ID_WOTC_PHB24_CLASS_FIGHTER", level: 1 }]; ch.selections = selections;
    return resolve(ch, reg).slots.filter((s) => s.root === "race");
  };
  it("finds a moved size and languages (Aasimar)", () => {
    const slots = species("ID_WOTC_PHB24_RACE_AASIMAR", { "ID_WOTC_PHB24_RACE_AASIMAR|1": ["ID_INTERNAL_RACIAL_TRAIT_SMALL"], "ID_WOTC_PHB24_RACE_AASIMAR|5": ["ID_WOTC_ERLW_LANGUAGE_RIEDRAN", "ID_WOTC_DSDQ_LANGUAGE_KENDERSPEAK"] });
    expect(slots.find((s) => /^Size/.test(s.rule.name))?.chosen).toEqual(["ID_INTERNAL_RACIAL_TRAIT_SMALL"]);
    expect(slots.find((s) => s.rule.name === "Language (Aasimar)")?.chosen).toEqual(["ID_WOTC_ERLW_LANGUAGE_RIEDRAN", "ID_WOTC_DSDQ_LANGUAGE_KENDERSPEAK"]);
  }, 600000);
  it("gives languages both lists offer to the species' own choice, not the switched-off customized one (Elf)", () => {
    const slots = species("ID_WOTC_PHB24_RACE_ELF", { "ID_WOTC_PHB24_RACE_ELF|5": ["ID_LANGUAGE_ELVISH", "ID_LANGUAGE_DWARVISH"] });
    const lang = slots.find((s) => s.rule.name === "Language (Elf)")!;
    expect(lang.chosen).toEqual(["ID_LANGUAGE_ELVISH", "ID_LANGUAGE_DWARVISH"]);
    expect(stillToChoose(lang)).toBe(false);
  }, 600000);
});
