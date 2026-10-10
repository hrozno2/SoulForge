/**
 * Fills the DLDM "5E24" fillable character sheets (the five-page file and its single-page parts) from a character.
 * The PDFs are not part of Soul Forge: the player loads their own copy. Pages are recognised by the names of their
 * form fields, so the five-page file and the separate pages both work.
 */
import fontkit from "@pdf-lib/fontkit";
import { PDFArray, PDFDocument, PDFDict, PDFHexString, PDFName, PDFRef, PDFString, type PDFFont, type PDFTextField } from "pdf-lib";
import type { FillData, SpellRow } from "./data";
import { readWidgets, rowsOf, type Widget } from "./widgets";

export type DldmPage = "p1a" | "p1b" | "p2a" | "p2b" | "spells";

export const DLDM_PAGES: Record<DldmPage, { label: string; note: string }> = {
  p1a: { label: "Page 1, style A", note: "Abilities with their saves and skills grouped under each score" },
  p1b: { label: "Page 1, style B", note: "Scores down the side, all skills in one list" },
  p2a: { label: "Page 2, style A", note: "Spellcasting, equipment, coins and backstory" },
  p2b: { label: "Page 2, style B", note: "Equipment, backstory and a companion block" },
  spells: { label: "Spell list", note: "A full page of spells" },
};

const SIGNATURE: [DldmPage, string[]][] = [
  ["p1a", ["STR SORE", "WEAPON NAME 1"]],
  ["p1b", ["STR SORE0", "CB-SKILLPROF1"]],
  ["p2a", ["CB-SPELLC1", "MAGIC ITEM1"]],
  ["p2b", ["Armor Worn2", "Image Field0"]],
  ["spells", ["Spellcasting Focus", "SPELL ATTK BONUS23"]],
];

/** Which page of the PDF is which, by looking at its field names. */
export function detectPages(widgets: Widget[]): Map<number, DldmPage> {
  const byPage = new Map<number, Set<string>>();
  for (const w of widgets) (byPage.get(w.page) ?? byPage.set(w.page, new Set()).get(w.page)!).add(w.name);
  const out = new Map<number, DldmPage>();
  for (const [page, names] of byPage) {
    for (const [id, sig] of SIGNATURE) {
      if (sig.every((n) => names.has(n)) && ![...out.values()].includes(id)) {
        out.set(page, id);
        break;
      }
    }
  }
  return out;
}

export const isDldm = (widgets: Widget[]) => detectPages(widgets).size > 0;

interface Ctx {
  doc: PDFDocument;
  /** Fonts for text drawn straight onto the page, so feature names can be bold. */
  rich?: { r: PDFFont; b: PDFFont };
  form: ReturnType<PDFDocument["getForm"]>;
  widgets: Widget[];
  missing: string[];
  /** Field name as the sheet's layout code knows it, to the real field names (after fields shared between pages were split). */
  alias: Map<string, string[]>;
}

const actual = (c: Ctx, name: string): string[] => c.alias.get(name) ?? [];

/**
 * The sheet reuses some field names on two pages (for example the spell rows on page 2 and on the spell list
 * page), but the columns differ between those pages. Each such widget becomes a field of its own so the
 * pages can be filled independently. Fields that only repeat the same thing (a name on both page 1 styles)
 * are split too, and filled with the same value through the alias map.
 */
export function splitSharedFields(doc: PDFDocument): void {
  const widgets = readWidgets(doc);
  const byName = new Map<string, Widget[]>();
  for (const w of widgets) (byName.get(w.name) ?? byName.set(w.name, []).get(w.name)!).push(w);
  const acro = doc.catalog.lookup(PDFName.of("AcroForm"));
  if (!(acro instanceof PDFDict)) return;
  const fields = acro.lookup(PDFName.of("Fields"));
  if (!(fields instanceof PDFArray)) return;
  for (const [name, ws] of byName) {
    const pages = new Set(ws.map((w) => w.page));
    if (pages.size < 2) continue;
    const sorted = [...ws].sort((a, b) => a.page - b.page);
    // Widgets on the first page keep the original field; widgets on later pages are split off.
    for (const w of sorted.slice(1)) {
      if (w.page === sorted[0].page) continue;
      const parent = w.dict.lookup(PDFName.of("Parent"));
      if (!(parent instanceof PDFDict)) continue;
      const kids = parent.lookup(PDFName.of("Kids"));
      if (!(kids instanceof PDFArray)) continue;
      let ref: PDFRef | undefined;
      for (let i = 0; i < kids.size(); i++) {
        if (kids.lookup(i) === w.dict) {
          ref = kids.get(i) as PDFRef;
          kids.remove(i);
          break;
        }
      }
      if (!ref) continue;
      for (const key of ["FT", "Ff", "Q", "MaxLen", "DA"]) {
        const v = parent.lookup(PDFName.of(key));
        if (v && !w.dict.has(PDFName.of(key))) w.dict.set(PDFName.of(key), v);
      }
      w.dict.set(PDFName.of("T"), PDFHexString.fromText(`${name}__p${w.page}`));
      w.dict.delete(PDFName.of("Parent"));
      w.dict.delete(PDFName.of("V"));
      fields.push(ref);
    }
  }
}

