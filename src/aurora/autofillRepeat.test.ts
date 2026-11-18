/**
 * A repeat the auto-fill must take back is taken from the choice that has somewhere else to go. A Wizard 7 (big batch,
 * 2026-11-18) held Arcana in its Wizard skills and in Skilled; every other Wizard skill was the character's already,
 * so taking Arcana out of the Wizard's choice could only put it back. Skilled offers any skill: it gives way.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolve } from "./engine";
import { autoFill } from "./autofill";
import { normalizeCharacter } from "./character";
import { repeatedPicks } from "./rulesCheck";
import { loadTestContent } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;

describe.skipIf(!C)("the auto-fill's repeats", () => {
  it("are taken back from the choice that has another option", () => {
    const reg = loadTestContent(C!);
    const ch = normalizeCharacter(JSON.parse(readFileSync(join(__dirname, "fixtures/wizard-skilled-repeat.json"), "utf8")));
    const filled = autoFill(ch, reg);
    const r = resolve(filled, reg);
    expect(r.slots.flatMap((s) => repeatedPicks(r, s))).toEqual([]);
  }, 600000);

  // W6: a repeat across providers is a repeat. The Wizard's choice taking Aurora's Insight while the background grants
  // 5e.tools' Insight is one skill twice (by id they looked like two).
  it("are seen across the two providers' ids", () => {
    const reg = loadTestContent(C!);
    const ch = normalizeCharacter(JSON.parse(readFileSync(join(__dirname, "fixtures/wizard-skilled-repeat.json"), "utf8")));
    const r0 = resolve(ch, reg);
    const wiz = r0.slots.find((s) => /Skill Proficiency \(Wizard\)/.test(s.rule.name))!;
    // Skilled's picks emptied, so the Wizard's choice has other skills to take (with none, nothing is a repeat).
    const skilled = r0.slots.find((s) => /Skilled/.test(s.owner.name))!;
    const twice = {
      ...ch,
      selections: { ...ch.selections, [skilled.key]: [], [wiz.key]: ["ID_PROFICIENCY_SKILL_INSIGHT", "ID_PROFICIENCY_SKILL_NATURE"] },
    };
    const r = resolve(twice, reg);
    expect(r.slots.flatMap((s) => repeatedPicks(r, s)).some((m) => /Insight \(already from/.test(m))).toBe(true);
  }, 600000);

  // With both providers loaded, a 5e.tools feature whose own set choice gives a training ("smith's tools, or another
  // artisan's tool": Battle Smith's Tool Proficiency) borrowed Aurora's choice of the same training as well, with a
  // default the auto-fill could not take back: Smith's Tools twice (big batch, 2026-11-18).
  it("are not made by a choice borrowed twice", () => {
    const reg = loadTestContent(C!);
    const ch = normalizeCharacter(JSON.parse(readFileSync(join(__dirname, "fixtures/battle-smith-both.json"), "utf8")));
    const r = resolve(autoFill(ch, reg), reg);
    expect(r.slots.flatMap((s) => repeatedPicks(r, s))).toEqual([]);
  }, 600000);
});
