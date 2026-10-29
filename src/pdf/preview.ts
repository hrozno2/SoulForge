/** Draws pages of a PDF to pictures for the in-app preview. pdf.js loads only when a preview is wanted. */
import type { PDFDocumentProxy } from "pdfjs-dist";

let lib: Promise<typeof import("pdfjs-dist")> | undefined;

async function pdfjs() {
  lib ??= (async () => {
    const mod = await import("pdfjs-dist");
    const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    mod.GlobalWorkerOptions.workerSrc = worker;
    return mod;
  })();
  return lib;
}

/** Starts loading pdf.js ahead of a preview, while the sheet is still being filled (C7.8). */
export function warmPdf(): void { void pdfjs(); }

export interface PdfPages {
  count: number;
  /** A data address of the page picture, `width` pixels wide. */
  page(index: number, width: number): Promise<string>;
  /** The words on a page with where they sit, in PDF points from the bottom left. */
  words(index: number): Promise<{ text: string; x: number; y: number; w: number; h: number }[]>;
  destroy(): void;
}

export async function openPdf(bytes: Uint8Array): Promise<PdfPages> {
  const { getDocument } = await pdfjs();
  const task = getDocument({ data: bytes.slice(), useSystemFonts: true });
  const doc: PDFDocumentProxy = await task.promise;
  return {
    count: doc.numPages,
    async page(index, width) {
      const p = await doc.getPage(index + 1);
      const base = p.getViewport({ scale: 1 });
      const viewport = p.getViewport({ scale: (width * (window.devicePixelRatio || 1)) / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await p.render({ canvas, viewport }).promise;
      // JPEG: a full page encodes several times faster than PNG, and a preview needs no lossless copy (C7.8).
      return canvas.toDataURL("image/jpeg", 0.88);
    },
    async words(index) {
      const p = await doc.getPage(index + 1);
      const tc = await p.getTextContent();
      return tc.items
        .filter((i): i is typeof i & { str: string; transform: number[]; width: number; height: number } => "str" in i && !!i.str.trim())
        .map((i) => ({ text: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height }));
    },
    destroy() {
      void task.destroy();
    },
  };
}