function sizeFor(text: string, w: number, h: number, multi: boolean, max = 9): number {
  if (!multi) return Math.max(5, Math.min(max, h * 0.72, (w - 4) / Math.max(1, text.length * 0.5)));
  for (const s of [8, 7.5, 7, 6.5, 6, 5.5, 5, 4.5, 4]) {
    if (s > max) continue;
    const perLine = Math.max(1, (w - 6) / (s * 0.5));
    const lines = text.split("\n").reduce((n, p) => n + Math.max(1, Math.ceil(p.length / perLine)), 0);
    if (lines * s * 1.18 <= h - 4) return s;
  }
  return 4;
}

function setText(c: Ctx, names: string | string[], value: string | number | undefined, opts: { keepSize?: boolean; max?: number; exact?: boolean; size?: number } = {}): void {
  const list = Array.isArray(names) ? names : [names];
  const v = value === undefined ? "" : String(value);
  for (const logical of list) {
    const real = opts.exact ? [logical] : actual(c, logical);
    if (!real.length) {
      c.missing.push(logical);
      continue;
    }
    for (const name of real) {
      try {
        const f = c.form.getTextField(name);
        f.setText(v);
        const w = c.widgets.find((x) => x.name === name);
        if (opts.size) f.setFontSize(opts.size);
        else if (!opts.keepSize && v.length > 3 && w) f.setFontSize(sizeFor(v, w.w, w.h, w.multiline || f.isMultiline(), opts.max ?? 9));
        // Widgets can carry their own default appearance, which wins over the field's. Keep them in step.
        const da = f.acroField.getDefaultAppearance();
        if (da) for (const x of c.widgets.filter((y) => y.name === name)) if (x.dict.has(PDFName.of("DA"))) x.dict.set(PDFName.of("DA"), PDFString.of(da));
      } catch {
        c.missing.push(name);
      }
    }
  }
}

const onState = (d: PDFDict): string => {
  const ap = d.lookup(PDFName.of("AP"));
  const n = ap instanceof PDFDict ? ap.lookup(PDFName.of("N")) : undefined;
  if (n instanceof PDFDict) for (const k of n.keys()) if (k.toString() !== "/Off") return k.toString().slice(1);
  return "Yes";
};

/** Sets one check box widget. Works when several boxes share a field name, which the DLDM sheet does in one place. */
function setBoxWidget(w: Widget, on: boolean): void {
  const state = on ? onState(w.dict) : "Off";
  w.dict.set(PDFName.of("AS"), PDFName.of(state));
  const parent = w.dict.lookup(PDFName.of("Parent"));
  if (on && parent instanceof PDFDict && parent.lookup(PDFName.of("T"))) parent.set(PDFName.of("V"), PDFName.of(state));
  if (on) w.dict.set(PDFName.of("V"), PDFName.of(state));
  else w.dict.delete(PDFName.of("V"));
}

function setBox(c: Ctx, logical: string, on: boolean, index = 0, exact = false): void {
  const real = exact ? [logical] : actual(c, logical);
  if (!real.length) {
    c.missing.push(logical);
    return;
  }
  for (const name of real) {
    const ws = c.widgets.filter((w) => w.name === name).sort((a, b) => b.y - a.y || a.x - b.x);
    if (ws.length === 1) {
      try {
        const f = c.form.getCheckBox(name);
        if (on) f.check();
        else f.uncheck();
        continue;
      } catch {
        /* fall through to widget level */
      }
    }
    if (ws.length) setBoxWidget(ws[Math.min(index, ws.length - 1)], on);
  }
}

// ---------------------------------------------------------------- shared pieces

const SKILLS_BY_ABILITY = {
  strength: ["athletics"], dexterity: ["acrobatics", "sleight of hand", "stealth"], constitution: [], intelligence: ["arcana", "history", "investigation", "nature", "religion"],
  wisdom: ["animal handling", "insight", "medicine", "perception", "survival"], charisma: ["deception", "intimidation", "performance", "persuasion"],
};
void SKILLS_BY_ABILITY;

/** Fits entries into one or more text boxes of a given capacity (characters), splitting between boxes. */
export function splitEntries(entries: string[], capacity: number, boxes: number): { texts: string[]; dropped: number; overflow: string[] } {
  const texts: string[] = Array.from({ length: boxes }, () => "");
  // Aim for equal columns, but never past a box's capacity.
  const total = entries.reduce((n, e) => n + e.length + 1, 0);
  const target = Math.min(capacity, Math.ceil(total / boxes) + 40);
  let box = 0;
  let dropped = 0;
  const overflow: string[] = [];
  for (const e of entries) {
    const add = (texts[box] ? 1 : 0) + e.length;
    if (texts[box].length + add > target && texts[box] && box + 1 < boxes) box++;
    if (texts[box].length + (texts[box] ? 1 : 0) + e.length > capacity * 1.15 && box + 1 >= boxes) {
      dropped++;
      overflow.push(e);
      continue;
    }
    texts[box] += (texts[box] ? "\n" : "") + e;
  }
  return { texts, dropped, overflow };
}

