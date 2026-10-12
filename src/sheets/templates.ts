import { PDFDocument } from "pdf-lib";
import { deleteTemplate, listTemplates, saveTemplate, type TemplateRecord } from "../aurora/storage";
import { uid } from "../aurora/character";
import { LAYOUTS, identifySheet } from "./official";
import { DLDM_PAGES, detectPages } from "./dldm";
import { companionLayoutOfPdf } from "./companion";
import { readWidgets } from "./widgets";
import { desktopFetch } from "../net";
import type { OFFICIAL_DOWNLOADS } from "./links";

const sha = async (bytes: ArrayBuffer): Promise<string> => {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

/** Whether two stored sheets are the same sheet: the same file, or the same kind of sheet in the same form. */
function sameSheet(a: TemplateRecord, b: TemplateRecord): boolean {
  if (a.hash && b.hash && a.hash === b.hash) return true;
  if (a.kind !== b.kind) return false;
  if (a.kind === "official") return a.layout === b.layout && !!a.form === !!b.form;
  if (a.kind === "dldm5e24" || a.kind === "companion") return a.name === b.name && a.size === b.size;
  return a.name === b.name && a.size === b.size;
}

/**
 * Stores a sheet unless it is already there. A second copy of the same file is dropped; a different copy of the same official
 * sheet replaces the older one, so the list holds one of each. Returns a short note about what happened.
 */
export async function keepOne(rec: TemplateRecord, bytes: ArrayBuffer): Promise<string> {
  rec.hash = await sha(bytes);
  const have = await listTemplates();
  const same = have.filter((h) => sameSheet(h, rec));
  if (same.some((h) => h.hash === rec.hash)) return " (already added, kept one copy)";
  for (const h of same) await deleteTemplate(h.id);
  await saveTemplate(rec, bytes);
  return same.length ? " (replaced the earlier copy)" : "";
}

/** Merges duplicates already stored by older versions: the newest of each same sheet stays. */
export async function mergeDuplicateSheets(): Promise<number> {
  const all = (await listTemplates()).sort((a, b) => b.added - a.added);
  const keep: TemplateRecord[] = [];
  let removed = 0;
  for (const t of all) {
    if (keep.some((k) => sameSheet(k, t))) {
      await deleteTemplate(t.id);
      removed++;
    } else keep.push(t);
  }
  return removed;
}

/** Works out what each PDF is and stores it as a sheet to fill. Returns one note per file. */
export async function addSheetFiles(list: FileList | File[]): Promise<string[]> {
  const notes: string[] = [];
    for (const file of [...list]) {
      try {
        const bytes = await file.arrayBuffer();
        const doc = await PDFDocument.load(bytes, { updateMetadata: false });
        const widgets = readWidgets(doc);
        const found = [...detectPages(widgets).values()];
                const official = found.length ? undefined : identifySheet(doc, file.name);
        if (official) {
          const label = `${LAYOUTS[official.layout].label}${official.form ? " (fillable)" : " (print)"}`;
          notes.push(`${file.name}: ${label.toLowerCase()}${await keepOne({ id: uid(), name: label, kind: "official", pages: [official.layout], size: bytes.byteLength, added: Date.now(), layout: official.layout, form: official.form }, bytes)}`);
          continue;
        }
        if (found.length) {
          notes.push(`${file.name}: ${found.map((p) => DLDM_PAGES[p].label).join(", ")}${await keepOne({ id: uid(), name: file.name.replace(/\.pdf$/i, ""), kind: "dldm5e24", pages: found, size: bytes.byteLength, added: Date.now() }, bytes)}`);
          continue;
        }
        const layout = await companionLayoutOfPdf(bytes, file.name);
        if (layout) {
          notes.push(`${file.name}: companion sheet${await keepOne({ id: uid(), name: file.name.replace(/\.pdf$/i, ""), kind: "companion", pages: [layout], size: bytes.byteLength, added: Date.now() }, bytes)}`);
        } else if (doc.getForm().getFields().length > 0) {
          notes.push(`${file.name}: a fillable sheet Soul Forge has not seen before. It will match fields by their names.${await keepOne({ id: uid(), name: file.name.replace(/\.pdf$/i, ""), kind: "auto", pages: ["all"], size: bytes.byteLength, added: Date.now() }, bytes)}`);
        } else notes.push(`${file.name}: not a sheet Soul Forge can fill (it fills the official 2024 and classic 2014 sheets, the DLDM 5E24 sheets and the DLDM companion sheets, and any fillable sheet)`);
      } catch (e) {
        notes.push(`${file.name}: ${(e as Error).message}`);
      }
    }
  return notes;
}

/** Downloads a sheet (or several, or a zip of them) from its maker's own address (desktop app) and adds them. Returns the notes. */
export async function downloadOfficialSheet(o: (typeof OFFICIAL_DOWNLOADS)[number]): Promise<string[]> {
  const get = await desktopFetch();
  const files: File[] = [];
  for (const f of o.files) {
    const res = await get(f.url);
    if (!res.ok) throw new Error(`The site answered ${res.status} for ${f.file}.`);
    const bytes = await res.arrayBuffer();
    if (!/\.zip$/i.test(f.file)) {
      files.push(new File([bytes], f.file, { type: "application/pdf" }));
      continue;
    }
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(bytes);
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir || !/\.pdf$/i.test(name) || name.startsWith("__MACOSX")) continue;
      files.push(new File([await entry.async("arraybuffer")], name.split("/").pop()!, { type: "application/pdf" }));
    }
  }
  return addSheetFiles(files);
}
