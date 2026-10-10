import { describe, expect, it } from "vitest";
import { Registry } from "./registry";
import { computeSheet } from "./compute";
import { detectCharacterFormat, htmlToText, importCharacterFile, importFoundry, importRoll20 } from "./importers";
import { starterPack } from "../content/starter";

const reg = () => {
  const r = new Registry();
  r.addPack(starterPack);
  return r;
};

const foundry = {
  name: "Brynja Ironvale",
  type: "character",
  system: {
    abilities: {
      str: { value: 16, proficient: 1 },
      dex: { value: 12, proficient: 0 },
      con: { value: 15, proficient: 1 },
      int: { value: 8, proficient: 0 },
      wis: { value: 10, proficient: 0 },
      cha: { value: 13, proficient: 0 },
    },
    skills: { ath: { value: 1 }, prc: { value: 1 }, ste: { value: 2 }, arc: { value: 0 } },
    details: { biography: { value: "<p>Raised in the <b>deep halls</b>.</p>" } },
  },
  items: [
    { name: "Dwarf", type: "race", system: { description: { value: "<p>Sturdy.</p>" } } },
    { name: "Fighter", type: "class", system: { levels: 3, hitDice: "d10", description: { value: "" } } },
    { name: "Soldier", type: "background", system: { description: { value: "" } } },
    { name: "Alert", type: "feat", system: { description: { value: "<p>Always ready.</p>" } } },
    {
      name: "Fire Bolt",
      type: "spell",
      system: {
        level: 0,
        school: "evo",
        activation: { type: "action", value: 1 },
        range: { value: 120, units: "ft" },
        duration: { units: "inst" },
        properties: ["vocal", "somatic"],
        description: { value: "<p>You hurl a mote of fire. @UUID[Compendium.x]{Make a ranged spell attack} for [[/r 1d10]] damage.</p>" },
      },
    },
    {
      name: "Longsword",
      type: "weapon",
      system: { damage: { parts: [["1d8", "slashing"]] }, weight: { value: 3 }, price: { value: 15, denomination: "gp" }, description: { value: "" } },
    },
    { name: "Weird Thing", type: "mystery", system: {} },
  ],
};

describe("Foundry import", () => {
  it("is detected and imported", () => {
    expect(detectCharacterFormat(foundry)).toBe("foundry");
    const res = importFoundry(foundry, reg());
    const ch = res.character;
    expect(ch.name).toBe("Brynja Ironvale");
    expect(ch.level).toBe(3);
    expect(ch.species).toBe("species-dwarf");
    expect(ch.class).toBe("class-fighter");
    expect(ch.background).toBe("background-soldier");
    expect(ch.abilityBase.str).toBe(16);
    expect(res.report.warnings.join(" ")).toContain("Weird Thing");
    // Unmatched content is kept as elements instead of being dropped.
    expect(res.elements.map((e) => e.name)).toEqual(expect.arrayContaining(["Alert", "Fire Bolt", "Longsword"]));
    const spell = res.elements.find((e) => e.name === "Fire Bolt")!;
    expect(spell.meta).toMatchObject({ level: "0", school: "Evocation", time: "1 Action", range: "120 ft", duration: "Instantaneous", hasVerbalComponent: "true" });
    expect(spell.description).toContain("Make a ranged spell attack");
    expect(spell.description).toContain("1d10");
    expect(spell.description).not.toContain("@UUID");
  });

  it("carries proficiencies into the computed sheet without double counting", () => {
    const r = reg();
    const res = importFoundry(foundry, r);
    r.addPack({ id: "imp", name: "imp", elements: res.elements });
    const sheet = computeSheet(res.character, r);
    expect(sheet.pending.filter((p) => p.id === "background-asi")).toHaveLength(0);
    expect(sheet.abilities.str.score).toBe(16);
    expect(sheet.saves.str.proficient).toBe(true);
    expect(sheet.skills.stealth.level).toBe("expertise");
    expect(sheet.skills.athletics.bonus).toBe(3 + 2);
    expect(sheet.elements.some((e) => e.name === "Fire Bolt")).toBe(true);
  });
});

const roll20 = {
  name: "Tessa Quill",
  attribs: [
    { name: "strength", current: "8" },
    { name: "dexterity", current: "14" },
    { name: "constitution", current: "13" },
    { name: "intelligence", current: "17" },
    { name: "wisdom", current: "12" },
    { name: "charisma", current: "10" },
    { name: "class", current: "Wizard" },
    { name: "base_level", current: "5" },
    { name: "race", current: "Human" },
    { name: "background", current: "Sage" },
    { name: "intelligence_save_prof", current: "(@{pb})" },
    { name: "arcana_prof", current: "(@{pb}*@{arcana_type})" },
    { name: "arcana_type", current: "1" },
    { name: "history_prof", current: "(@{pb}*@{history_type})" },
    { name: "history_type", current: "2" },
    { name: "repeating_spell-1_-Mabcdefghij0123456_spellname", current: "Magic Missile" },
    { name: "repeating_spell-1_-Mabcdefghij0123456_spellschool", current: "evocation" },
    { name: "repeating_spell-1_-Mabcdefghij0123456_spellcomp", current: "V, S" },
    { name: "repeating_spell-1_-Mabcdefghij0123456_spellrange", current: "120 feet" },
    { name: "repeating_spell-cantrip_-Mabcdefghij0123456_spellname", current: "Light" },
    { name: "repeating_inventory_-Mzzzzzzzzzzzzzzzzzz_itemname", current: "Quarterstaff" },
    { name: "repeating_inventory_-Mzzzzzzzzzzzzzzzzzz_itemcount", current: "1" },
    { name: "repeating_traits_-Mtttttttttttttttttt_name", current: "Arcane Recovery" },
    { name: "repeating_traits_-Mtttttttttttttttttt_description", current: "Regain slots on a short rest." },
  ],
};

describe("Roll20 import", () => {
  it("reads attributes and repeating sections", () => {
    expect(detectCharacterFormat(roll20)).toBe("roll20");
    const res = importRoll20(roll20, reg());
    const ch = res.character;
    expect(ch.name).toBe("Tessa Quill");
    expect(ch.level).toBe(5);
    expect(ch.class).toBe("class-wizard");
    expect(ch.species).toBe("species-human");
    expect(ch.abilityBase.int).toBe(17);
    const magic = res.elements.find((e) => e.name === "Magic Missile")!;
    expect(magic.meta).toMatchObject({ level: "1", school: "Evocation", hasVerbalComponent: "true", hasSomaticComponent: "true" });
    expect(res.elements.find((e) => e.name === "Light")!.meta?.level).toBe("0");
    expect(res.elements.map((e) => e.name)).toEqual(expect.arrayContaining(["Quarterstaff", "Arcane Recovery"]));
  });

  it("maps skill proficiency and expertise", () => {
    const r = reg();
    const res = importRoll20(roll20, r);
    r.addPack({ id: "imp", name: "imp", elements: res.elements });
    const sheet = computeSheet(res.character, r);
    expect(sheet.saves.int.proficient).toBe(true);
    expect(sheet.skills.arcana.level).toBe("proficient");
    expect(sheet.skills.history.level).toBe("expertise");
  });
});

describe("importCharacterFile", () => {
  it("rejects unknown files", () => {
    expect(importCharacterFile({ hello: 1 }, reg())).toHaveProperty("error");
  });
  it("cleans Foundry enrichers", () => {
    expect(htmlToText("<p>Deal [[/r 2d6]] damage to @UUID[a.b]{a goblin}.</p>")).toBe("Deal 2d6 damage to a goblin.");
  });
});