function fillCommon(c: Ctx, d: FillData, map: Record<string, string | string[]>): void {
  const set = (k: string, v: string | number | undefined) => map[k] !== undefined && setText(c, map[k], v);
  set("name", d.name); set("background", d.background); set("class", d.className); set("species", d.species); set("subclass", d.subclass);
  set("level", d.level); set("xp", d.xp || ""); set("ac", d.ac); set("hpCurrent", d.hpCurrent); set("hpMax", d.hpMax); set("hpTemp", d.hpTemp || "");
  set("hdSpent", d.hdSpent || ""); set("hdMax", d.hdMax); set("speed", d.speed); set("exhaustion", d.exhaustion); set("conditions", d.conditions);
  set("prof", d.profBonus); set("size", d.size); set("darkvision", d.darkvision); set("tools", d.tools); set("languages", d.languages);
}

function weaponRows(c: Ctx, d: FillData, rows: { name: string; bonus: string; dmg: string; notes: string }[]): void {
  rows.forEach((r, i) => {
    const w = d.weapons[i];
    setText(c, r.name, w?.name ?? "");
    setText(c, r.bonus, w?.bonus ?? "");
    setText(c, r.dmg, w?.damage ?? "");
    setText(c, r.notes, w?.notes ?? "");
  });
}

function multiBox(c: Ctx, name: string | string[], text: string): void {
  setText(c, name, text, { max: 8 });
}

/**
 * A box of features, one per line as "Name: text". A form field holds one font, so the names cannot be bold there.
 * When a bold font is available the text is drawn on the page with bold names, and the field is left empty.
 */
function featureBox(c: Ctx, name: string, text: string): void {
  const real = actual(c, name);
  const wd = c.rich && text.trim() ? c.widgets.find((x) => x.name === real[0]) : undefined;
  if (!c.rich || !wd) return multiBox(c, name, text);
  const { r, b } = c.rich;
  const entries = text.split("\n").filter(Boolean).map((l) => {
    const m = l.match(/^([^:\n]{2,70}): ([\s\S]+)$/);
    return m ? { lead: `${m[1]}:`, body: m[2] } : { lead: "", body: l };
  });
  const layout = (size: number): { lines: { lead?: string; text: string }[]; h: number } => {
    const lines: { lead?: string; text: string }[] = [];
    const w = wd.w - 8;
    for (const e of entries) {
      const lead = e.lead ? `${e.lead} ` : "";
      const leadW = lead ? b.widthOfTextAtSize(lead, size) : 0;
      let cur = "";
      let first = true;
      for (const word of e.body.split(/\s+/).filter(Boolean)) {
        const room = w - (first ? leadW : 0);
        const next = cur ? `${cur} ${word}` : word;
        if (r.widthOfTextAtSize(next, size) <= room) cur = next;
        else {
          lines.push({ lead: first ? e.lead : undefined, text: cur });
          first = false;
          cur = word;
        }
      }
      lines.push({ lead: first ? e.lead : undefined, text: cur });
    }
    return { lines, h: lines.length * size * 1.2 };
  };
  let size = 8.5;
  let lay = layout(size);
  while (lay.h > wd.h - 6 && size > 4.6) { size -= 0.4; lay = layout(size); }
  const page = c.doc.getPage(wd.page);
  let y = wd.y + wd.h - 3 - size;
  for (const l of lay.lines.slice(0, Math.max(1, Math.floor((wd.h - 4) / (size * 1.2))))) {
    let x = wd.x + 4;
    if (l.lead) {
      page.drawText(`${l.lead} `, { x, y, size, font: b });
      x += b.widthOfTextAtSize(`${l.lead} `, size);
    }
    page.drawText(l.text, { x, y, size, font: r });
    y -= size * 1.2;
  }
  setText(c, name, "");
}

function deathBoxes(c: Ctx, names: string[], count: number): void {
  names.forEach((n, i) => setBox(c, n, i < count));
}

// ---------------------------------------------------------------- page 1 (style A)

