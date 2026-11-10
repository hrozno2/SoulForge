/**
 * The three small languages content is written in (requirements, `supports` filters, statistic formulas) come from
 * files the app did not write. Whatever they hold, reading them must not throw (docs/AUDIT-2026-11-10.md, H6).
 */
import { describe, expect, it } from "vitest";
import { matchesSupports } from "./registry";
import { explainUnmet, meets, type ReqCtx } from "./requirements";
import { evalFormula } from "./stats";
import type { AElement } from "./types";

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const PIECES = ["ID_A", "ID_B_C", "!", "(", ")", ",", "||", "&&", "|", "[", "]", "[str:13]", "[level:5]", "[character:", "[type:Feat]", "[armor:none]", ":", "{", "}", "{level}", "{a:b}", "+", "-", "*", "/", "0", "12", "3.5", "floor", "min", "max(", " ", "  ", "Wizard", "$(spellcasting:list)", "$(", "é", "\u0000", "\n", "''", "\"", "<b>", "1/4", "!!", "(((", ")))", ",,", "||||"];
const junk = (rng: () => number) => Array.from({ length: 1 + Math.floor(rng() * 14) }, () => PIECES[Math.floor(rng() * PIECES.length)]).join(rng() < 0.3 ? " " : "");

const ctx: ReqCtx = { hasId: (id) => id.length % 2 === 0, hasType: () => true, level: 5, characterLevel: 7, stat: (n) => n.length, equipped: () => true };
ctx.as = () => ctx;
const el = { id: "ID_X", name: "X", type: "Spell", source: "S", supports: ["Wizard", "Evocation"], description: "", compendiumHidden: false, setters: { level: { value: "3", attrs: {} } }, rules: [] } as AElement;

describe("content's small languages never throw", () => {
  it("requirements, filters and formulas on 6,000 random strings", () => {
    const rng = seeded(99);
    for (let i = 0; i < 6000; i++) {
      const s = junk(rng);
      try {
        expect(typeof meets(s, ctx)).toBe("boolean");
        expect(typeof meets(s, ctx, true)).toBe("boolean");
        explainUnmet(s, ctx);
        expect(typeof matchesSupports(el, s)).toBe("boolean");
        expect(Number.isNaN(evalFormula(s, (n) => n.length))).toBe(false);
      } catch (e) {
        throw new Error(`case ${i}, ${JSON.stringify(s)}: ${(e as Error).message}`);
      }
    }
  });

  it("the obvious ones still read right", () => {
    // The test's character "has" ids of even length.
    expect(meets("ID_ABC,[level:5]", ctx)).toBe(true);
    expect(meets("ID_ABC,[level:6]", ctx)).toBe(false);
    expect(meets("ID_AB||ID_ABC", ctx)).toBe(true);
    expect(meets("!ID_ABC", ctx)).toBe(false);
    expect(matchesSupports(el, "Wizard,3")).toBe(true);
    expect(matchesSupports(el, "Cleric||Evocation")).toBe(true);
    expect(matchesSupports(el, "!Wizard")).toBe(false);
    expect(evalFormula("2 * {abc} + floor(7 / 2)", (n) => n.length)).toBe(9);
  });
});
