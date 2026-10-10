import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildPdf, cardCounts, DEFAULT_PDF_OPTIONS, type FontData } from "./exportPdf";
import { ARegistry } from "../aurora/registry";
import { parseElementsXml } from "../aurora/parse";
import { nodeXml } from "../aurora/fixture";
import { resolve } from "../aurora/engine";
import { buildSheet } from "../aurora/sheet";
import { newCharacter } from "../aurora/character";

const dir = "node_modules/dejavu-fonts-ttf/ttf";
const fonts: FontData = {
  regular: readFileSync(`${dir}/DejaVuSansCondensed.ttf`),
  bold: readFileSync(`${dir}/DejaVuSansCondensed-Bold.ttf`),
};

const spells = Array.from({ length: 11 }, (_, i) => `
  <element name="${i === 0 ? "Žiarivý lúč ťažkej noci" : `Spell ${i}`}" type="Spell" source="T" id="ID_SPELL_${i}">
    <supports>Wizard</supports>
    <description><p>${"You create a shimmering effect. ".repeat(i === 1 ? 80 : 6)}</p></description>
    <setters><set name="level">${i % 4}</set><set name="school">Evocation</set><set name="time">Action</set><set name="range">60 feet</set>
      <set name="duration">Instantaneous</set><set name="hasVerbalComponent">true</set><set name="hasMaterialComponent">true</set><set name="materialComponent">a pinch of sulfur</set></setters>
  </element>`).join("");

const XML = `<elements>
  <element name="Wizard" type="Class" source="T" id="ID_WIZ"><setters><set name="hd">d6</set></setters>
    <spellcasting name="Wizard" ability="Intelligence" prepare="true"><list>Wizard</list></spellcasting>
    <rules>${spells.match(/ID_SPELL_\d+/g)!.map((id) => `<grant type="Spell" id="${id}" spellcasting="Wizard" />`).join("")}
      <stat name="wizard:spellcasting:slots:1" value="2" /></rules></element>
  <element name="Longsword" type="Weapon" source="T" id="ID_LS"><setters><set name="damage" type="slashing">1d8</set><set name="weight" lb="3">3 lb.</set></setters><description><p>A blade.</p></description></element>
  ${spells}
</elements>`;

function setup() {
  const reg = new ARegistry();
  reg.addFile(parseElementsXml(XML, nodeXml));
  reg.build();
  const ch = newCharacter();
  ch.name = "Čeněk Šťastný";
  ch.classes = [{ classId: "ID_WIZ", level: 1 }];
  ch.inventory = [{ uid: "a", id: "ID_LS", qty: 1, equipped: true, attuned: false }];
  const r = resolve(ch, reg);
  return { r, sheet: buildSheet(r) };
}

describe("pdf export", () => {
  it("builds a sheet plus cards, with diacritics and overflow text", async () => {
    const { r, sheet } = setup();
    expect(cardCounts(r, sheet).spells).toBe(11);
    const bytes = await buildPdf(r, sheet, DEFAULT_PDF_OPTIONS, fonts);
    const doc = await PDFDocument.load(bytes);
    // 1 sheet page, then 12 cards in two pages of nine
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("respects the options and paper size", async () => {
    const { r, sheet } = setup();
    const bytes = await buildPdf(r, sheet, { ...DEFAULT_PDF_OPTIONS, paper: "letter", spellCards: false, itemCards: false, featureCards: false, tips: false }, fonts);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  });
});
