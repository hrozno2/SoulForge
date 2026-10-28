import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formStats, type FormKind } from "../aurora/forms";
import { logEvent } from "../logbook";
import fontkit from "@pdf-lib/fontkit";
import type { AElement } from "../aurora/types";
import type { Resolved } from "../aurora/engine";
import { everySpellOf, readySpells, stripHtml, type SheetData } from "../aurora/sheet";
import { playTips } from "./tips";
import { drawSoulForgeSheet } from "./sheetSF";
import { buildFillData } from "../sheets/data";
import { translatable, translateAll, type BatchTranslator } from "./translate";
import { lookup } from "./glossary";

export interface PdfOptions {
  paper: "a4" | "letter";
  sheet: boolean;
  spellCards: boolean;
  itemCards: boolean;
  featureCards: boolean;
  /** Wild Shape forms and companions, each worked out for the character (C5.3, src/aurora/forms.ts). */
  formCards?: boolean;
  tips?: boolean;
  /** The spell pages list every spell the character can prepare, not only the prepared ones. */
  allSpells?: boolean;
  /**
   * Which spells get a card: "prepared" (the default: cantrips, always-prepared and prepared spells, as the spell
   * table) or "all" (every spell the character can prepare, a cleric's whole list).
   */
  spellCardScope?: "prepared" | "all";
  /** Translate the printed text. Names the player typed are kept as they are. */
  translate?: {
    target: string;
    translator: BatchTranslator;
    cache: { get(k: string): Promise<string | undefined>; put(k: string, v: string): Promise<void> };
    onProgress?: (done: number, total: number) => void;
    onResult?: (failed: number) => void;
    /** Keep names of spells, items and features in English. */
    keepNames?: boolean;
    /** Terms with fixed translations, used before anything goes to the service. */
    glossary?: import("./glossary").Glossary;
  };
}

export interface FontData {
  regular: ArrayBuffer | Uint8Array;
  bold: ArrayBuffer | Uint8Array;
}

export const DEFAULT_PDF_OPTIONS: PdfOptions = {
  paper: "a4",
  sheet: true,
  spellCards: true,
  itemCards: true,
  featureCards: true,
  formCards: true,
  tips: true,
};

const PAPER = { a4: [595.28, 841.89], letter: [612, 792] } as const;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.4, 0.4, 0.45);
const LINE = rgb(0.788, 0.678, 0.416); // #C9AD6A gilt
const ACCENT = rgb(0.345, 0.094, 0.051); // #58180D, the heading red of the printed books
const FILL = rgb(0.933, 0.898, 0.808); // #EEE5CE parchment

// Strip control and zero-width characters the embedded font cannot draw.
// While a translated PDF is built, every string that gets drawn passes through here.
let TR: ((s: string) => string) | null = null;

function clean(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    const bad =
      (c < 32 && c !== 10) || c === 11 || c === 12 || (c >= 0x200b && c <= 0x200f) || c === 0x2028 || c === 0x2029 || c === 0xfeff;
    if (!bad) out += ch;
  }
  return TR ? TR(out) : out;
}

interface Fonts {
  r: PDFFont;
  b: PDFFont;
}

