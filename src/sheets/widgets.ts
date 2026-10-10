import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString, type PDFPage } from "pdf-lib";

export interface Widget {
  /** Full field name, as the form knows it. Several widgets can share one name. */
  name: string;
  /** "Tx" text, "Btn" button or check box. */
  type: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  multiline: boolean;
  dict: PDFDict;
}

const text = (o: unknown): string | undefined => (o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : undefined);

const up = (d: PDFDict): PDFDict | undefined => {
  const p = d.lookup(PDFName.of("Parent"));
  return p instanceof PDFDict ? p : undefined;
};

function fullName(d: PDFDict): string {
  const parts: string[] = [];
  for (let cur: PDFDict | undefined = d; cur; cur = up(cur)) {
    const t = text(cur.lookup(PDFName.of("T")));
    if (t !== undefined) parts.unshift(t);
  }
  return parts.join(".");
}

function inherited(d: PDFDict, key: string) {
  for (let cur: PDFDict | undefined = d; cur; cur = up(cur)) {
    const v = cur.lookup(PDFName.of(key));
    if (v) return v;
  }
  return undefined;
}

/** Every form widget on every page with its position, read from the page annotations. */
export function readWidgets(doc: PDFDocument): Widget[] {
  const out: Widget[] = [];
  doc.getPages().forEach((page: PDFPage, pg) => {
    const annots = page.node.lookup(PDFName.of("Annots"));
    if (!(annots instanceof PDFArray)) return;
    for (let i = 0; i < annots.size(); i++) {
      const d = annots.lookup(i);
      if (!(d instanceof PDFDict)) continue;
      if (d.lookup(PDFName.of("Subtype"))?.toString() !== "/Widget") continue;
      const rect = d.lookup(PDFName.of("Rect")) as PDFArray | undefined;
      if (!rect) continue;
      const r = rect.asArray().map((n) => (n as unknown as { asNumber(): number }).asNumber());
      const ft = inherited(d, "FT")?.toString().slice(1) ?? "";
      const ff = (inherited(d, "Ff") as unknown as { asNumber?: () => number } | undefined)?.asNumber?.() ?? 0;
      out.push({
        name: fullName(d),
        type: ft,
        page: pg,
        x: Math.round(Math.min(r[0], r[2])),
        y: Math.round(Math.min(r[1], r[3])),
        w: Math.round(Math.abs(r[2] - r[0])),
        h: Math.round(Math.abs(r[3] - r[1])),
        multiline: !!(ff & 4096),
        dict: d,
      });
    }
  });
  return out;
}

/** Group widgets into rows of similar height, top to bottom, each row sorted left to right. */
export function rowsOf(list: Widget[], tolerance = 4): Widget[][] {
  const sorted = [...list].sort((a, b) => b.y - a.y);
  const rows: Widget[][] = [];
  for (const w of sorted) {
    const row = rows.find((r) => Math.abs(r[0].y - w.y) <= tolerance);
    if (row) row.push(w);
    else rows.push([w]);
  }
  rows.forEach((r) => r.sort((a, b) => a.x - b.x));
  return rows;
}

export const inRect = (w: Widget, x0: number, x1: number, y0 = -1e9, y1 = 1e9) => w.x >= x0 && w.x <= x1 && w.y >= y0 && w.y <= y1;
