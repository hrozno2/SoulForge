/** Items a feature gives (A4, UA3): SOULFORGE_RULES=<test content folder>. */
import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { withGrantedItems } from "./grantedItems";
import { buildSheet } from "./sheet";
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

describe.skipIf(!C)("playtest Artificer (UA2)", () => {
  it("says how long infusions last after the artificer dies", () => {
    const reg = loadTestContent(C!);
    const cls = reg.ofType("Class").find((c) => c.name === "Artificer" && /2019|unearthed/i.test(c.source) && /20190228/.test(c.id))!;
    const ch = newCharacter();
    ch.classes = [{ classId: cls.id, level: 5 }];
    ch.abilityBase = { ...ch.abilityBase, intelligence: 14 };
    const line = buildSheet(resolve(ch, reg)).features.find((f) => /infuse item/i.test(f.name));
    expect(line?.text).toMatch(/infusions last 2 days after your death/);
  }, 600000);
});
