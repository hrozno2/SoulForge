/**
 * Fills the DLDM 5E24 sheets with a character built from real content and checks the result.
 * Needs the PDFs and content, which are not in the repository:
 *   SHEET_FIXTURES=<folder with the PDFs>  AURORA_FIXTURES_2014=<content folder>
 * Set SHEET_OUT to also write the filled PDF for a look.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { loadRegistry } from "../aurora/fixture";
import { resolve } from "../aurora/engine";
import { autoFill } from "../aurora/autofill";
import { buildSheet } from "../aurora/sheet";
import { newCharacter, ABILITY_IDS } from "../aurora/character";
import { buildFillData } from "./data";
import { fillDldm, inspectDldm } from "./dldm";
import { readWidgets } from "./widgets";

const SHEETS = process.env.SHEET_FIXTURES;
const CONTENT = process.env.AURORA_FIXTURES_2014;
const font = { regular: readFileSync("node_modules/dejavu-fonts-ttf/ttf/DejaVuSansCondensed.ttf") };

describe.skipIf(!SHEETS || !CONTENT)("DLDM 5E24 sheets", () => {
  const reg = CONTENT ? loadRegistry(CONTENT) : undefined;
  const make = () => {
    const by = (t: string, n: string) => reg!.ofType(t).find((e) => e.name === n)!;
    let ch = newCharacter();
    ch.name = "Čeněk the Wise";
    ch.race = by("Race", "Elf").id;
    ch.background = by("Background", "Sage").id;
    ch.classes = [{ classId: by("Class", "Wizard").id, level: 5 }];
    ch.abilityBase = { strength: 8, dexterity: 14, constitution: 14, intelligence: 16, wisdom: 12, charisma: 10 };
    ch = autoFill(ch, reg!);
    const item = (n: string) => reg!.ofType("Weapon").concat(reg!.ofType("Item")).find((e) => e.name === n)!;
    ch.inventory = [{ uid: "1", id: item("Dagger").id, qty: 1, equipped: true, attuned: false }, { uid: "2", id: item("Backpack").id, qty: 1, equipped: false, attuned: false }];
    ch.coins.gp = 25;
    ch.info.alignment = "Neutral Good";
    ch.info.backstory = "Raised in a library tower. Likes cats.";
    const r = resolve(ch, reg!);
    return { r, sheet: buildSheet(r) };
  };

  it("recognises the pages of the five-page file", async () => {
    const pages = await inspectDldm(readFileSync(`${SHEETS}/DLDM - 5E24 CHARACTER SHEET - 5pg - Updated Form Fields.pdf`));
    expect(pages.sort()).toEqual(["p1a", "p1b", "p2a", "p2b", "spells"]);
  });

  it("recognises the single page files", async () => {
    const one = async (f: string) => (await inspectDldm(readFileSync(`${SHEETS}/${f}`)))[0];
    expect(await one("DLDM - 5E24 CHARACTER SHEET - Page1 - A.pdf")).toBe("p1a");
    expect(await one("DLDM - 5E24 CHARACTER SHEET - Page1 - B.pdf")).toBe("p1b");
    expect(await one("DLDM - 5E24 CHARACTER SHEET - Page2 - A.pdf")).toBe("p2a");
    expect(await one("DLDM - 5E24 CHARACTER SHEET - Page2 - B.pdf")).toBe("p2b");
    expect(await one("DLDM - 5E24 CHARACTER SHEET - Spells.pdf")).toBe("spells");
  });

  it("fills every page with the character's figures", async () => {
    const { r, sheet } = make();
    const data = buildFillData(r, sheet);
    const out = await fillDldm(readFileSync(`${SHEETS}/DLDM - 5E24 CHARACTER SHEET - 5pg - Updated Form Fields.pdf`), data, { pages: ["p1a", "p1b", "p2a", "p2b", "spells"], font });
    if (process.env.SHEET_OUT) writeFileSync(process.env.SHEET_OUT, out.bytes);
    expect(out.missing).toEqual([]);
    const doc = await PDFDocument.load(out.bytes);
    const form = doc.getForm();
    const text = (n: string) => form.getTextField(n).getText();
    expect(text("Name")).toBe("Čeněk the Wise");
    expect(text("Class")).toBe("Wizard");
    expect(text("Level")).toBe("5");
    expect(text("AC")).toBe(String(sheet.ac.value));
    expect(text("Max HP")).toBe(String(sheet.hp));
    for (const a of sheet.abilities) expect(a.score).toBeGreaterThan(0);
    expect(text("INT SCORE")).toBe(String(sheet.abilities.find((a) => a.id === "intelligence")!.score));
    expect(text("ARCANA")).toBe(`+${sheet.skills.find((s) => s.name === "arcana")!.bonus}`);
    // The sheet's three spellcasting fields are named one box off; the DC goes in the middle box, whatever its name.
    expect(text("SPELLCASTING MOD24")).toBe(String(sheet.casting[0].dc));
    expect(form.getCheckBox("CB-INTSAVE").isChecked()).toBe(true);
    // The blank sheet comes with attunement boxes 6 to 10 ticked; with no magic items they must come out clear.
    for (let i = 1; i <= 10; i++) expect(form.getCheckBox(`CB-ATTUNE${i}`).isChecked()).toBe(false);
    expect(text("COIN9")).toBe("25");
    // Filling only the first page still clears the boxes the blank sheet came with ticked.
    const one = await PDFDocument.load((await fillDldm(readFileSync(`${SHEETS}/DLDM - 5E24 CHARACTER SHEET - 5pg - Updated Form Fields.pdf`), data, { pages: ["p1a"], font })).bytes);
    for (let i = 6; i <= 10; i++) expect(one.getForm().getCheckBox(`CB-ATTUNE${i}`).isChecked()).toBe(false);
    void ABILITY_IDS;
  });

  it("keeps only the pages asked for", async () => {
    const { r, sheet } = make();
    const out = await fillDldm(readFileSync(`${SHEETS}/DLDM - 5E24 CHARACTER SHEET - 5pg - Updated Form Fields.pdf`), buildFillData(r, sheet), { pages: ["p1a", "spells"], font });
    expect(out.pages.sort()).toEqual(["p1a", "spells"]);
    expect((await PDFDocument.load(out.bytes)).getPageCount()).toBe(2);
  });

  it("fills the spell rows of both spell pages independently", async () => {
    const { r, sheet } = make();
    const data = buildFillData(r, sheet);
    expect(data.spells.length).toBeGreaterThan(2);
    const out = await fillDldm(readFileSync(`${SHEETS}/DLDM - 5E24 CHARACTER SHEET - 5pg - Updated Form Fields.pdf`), data, { pages: ["p2a", "spells"], font });
    const doc = await PDFDocument.load(out.bytes);
    const form = doc.getForm();
    const cells = readWidgets(doc).filter((w) => w.type === "Tx" && w.y > 570 && w.y < 600);
    const read = (page: number, x: number) => form.getTextField(cells.find((w) => w.page === page && Math.abs(w.x - x) <= 6)!.name).getText();
    // page 2A: name at x 43, casting time at 155, range at 189
    expect(read(0, 43)).toBe(data.spells[0].name);
    expect(read(0, 155)).toBe(data.spells[0].time);
    expect(read(0, 189)).toBe(data.spells[0].range);
    // spell list page: name at x 42, school at 124, casting time at 166
    expect(read(1, 42)).toBe(data.spells[0].name);
    expect(read(1, 124)).toBe(data.spells[0].school);
    expect(read(1, 166)).toBe(data.spells[0].time);
  });
});