function page1a(c: Ctx, d: FillData): void {
  fillCommon(c, d, {
    name: "Name", background: "Background", class: "Class", species: "Species", subclass: "Subclass", level: "Level", xp: "Experience Points", ac: "AC",
    hpCurrent: "Current HP", hpMax: "Max HP", hpTemp: "Temp HP", hdSpent: "Spent HD", hdMax: "MAX HD", speed: "SPEED", exhaustion: "EXHAUSTION",
    conditions: "Conditions and Effects", prof: "Prof Bonus", size: "Size", darkvision: "Darkvision", tools: "TOOLS", languages: "LANGUAGES",
  });
  const A = d.abilities;
  const ab: [string, string, string, string[], string][] = [
    ["strength", "SRT MOD", "STR SORE", ["STR SAVE"], "CB-STRSAVE"], ["dexterity", "DEX MOD", "DEX SCORE", ["DEX SAVE"], "CB-DEXSAVE"],
    ["constitution", "CON MOD", "CON SCORE", ["CON SAVE"], "CB-CONSAVE"], ["intelligence", "INT MOD", "INT SCORE", ["INT SAVE", "INT SAVE0"], "CB-INTSAVE"],
    ["wisdom", "WIS MOD", "WIS SCORE", ["WIS SAVE1"], "CB-WISSAVE"], ["charisma", "CHA MOD", "CHA SCORE", ["CHA SAVE"], "CB-CHASAVE"],
  ];
  for (const [id, mod, score, save, cb] of ab) {
    const a = A[id as keyof typeof A];
    setText(c, mod, a.mod); setText(c, score, a.score); setText(c, save, a.save); setBox(c, cb, a.saveProf);
  }
  const sk: [string, string[], string, string][] = [
    ["athletics", ["ATHLETICS"], "CB-ATHLETICPROF", "CB-ATHLETICEXP"], ["acrobatics", ["ACROBATICS"], "CB-ACROPROF", "CB-ACROEXP"],
    ["sleight of hand", ["SLEIGHT OF HAND"], "CB-SOHPROF", "CB-SOHEXP"], ["stealth", ["STEALTH"], "CB-STEALTHPROF", "CB-STEALTHEXP"],
    ["arcana", ["ARCANA", "ARCANA1"], "CB-ARCANAPROF", "CB-ARCANAEXP"], ["history", ["HISTORY", "HISTORY1"], "CB-HISTORYPROF", "CB-HISTORYEXP"],
    ["investigation", ["INVESTIGATION", "INVESTIGATION1"], "CB-INVESTPROF", "CB-INVESTEXP"], ["nature", ["NATURE", "NATURE1"], "CB-NATUREPROF", "CB-NATUREEXP"],
    ["religion", ["RELIGION", "RELIGION1"], "CB-RELIGIONPROF", "CB-RELIGIONEXP"],
    ["animal handling", ["ANIMAL HANDLING"], "CB-WISPROF1", "CB-WISEXP1"], ["insight", ["INSIGHT"], "CB-WISPROF2", "CB-WISEXP2"],
    ["medicine", ["MEDICINE"], "CB-WISPROF3", "CB-WISEXP3"], ["perception", ["PERCEPTION"], "CB-WISPROF4", "CB-WISEXP4"], ["survival", ["SURVIVAL"], "CB-WISPROF5", "CB-WISEXP5"],
    ["deception", ["DECEPTION"], "CB-CHAPROF1", "CB-CHAEXP1"], ["intimidation", ["INTIMIDATION"], "CB-CHAPROF2", "CB-CHAEXP2"],
    ["performance", ["PERFORMANCE"], "CB-CHAPROF3", "CB-CHAEXP3"], ["persuasion", ["PERSUASION"], "CB-CHAPROF4", "CB-CHAEXP4"],
  ];
  for (const [name, fields, prof, exp] of sk) {
    const s = d.skills[name];
    setText(c, fields, s.bonus); setBox(c, prof, s.prof); setBox(c, exp, s.expert);
  }
  setText(c, "INIT", d.initiative);
  setBox(c, "CB-Insp", d.inspiration); setBox(c, "CB-Shield", d.shield);
  setBox(c, "CB-ARMORL", d.armorTraining.light); setBox(c, "CB-ARMORM", d.armorTraining.medium); setBox(c, "CB-ARMORH", d.armorTraining.heavy); setBox(c, "CB-ARMORS", d.armorTraining.shield);
  setBox(c, "CB-WEAPONSIMPLE", d.weaponTraining.simple); setBox(c, "CB-WEAPONMARTIAL", d.weaponTraining.martial); setBox(c, "CB-WEAPONIMPROVISED", d.weaponTraining.improvised);
  deathBoxes(c, ["CB-death1", "CB-death2", "CB-death3"], d.deathSuccess);
  deathBoxes(c, ["CB-death4", "CB-death5", "CB-death6"], d.deathFail);
  weaponRows(c, d, [
    { name: "WEAPON NAME 1", bonus: "Text Field39", dmg: "Text Field40", notes: "Text Field151" }, { name: "WEAPON NAME 2", bonus: "Text Field43", dmg: "Text Field44", notes: "Text Field152" },
    { name: "WEAPON NAME 3", bonus: "Text Field47", dmg: "Text Field48", notes: "Text Field49" }, { name: "WEAPON NAME 4", bonus: "Text Field51", dmg: "Text Field52", notes: "Text Field53" },
    { name: "WEAPON NAME 5", bonus: "Text Field55", dmg: "Text Field56", notes: "Text Field57" }, { name: "WEAPON NAME 6", bonus: "Text Field59", dmg: "Text Field60", notes: "Text Field61" },
  ]);
  const cf = splitEntries(d.classFeatures, 1650, 2);
  featureBox(c, "CLASS FEATURES 1", cf.texts[0]); featureBox(c, "CLASS FEATURES 2", cf.texts[1] + (cf.dropped ? `\n(+${cf.dropped} more features, see Soul Forge)` : ""));
  featureBox(c, "TRAITS", d.traits.join("\n")); featureBox(c, "FEATS", d.feats.join("\n"));
}