/** Wrap text to a pixel width, honouring explicit newlines. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n").map(clean)) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      // Break a single very long word.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

function text(page: PDFPage, s: string, x: number, y: number, font: PDFFont, size: number, color = INK): void {
  page.drawText(clean(s), { x, y, font, size, color });
}

function fit(s: string, font: PDFFont, size: number, maxWidth: number): string {
  let t = clean(s);
  if (font.widthOfTextAtSize(t, size) <= maxWidth) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > maxWidth) t = t.slice(0, -1);
  return `${t}...`;
}

// ---------------------------------------------------------------- cards

const CARD_W = 180; // 2.5 in
const CARD_H = 252; // 3.5 in

interface CardData {
  title: string;
  subtitle: string;
  stats: [string, string][];
  body: string;
  kind: string;
}

function spellCard(e: AElement): CardData {
  const m = (k: string) => e.setters[k]?.value;
  const level = Number(m("level") ?? 0);
  const comps = [m("hasVerbalComponent") === "true" && "V", m("hasSomaticComponent") === "true" && "S", m("hasMaterialComponent") === "true" && "M"].filter(Boolean).join(", ");
  const tags = [m("isConcentration") === "true" && "Concentration", m("isRitual") === "true" && "Ritual"].filter(Boolean).join(", ");
  const subtitle = [level === 0 ? `${m("school") ?? ""} Cantrip`.trim() : `Level ${level} ${m("school") ?? ""}`.trim(), tags].filter(Boolean).join(" - ");
  const stats: [string, string][] = [];
  if (m("time")) stats.push(["Casting Time", m("time")!]);
  if (m("range")) stats.push(["Range", m("range")!]);
  if (comps) stats.push(["Components", m("materialComponent") ? `${comps} (${m("materialComponent")})` : comps]);
  if (m("duration")) stats.push(["Duration", m("duration")!]);
  return { title: e.name, subtitle, stats, body: stripHtml(e.description), kind: "SPELL" };
}

function itemCard(e: AElement, qty: number): CardData {
  const s = e.setters;
  const stats: [string, string][] = [];
  if (s.damage) stats.push(["Damage", `${s.damage.value} ${s.damage.attrs.type ?? ""}`.trim()]);
  if (s.versatile) stats.push(["Versatile", s.versatile.value]);
  if (s.armorClass) stats.push(["Armor Class", s.armorClass.value]);
  if (s.armor) stats.push(["Armor", s.armor.value]);
  if (s.category) stats.push(["Category", s.category.value]);
  if (s.cost) stats.push(["Cost", `${s.cost.value} ${s.cost.attrs.currency ?? ""}`.trim()]);
  if (s.weight) stats.push(["Weight", s.weight.value]);
  if (qty > 1) stats.push(["Quantity", String(qty)]);
  return { title: e.name, subtitle: s.category?.value ?? e.type, stats, body: stripHtml(e.description), kind: "ITEM" };
}

function drawCard(page: PDFPage, f: Fonts, c: CardData, x: number, y: number): void {
  // (x, y) is the bottom-left corner.
  page.drawRectangle({ x, y, width: CARD_W, height: CARD_H, borderColor: INK, borderWidth: 1 });
  page.drawRectangle({ x: x + 1, y: y + CARD_H - 34, width: CARD_W - 2, height: 33, color: FILL });
  const pad = 8;
  const inner = CARD_W - 2 * pad;
  let ts = 11;
  while (ts > 7 && f.b.widthOfTextAtSize(clean(c.title), ts) > inner) ts -= 0.5;
  text(page, fit(c.title, f.b, ts, inner), x + pad, y + CARD_H - 15, f.b, ts);
  text(page, fit(c.subtitle, f.r, 7, inner - 30), x + pad, y + CARD_H - 27, f.r, 7, MUTED);
  const kw = f.r.widthOfTextAtSize(c.kind, 5.5);
  text(page, c.kind, x + CARD_W - pad - kw, y + CARD_H - 27, f.r, 5.5, MUTED);

  let cy = y + CARD_H - 46;
  for (const [k, v] of c.stats) {
    const lines = wrap(v, f.r, 7, inner - 58);
    text(page, k, x + pad, cy, f.b, 7);
    lines.slice(0, 3).forEach((l, i) => text(page, l, x + pad + 58, cy - i * 8.4, f.r, 7));
    cy -= Math.max(1, Math.min(3, lines.length)) * 8.4 + 1.5;
  }
  page.drawLine({ start: { x: x + pad, y: cy + 4 }, end: { x: x + CARD_W - pad, y: cy + 4 }, color: LINE, thickness: 0.6 });
  cy -= 6;

  // Auto-shrink the body until it fits, then truncate with an ellipsis.
  const avail = cy - (y + 8);
  let size = 9;
  let lines = wrap(c.body, f.r, size, inner);
  while (size > 5.2 && lines.length * (size + 1.6) > avail) {
    size -= 0.4;
    lines = wrap(c.body, f.r, size, inner);
  }
  const lh = size + 1.6;
  const maxLines = Math.max(1, Math.floor(avail / lh));
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines) shown[maxLines - 1] = fit(`${shown[maxLines - 1]} ...`, f.r, size, inner);
  shown.forEach((l, i) => text(page, l, x + pad, cy - i * lh, f.r, size));
}

function drawCards(pdf: PDFDocument, f: Fonts, cards: CardData[], size: readonly [number, number]): void {
  const [W, H] = size;
  const cols = 3;
  const rows = 3;
  const left = (W - cols * CARD_W) / 2;
  const bottom = (H - rows * CARD_H) / 2;
  for (let i = 0; i < cards.length; i += cols * rows) {
    const page = pdf.addPage([W, H]);
    cards.slice(i, i + cols * rows).forEach((c, j) => {
      const col = j % cols;
      const row = Math.floor(j / cols);
      drawCard(page, f, c, left + col * CARD_W, bottom + (rows - 1 - row) * CARD_H);
    });
  }
}

function drawTips(pdf: PDFDocument, f: Fonts, r: Resolved, sh: SheetData, size: readonly [number, number]): void {
  const [W, H] = size;
  const M = 44;
  const colW = W - 2 * M;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const head = (t: string, big = false) => {
    if (y < M + 40) { page = pdf.addPage([W, H]); y = H - M; }
    page.drawText(clean(t), { x: M, y: y - (big ? 18 : 12), font: f.b, size: big ? 20 : 12, color: ACCENT });
    y -= big ? 26 : 20;
    page.drawLine({ start: { x: M, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: big ? 1.4 : 0.6, color: LINE });
    y -= 6;
  };
  head("Tips and tricks for play", true);
  for (const g of playTips(r, sh)) {
    head(g.title);
    for (const it of g.items) {
      const lines = wrap(it, f.r, 9.5, colW - 14);
      if (y - lines.length * 12.5 < M) { page = pdf.addPage([W, H]); y = H - M; }
      page.drawText("\u2022", { x: M + 2, y: y - 9.5, font: f.b, size: 10, color: ACCENT });
      lines.forEach((l, i) => page.drawText(l, { x: M + 14, y: y - 9.5 - i * 12.5, font: f.r, size: 9.5, color: INK }));
      y -= lines.length * 12.5 + 4;
    }
    y -= 6;
  }
}

// ---------------------------------------------------------------- entry

export function cardSources(r: Resolved, sh: SheetData, scope: "prepared" | "all" = "prepared") {
  const spellIds = new Set<string>();
  for (const c of sh.casting) for (const p of scope === "all" ? everySpellOf(r, c) : readySpells(c)) spellIds.add(p.id);
  const spells = [...spellIds].map((id) => r.reg.get(id)).filter((e): e is AElement => !!e)
    .sort((a, b) => Number(a.setters.level?.value ?? 0) - Number(b.setters.level?.value ?? 0) || a.name.localeCompare(b.name));
  const items = r.character.inventory.map((i) => ({ el: i.id ? r.reg.get(i.id) : undefined, qty: i.qty })).filter((x): x is { el: AElement; qty: number } => !!x.el);
  const features = sh.features.filter((x) => ["Feat", "Feat Feature", "Archetype Feature", "Class Feature", "Racial Trait"].includes(x.type));
  // Forms: the beasts picked in Wild Shape's choices; companions: the rest the character has (granted or added).
  const formIds = new Set(r.slots.filter((s) => s.rule.type === "Companion" && /\bws beast\b/.test(s.rule.supports ?? "")).flatMap((s) => s.chosen));
  const companionIds = new Set([...r.active.filter((a) => a.el.type === "Companion" && !formIds.has(a.el.id)).map((a) => a.el.id), ...r.character.companions.map((c) => c.id)]);
  const el = (id: string) => r.reg.get(id);
  const forms = [...[...formIds].map((id) => ({ el: el(id), kind: "wild shape" as const })), ...[...companionIds].map((id) => ({ el: el(id), kind: "companion" as const }))]
    .filter((x): x is { el: AElement; kind: "wild shape" | "companion" } => !!x.el);
  return { spells, items, features, forms };
}

/** A form or companion card: its numbers for this character (formStats), then skills and how the numbers came about. */
function formCard(r: Resolved, el: AElement, kind: FormKind): CardData {
  const b = formStats(r, el, kind);
  const sg = (n: number) => (n >= 0 ? `+${n}` : String(n));
  const abil = Object.entries(b.abilities).map(([k, v]) => [k.slice(0, 3).toUpperCase(), `${v} (${sg(Math.floor((v - 10) / 2))})`] as [string, string]);
  const skills = b.skills.filter((k) => k.bonus !== 0).sort((x, y) => y.bonus - x.bonus).slice(0, 8).map((k) => `${k.name.replace(/\b\w/g, (c) => c.toUpperCase())} ${sg(k.bonus)}`).join(", ");
  return {
    title: el.name,
    subtitle: kind === "wild shape" ? `Wild Shape form (${b.rules} rules)` : "Companion",
    stats: [["AC", String(b.ac)], ["HP", b.tempHp ? `${b.hp} + ${b.tempHp} temp` : String(b.hp)], ["Speed", b.speed || "-"], ...abil],
    body: [skills && `Skills: ${skills}.`, ...b.notes].filter(Boolean).join(" "),
    kind: "",
  };
}

