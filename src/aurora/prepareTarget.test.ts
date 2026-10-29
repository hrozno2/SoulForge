/** The spells to prepare never count higher than what there is to prepare from (C7.18). */
import { describe, expect, it } from "vitest";
import { loadRegistry } from "./fixture";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { buildSheet, preparePool, prepareTarget } from "./sheet";

const reg = loadRegistry("fixtures/content");

describe("prepareTarget", () => {
  it("is the rules' number, capped by the spells there are to prepare", () => {
    const ch = newCharacter(); ch.classes = [{ classId: "ID_SF_CLASS_SPELLSINGER", level: 3 }];
    const r = resolve(ch, reg);
    const line = buildSheet(r).casting.find((c) => c.prepare)!;
    const pool = preparePool(r, line).length;
    expect(prepareTarget(r, { ...line, prepareMax: 1 })).toBe(1);
    expect(prepareTarget(r, { ...line, prepareMax: pool + 5 })).toBe(pool);
  });
});

describe("prepared spells", () => {
  it("are at least one, however low the casting ability (minimum of one spell)", () => {
    const ch = newCharacter(); ch.classes = [{ classId: "ID_SF_CLASS_SPELLSINGER", level: 1 }];
    ch.abilityBase.charisma = 6;
    const line = buildSheet(resolve(ch, reg)).casting.find((c) => c.prepare)!;
    expect(line.prepareMax).toBe(1);
  });
});
