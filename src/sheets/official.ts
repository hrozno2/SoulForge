/**
 * The official Wizards of the Coast character sheets. Each is a known layout: the positions of every field are kept here,
 * so the same filler works on a fillable copy (the form's own fields) and on a plain printing copy (text drawn at those positions).
 */
import { logEvent } from "../logbook";
import { appendSpellPages } from "./continuation";
import type { SpellRow } from "./data";
import { PDFDocument, type PDFCheckBox, type PDFFont, type PDFTextField } from "pdf-lib";
import type { FillData } from "./data";
import { fill2014, fill2024Form, formSink, overlaySink, placePortrait, type FormFillResult, type Sink, type W } from "./forms";
import { autoFill, type AutoField } from "./automap";
import layout2024 from "./layouts/2024.json";
import layout3p from "./layouts/3p.json";
import layoutClassic from "./layouts/classic.json";
import layoutAlt from "./layouts/alt.json";
import layoutDetails from "./layouts/details.json";
import layoutSpells from "./layouts/spells.json";
import layoutAdventurers from "./layouts/adventurers.json";
import layoutAlt2 from "./layouts/alt2.json";
import { fillAlt2 } from "./alt2";

export type LayoutId = "2024" | "3p" | "classic" | "alt" | "details" | "spells" | "adventurers" | "alt2";

interface Raw {
  n: string;
  t: string;
  p: number;
  x: number;
  y: number;
  w: number;
  h: number;
  u?: string;
}

const toWidgets = (raw: Raw[]): AutoField[] => raw.map((r) => ({ name: r.n, t: r.t === "Btn" ? "Btn" : "Tx", p: r.p, x: r.x, y: r.y, w: r.w, h: r.h, tip: r.u }));

export const LAYOUTS: Record<LayoutId, { label: string; edition: "2024" | "2014"; widgets: AutoField[] }> = {
  "2024": { label: "Official 2024 sheet", edition: "2024", widgets: toWidgets(layout2024 as Raw[]) },
  "3p": { label: "Classic 2014 sheet, 3 pages", edition: "2014", widgets: toWidgets(layout3p as Raw[]) },
  classic: { label: "Classic 2014 sheet, 1 page", edition: "2014", widgets: toWidgets(layoutClassic as Raw[]) },
  alt: { label: "Classic 2014 sheet, alternative layout", edition: "2014", widgets: toWidgets(layoutAlt as Raw[]) },
  details: { label: "Classic 2014 character details page", edition: "2014", widgets: toWidgets(layoutDetails as Raw[]) },
  spells: { label: "Classic 2014 spellcasting page", edition: "2014", widgets: toWidgets(layoutSpells as Raw[]) },
  alt2: { label: "Classic 2014 sheet, circular layout", edition: "2014", widgets: toWidgets(layoutAlt2 as Raw[]) },
  adventurers: { label: "Adventurers League sheet, 2 pages", edition: "2014", widgets: toWidgets(layoutAdventurers as Raw[]) },
};

export interface Identified {
  layout: LayoutId;
  /** True when the PDF has real form fields, so the text stays editable. */
  form: boolean;
}

const near = (a: number, b: number) => Math.abs(a - b) < 6;

/** Which official sheet a PDF is, from its size, page count, field names and file name. */
export function identifySheet(doc: PDFDocument, nameHint: string): Identified | undefined {
  const size = doc.getPage(0).getSize();
  const pages = doc.getPageCount();
  const names = new Set(doc.getForm().getFields().map((f) => f.getName().trim()));
  const form = names.size > 0;
  if (form) {
    if (names.has("STR SAVE") && names.has("NAME - WEAPON 1")) return { layout: "2024", form };
    if (names.has("CharacterName") && names.has("Wpn Name")) return { layout: pages >= 3 ? "3p" : names.has("SavingThrows") ? "alt" : "classic", form };
    if (names.has("Backstory") && !names.has("CharacterName")) return { layout: "details", form };
    if (names.has("SpellcastingAbility 2") && pages === 1) return { layout: "spells", form };
    return undefined;
  }
  if (near(size.width, 603) && near(size.height, 774) && pages === 2) return { layout: "2024", form };
  if (near(size.width, 612) && near(size.height, 792)) {
    if (pages === 3) return { layout: "3p", form };
    if (pages === 2 && /alternative\s*2/i.test(nameHint)) return { layout: "alt2", form };
    if (pages === 2 && /tyranny|adventurer|league/i.test(nameHint)) return { layout: "adventurers", form };
    if (pages === 1) {
      if (/alternative/i.test(nameHint)) return { layout: "alt", form };
      if (/detail/i.test(nameHint)) return { layout: "details", form };
      if (/spell/i.test(nameHint)) return { layout: "spells", form };
      if (/5e|dnd|character|sheet/i.test(nameHint)) return { layout: "classic", form };
    }
  }
  return undefined;
}

/** Fields whose name on the official file is wrong: on the alternative sheet the Inspiration and Proficiency Bonus boxes carry each other's names. */
const WRONG_NAMES: Partial<Record<LayoutId, Record<string, string>>> = { alt: { Inspiration: "ProfBonus", ProfBonus: "Inspiration" } };