export async function buildPdf(r: Resolved, sh: SheetData, opts: PdfOptions, fonts: FontData): Promise<Uint8Array> {
  // The log (A2.11): what was made, how long it took, or why it failed.
  const t0 = performance.now();
  try {
    const bytes = await buildPdfTranslated(r, sh, opts, fonts);
    logEvent("export", `Soul Forge PDF for ${r.character.name || "a character"}: ${[opts.sheet && "sheet", opts.spellCards && "spell cards", opts.itemCards && "item cards", opts.featureCards && "feature cards", opts.formCards !== false && "form cards", opts.tips && "tips"].filter(Boolean).join(", ")}${opts.translate ? `, translated to ${opts.translate.target}` : ""}; ${Math.round(bytes.length / 1024)} KB in ${Math.round(performance.now() - t0)} ms`);
    return bytes;
  } catch (e) {
    logEvent("export", `Soul Forge PDF failed: ${(e as Error).message}`);
    throw e;
  }
}

async function buildPdfTranslated(r: Resolved, sh: SheetData, opts: PdfOptions, fonts: FontData): Promise<Uint8Array> {
  const t = opts.translate;
  if (!t) return buildPdfOnce(r, sh, opts, fonts);
  // First pass only collects the strings that would be printed. Then they are translated, then the real pass runs.
  const seen = new Set<string>();
  const keep = new Set<string>([r.character.name, ...Object.values(r.character.info)].map((x) => String(x ?? "").trim()).filter(Boolean));
  if (t.keepNames !== false) {
    // Names of what is printed stay as they are; the descriptions around them are translated.
    const src = cardSources(r, sh, opts.spellCardScope);
    for (const e of [...src.spells, ...src.items.map((i) => i.el)]) keep.add(e.name);
    for (const f of src.features) keep.add(f.name);
    for (const i of r.character.inventory) { const n = i.id ? r.reg.get(i.id)?.name : i.custom?.name; if (n) keep.add(n); }
  }
  TR = (x) => {
    if ((t.glossary && lookup(t.glossary, x)) || translatable(x, keep)) seen.add(x);
    return x;
  };
  try {
    await buildPdfOnce(r, sh, opts, fonts);
    const { map, failed } = await translateAll(seen, t.target, t.translator, t.cache, t.onProgress, t.glossary);
    t.onResult?.(failed);
    TR = (x) => map.get(x) ?? x;
    return await buildPdfOnce(r, sh, opts, fonts);
  } finally {
    TR = null;
  }
}