// ---------------------------------------------------------------- page 1 (style B)

function page1b(c: Ctx, d: FillData): void {
  fillCommon(c, d, {
    name: "Name0", background: "Background0", class: "Class0", species: "Species0", subclass: "Subclass0", level: "Level0", xp: "Experience Points0", ac: "AC0",
    hpCurrent: "Current HP0", hpMax: "Max HP0", hpTemp: "Temp HP0", hdSpent: "Spent HD0", hdMax: "MAX HD0", speed: "SPEED0", exhaustion: "EXHAUSTION0",
    conditions: "Conditions and Effects", prof: ["Prof Bonus0"], size: "Size", darkvision: "Darkvision", tools: "TOOLS0", languages: "LANGUAGES0",
  });
  const A = d.abilities;
  const ab: [string, string, string, string, string][] = [
    ["strength", "SRT MOD0", "STR SORE0", "STR SAVE1", "CB-STRSAVE2"], ["dexterity", "DEX MOD0", "DEX SCORE0", "DEX SAVE0", "CB-DEXSAVE2"],
    ["constitution", "CON MOD0", "CON SCORE0", "CON SAVE0", "CB-CONSAVE2"], ["intelligence", "INT MOD0", "INTR SCORE0", "INT SAVE1", "CB-INTSAVE2"],
    ["wisdom", "WIS MOD0", "WIS SCORE0", "WIS SAVE0", "CB-WISSAVE2"], ["charisma", "CHA MOD0", "CHA SCORE0", "CHA SAVE0", "CB-CHASAVE2"],
  ];
  for (const [id, mod, score, save, cb] of ab) {
    const a = A[id as keyof typeof A];
    setText(c, mod, a.mod); setText(c, score, a.score); setText(c, save, a.save); setBox(c, cb, a.saveProf);
  }
  const left = ["acrobatics", "animal handling", "arcana", "athletics", "deception", "history", "insight", "intimidation", "investigation"];
  const right = ["medicine", "nature", "perception", "performance", "persuasion", "religion", "sleight of hand", "stealth", "survival"];
  const rightProf = ["CB-SKILLPROF11", "CB-SKILLPROF12", "CB-SKILLPROF13", "CB-SKILLPROF13", "CB-SKILLPROF14", "CB-SKILLPROF15", "CB-SKILLPROF16", "CB-SKILLPROF17", "CB-SKILLPROF18"];
  left.forEach((name, i) => {
    const s = d.skills[name];
    setText(c, `${name.toUpperCase()}0`, s.bonus); setBox(c, `CB-SKILLPROF${i + 1}`, s.prof); setBox(c, `CB-SKILLEXP${i + 1}`, s.expert);
  });
  right.forEach((name, i) => {
    const s = d.skills[name];
    setText(c, `${name.toUpperCase()}0`, s.bonus);
    // Perception and Performance share one field name on this sheet, so they are set box by box (top one first).
    setBox(c, rightProf[i], s.prof, i === 3 ? 1 : 0);
    setBox(c, `CB-SKILLEXP${i + 10}`, s.expert);
  });
  setText(c, "INIT0", d.initiative);
  setText(c, "CARRY CAP", d.carryCapacity); setText(c, "PUSH/PULL/DRAG", d.pushDrag);
  setBox(c, "CB-INSP2", d.inspiration); setBox(c, "CB-SHIELD2", d.shield);
  setBox(c, "CB-ARMORL2", d.armorTraining.light); setBox(c, "CB-ARMORM2", d.armorTraining.medium); setBox(c, "CB-ARMORH2", d.armorTraining.heavy); setBox(c, "CB-ARMORS2", d.armorTraining.shield);
  setBox(c, "CB-WEPSIMPLE", d.weaponTraining.simple); setBox(c, "CB-WEPMARTIAL", d.weaponTraining.martial); setBox(c, "CB-WEPIMP", d.weaponTraining.improvised);
  deathBoxes(c, ["CB-death7", "CB-death8", "CB-death9"], d.deathSuccess);
  deathBoxes(c, ["CB-death10", "CB-death11", "CB-death12"], d.deathFail);
  weaponRows(c, d, [
    { name: "Text Field82", bonus: "Text Field83", dmg: "Text Field84", notes: "Text Field85" }, { name: "Text Field86", bonus: "Text Field87", dmg: "Text Field88", notes: "Text Field89" },
    { name: "Text Field90", bonus: "Text Field91", dmg: "Text Field92", notes: "Text Field93" }, { name: "Text Field94", bonus: "Text Field95", dmg: "Text Field96", notes: "Text Field97" },
    { name: "Text Field98", bonus: "Text Field99", dmg: "Text Field100", notes: "Text Field101" }, { name: "Text Field102", bonus: "Text Field103", dmg: "Text Field104", notes: "Text Field105" },
  ]);
  const cf = splitEntries(d.classFeatures, 1650, 2);
  featureBox(c, "CLASS FEATURES 0", cf.texts[0]); featureBox(c, "CLASS FEATURES 3", cf.texts[1] + (cf.dropped ? `\n(+${cf.dropped} more features, see Soul Forge)` : ""));
  featureBox(c, "TRAITS0", d.traits.join("\n")); featureBox(c, "FEATS0", d.feats.join("\n"));
}

