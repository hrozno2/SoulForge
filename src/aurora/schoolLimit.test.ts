/**
 * The 5e.tools Eldritch Knight and Arcane Trickster keep their school limits, as the Aurora copies do (Chris
 * 2026-10-29). SOULFORGE_RULES for the content part.
 */
import { describe, expect, it } from "vitest";
import { schoolLimit } from "./fivetools";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { loadTestContent } from "../engine/testContent";

describe("schoolLimit", () => {
  it("reads the two schools and the any-school levels from the text", () => {
    const t = "You know three 1st-level wizard spells of your choice, two of which you must choose from the abjuration and evocation spells on the wizard spell list. The spells you learn at 8th, 14th, and 20th level can come from any school of magic.";
    expect(schoolLimit(t)).toEqual({ schools: ["Abjuration", "Evocation"], anyAt: [3, 8, 14, 20] });
    expect(schoolLimit("You learn two wizard spells of your choice.")).toBeUndefined();
  });
});

const C = process.env.SOULFORGE_RULES;
describe.skipIf(!C)("school-limited subclasses from 5e.tools", () => {
  const reg = C ? loadTestContent(C) : undefined!;
  for (const [cls, sub, schools] of [["ID_5ET_CLASS_PHB_FIGHTER", "Eldritch Knight", ["abjuration", "evocation"]], ["ID_5ET_CLASS_PHB_ROGUE", "Arcane Trickster", ["enchantment", "illusion"]]] as const) {
    it(`limits the ${sub}'s spells to ${schools.join(" and ")}, with any-school picks at 3 and 8`, () => {
      const ch = newCharacter(); ch.classes = [{ classId: cls, level: 9 }];
      let r = resolve(ch, reg);
      const s = r.slots.find((x) => x.rule.type === "Archetype")!;
      ch.selections[s.key] = [s.options.find((o) => o.name === sub && o.id.startsWith("ID_5ET_"))!.id];
      r = resolve(ch, reg);
      const spells = r.slots.filter((x) => x.rule.type === "Spell" && !/cantrip/i.test(x.rule.name));
      const limited = spells.filter((x) => !/any school/.test(x.rule.name));
      const free = spells.filter((x) => /any school/.test(x.rule.name));
      expect(limited.length).toBeGreaterThan(0);
      for (const x of limited) for (const o of x.options.filter((o) => !x.blocked.has(o.id))) expect(schools, `${x.rule.name}: ${o.name}`).toContain((o.setters.school?.value ?? "").toLowerCase());
      expect(free.reduce((n, x) => n + x.rule.number, 0)).toBe(2);
      expect(new Set(free.flatMap((x) => x.options.map((o) => (o.setters.school?.value ?? "").toLowerCase()))).size).toBeGreaterThan(2);
    }, 600000);
  }
});
