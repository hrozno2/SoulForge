import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildPdf, DEFAULT_PDF_OPTIONS, type FontData } from "./exportPdf";
import { Registry } from "../engine/registry";
import { computeSheet, newCharacter } from "../engine/compute";
import { starterPack } from "../content/starter";
import type { Element } from "../engine/types";

const dir = "node_modules/dejavu-fonts-ttf/ttf";
const fonts: FontData = {
  regular: readFileSync(`${dir}/DejaVuSansCondensed.ttf`),
  bold: readFileSync(`${dir}/DejaVuSansCondensed-Bold.ttf`),
};

const spells: Element[] = Array.from({ length: 11 }, (_, i) => ({
  id: `spell-${i}`,
  type: "spell" as const,
  name: i === 0 ? "Žiarivý lúč ťažkej noci" : `Spell ${i}`,
  description: "You create a shimmering effect. ".repeat(i === 1 ? 80 : 6),
  meta: { level: String(i % 4), school: "Evocation", time: "Action", range: "60 feet", duration: "Instantaneous", hasVerbalComponent: "true", hasMaterialComponent: "true", materialComponent: "a pinch of sulfur" },
}));

describe("pdf export", () => {
  it("builds a sheet plus cards, with diacritics and overflow text", async () => {
    const reg = new Registry();
    reg.addPack(starterPack);
    reg.addPack({ id: "t", name: "t", elements: spells });
    const ch = newCharacter();
    ch.name = "Čeněk Šťastný";
    ch.class = "class-wizard";
    ch.species = "species-dwarf";
    ch.extras = [...spells.map((s) => s.id), "item-shield-example", "feat-tough-example"];
    const sheet = computeSheet(ch, reg);
    const bytes = await buildPdf(ch, sheet, DEFAULT_PDF_OPTIONS, fonts);
    const doc = await PDFDocument.load(bytes);
    // 1 sheet page, then 13 cards = 2 pages of cards
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("respects the options and paper size", async () => {
    const reg = new Registry();
    reg.addPack(starterPack);
    const ch = newCharacter();
    const sheet = computeSheet(ch, reg);
    const bytes = await buildPdf(ch, sheet, { ...DEFAULT_PDF_OPTIONS, paper: "letter", spellCards: false, itemCards: false, featureCards: false }, fonts);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  });
});