// ---------------------------------------------------------------- spells and slots (geometry based)

const SLOT_COLUMNS = {
  p2a: { totalX: [182, 270, 348], totalY: [680, 666, 652], pipX: [[195, 232], [283, 312], [360, 382]] },
  spells: { totalX: [43, 131, 210], totalY: [679, 665, 651], pipX: [[58, 92], [146, 172], [224, 240]] },
};

function fillSlots(c: Ctx, page: number, which: "p2a" | "spells", d: FillData): void {
  if (!d.casting) return;
  const ws = c.widgets.filter((w) => w.page === page);
  const cfg = SLOT_COLUMNS[which];
  for (let n = 1; n <= 9; n++) {
    const row = (n - 1) % 3;
    const col = Math.floor((n - 1) / 3);
    const total = ws.find((w) => w.type === "Tx" && Math.abs(w.x - cfg.totalX[col]) <= 3 && Math.abs(w.y - cfg.totalY[row]) <= 3);
    if (total) setText(c, total.name, d.casting.slots[n - 1] || "", { exact: true, size: 8 });
    const [x0, x1] = cfg.pipX[col];
    const pips = ws.filter((w) => w.type === "Btn" && w.x >= x0 && w.x <= x1 && Math.abs(w.y - cfg.totalY[row]) <= 4).sort((a, b) => a.x - b.x);
    const used = d.casting.used[n - 1] ?? 0;
    pips.forEach((p, i) => setBox(c, p.name, i < used, 0, true));
  }
}

function spellHeader(c: Ctx, d: FillData, names: { ability: string; mod: string; dc: string; attack: string }): void {
  if (!d.casting) return;
  setText(c, names.ability, d.casting.ability); setText(c, names.mod, d.casting.mod); setText(c, names.dc, d.casting.dc); setText(c, names.attack, d.casting.attack);
}

function fillSpellRows(c: Ctx, page: number, which: "p2a" | "spells", spells: SpellRow[]): void {
  const ws = c.widgets.filter((w) => w.page === page);
  const texts = ws.filter((w) => w.type === "Tx" && w.y < (which === "p2a" ? 600 : 600));
  const rows = rowsOf(texts.filter((w) => w.h >= 14 && w.h <= 18 && w.w < 300), 4).filter((r) => r.length >= 4);
  const boxes = ws.filter((w) => w.type === "Btn");
  rows.forEach((row, i) => {
    const s = spells[i];
    const col = (x: number, tol = 6) => row.find((w) => Math.abs(w.x - x) <= tol);
    const cell = which === "p2a"
      ? { level: col(18), name: col(43), time: col(155), range: col(189), notes: col(306) }
      : { level: col(16), name: col(42), school: col(124), time: col(166), range: col(200), duration: col(256), notes: col(330), page: col(560) };
    for (const [k, w] of Object.entries(cell)) {
      if (!w) continue;
      const v = !s ? "" : k === "level" ? (s.level === "0" ? "C" : s.level) : k === "name" ? s.name : k === "time" ? s.time : k === "range" ? s.range : k === "notes" ? s.notes : k === "school" ? s.school : k === "duration" ? s.duration : "";
      setText(c, w.name, v, { max: 8, exact: true });
    }
    // Check boxes sit in the same band as the row text.
    const band = boxes.filter((b) => b.y >= row[0].y - 6 && b.y <= row[0].y + 14);
    const at = (x: number, tol = 5) => band.find((b) => Math.abs(b.x - x) <= tol);
    const flags = which === "p2a"
      ? { conc: at(239), rit: at(261), s: at(283), v: at(278, 4), m: at(287, 4) }
      : { conc: at(247), rit: at(156), v: at(293), s: at(302), m: at(312) };
    // On the first style the V box sits slightly lower than S; tell them apart by height.
    if (which === "p2a") {
      const near = band.filter((b) => b.x >= 275 && b.x <= 292);
      const sorted = near.sort((a, b) => b.y - a.y);
      const sBox = sorted[0]; // upper box is S
      const vBox = near.filter((b) => b.x < 283).sort((a, b) => a.y - b.y)[0];
      const mBox = near.find((b) => b.x >= 285);
      flags.s = sBox && sBox.x >= 280 ? sBox : flags.s; flags.v = vBox ?? flags.v; flags.m = mBox ?? flags.m;
    }
    if (flags.conc) setBox(c, flags.conc.name, !!s?.concentration, 0, true);
    if (flags.rit) setBox(c, flags.rit.name, !!s?.ritual, 0, true);
    if (flags.v) setBox(c, flags.v.name, !!s?.v, 0, true);
    if (flags.s) setBox(c, flags.s.name, !!s?.s, 0, true);
    if (flags.m) setBox(c, flags.m.name, !!s?.m, 0, true);
  });
}

