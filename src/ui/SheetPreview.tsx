import { useEffect, useRef, useState } from "react";
import { openPdf, type PdfPages } from "../pdf/preview";

/** The filled sheet as it will print, one page at a time, with buttons to turn the pages. */
export function SheetPreview({ bytes, note }: { bytes: Uint8Array | null; note?: string }) {
  const [pages, setPages] = useState<PdfPages | null>(null);
  const [at, setAt] = useState(0);
  const [img, setImg] = useState("");
  const [busy, setBusy] = useState(false);
  const holder = useRef<PdfPages | null>(null);

  useEffect(() => {
    let live = true;
    if (!bytes) { setPages(null); setImg(""); return; }
    setBusy(true);
    openPdf(bytes).then((p) => {
      if (!live) { p.destroy(); return; }
      holder.current?.destroy();
      holder.current = p;
      setPages(p);
      setAt((a) => Math.min(a, p.count - 1));
    }).catch(() => { if (live) { setPages(null); setBusy(false); } });
    return () => { live = false; };
  }, [bytes]);

  useEffect(() => () => holder.current?.destroy(), []);

  useEffect(() => {
    let live = true;
    if (!pages) return;
    setBusy(true);
    pages.page(at, 560).then((url) => { if (live) { setImg(url); setBusy(false); } }).catch(() => live && setBusy(false));
    return () => { live = false; };
  }, [pages, at]);

  if (!bytes) return note ? <p className="notice">{note}</p> : <p className="muted">Preparing a preview...</p>;
  const n = pages?.count ?? 1;
  return (
    <div className="sheet-preview" aria-label="Sheet preview">
      <div className="sheet-preview-frame">
        {img ? <img src={img} alt={`Page ${at + 1} of the filled sheet`} /> : <span className="muted">Drawing the page...</span>}
        {busy && img && <span className="sheet-preview-busy">...</span>}
      </div>
      <div className="row sheet-preview-nav">
        <button onClick={() => setAt((a) => Math.max(0, a - 1))} disabled={at === 0} aria-label="Previous page">◀ Previous</button>
        <span>Page {at + 1} of {n}</span>
        <button onClick={() => setAt((a) => Math.min(n - 1, a + 1))} disabled={at >= n - 1} aria-label="Next page">Next ▶</button>
      </div>
      <p className="muted small-text">A preview of your character on this sheet. The saved file uses your chosen language and extras.</p>
    </div>
  );
}
