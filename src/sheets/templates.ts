import { PDFDocument } from "pdf-lib";
import { saveTemplate } from "../aurora/storage";
import { uid } from "../aurora/character";
import { detectOfficial } from "./forms";
import { DLDM_PAGES, detectPages } from "./dldm";
import { companionLayoutOfPdf } from "./companion";
import { looksLikeWotc2024 } from "./wotc";
import { readWidgets } from "./widgets";
import { desktopFetch } from "../net";
import type { OFFICIAL_DOWNLOADS } from "./links";

/** Works out what each PDF is and stores it as a sheet to fill. Returns one note per file. */
export async function addSheetFiles(list: FileList | File[]): Promise<string[]> {
  const notes: string[] = [];
    for (const file of [...list]) {
      try {
        const bytes = await file.arrayBuffer();
        const doc = await PDFDocument.load(bytes, { updateMetadata: false });
        const widgets = readWidgets(doc);
        const found = [...detectPages(widgets).values()];
        const first = doc.getPage(0).getSize();
        const official = found.length ? undefined : detectOfficial(doc, file.name);
        if (official) {
          const label = ({ wotc2024form: "Official 2024 sheet (fillable)", wotc2014form: "Classic 2014 sheet (fillable)", wotc2014: "Classic 2014 sheet (print)", auto: file.name } as Record<string, string>)[official];
          await saveTemplate({ id: uid(), name: label, kind: official, pages: ["all"], size: bytes.byteLength, added: Date.now() }, bytes);
          notes.push(`${file.name}: ${label.toLowerCase()}`);
          continue;
        }
        if (!found.length && looksLikeWotc2024(first.width, first.height, doc.getPageCount(), doc.getForm().getFields().length, file.name)) {
          await saveTemplate({ id: uid(), name: "Official 2024 sheet", kind: "wotc2024", pages: ["page1", "page2"], size: bytes.byteLength, added: Date.now() }, bytes);
          notes.push(`${file.name}: official 2024 character sheet`);
          continue;
        }
        if (found.length) {
          await saveTemplate({ id: uid(), name: file.name.replace(/\.pdf$/i, ""), kind: "dldm5e24", pages: found, size: bytes.byteLength, added: Date.now() }, bytes);
          notes.push(`${file.name}: ${found.map((p) => DLDM_PAGES[p].label).join(", ")}`);
          continue;
        }
        const layout = await companionLayoutOfPdf(bytes, file.name);
        if (layout) {
          await saveTemplate({ id: uid(), name: file.name.replace(/\.pdf$/i, ""), kind: "companion", pages: [layout], size: bytes.byteLength, added: Date.now() }, bytes);
          notes.push(`${file.name}: companion sheet`);
        } else if (doc.getForm().getFields().length > 0) {
          await saveTemplate({ id: uid(), name: file.name.replace(/\.pdf$/i, ""), kind: "auto", pages: ["all"], size: bytes.byteLength, added: Date.now() }, bytes);
          notes.push(`${file.name}: a fillable sheet Soul Forge has not seen before. It will match fields by their names.`);
        } else notes.push(`${file.name}: not a sheet Soul Forge can fill (it fills the official 2024 sheet, the classic 2014 sheet, the DLDM 5E24 sheets and the DLDM companion sheets)`);
      } catch (e) {
        notes.push(`${file.name}: ${(e as Error).message}`);
      }
    }
  return notes;
}

/** Downloads an official sheet from Wizards' own address (desktop app) and adds it. Returns the notes, or throws a readable error. */
export async function downloadOfficialSheet(o: (typeof OFFICIAL_DOWNLOADS)[number]): Promise<string[]> {
  const res = await (await desktopFetch())(o.url);
  if (!res.ok) throw new Error(`The site answered ${res.status}.`);
  return addSheetFiles([new File([await res.arrayBuffer()], o.file, { type: "application/pdf" })]);
}