// ---------------------------------------------------------------- page 2 (style A) and (style B)

function coins(c: Ctx, d: FillData, names: string[]): void {
  (["cp", "sp", "ep", "gp", "pp"] as const).forEach((k, i) => setText(c, names[i], d.coins[k] === "0" ? "" : d.coins[k], { keepSize: true }));
}

function magicItems(c: Ctx, d: FillData, attune: string[], names: string[]): void {
  names.forEach((n, i) => {
    const m = d.magicItems[i];
    setText(c, n, m?.name ?? "");
    setBox(c, attune[i], !!m?.attuned);
  });
}

function page2a(c: Ctx, d: FillData, page: number): void {
  spellHeader(c, d, { ability: "SPELLCASTING ABILITY22", mod: "SPELLCASTING MOD24", dc: "SPELL SAVE DC25", attack: "SPELL ATTK BONUS23" });
  fillSlots(c, page, "p2a", d);
  fillSpellRows(c, page, "p2a", d.spells);
  setText(c, "Armor Worn1", d.armorWorn);
  multiBox(c, "WEAPONS1", d.weaponsText); multiBox(c, "EQUIPMENT1", d.otherGear);
  magicItems(c, d, ["CB-ATTUNE1", "CB-ATTUNE2", "CB-ATTUNE3", "CB-ATTUNE4", "CB-ATTUNE5"], ["MAGIC ITEM1", "MAGIC ITEM2", "MAGIC ITEM3", "MAGIC ITEM4", "MAGIC ITEM5"]);
  coins(c, d, ["COIN6", "COIN7", "COIN8", "COIN9", "COIN10"]);
  multiBox(c, "Text Field114", [d.personality, d.backstory].filter(Boolean).join("\n\n"));
}

function page2b(c: Ctx, d: FillData): void {
  setText(c, "Armor Worn2", d.armorWorn);
  multiBox(c, "Text Field106", d.weaponsText); multiBox(c, "Text Field108", d.otherGear);
  magicItems(c, d, ["CB-ATTUNE6", "CB-ATTUNE7", "CB-ATTUNE8", "CB-ATTUNE9", "CB-ATTUNE10"], ["MAGIC ITEM6", "MAGIC ITEM7", "MAGIC ITEM8", "MAGIC ITEM9", "MAGIC ITEM10"]);
  coins(c, d, ["COIN1", "COIN2", "COIN3", "COIN4", "COIN5"]);
  multiBox(c, "Text Field114", [d.personality, d.backstory].filter(Boolean).join("\n\n"));
  setText(c, "Text Field115", d.alignment); multiBox(c, "Text Field116", d.appearance);
  // Features that did not fit on page 1, then the player's notes, go in the additional features box.
  const first = splitEntries(d.classFeatures, 1650, 2);
  const extra = splitEntries([...first.overflow, ...(d.notes ? d.notes.split("\n").filter(Boolean) : [])], 1000, 2);
  featureBox(c, "Text Field118", extra.texts[0]); featureBox(c, "Text Field119", extra.texts[1]);
  const k = d.companion;
  if (k) {
    setText(c, "Text Field126", k.name); setText(c, "Text Field127", k.type); setText(c, "Text Field128", [k.creature, k.size].filter(Boolean).join(", "));
    setText(c, "Text Field129", k.ac); setText(c, "Text Field130", k.speed); setText(c, "Text Field131", k.hp); setText(c, "Text Field133", k.hp.match(/\d+/)?.[0] ?? "");
    const ab = k.abilities;
    const mod = (v: string) => (v ? (Math.floor((Number(v) - 10) / 2) >= 0 ? `+${Math.floor((Number(v) - 10) / 2)}` : String(Math.floor((Number(v) - 10) / 2))) : "");
    const pairs: [string, string, string][] = [["strength", "STR SORE1", "SRT MOD1"], ["intelligence", "INTR SCORE1", "INT MOD1"], ["dexterity", "DEX SCORE1", "DEX MOD1"], ["wisdom", "WIS SCORE1", "WIS MOD1"], ["constitution", "CON SCORE1", "CON MOD1"], ["charisma", "CHA SCORE1", "CHA MOD1"]];
    for (const [a, score, m] of pairs) { setText(c, score, ab[a] ?? ""); setText(c, m, mod(ab[a] ?? "")); }
    multiBox(c, "Text Field117", [k.skills && `Skills: ${k.skills}`, k.senses && `Senses: ${k.senses}`, k.traits].filter(Boolean).join("\n"));
  }
}

