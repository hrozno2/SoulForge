/**
 * A required choice with nothing to take (full check 2026-10-29: Barbarian 5 + Wizard, Scholar's expertise with none
 * of its skills). Options the build rules out leave it asking for nothing (stillToChoose); only a choice with no
 * options at all is a hole in the content, which the rules check reports.
 */
import { describe, expect, it } from "vitest";
import { loadRegistry } from "./fixture";
import { newCharacter } from "./character";
import { resolve, stillToChoose } from "./engine";
import { checkChoiceWindows } from "./rulesCheck";

const reg = loadRegistry("fixtures/content");

describe("a required choice with nothing to take", () => {
  const ch = newCharacter();
  ch.classes = [{ classId: "ID_SF_CLASS_SPELLSINGER", level: 1 }];
  const r = resolve(ch, reg);
  const s = r.slots.find((x) => !x.rule.optional && x.options.length > 1 && x.chosen.length < x.rule.number)!;
  const finds = (slot: typeof s) => checkChoiceWindows({ ...r, slots: [slot] }).filter((f) => f.rule === "A required choice has nothing to take");

  it("asks for nothing and is no mistake when the build rules out every option", () => {
    const ruledOut = { ...s, chosen: [], blocked: new Set(s.options.map((o) => o.id)) };
    expect(stillToChoose(ruledOut)).toBe(false);
    expect(finds(ruledOut)).toEqual([]);
  });

  it("is reported when the content gives the choice no options at all", () => {
    expect(finds({ ...s, chosen: [], options: [] })).toHaveLength(1);
  });
});
