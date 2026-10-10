import { describe, expect, it } from "vitest";
import { DOMParser as XmlDomParser } from "@xmldom/xmldom";
import { evaluate } from "./formula";
import { Registry, validatePack } from "./registry";
import { computeSheet, newCharacter, pointBuySpent, proficiencyBonus, spellSlots } from "./compute";
import { convertAuroraXml } from "./aurora";
import { starterPack } from "../content/starter";

function reg() {
  const r = new Registry();
  r.addPack(starterPack);
  return r;
}

describe("formula", () => {
  it("evaluates arithmetic and functions", () => {
    expect(evaluate("10 + dexMod * 2", { dexMod: 3 })).toBe(16);
    expect(evaluate("floor(level / 2) + max(1, 2)", { level: 5 })).toBe(4);
    expect(evaluate("-(2 + 3)", {})).toBe(-5);
  });
  it("rejects unknown variables and functions", () => {
    expect(() => evaluate("foo + 1", {})).toThrow();
    expect(() => evaluate("process(1)", {})).toThrow();
    expect(() => evaluate("1 +", {})).toThrow();
  });
});

describe("rules", () => {
  it("proficiency bonus by level", () => {
    expect([1, 4, 5, 8, 9, 13, 17, 20].map(proficiencyBonus)).toEqual([2, 2, 3, 3, 4, 5, 6, 6]);
  });

  it("point buy cost", () => {
    expect(pointBuySpent({ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 })).toBe(27);
  });

  it("builds a level 1 dwarf fighter with 2024 background increases", () => {
    const ch = newCharacter();
    ch.abilityBase = { str: 15, dex: 12, con: 14, int: 8, wis: 10, cha: 13 };
    ch.species = "species-dwarf";
    ch.class = "class-fighter";
    ch.background = "background-soldier";
    ch.backgroundAsi = { mode: "2/1", plus2: "str", plus1: "con" };
    ch.choices["fighter-skills"] = ["perception", "survival"];
    const s = computeSheet(ch, reg());
    expect(s.abilities.str.score).toBe(17);
    expect(s.abilities.con.score).toBe(15);
    // d10 + con mod 2 + dwarf toughness 1
    expect(s.hp).toBe(10 + 2 + 1);
    expect(s.saves.str.bonus).toBe(3 + 2);
    expect(s.skills.athletics.bonus).toBe(3 + 2);
    expect(s.skills.perception.bonus).toBe(0 + 2);
    expect(s.pending).toHaveLength(0);
    expect(s.ac).toBe(11);
  });

  it("applies custom modifiers and orders set before add", () => {
    const ch = newCharacter();
    ch.class = "class-fighter";
    ch.level = 3;
    ch.abilityBase.dex = 14;
    ch.abilityBase.con = 10;
    ch.extras = ["item-chain-mail-example", "item-shield-example", "feat-tough-example"];
    const s = computeSheet(ch, reg());
    expect(s.ac).toBe(18);
    // d10 + 0 + 2 levels * (6 + 0) + hardy 3*2
    expect(s.hp).toBe(10 + 12 + 6);
  });

  it("reports unfilled choices", () => {
    const ch = newCharacter();
    ch.class = "class-wizard";
    ch.background = "background-sage";
    const s = computeSheet(ch, reg());
    expect(s.pending.map((p) => p.id).sort()).toEqual(["background-asi", "wizard-skills"]);
  });
});

describe("pack validation", () => {
  it("accepts the starter pack", () => {
    expect(validatePack(starterPack)).toEqual([]);
  });
  it("flags bad formulas and unknown variables", () => {
    const errs = validatePack({
      id: "x",
      name: "x",
      elements: [{ id: "a", type: "feat", name: "A", rules: [{ kind: "stat", stat: "ac", value: "wisdom + (" }] }],
    });
    expect(errs.length).toBeGreaterThan(0);
  });
});

