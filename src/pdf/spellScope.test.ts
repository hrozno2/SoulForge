/**
 * The sheet's spell table and the spell cards name the same spells (one rule, readySpells and everySpellOf), for
 * random casters of both editions: SOULFORGE_RULES=<test content folder>.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "../aurora/engine";
import { buildSheet } from "../aurora/sheet";
import { randomCharacter } from "../aurora/randomCharacter";
import { buildFillData } from "../sheets/data";
import { loadTestContent } from "../engine/testContent";
import { cardSources } from "./exportPdf";

const C = process.env.SOULFORGE_RULES;
const key = (n: string) => n.toLowerCase().replace(/[’']/g, "'");

describe.skipIf(!C)("spell table and spell cards", () => {
  it("agree on the spells, prepared only and every spell", () => {
    const reg = loadTestContent(C!);
    const filters = { legacy: true, playtest: false, unusual: true, scifi: false };
    let seed = 7;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let casters = 0;
    for (const cls of ["ID_WOTC_PHB24_CLASS_CLERIC", "ID_WOTC_PHB24_CLASS_DRUID", "ID_WOTC_PHB24_CLASS_WIZARD", "ID_CLASS_CLERIC", "ID_CLASS_WIZARD", "ID_WOTC_PHB24_CLASS_BARD"]) {
      if (!reg.get(cls)) continue;
      const r = resolve(randomCharacter(reg, 7, filters, rng, { classId: cls }), reg);
      const sh = buildSheet(r);
      if (!sh.casting.length) continue;
      casters++;
      for (const [scope, all] of [["prepared", false], ["all", true]] as const) {
        const table = new Set(buildFillData(r, sh, { allSpells: all }).spells.map((s) => key(s.name)));
        const cards = new Set(cardSources(r, sh, scope).spells.map((e) => key(e.name)));
        expect([...cards].filter((n) => !table.has(n)), `${reg.get(cls)!.name} ${scope}: cards not in the table`).toEqual([]);
        expect([...table].filter((n) => !cards.has(n)), `${reg.get(cls)!.name} ${scope}: table not on cards`).toEqual([]);
      }
    }
    expect(casters).toBeGreaterThan(3);
  }, 900000);
});
