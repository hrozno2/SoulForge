import { PDFDocument, PDFName, PDFArray, PDFDict } from "pdf-lib";
import { readFileSync, writeFileSync } from "node:fs";
const [src, dst] = process.argv.slice(2);
const d = await PDFDocument.load(readFileSync(src), { ignoreEncryption: true });
const out = [];
d.getPages().forEach((p, pg) => {
  const annots = p.node.lookup(PDFName.of("Annots"));
  if (!(annots instanceof PDFArray)) return;
  for (let i = 0; i < annots.size(); i++) {
    const a = annots.lookup(i);
    if (!(a instanceof PDFDict) || a.lookup(PDFName.of("Subtype"))?.toString() !== "/Widget") continue;
    const names = []; let c = a; while (c instanceof PDFDict) { const t = c.lookup(PDFName.of("T")); if (t) names.unshift(t.decodeText()); c = c.lookup(PDFName.of("Parent")); }
    const r = a.lookup(PDFName.of("Rect")).asArray().map((n) => n.asNumber());
    let ft = ""; for (let c2 = a; c2 instanceof PDFDict; c2 = c2.lookup(PDFName.of("Parent"))) { const v = c2.lookup(PDFName.of("FT")); if (v) { ft = v.toString().slice(1); break; } }
    let tip = ""; for (let c3 = a; c3 instanceof PDFDict; c3 = c3.lookup(PDFName.of("Parent"))) { const v = c3.lookup(PDFName.of("TU")); if (v) { tip = v.decodeText(); break; } }
    const x = Math.round(Math.min(r[0], r[2])), y = Math.round(Math.min(r[1], r[3]));
    out.push({ n: names.join("."), t: ft, p: pg, x, y, w: Math.round(Math.abs(r[2] - r[0])), h: Math.round(Math.abs(r[3] - r[1])), ...(tip ? { u: tip } : {}) });
  }
});
writeFileSync(dst, JSON.stringify(out));
console.log(src.split("/").pop(), out.length);
