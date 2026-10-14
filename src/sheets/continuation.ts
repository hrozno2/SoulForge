/**
 * Continuation pages for the standard sheets: spells that do not fit a sheet's own spell table are added at the end
 * of the PDF in a table of the same kind, so nothing is cut off (plan principle P6).
 */
import { rgb, type PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";
import type { SpellRow } from "./data";

const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.42, 0.42, 0.45);
const RULE = rgb(0.75, 0.75, 0.78);

/** Shortens text to a width, ending with "..." when cut. */
function fit(font: PDFFont, text: string, size: number, width: number): string {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > width) t = t.slice(0, -1);
  return `${t}...`;
}

/**
 * Adds pages listing `rows` after the last page. `title` names what continues ("Spells, continued"); `who` is the
 * character's name. The prepared box is filled for prepared spells; cantrips have none.
 */
export function appendSpellPages(doc: PDFDocument, font: PDFFont, rows: SpellRow[], title: string, who: string): number {
  if (!rows.length) return 0;
  const first = doc.getPage(0);
  const { width: W, height: H } = first.getSize();
  const M = 36;
  const rowH = 15;
  const cols = [
    { key: "prep", label: "Prep", w: 26 },
    { key: "level", label: "Lvl", w: 24 },
    { key: "name", label: "Spell", w: 150 },
    { key: "time", label: "Time", w: 46 },
    { key: "range", label: "Range", w: 56 },
    { key: "duration", label: "Duration", w: 64 },
    { key: "crm", label: "C R M", w: 38 },
    { key: "notes", label: "Notes", w: 0 },
  ];
  const used = cols.reduce((t, c) => t + c.w, 0);
  cols[cols.length - 1].w = W - 2 * M - used;
  const perPage = Math.floor((H - 2 * M - 46) / rowH);
  let pages = 0;
  for (let start = 0; start < rows.length; start += perPage) {
    const page: PDFPage = doc.addPage([W, H]);
    pages++;
    page.drawText(fit(font, `${who}: ${title}`, 13, W - 2 * M), { x: M, y: H - M - 4, size: 13, font, color: INK });
    let y = H - M - 30;
    let x = M;
    for (const c of cols) {
      page.drawText(c.label, { x: x + 2, y, size: 7.5, font, color: MUTED });
      x += c.w;
    }
    y -= 5;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: INK });
    for (const sp of rows.slice(start, start + perPage)) {
      y -= rowH;
      x = M;
      const cell: Record<string, string> = {
        level: sp.level === "0" ? "C" : sp.level,
        name: sp.name,
        time: sp.time,
        range: sp.range,
        duration: sp.duration,
        crm: [sp.concentration ? "C" : "-", sp.ritual ? "R" : "-", sp.m ? "M" : "-"].join(" "),
        notes: sp.notes,
      };
      for (const c of cols) {
        if (c.key === "prep") {
          if (sp.level !== "0") {
            page.drawRectangle({ x: x + 8, y: y + 2, width: 8, height: 8, borderColor: INK, borderWidth: 0.7, color: sp.prepared ? INK : undefined });
          }
        } else {
          page.drawText(fit(font, cell[c.key] ?? "", 8.5, c.w - 4), { x: x + 2, y: y + 3, size: 8.5, font, color: INK });
        }
        x += c.w;
      }
      page.drawLine({ start: { x: M, y: y - 1 }, end: { x: W - M, y: y - 1 }, thickness: 0.3, color: RULE });
    }
    page.drawText(`Filled box: prepared today. C R M: concentration, ritual, material component.`, { x: M, y: M - 10, size: 7, font, color: MUTED });
  }
  return pages;
}
