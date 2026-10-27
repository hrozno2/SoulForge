/** Characters from an older Soul Forge (A2.13): picks a choice no longer offers are listed. SOULFORGE_RULES=<test content>. */
import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { checkDue, markChecked, misalignments, picksNoLongerOffered } from "./olderBuild";
import { loadTestContent } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;

describe("older builds", () => {
  it("is due once per version, for characters with a class", () => {
    const ch = { ...newCharacter(), classes: [{ classId: "X", level: 1 }] };
    expect(checkDue(newCharacter(), "1.0.0")).toBe(false);
    expect(checkDue(ch, "1.0.0")).toBe(true);
    expect(checkDue(markChecked(ch, "1.0.0"), "1.0.0")).toBe(false);
    expect(checkDue(markChecked(ch, "1.0.0"), "1.1.0")).toBe(true);
  });

  it.skipIf(!C)("lists a pick its choice no longer offers", () => {
    const reg = loadTestContent(C!);
    let ch = newCharacter();
    ch.classes = [{ classId: "ID_WOTC_PHB_CLASS_WIZARD", level: 3 }];
    const slot = resolve(ch, reg).slots.find((s) => s.rule.type === "Archetype")!;
    // A Fighter subclass saved in the Wizard's subclass choice: no longer (or never) offered there.
    const fighterSub = reg.ofType("Archetype").find((a) => a.supports.some((x) => /fighter/i.test(x)))!;
    ch = { ...ch, selections: { [slot.key]: [fighterSub.id] } };
    const r = resolve(ch, reg);
    expect(picksNoLongerOffered(r).map((f) => f.detail)).toEqual([`${slot.rule.name}: ${fighterSub.name}`]);
    expect(misalignments(r, [{ rule: "A required choice is not made", detail: "x" }])).toHaveLength(1);
  }, 600000);
});
