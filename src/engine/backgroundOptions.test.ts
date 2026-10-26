/** A 2014 background with the 2024 rules (A1.1), on the real content: SOULFORGE_RULES=<test content folder>. */
import { describe, expect, it } from "vitest";
import { newCharacter } from "../aurora/character";
import { resolve } from "../aurora/engine";
import { buildSheet } from "../aurora/sheet";
import { checkCharacter } from "../aurora/rulesCheck";
import { loadTestContent } from "./testContent";
import { BACKGROUND_2024_ID } from "./backgroundOptions";

const C = process.env.SOULFORGE_RULES;

describe.skipIf(!C)("2014 background with the 2024 rules", () => {
  const reg = C ? loadTestContent(C) : undefined!;
  const base = (race: string) => {
    const ch = newCharacter();
    ch.race = race;
    ch.background = "ID_BACKGROUND_OUTLANDER";
    ch.classes = [{ classId: "ID_WOTC_PHB24_CLASS_FIGHTER", level: 1 }];
    return ch;
  };
  const mixed = (r: ReturnType<typeof resolve>) => checkCharacter(r, buildSheet(r), []).some((f) => f.rule === "Origin editions mixed");
  const optIn = (ch: ReturnType<typeof base>) => {
    const slot = resolve(ch, reg).slots.find((s) => s.root === "background" && s.rule.name.startsWith("2024 rules"))!;
    let next = { ...ch, selections: { ...ch.selections, [slot.key]: [BACKGROUND_2024_ID] } };
    // Strength +2 and Constitution +1 from the Strength, Dexterity, Constitution combination; Alert as the feat.
    const pick = (name: string, id: string) => {
      const s = resolve(next, reg).slots.find((x) => x.rule.name === name)!;
      expect(s.options.map((o) => o.id)).toContain(id);
      next = { ...next, selections: { ...next.selections, [s.key]: [id] } };
    };
    pick("Ability Score Combination (2024 rules)", "ID_INTERNAL_ABILITY_SCORE_IMPROVEMENT_COMBINATION_STR_DEX_CON");
    pick("Ability Score Improvement Option", "ID_INTERNAL_ABILITY_SCORE_IMPROVEMENT_COMBINATION_STR_DEX_CON_1");
    pick("Background Ability Score Improvement +2", "ID_WOTC_TCOE_OPTION_CUSTOMIZED_ASI_STRENGTH_INCREASE_2");
    pick("Background Ability Score Improvement +1", "ID_WOTC_TCOE_OPTION_CUSTOMIZED_ASI_CONSTITUTION_INCREASE_1");
    return { ch: next, slot };
  };

  it("offers the option on a 2014 background, not taken until the player takes it", () => {
    const r = resolve(base("ID_WOTC_PHB24_RACE_ORC"), reg);
    const slot = r.slots.find((s) => s.root === "background" && s.rule.name.startsWith("2024 rules"));
    expect(slot?.declined).toBe(true);
    expect(mixed(r)).toBe(true);
  });

  it("raises three abilities and satisfies the rules check once taken (2024 species)", () => {
    const { ch } = optIn(base("ID_WOTC_PHB24_RACE_ORC"));
    const r = resolve(ch, reg);
    expect(r.stats.get("strength")).toBe(10);
    expect(r.stats.get("constitution")).toBe(9);
    expect(mixed(r)).toBe(false);
    expect(r.slots.some((s) => s.rule.name === "Origin Feat (2024 rules)" && s.options.length > 0)).toBe(true);
  });

  it("turns off a 2014 species' own increases once taken", () => {
    expect(resolve(base("ID_RACE_ELF"), reg).stats.get("dexterity")).toBe(10);
    const r = resolve(optIn(base("ID_RACE_ELF")).ch, reg);
    expect(r.stats.get("dexterity")).toBe(8);
    expect(r.stats.get("strength")).toBe(10);
  });
});