async function buildPdfOnce(r: Resolved, sh: SheetData, opts: PdfOptions, fonts: FontData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(r.character.name || "Character");
  pdf.setCreator("Soul Forge");
  const f: Fonts = {
    r: await pdf.embedFont(fonts.regular, { subset: true }),
    b: await pdf.embedFont(fonts.bold, { subset: true }),
  };
  const size = PAPER[opts.paper];
  if (opts.sheet) await drawSoulForgeSheet(pdf, f, buildFillData(r, sh, { allSpells: opts.allSpells }), size, clean);

  const src = cardSources(r, sh, opts.spellCardScope);
  const cards: CardData[] = [];
  if (opts.spellCards) cards.push(...src.spells.map(spellCard));
  if (opts.itemCards) cards.push(...src.items.map((x) => itemCard(x.el, x.qty)));
  if (opts.featureCards) cards.push(...src.features.map((x) => ({ title: x.name, subtitle: x.type, stats: x.usage ? ([["Uses", x.usage]] as [string, string][]) : [], body: x.text, kind: "" })));
  if (opts.formCards !== false) cards.push(...src.forms.map((x) => formCard(r, x.el, x.kind)));
  if (cards.length) drawCards(pdf, f, cards, size);
  if (opts.tips) drawTips(pdf, f, r, sh, size);

  if (pdf.getPageCount() === 0) pdf.addPage([...size]);
  return pdf.save();
}

export function cardCounts(r: Resolved, sh: SheetData, scope: "prepared" | "all" = "prepared"): { spells: number; items: number; features: number; forms: number } {
  const s = cardSources(r, sh, scope);
  return { spells: s.spells.length, items: s.items.length, features: s.features.length, forms: s.forms.length };
}
