/** "inherit" spellcasting (5e.tools): the ability the feat itself raised, as Plutonium reads it. SOULFORGE_RULES=<folder>. */
import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { loadTestContent } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;

describe.skipIf(!C)("inherit spellcasting ability", () => {
  it("casts a feat's spells with the ability the feat raised", () => {
    const reg = loadTestContent(C!);
    const feat = reg.ofType("Feat").find((e) => e.spellcasting?.ability?.toLowerCase() === "inherit" && e.rules.some((r) => r.kind === "select" && r.type === "Ability Score Improvement"));
    expect(feat, "a feat with an inherited spellcasting ability and its own increase").toBeTruthy();
    let ch = newCharacter();
    ch.classes = [{ classId: "ID_WOTC_PHB24_CLASS_FIGHTER", level: 4 }];
    ch.extras = [feat!.id];
    const slot = resolve(ch, reg).slots.find((s) => s.owner.id === feat!.id && s.rule.type === "Ability Score Improvement")!;
    const pick = slot.options.find((o) => o.rules.some((r) => r.kind === "stat" && r.name === "wisdom"))!;
    ch = { ...ch, selections: { [slot.key]: [pick.id] } };
    const entry = [...resolve(ch, reg).spellcasting.values()].find((e) => e.owner === feat!.id)!;
    expect(entry.ability).toBe("wisdom");
  }, 600000);
});
