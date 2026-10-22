/**
 * Writes the Soul Forge sheet for a saved character to a PDF, for looking at the layout while working on it
 * (RULES_TIER=sheet; SHEET_CHARACTER is the saved character's file, SHEET_OUT the PDF to write).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { normalizeCharacter } from "../aurora/character";
import { resolve } from "../aurora/engine";
import { buildSheet } from "../aurora/sheet";
import { loadTestContent } from "../engine/testContent";
import { buildPdf, DEFAULT_PDF_OPTIONS } from "./exportPdf";

it.skipIf(process.env.RULES_TIER !== "sheet")("draws the sheet for a saved character", async () => {
  const reg = loadTestContent(process.env.SOULFORGE_RULES!);
  const ch = normalizeCharacter(JSON.parse(readFileSync(process.env.SHEET_CHARACTER!, "utf8")));
  const r = resolve(ch, reg);
  const font = { regular: readFileSync("node_modules/dejavu-fonts-ttf/ttf/DejaVuSansCondensed.ttf"), bold: readFileSync("node_modules/dejavu-fonts-ttf/ttf/DejaVuSansCondensed-Bold.ttf") };
  const pdf = await buildPdf(r, buildSheet(r), { ...DEFAULT_PDF_OPTIONS, paper: "letter", spellCards: false, itemCards: false, featureCards: false, tips: false }, font);
  writeFileSync(process.env.SHEET_OUT!, pdf);
}, 600000);