const ACOLYTE = `<?xml version="1.0" encoding="utf-8" ?>
<elements>
  <info><name>Acolyte</name></info>
  <element name="Acolyte" type="Background" source="PHB" id="ID_BG_ACOLYTE">
    <description><p>Temple service.</p></description>
    <rules>
      <grant type="Ability Score Improvement" id="ID_INTERNAL_ABILITY_SCORE_IMPROVEMENT_COMBINATION_INT_WIS_CHA" />
      <grant type="Proficiency" id="ID_PROFICIENCY_SKILL_INSIGHT" />
      <grant type="Proficiency" id="ID_PROFICIENCY_SKILL_SLEIGHT_OF_HAND" />
      <grant type="Feat" id="ID_FEAT_X" requirements="ID_SOMETHING" />
      <select type="Language" name="Language" supports="Standard" />
    </rules>
  </element>
  <element name="Dwarven Toughness" type="Racial Trait" source="PHB" id="ID_DT">
    <description><p>More HP.</p></description>
    <sheet display="false" />
    <rules><stat name="hp" value="level" /><stat name="innate speed" value="30" bonus="base" /></rules>
  </element>
</elements>`;

describe("aurora importer", () => {
  it("converts elements, rules and reports skips", () => {
    const { pack, report } = convertAuroraXml([{ path: "a.xml", xml: ACOLYTE }], XmlDomParser as never);
    expect(report.elements).toBe(2);
    expect(report.selectionsSkipped).toBe(1);
    expect(report.rulesSkipped).toBe(1);
    const bg = pack.elements.find((e) => e.id === "ID_BG_ACOLYTE")!;
    expect(bg.type).toBe("background");
    expect(bg.rules).toContainEqual({ kind: "asi", options: ["int", "wis", "cha"] });
    expect(bg.rules).toContainEqual({ kind: "proficiency", target: "skill:sleight-of-hand" });
    const dt = pack.elements.find((e) => e.id === "ID_DT")!;
    expect(dt.rules).toContainEqual({ kind: "stat", stat: "hp", op: "add", value: "level" });
    expect(dt.rules).toContainEqual({ kind: "stat", stat: "speed", op: "set", value: 30 });
    expect(validatePack(pack)).toEqual([]);
  });
});

describe("level gated rules", () => {
  it("only applies grants and stats once the level is reached", () => {
    const r = new Registry();
    r.addPack({
      id: "g",
      name: "g",
      elements: [
        {
          id: "c",
          type: "class",
          name: "C",
          hitDie: 8,
          rules: [
            { kind: "grant", ids: ["f2"], minLevel: 2 },
            { kind: "grant", ids: ["f5"], minLevel: 5 },
            { kind: "stat", stat: "speed", value: 10, minLevel: 3 },
          ],
        },
        { id: "f2", type: "feature", name: "Feature 2" },
        { id: "f5", type: "feature", name: "Feature 5" },
      ],
    });
    const ch = newCharacter();
    ch.class = "c";
    ch.level = 3;
    const names = computeSheet(ch, r).elements.map((e) => e.name);
    expect(names).toEqual(["C", "Feature 2"]);
    expect(computeSheet(ch, r).speed).toBe(40);
    ch.level = 1;
    expect(computeSheet(ch, r).elements.map((e) => e.name)).toEqual(["C"]);
    expect(computeSheet(ch, r).speed).toBe(30);
  });
});

describe("spellcasting", () => {
  it("slot tables", () => {
    expect(spellSlots("full", 1).slots).toEqual([2]);
    expect(spellSlots("full", 5).slots).toEqual([4, 3, 2]);
    expect(spellSlots("full", 20).slots).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
    expect(spellSlots("half", 1).slots).toEqual([2]);
    expect(spellSlots("third", 2).slots).toEqual([]);
    expect(spellSlots("third", 3).slots).toEqual([2]);
    expect(spellSlots("pact", 5)).toEqual({ slots: [0, 0, 2], pactLevel: 3 });
  });

  it("computes save DC and attack for a level 5 wizard", () => {
    const ch = newCharacter();
    ch.class = "class-wizard";
    ch.level = 5;
    ch.abilityBase = { str: 8, dex: 8, con: 8, int: 16, wis: 8, cha: 8 };
    const s = computeSheet(ch, reg());
    expect(s.spellcasting).toMatchObject({ ability: "int", saveDC: 8 + 3 + 3, attackBonus: 6, slots: [4, 3, 2] });
  });

  it("has no spellcasting for a fighter", () => {
    const ch = newCharacter();
    ch.class = "class-fighter";
    expect(computeSheet(ch, reg()).spellcasting).toBeUndefined();
  });
});
