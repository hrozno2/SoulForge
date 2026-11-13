/**
 * "Print the entire spellbook" ticked (C7.9): the spell cards hold every spell the character can prepare, not only
 * today's (Chris, 2026-11-12: a Wizard 4 exported on the DLDM sheet had 19 spells on the sheet and 12 cards). The
 * fillable-sheet export left the card scope out and got the prepared-only default; the scope is now a required
 * option, and this checks what each scope gives on the bundled free rules (runs in CI).
 */
import { describe, expect, it } from "vitest";
import { newCharacter } from "../aurora/character";
import { autoFill } from "../aurora/autofill";
import { resolve } from "../aurora/engine";
import { buildSheet } from "../aurora/sheet";
import { buildFillData } from "../sheets/data";
import { loadContentSet } from "../engine/testContent";
import { cardSources } from "./exportPdf";

describe("spell cards for the entire spellbook", () => {
  const reg = loadContentSet("", "srd");
  for (const edition of ["2014", "2024"]) {
    it(`a ${edition} Wizard gets a card for every spell in the spellbook, prepared or not`, () => {
      const wizard = reg.ofType("Class").find((c) => c.name === "Wizard" && c.source.includes(edition))!;
      const ch = autoFill({ ...newCharacter(), classes: [{ classId: wizard.id, level: 5 }] }, reg);
      // Two spells prepared today, the rest only in the book.
      const line = buildSheet(resolve(ch, reg)).casting.find((c) => c.name === "Wizard")!;
      const book = line.spells.map((p) => p.id);
      expect(book.length).toBeGreaterThan(6);
      const today = { ...ch, prepared: { ...ch.prepared, Wizard: book.slice(0, 2) } };
      const r = resolve(today, reg);
      const sh = buildSheet(r);
      const name = (id: string) => reg.get(id)!.name;
      const all = new Set(cardSources(r, sh, "all").spells.map((e) => e.name));
      const prepared = new Set(cardSources(r, sh, "prepared").spells.map((e) => e.name));
      for (const id of book) expect(all.has(name(id)), `${name(id)} has a card`).toBe(true);
      expect(prepared.size).toBeLessThan(all.size);
      // The sheet's spell list with the same choice names the same spells.
      const table = new Set(buildFillData(r, sh, { allSpells: true }).spells.map((s) => s.name));
      expect([...all].filter((n) => !table.has(n))).toEqual([]);
      expect([...table].filter((n) => !all.has(n))).toEqual([]);
    });
  }
});

describe("the cards added to a fillable sheet", () => {
  it("follow the sheet's spell scope", async () => {
    const { extraCardOptions } = await import("../ui/SheetExport");
    const cards = { spells: true, items: false, features: false, tips: true };
    expect(extraCardOptions(cards, true).spellCardScope).toBe("all");
    expect(extraCardOptions(cards, false).spellCardScope).toBe("prepared");
    expect(extraCardOptions(cards, true)).toMatchObject({ sheet: false, spellCards: true, tips: true });
  });
});
