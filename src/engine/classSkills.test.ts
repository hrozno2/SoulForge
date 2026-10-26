/** Class skill lists against 5e.tools, on the real content: SOULFORGE_RULES=<test content folder>. */
import { describe, expect, it } from "vitest";
import { newCharacter } from "../aurora/character";
import { resolve } from "../aurora/engine";
import { loadTestContent } from "./testContent";
import { CLASS_PROFICIENCY_ACCEPTED, classProficiencyDiffs } from "./classSkills";

const C = process.env.SOULFORGE_RULES;

describe.skipIf(!C)("class skill lists", () => {
  it("gives the 2024 Fighter Insight, as the Player's Handbook and 5e.tools do", () => {
    const reg = loadTestContent(C!);
    expect(reg.skillFixes).toContain("Fighter (2024): Insight");
    const ch = newCharacter();
    ch.classes = [{ classId: "ID_WOTC_PHB24_CLASS_FIGHTER", level: 1 }];
    const slot = resolve(ch, reg).slots.find((s) => s.rule.name === "Skill Proficiency (Fighter)")!;
    expect(slot.options.map((o) => o.name)).toEqual(expect.arrayContaining(["Insight", "Persuasion", "Survival"]));
  }, 600000);

  // The standing gate: every class against its 5e.tools twin. A new difference is a gap in one provider's content
  // (fix it in the content or the converter) or, with a reason, an accepted one.
  it("agrees with 5e.tools on every class's proficiencies and skill choice", () => {
    const reg = loadTestContent(C!);
    const diffs = classProficiencyDiffs(reg).filter((d) => !CLASS_PROFICIENCY_ACCEPTED.some((re) => re.test(d)));
    expect(diffs).toEqual([]);
  }, 900000);
});
