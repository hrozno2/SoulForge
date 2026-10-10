/**
 * Fills the  with a character built from real content and checks the result.
 * Needs the PDFs and content, which are not in the repository:
 *   SHEET_FIXTURES=<folder with the PDFs>  AURORA_FIXTURES_2014=<content folder>
 * Set SHEET_OUT to also write the filled PDF for a look.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadRegistry } from "../aurora/fixture";
import { resolve } from "../aurora/engine";
import { autoFill } from "../aurora/autofill";
import { buildSheet } from "../aurora/sheet";
import { newCharacter } from "../aurora/character";
import { buildFillData } from "./data";
import { fillWotc } from "./wotc";
import { buildPdf } from "../pdf/exportPdf";

const CONTENT = process.env.AURORA_FIXTURES_2014;
const OFFICIAL = process.env.WOTC_PDF;
const font = { regular: readFileSync("node_modules/dejavu-fonts-ttf/ttf/DejaVuSansCondensed.ttf"), bold: readFileSync("node_modules/dejavu-fonts-ttf/ttf/DejaVuSansCondensed-Bold.ttf") };
describe.skipIf(!OFFICIAL || !CONTENT)("official 2024 sheet", () => {
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

  it("fills both pages", async () => {
    const { r, sheet } = make();
    const res = await fillWotc(readFileSync(OFFICIAL!), buildFillData(r, sheet), { pages: ["page1", "page2"], font });
    expect(res.bytes.length).toBeGreaterThan(1000);
    if (process.env.SHEET_OUT) writeFileSync(`${process.env.SHEET_OUT}/wotc.pdf`, res.bytes);
  });

  it("builds the Soul Forge PDF with tips", async () => {
    const { r, sheet } = make();
    const bytes = await buildPdf(r, sheet, { paper: "letter", sheet: false, spellCards: false, itemCards: false, featureCards: false, tips: true }, font);
    if (process.env.SHEET_OUT) writeFileSync(`${process.env.SHEET_OUT}/tips.pdf`, bytes);
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("builds the Soul Forge sheet in the official layout", async () => {
    const { r, sheet } = make();
    const bytes = await buildPdf(r, sheet, { paper: "letter", sheet: true, spellCards: false, itemCards: false, featureCards: false, tips: false }, font);
    if (process.env.SHEET_OUT) writeFileSync(`${process.env.SHEET_OUT}/sf.pdf`, bytes);
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
