import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { LAYOUTS, fillOfficialSheet, identifySheet } from "./official";
import { maximal } from "./testdata";

const DIR = process.env.SHEET_FIXTURES;
const OUT = process.env.SHEET_OUT;
const font = { regular: readFileSync("node_modules/dejavu-fonts-ttf/ttf/DejaVuSansCondensed.ttf") };

describe("known layouts", () => {
  it("every layout has fields on its pages", () => {
    for (const [id, l] of Object.entries(LAYOUTS)) expect(l.widgets.filter((w) => w.t === "Tx").length, id).toBeGreaterThan(5);
  });
});

/** Fills every PDF in SHEET_FIXTURES that Soul Forge recognises, and keeps the results (SHEET_OUT) to look at. */
describe.skipIf(!DIR)("official sheets from a folder", () => {
  const files = DIR ? readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".pdf")) : [];
  for (const f of files) {
    it(`fills ${f}`, async () => {
      const bytes = readFileSync(join(DIR!, f));
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const id = identifySheet(doc, f);
      if (!id) return;
      const res = await fillOfficialSheet(bytes, f, maximal(), font);
      expect(res.layout).toBe(id.layout);
      if (OUT) {
        mkdirSync(OUT, { recursive: true });
        writeFileSync(join(OUT, f), res.bytes);
      }
    });
  }
});
