/** Items a feature gives (A4, UA3): SOULFORGE_RULES=<test content folder>. */
import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { withGrantedItems } from "./grantedItems";
import { loadTestContent } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;

describe.skipIf(!C)("granted items", () => {
  it("puts the School of Invention's arcanomechanical armor in the inventory once", () => {
    const reg = loadTestContent(C!);
    let ch = newCharacter();
    ch.classes = [{ classId: "ID_WOTC_PHB_CLASS_WIZARD", level: 2 }];
    const slot = resolve(ch, reg).slots.find((s) => s.rule.type === "Archetype")!;
    ch = { ...ch, selections: { [slot.key]: ["ID_WOTC_UA_ARCHETYPE_SCHOOL_INVENTION"] } };
    const once = withGrantedItems(ch, resolve(ch, reg));
    expect(once.inventory.map((i) => i.id)).toContain("ID_WOTC_UA_ARMOR_LIGHT_ARCANOMECHANICAL");
    // Removed by the player, it does not come back.
    const removed = { ...once, inventory: [] };
    expect(withGrantedItems(removed, resolve(removed, reg)).inventory).toEqual([]);
  }, 600000);
});
