import regularUrl from "dejavu-fonts-ttf/ttf/DejaVuSansCondensed.ttf?url";
import boldUrl from "dejavu-fonts-ttf/ttf/DejaVuSansCondensed-Bold.ttf?url";
import type { FontData } from "./exportPdf";

/** DejaVu covers Latin Extended, so Slovak and Czech names print correctly. */
export async function loadFonts(): Promise<FontData> {
  const [regular, bold] = await Promise.all([
    fetch(regularUrl).then((r) => r.arrayBuffer()),
    fetch(boldUrl).then((r) => r.arrayBuffer()),
  ]);
  return { regular, bold };
}
