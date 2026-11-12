/**
 * A score may pass 20 only where a rule raises its maximum, and then it must (2026-11-12): Primal Champion's +4 (to
 * 24 in 2014, 25 in 2024) and an Epic Boon's +1 (to 30) stopped at 20 on every content set, because the stat book
 * read the raised maximum under another name than the content writes it. Found by a FastCharacter Barbarian 20.
 */
import { describe, expect, it } from "vitest";
import { newCharacter, type Character } from "./character";
import { resolve } from "./engine";
import { checkCharacter } from "./rulesCheck";
import { buildSheet } from "./sheet";
import { loadContentSet } from "../engine/testContent";

describe("ability scores above 20", () => {
  const reg = loadContentSet("", "srd");
  const barbarian = (edition: string) => reg.ofType("Class").find((c) => c.name === "Barbarian" && c.source.includes(edition))!;
  const at = (classId: string, level: number, strength: number): Character => ({ ...newCharacter(), classes: [{ classId, level }], abilityMethod: "manual", abilityBase: { ...newCharacter().abilityBase, strength, constitution: 16 } });
  const str = (ch: Character) => buildSheet(resolve(ch, reg)).abilities[0].score;

  it("Primal Champion adds 4 to Strength and Constitution, to 24 (2014) and 25 (2024)", () => {
    for (const [edition, top] of [["2014", 24], ["2024", 25]] as const) {
      const id = barbarian(edition).id;
      expect(str(at(id, 19, 18)), `${edition} at 19`).toBe(18);
      expect(str(at(id, 20, 18)), `${edition} at 20`).toBe(22);
      expect(str(at(id, 20, 20)), `${edition} from 20`).toBe(24);
      const r = resolve(at(id, 20, 20), reg);
      const sh = buildSheet(r);
      expect(sh.abilities[2].score).toBe(20);
      expect(checkCharacter(r, sh, []).filter((f) => /maximum/.test(f.rule))).toEqual([]);
      // No further than the raised maximum, whatever the increases add up to.
      expect(str({ ...at(id, 20, 20), customStats: [{ id: "x", stat: "strength", value: 5 }] })).toBe(top);
    }
  });

  it("nothing else lifts a score past 20", () => {
    const id = barbarian("2024").id;
    expect(str({ ...at(id, 10, 20), customStats: [{ id: "x", stat: "strength", value: 3 }] })).toBe(20);
  });

  it("an Epic Boon's +1 goes past 20, for the score chosen and no other", () => {
    const boon = reg.ofType("Feat").find((f) => /^Boon of /.test(f.name));
    expect(boon, "an Epic Boon in the free rules").toBeTruthy();
    const base: Character = { ...at(barbarian("2024").id, 19, 20), extras: [boon!.id], abilityBase: { ...newCharacter().abilityBase, strength: 20, constitution: 20 } };
    const slot = resolve(base, reg).slots.find((s) => s.owner.id === boon!.id && s.rule.type === "Ability Score Improvement")!;
    const pick = slot.options.find((o) => /strength/i.test(o.name))!;
    const sh = buildSheet(resolve({ ...base, selections: { [slot.key]: [pick.id] }, customStats: [{ id: "x", stat: "constitution", value: 1 }] }, reg));
    expect(sh.abilities[0].score).toBe(21);
    expect(sh.abilities[2].score).toBe(20);
  });
});
