import regularUrl from "dejavu-fonts-ttf/ttf/DejaVuSansCondensed.ttf?url";
import boldUrl from "dejavu-fonts-ttf/ttf/DejaVuSansCondensed-Bold.ttf?url";
import type { FontData } from "./exportPdf";

/** DejaVu covers Latin Extended, so Slovak and Czech names print correctly. */
let fonts: Promise<FontData> | undefined;
/** Fetched once per session (C7.8: every preview fetched them again). A failed fetch is tried again next time. */
export async function loadFonts(): Promise<FontData> {
  fonts ??= Promise.all([
    fetch(regularUrl).then((r) => r.arrayBuffer()),
    fetch(boldUrl).then((r) => r.arrayBuffer()),
  ]).then(([regular, bold]) => ({ regular, bold }));
  return fonts.catch((e) => { fonts = undefined; throw e; });
}