function spellsPage(c: Ctx, d: FillData, page: number): void {
  spellHeader(c, d, { ability: "SPELLCASTING ABILITY22", mod: "SPELLCASTING MOD24", dc: "SPELL SAVE DC25", attack: "SPELL ATTK BONUS23" });
  setText(c, "Spellcasting Focus", d.casting?.focus ?? "");
  fillSlots(c, page, "spells", d);
  fillSpellRows(c, page, "spells", d.spells);
}

// ---------------------------------------------------------------- entry

export interface FillOptions {
  pages: DldmPage[];
  font: { regular: ArrayBuffer | Uint8Array; bold?: ArrayBuffer | Uint8Array };
}

export interface FillResult {
  bytes: Uint8Array;
  pages: DldmPage[];
  missing: string[];
  notes: string[];
}

export async function fillDldm(template: Uint8Array | ArrayBuffer, data: FillData, opts: FillOptions): Promise<FillResult> {
  const doc = await PDFDocument.load(template);
  doc.registerFontkit(fontkit);
  const font: PDFFont = await doc.embedFont(opts.font.regular, { subset: true });
  // Recognise the pages by their original field names, before shared fields are split and renamed.
  const detected = detectPages(readWidgets(doc));
  splitSharedFields(doc);
  const widgets = readWidgets(doc);
  const alias = new Map<string, string[]>();
  for (const w of widgets) {
    const logical = w.name.replace(/__p\d+$/, "");
    const list = alias.get(logical) ?? alias.set(logical, []).get(logical)!;
    if (!list.includes(w.name)) list.push(w.name);
    if (w.name !== logical) {
      const own = alias.get(w.name) ?? alias.set(w.name, []).get(w.name)!;
      if (!own.includes(w.name)) own.push(w.name);
    }
  }
  const bold = opts.font.bold ? await doc.embedFont(opts.font.bold, { subset: true }) : undefined;
  const c: Ctx = { doc, form: doc.getForm(), widgets, missing: [], alias, rich: bold ? { r: font, b: bold } : undefined };
  const notes: string[] = [];
  const want = new Set(opts.pages);

  for (const [page, id] of detected) {
    if (!want.has(id)) continue;
    if (id === "p1a") page1a(c, data);
    else if (id === "p1b") page1b(c, data);
    else if (id === "p2a") page2a(c, data, page);
    else if (id === "p2b") page2b(c, data);
    else spellsPage(c, data, page);
  }
  // Portrait goes in the picture boxes on the second-page sheets.
  if (data.portrait) {
    try {
      const bytes = Uint8Array.from(atob(data.portrait.split(",")[1] ?? ""), (ch) => ch.charCodeAt(0));
      const img = await doc.embedJpg(bytes);
      for (const name of ["Image Field", "Image Field0"]) {
        const page = [...detected.entries()].find(([, id]) => (name === "Image Field" ? id === "p2a" : id === "p2b"))?.[1];
        if (page && want.has(page)) for (const real of actual(c, name)) c.form.getButton(real).setImage(img);
      }
    } catch {
      notes.push("The portrait could not be placed.");
    }
  }
  if (data.spells.length > 20 && want.has("p2a") && !want.has("spells")) notes.push(`${data.spells.length - 20} spells did not fit on page 2. Add the spell list page.`);
  const spellsFit = 32;
  if (data.spells.length > spellsFit && want.has("spells")) notes.push(`${data.spells.length - spellsFit} spells did not fit on the spell list page.`);
  if (data.casting && !data.spells.length && (want.has("p2a") || want.has("spells"))) notes.push("No spells are known or prepared yet.");

  // Make the embedded font known to the form, so viewers can find it by the name the fields use.
  const acroForm = doc.catalog.lookup(PDFName.of("AcroForm"));
  if (acroForm instanceof PDFDict) {
    let dr = acroForm.lookup(PDFName.of("DR"));
    if (!(dr instanceof PDFDict)) {
      dr = doc.context.obj({});
      acroForm.set(PDFName.of("DR"), dr);
    }
    let fonts = (dr as PDFDict).lookup(PDFName.of("Font"));
    if (!(fonts instanceof PDFDict)) {
      fonts = doc.context.obj({});
      (dr as PDFDict).set(PDFName.of("Font"), fonts);
    }
    (fonts as PDFDict).set(PDFName.of(font.name), font.ref);
  }
  c.form.updateFieldAppearances(font);

  // Drop pages the player did not ask for.
  const drop = [...detected.entries()].filter(([, id]) => !want.has(id)).map(([p]) => p).sort((a, b) => b - a);
  for (const p of drop) doc.removePage(p);
  return { bytes: await doc.save(), pages: [...detected.values()].filter((id) => want.has(id)), missing: [...new Set(c.missing)], notes };
}

/** Which pages a loaded PDF offers, for the picker. */
export async function inspectDldm(template: Uint8Array | ArrayBuffer): Promise<DldmPage[]> {
  const doc = await PDFDocument.load(template);
  const widgets = readWidgets(doc);
  return [...detectPages(widgets).values()];
}

export type { PDFTextField };