const withAliases = (layout: LayoutId, ws: AutoField[]): AutoField[] => {
  const fix = WRONG_NAMES[layout];
  return fix ? ws.map((w) => (fix[w.name.trim()] ? { ...w, alias: fix[w.name.trim()] } : w)) : ws;
};

/** Fills the layout's fields: by hand-made mapping for the two big sheets, by matching names for the rest. */
function run(layout: LayoutId, ws: AutoField[], data: FillData, sink: Sink, overflow: SpellRow[] = []): string[] {
  if (layout === "2024") return fill2024Form(ws, data, sink, overflow);
  else if (layout === "3p") fill2014(ws, data, sink, overflow);
  else if (layout === "alt2") fillAlt2(ws, data, sink);
  else autoFill(withAliases(layout, ws), data, sink);
  return [];
}

/** Spells the sheet has no room for continue on pages at the end, in a table of their own. */
function continueSpells(doc: PDFDocument, font: PDFFont, rows: SpellRow[], data: FillData, notes: string[]): void {
  const pages = appendSpellPages(doc, font, rows, "Spells, continued", data.name || "Character");
  if (pages) notes.push(`${rows.length} spell${rows.length === 1 ? "" : "s"} did not fit the sheet's spell table and continue on ${pages === 1 ? "a page" : `${pages} pages`} at the end.`);
}

/** Fills one of the official sheets, fillable or plain. */
export async function fillOfficialSheet(template: Uint8Array | ArrayBuffer, nameHint: string, data: FillData, font: { regular: ArrayBuffer | Uint8Array }): Promise<FormFillResult & { layout?: LayoutId; form?: boolean }> {
  const doc = await PDFDocument.load(template, { ignoreEncryption: true });
  const id = identifySheet(doc, nameHint);
  if (!id) { logEvent("export", `sheet not recognised: ${nameHint}`); throw new Error("This is not one of the official sheets Soul Forge knows."); }
  logEvent("export", `filling ${nameHint} as layout ${id.layout}${id.form ? "" : " (printed: fields added)"}`);
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  doc.registerFontkit(fontkit);
  const f = await doc.embedFont(font.regular, { subset: true });
  const notes: string[] = [];
  const known = LAYOUTS[id.layout].widgets;
  // A printed copy gets the fillable version's fields, at the layout's places (A3.2): transparent, no border, so the
  // page looks the same and every value can be changed afterwards. If that fails, the text is written onto the page.
  if (!id.form) {
    try {
      addFormFields(doc, known);
      return await fillAsForm(doc, f, id.layout, data, [...notes, "The printed sheet got fillable fields, so you can change any value afterwards."]);
    } catch {
      // Fall back to writing onto the page below.
    }
  }
  if (!id.form) {
    const over = overlaySink(doc, f);
    const pics: W[] = [];
    const overflow: SpellRow[] = [];
    notes.push(...run(id.layout, known, data, { ...over, image: (w) => void pics.push(w) }, overflow));
    continueSpells(doc, f, overflow, data, notes);
    await placePortrait(doc, data, pics, notes, true);
    notes.push("This copy has no form fields, so the text is written onto the page and cannot be edited afterwards.");
    return { bytes: await doc.save(), notes, layout: id.layout, form: false };
  }
  return fillAsForm(doc, f, id.layout, data, notes);
}

/** Fills a sheet through its form fields (its own, or the ones a printed copy was given). */
async function fillAsForm(doc: PDFDocument, f: PDFFont, layout: LayoutId, data: FillData, notes: string[]): Promise<FormFillResult & { layout?: LayoutId; form?: boolean }> {
  const sink = formSink(doc, f);
  const ws: AutoField[] = sink.widgets.map((w) => ({ name: w.name, t: w.type === "Btn" ? "Btn" : "Tx", p: w.page, x: w.x, y: w.y, w: w.w, h: w.h }));
  const overflow: SpellRow[] = [];
  notes.push(...run(layout, ws, data, sink, overflow));
  sink.done();
  continueSpells(doc, f, overflow, data, notes);
  await placePortrait(doc, data, sink.images, notes);
  return { bytes: await doc.save({ updateFieldAppearances: false }), notes, layout, form: true };
}

/**
 * Form fields for a printed sheet, from its layout (the fillable version's fields and places). Two places with one
 * name (a slip in the original PDF) become one field with two boxes, as in the fillable version.
 */
export function addFormFields(doc: PDFDocument, widgets: W[]): void {
  const form = doc.getForm();
  const look = { borderWidth: 0, backgroundColor: undefined, borderColor: undefined };
  for (const w of widgets) {
    if (w.p >= doc.getPageCount()) continue;
    const page = doc.getPage(w.p);
    const at = { x: w.x, y: w.y, width: w.w, height: w.h, ...look };
    if (w.t === "Btn") {
      let cb: PDFCheckBox;
      try { cb = form.getCheckBox(w.name); } catch { cb = form.createCheckBox(w.name); }
      cb.addToPage(page, at);
    } else {
      let tf: PDFTextField;
      try { tf = form.getTextField(w.name); } catch { tf = form.createTextField(w.name); }
      tf.addToPage(page, at);
    }
  }
}
