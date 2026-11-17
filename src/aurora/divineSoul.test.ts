/**
 * A subclass whose expanded list is a filter, not names: Xanathar's Divine Soul, "you can choose the new spell from
 * the cleric spell list", which 5e.tools writes as {"all": "level=1|class=Cleric"}. Read as names before, so a 5e.tools
 * Divine Soul could learn no Cleric spell (found 2026-11-17 by the move's laws test). Needs SOULFORGE_RULES.
 */
import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { loadContentSet } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;
describe.skipIf(!C)("Divine Soul on 5e.tools content", () => {
  it("offers Cleric cantrips and spells to the sorcerer's own choices", () => {
    const reg = loadContentSet(C!, "5etools");
    let ch = { ...newCharacter(), classes: [{ classId: "ID_5ET_CLASS_PHB_SORCERER", level: 3 }] };
    const slot = resolve(ch, reg).slots.find((s) => s.rule.type === "Archetype")!;
    ch = { ...ch, selections: { [slot.key]: [slot.options.find((o) => /^divine soul$/i.test(o.name))!.id] } };
    const r = resolve(ch, reg);
    const offered = (re: RegExp) =>
      r.slots.filter((s) => s.rule.type === "Spell" && re.test(s.rule.name)).flatMap((s) => s.options.map((o) => o.name));
    expect(offered(/cantrip/i)).toContain("Sacred Flame");
    expect(offered(/spell known|^spell/i)).toContain("Bless");
  }, 600000);
});
