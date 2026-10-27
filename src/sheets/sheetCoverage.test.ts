/**
 * Every field of every known sheet (A3.2): the fully loaded test character fills each official sheet in the test
 * content folder, and every text field left empty is listed per sheet, with a coverage figure, in
 * <cache>/sheets/coverage.md. A field the character has data for and the sheet leaves empty is a mapping gap.
 * SOULFORGE_RULES=<test content folder> with sheets/ (and sheets/unzipped/ for the 2014 pack).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument, PDFTextField } from "pdf-lib";
import { fillOfficialSheet, identifySheet } from "./official";
import { maximal } from "./testdata";

const C = process.env.SOULFORGE_RULES;
const DIRS = C ? [join(C, "sheets"), join(C, "sheets", "unzipped")] : [];
const font = { regular: readFileSync("node_modules/dejavu-fonts-ttf/ttf/DejaVuSansCondensed.ttf") };

describe.skipIf(!C || !existsSync(join(C ?? "", "sheets")))("sheet coverage", () => {
  it("fills every text field it can, per sheet", async () => {
    const out: string[] = ["# Sheet coverage", "", "| Sheet | Layout | Text fields | Filled | Coverage |", "|---|---|---|---|---|"];
    const detail: string[] = [];
    // Fields Soul Forge has nothing for: Alternative 2's spell attack damage (the spell rows carry no damage), its
    // equipment notes and gems.
    const ACCEPTED = /^(spa\d\.dmg|eq\d\.note|gems)$/;
    const gaps: string[] = [];
    for (const dir of DIRS.filter((d) => existsSync(d))) {
      for (const f of readdirSync(dir).filter((x) => x.toLowerCase().endsWith(".pdf")).sort()) {
        const bytes = readFileSync(join(dir, f));
        const id = identifySheet(await PDFDocument.load(bytes, { ignoreEncryption: true }), f);
        if (!id) continue;
        const res = await fillOfficialSheet(bytes, f, maximal(), font);
        const doc = await PDFDocument.load(res.bytes, { ignoreEncryption: true });
        let fields: PDFTextField[] = [];
        try { fields = doc.getForm().getFields().filter((x): x is PDFTextField => x instanceof PDFTextField); } catch { /* no form: printed version drawn over */ }
        if (!fields.length) { out.push(`| ${f} | ${id.layout} | drawn (no form) | - | - |`); continue; }
        // A name the PDF uses for two places (a slip in WotC's own file) is one field; the fill draws its values onto
        // the page instead, so it counts as filled.
        const empty = fields.filter((x) => !(x.getText() ?? "").trim() && x.acroField.getWidgets().length < 2).map((x) => x.getName());
        const filled = fields.length - empty.length;
        out.push(`| ${f} | ${id.layout} | ${fields.length} | ${filled} | ${Math.round((filled / fields.length) * 100)}% |`);
        detail.push(`## ${f}`, "", `Empty: ${empty.join(", ") || "none"}`, "");
        gaps.push(...empty.filter((n) => !ACCEPTED.test(n)).map((n) => `${f}: ${n}`));
      }
    }
    writeFileSync(join(C!, "sheets", "coverage.md"), [...out, "", ...detail].join("\n"));
    console.log(out.join("\n"));
    expect(gaps).toEqual([]);
  }, 600000);
});
