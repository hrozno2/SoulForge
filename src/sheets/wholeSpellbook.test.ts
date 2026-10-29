/** "Print the entire spellbook" (C7.9): every prepare box blank but the always-prepared, and how many to prepare. */
import { describe, expect, it } from "vitest";
import { loadRegistry } from "../aurora/fixture";
import { newCharacter } from "../aurora/character";
import { resolve } from "../aurora/engine";
import { buildSheet, preparePool } from "../aurora/sheet";
import { buildFillData } from "./data";

const reg = loadRegistry("fixtures/content");

describe("the entire spellbook on a sheet", () => {
  const ch = newCharacter();
  ch.classes = [{ classId: "ID_SF_CLASS_SPELLSINGER", level: 3 }];
  let r = resolve(ch, reg);
  const line = buildSheet(r).casting.find((c) => c.prepare)!;
  const first = preparePool(r, line).find((e) => e.setters.level?.value !== "0")!;
  ch.prepared = { [line.name]: [first.id] };
  r = resolve(ch, reg);
  const sh = buildSheet(r);

  it("leaves every prepare box blank and says how many to prepare", () => {
    const d = buildFillData(r, sh, { allSpells: true });
    expect(d.spells.filter((s) => s.prepared && !/always prepared/.test(s.notes))).toEqual([]);
    expect(d.otherCasting.some((l) => /prepare \d+ spells each day/.test(l))).toBe(true);
  });

  it("marks today's prepared spells when only those are printed", () => {
    const d = buildFillData(r, sh, { allSpells: false });
    expect(d.spells.find((s) => s.name === first.name)?.prepared).toBe(true);
    expect(d.otherCasting.some((l) => /prepare \d+ spells/.test(l))).toBe(false);
  });
});
