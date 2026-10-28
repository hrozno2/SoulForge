/**
 * A feat's spells with a chosen casting ability (5e.tools "ability": {"choose": [...]}) offer the choice, and the pick
 * sets the ability, as Plutonium asks; the 2024 Magic Initiate's spell-list versions too. SOULFORGE_RULES=<folder>.
 */
import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { loadTestContent } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;

describe.skipIf(!C)("chosen spellcasting ability", () => {
  it("lets a Magic Initiate (Cleric) cast with Wisdom", () => {
    const reg = loadTestContent(C!);
    const feat = reg.ofType("Feat").find((f) => f.name === "Magic Initiate (Cleric)" && f.id.startsWith("ID_5ET_") && /2024/.test(f.source));
    expect(feat, "5e.tools 2024 Magic Initiate (Cleric)").toBeTruthy();
    const ch = newCharacter();
    ch.classes = [{ classId: "ID_WOTC_PHB24_CLASS_FIGHTER", level: 1 }];
    ch.extras = [feat!.id];
    const slot = resolve(ch, reg).slots.find((s) => s.owner.id === feat!.id && s.rule.type === "Spellcasting Ability");
    expect(slot, "the ability choice").toBeTruthy();
    expect(slot!.options.map((o) => o.name).sort()).toEqual(["Charisma", "Intelligence", "Wisdom"]);
    const wis = slot!.options.find((o) => o.name === "Wisdom")!;
    const r = resolve({ ...ch, selections: { [slot!.key]: [wis.id] } }, reg);
    const entry = [...r.spellcasting.values()].find((e) => /magic initiate/i.test(e.name));
    expect(entry?.ability).toBe("wisdom");
  }, 600000);
});
