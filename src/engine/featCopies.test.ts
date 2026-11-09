/**
 * A book's own copies of one feat (Aurora's 2024 Ability Score Improvement, _2, _3, taken at each improvement level)
 * do not block each other; the same feat from another book does. A Rogue 17 imported from Foundry took Dungeon Delver
 * at four levels when the copies blocked each other. SOULFORGE_RULES=<folder>.
 */
import { describe, expect, it } from "vitest";
import { newCharacter } from "../aurora/character";
import { resolve } from "../aurora/engine";
import { checkCharacter } from "../aurora/rulesCheck";
import { buildSheet } from "../aurora/sheet";
import { loadTestContent } from "./testContent";

const C = process.env.SOULFORGE_RULES;
const ASI = "ID_WOTC_PHB24_FEAT_ABILITY_SCORE_IMPROVEMENT";

describe.skipIf(!C)("copies of one feat", () => {
  const reg = C ? loadTestContent(C) : undefined!;
  it("a second improvement level offers the book's next copy", () => {
    const ch = newCharacter();
    ch.classes = [{ classId: "ID_WOTC_PHB24_CLASS_ROGUE", level: 8 }];
    let r = resolve(ch, reg);
    const asiSlots = () => r.slots.filter((s) => s.rule.type === "Feat" && /^Ability Score Improvement \(Rogue/.test(s.rule.name)).sort((a, b) => a.rule.name.localeCompare(b.rule.name));
    const [first] = asiSlots();
    ch.selections[first.key] = [ASI];
    r = resolve(ch, reg);
    const second = asiSlots().find((s) => s.key !== first.key)!;
    const copy = second.options.find((o) => o.id === `${ASI}_2`);
    expect(copy, "the _2 copy is offered").toBeDefined();
    expect(second.blocked.has(copy!.id)).toBe(false);
    expect(second.blocked.has(ASI) || !second.options.some((o) => o.id === ASI)).toBe(true);
  }, 600000);

  it("a feat taken again through its repeat copy is not \"Same feat twice\" (2024 Magic Initiate, another list)", () => {
    const ch = newCharacter();
    ch.classes = [{ classId: "ID_WOTC_PHB24_CLASS_ROGUE", level: 4 }];
    ch.extras = ["ID_WOTC_PHB24_FEAT_MAGIC_INITIATE", "ID_WOTC_PHB24_FEAT_MAGIC_INITIATE_2"];
    const r = resolve(ch, reg);
    expect(r.active.filter((a) => a.el.name === "Magic Initiate" && a.el.type === "Feat")).toHaveLength(2);
    expect(checkCharacter(r, buildSheet(r), []).filter((f) => f.rule === "Same feat twice")).toEqual([]);
  }, 600000);
});
