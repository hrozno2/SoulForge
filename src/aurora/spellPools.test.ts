/**
 * A class's spells known or prepared are one list (Chris, 2026-10-28): the 2024 Bard's first four spells were "1st
 * level" and the rest "levels with slots", so the board showed two lists and five 1st-level spells could not be had.
 * The registry pass makes them one pool; this checks the pass, and with SOULFORGE_RULES every class in the content.
 */
import { describe, expect, it } from "vitest";
import { spellChoicePools } from "./registry";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { mergeSlots } from "../ui/Slots";
import { loadTestContent } from "../engine/testContent";
import type { AElement } from "./types";

const sel = (name: string, supports: string) => ({ kind: "select", type: "Spell", name, supports, number: 4, spellcasting: "Bard" });

describe("spell choice pools", () => {
  it("opens a class's 1st-level spell choice to every level with slots, but keeps a spellbook and Mystic Arcanum", () => {
    const el = { id: "X", type: "Class Feature", name: "Spellcasting", rules: [
      sel("Spell (Bard)", "$(spellcasting:list), 1"), sel("Spellbook (Wizard)", "$(spellcasting:list), 1"),
      sel("Level 6 spell (Warlock 11)", "$(spellcasting:list), 6"), sel("Cantrip (Bard)", "$(spellcasting:list), 0"),
    ] } as unknown as AElement;
    expect(spellChoicePools(new Map([["X", el]]))).toBe(1);
    expect(el.rules.map((r: any) => r.supports)).toEqual(["$(spellcasting:list), $(spellcasting:slots)", "$(spellcasting:list), 1", "$(spellcasting:list), 6", "$(spellcasting:list), 0"]);
  });

  it("leaves a feat's or species trait's spells alone: their own list, their own level (C7.1)", () => {
    for (const type of ["Feat", "Racial Trait", "Feat Feature"]) {
      const el = { id: "F", type, name: "Magic Initiate", rules: [sel("Level 1 spell (Magic Initiate)", "$(spellcasting:list), 1")] } as unknown as AElement;
      expect(spellChoicePools(new Map([["F", el]]))).toBe(0);
    }
  });
});

const C = process.env.SOULFORGE_RULES;
describe.skipIf(!C)("every class's spells are one list", () => {
  const reg = C ? loadTestContent(C) : undefined!;
  it("merges each class's own spell choices (not cantrips, not a wizard's first spellbook pages) into one", () => {
    const split: string[] = [];
    for (const cls of reg.ofType("Class")) {
      const ch = newCharacter(); ch.classes = [{ classId: cls.id, level: 9 }];
      const r = resolve(ch, reg);
      const own = r.slots.filter((s) => s.rule.type === "Spell" && s.rule.spellcasting && !/^spellbook/i.test(s.rule.name) && /\$\(spellcasting:slots\)|, 1\s*$/.test(s.rule.supports ?? ""));
      const names = mergeSlots(own).map((s) => s.rule.name);
      const twice = names.filter((n, i) => names.indexOf(n) !== i);
      if (twice.length) split.push(`${cls.id}: ${[...new Set(twice)].join(", ")}`);
    }
    expect(split).toEqual([]);
  }, 1800000);
});
