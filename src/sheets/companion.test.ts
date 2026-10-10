/** Fills the DLDM companion sheets (SHEET_FIXTURES=<folder with the PDFs>, SHEET_OUT=<folder> to keep the results). */
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { companionLayoutOfPdf, fillCompanion } from "./companion";
import type { CompanionFill } from "./data";

const SHEETS = process.env.SHEET_FIXTURES;
const font = { regular: readFileSync("node_modules/dejavu-fonts-ttf/ttf/DejaVuSansCondensed.ttf") };

const wolf: CompanionFill = {
  name: "Fang", type: "Wolf", creature: "Beast", size: "Medium", alignment: "Unaligned", cr: "1/4", ac: "13", speed: "40 ft.", hp: "11 (2d8 + 2)", hitDice: "2d8",
  abilities: { strength: "12", dexterity: "15", constitution: "12", intelligence: "3", wisdom: "12", charisma: "6" },
  skills: "Perception +3, Stealth +4", senses: "passive Perception 13", languages: "",
  traits: "Keen Hearing and Smell. The wolf has advantage on Wisdom (Perception) checks that rely on hearing or smell.\nPack Tactics. The wolf has advantage on an attack roll against a creature if at least one of the wolf's allies is within 5 feet of the creature.",
  actions: [{ name: "Bite", bonus: "+4", damage: "2d4+2 piercing" }],
};

describe.skipIf(!SHEETS)("companion sheets", () => {
  const files: [string, "mount" | "ranger"][] = [
    ["DLDM - 5E14 - Companion Sheet - Familiar.pdf", "mount"], ["DLDM - 5E14 - Companion Sheet - Paladin Mount.pdf", "mount"],
    ["DLDM - 5E14 - Companion Sheet - Beastmaster Ranger.pdf", "ranger"], ["DLDM - 5E14 - Companion Sheet - Drakewarden Ranger.pdf", "ranger"],
  ];
  for (const [f, layout] of files) {
    it(`recognises and fills ${f}`, async () => {
      const bytes = readFileSync(`${SHEETS}/${f}`);
      expect(await companionLayoutOfPdf(bytes, f)).toBe(layout);
      const out = await fillCompanion(bytes, wolf, { font, profBonus: "+2", layout });
      expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
      if (process.env.SHEET_OUT) writeFileSync(`${process.env.SHEET_OUT}/comp-${layout}-${f.includes("Familiar") ? "fam" : f.includes("Mount") ? "mount" : f.includes("Beast") ? "beast" : "drake"}.pdf`, out);
    });
  }
});
