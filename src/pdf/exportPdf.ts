import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { ABILITIES, ABILITY_NAMES, SKILLS, type Character, type Element, type Sheet } from "../engine/types";

export interface PdfOptions {
  paper: "a4" | "letter";
  sheet: boolean;
  spellCards: boolean;
  itemCards: boolean;
  featureCards: boolean;
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
};

const PAPER = { a4: [595.28, 841.89], letter: [612, 792] } as const;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.4, 0.4, 0.45);
const LINE = rgb(0.72, 0.72, 0.76);
const ACCENT = rgb(0.45, 0.3, 0.05);
const FILL = rgb(0.95, 0.94, 0.92);

const sign = (n: number) => (n >= 0 ? `+${n}` : String(n));
const label = (id: string) => id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
// Strip control and zero-width characters the embedded font cannot draw.
function clean(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    const bad =
      (c < 32 && c !== 10) || c === 11 || c === 12 || (c >= 0x200b && c <= 0x200f) || c === 0x2028 || c === 0x2029 || c === 0xfeff;
    if (!bad) out += ch;
  }
  return out;
}

interface Fonts {
  r: PDFFont;
  b: PDFFont;
}

/** Wrap text to a pixel width, honouring explicit newlines. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of clean(text).split("\n")) {
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

// ---------------------------------------------------------------- sheet

function drawSheet(pdf: PDFDocument, f: Fonts, ch: Character, sh: Sheet, size: readonly [number, number]): void {
  const [W, H] = size;
  const M = 30;
  let page = pdf.addPage([W, H]);
  const innerW = W - 2 * M;
  const byType = (t: string) => sh.elements.filter((e) => e.type === t && e.meta?.hidden !== "true");
  // The header always shows the chosen species, class and background, even when they are hidden from lists.
  const first = (t: string) => sh.elements.find((e) => e.type === t);

  // Header
  text(page, ch.name || "Unnamed character", M, H - M - 18, f.b, 20);
  const meta: [string, string][] = [
    ["SPECIES", first("species")?.name ?? "-"],
    ["CLASS", first("class")?.name ?? "-"],
    ["SUBCLASS", first("subclass")?.name ?? "-"],
    ["BACKGROUND", first("background")?.name ?? "-"],
    ["LEVEL", String(ch.level)],
  ];
  const gap = 6;
  const mw = (innerW - gap * (meta.length - 1)) / meta.length;
  let top = H - M - 30;
  meta.forEach(([k, v], i) => {
    const x = M + i * (mw + gap);
    page.drawRectangle({ x, y: top - 30, width: mw, height: 30, color: FILL });
    text(page, k, x + 5, top - 10, f.r, 6, MUTED);
    text(page, fit(v, f.b, 9.5, mw - 10), x + 5, top - 23, f.b, 9.5);
  });

  // Combat strip
  top -= 40;
  const die = first("class")?.hitDie ? `${ch.level}d${first("class")!.hitDie}` : "-";
  const combat: [string, string][] = [
    ["ARMOR CLASS", String(sh.ac)],
    ["INITIATIVE", sign(sh.initiative)],
    ["HIT POINTS", String(sh.hp)],
    ["HIT DICE", die],
    ["PROFICIENCY", sign(sh.proficiencyBonus)],
    ["SPEED", `${sh.speed} ft`],
    ["PASSIVE PERC.", String(sh.passivePerception)],
    ["INSPIRATION", ""],
  ];
  const cw = (innerW - gap * 7) / 8;
  combat.forEach(([k, v], i) => {
    const x = M + i * (cw + gap);
    page.drawRectangle({ x, y: top - 42, width: cw, height: 42, borderColor: LINE, borderWidth: 0.8 });
    text(page, k, x + 4, top - 10, f.r, 5.8, MUTED);
    if (k === "INSPIRATION") page.drawRectangle({ x: x + cw / 2 - 6, y: top - 36, width: 12, height: 12, borderColor: INK, borderWidth: 0.8 });
    else text(page, fit(v, f.b, 16, cw - 8), x + 4, top - 32, f.b, 16);
  });

  // Abilities with saves and skills underneath (2024 sheet layout)
  top -= 54;
  const aw = (innerW - gap * 2) / 3;
  const rowH = 124;
  ABILITIES.forEach((a, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = M + col * (aw + gap);
    const y = top - row * (rowH + gap);
    page.drawRectangle({ x, y: y - rowH, width: aw, height: rowH, borderColor: LINE, borderWidth: 0.8 });
    text(page, ABILITY_NAMES[a].toUpperCase(), x + 6, y - 12, f.b, 8);
    text(page, sign(sh.abilities[a].mod), x + aw - 56, y - 16, f.b, 16);
    text(page, String(sh.abilities[a].score), x + aw - 22, y - 12, f.r, 8, MUTED);
    page.drawLine({ start: { x: x + 4, y: y - 22 }, end: { x: x + aw - 4, y: y - 22 }, color: LINE, thickness: 0.6 });
    const rows: { name: string; bonus: number; level: "none" | "proficient" | "expertise" }[] = [
      { name: "Saving Throw", bonus: sh.saves[a].bonus, level: sh.saves[a].proficient ? "proficient" : "none" },
      ...Object.entries(SKILLS)
        .filter(([, ab]) => ab === a)
        .map(([id]) => ({ name: label(id), bonus: sh.skills[id].bonus, level: sh.skills[id].level })),
    ];
    rows.forEach((r, j) => {
      const ly = y - 34 - j * 14;
      page.drawCircle({
        x: x + 11,
        y: ly + 3,
        size: 3.2,
        borderColor: INK,
        borderWidth: 0.7,
        color: r.level === "none" ? undefined : INK,
      });
      if (r.level === "expertise") page.drawCircle({ x: x + 11, y: ly + 3, size: 5, borderColor: INK, borderWidth: 0.5 });
      text(page, r.name, x + 22, ly, f.r, 8.5);
      text(page, sign(r.bonus), x + aw - 26, ly, f.b, 8.5);
    });
  });
  top -= 2 * rowH + gap + 12;

  // Flowing two-column text sections
  const colW = (innerW - 14) / 2;
  const bottom = M + 10;
  let col = 0;
  let y = top;
  const nextSlot = () => {
    if (col === 0) {
      col = 1;
      y = top;
    } else {
      page = pdf.addPage([W, H]);
      col = 0;
      top = H - M;
      y = top;
    }
  };
  const colX = () => M + col * (colW + 14);
  const heading = (t: string) => {
    if (y < bottom + 40) nextSlot();
    text(page, t.toUpperCase(), colX(), y - 8, f.b, 8.5, ACCENT);
    page.drawLine({ start: { x: colX(), y: y - 11 }, end: { x: colX() + colW, y: y - 11 }, color: ACCENT, thickness: 0.8 });
    y -= 20;
  };
  const entry = (name: string, desc?: string, extra?: string) => {
    if (y < bottom + 22) nextSlot();
    text(page, fit(extra ? `${name}  (${extra})` : name, f.b, 8.6, colW), colX(), y - 8, f.b, 8.6);
    y -= 11;
    const paragraphs = (desc ?? "").split("\n").filter(Boolean);
    for (const para of paragraphs) {
      for (const line of wrap(para, f.r, 7.8, colW)) {
        if (y < bottom + 9) {
          nextSlot();
          text(page, `${name} (cont.)`, colX(), y - 8, f.b, 8.6, MUTED);
          y -= 11;
        }
        text(page, line, colX(), y - 7, f.r, 7.8);
        y -= 9.6;
      }
      y -= 2.4;
    }
    y -= 3;
  };

  const section = (title: string, list: Element[], withExtra?: (e: Element) => string | undefined) => {
    if (list.length === 0) return;
    heading(title);
    list.forEach((e) => entry(e.name, e.description, withExtra?.(e)));
  };

  section("Class features", [...byType("class").filter((e) => e.description), ...byType("subclass")]);
  section("Species traits and features", [...byType("species").filter((e) => e.description), ...byType("feature")]);
  section("Background and feats", [...byType("background"), ...byType("feat")]);
  section("Equipment", byType("item"), (e) => e.meta?.damage ?? e.meta?.armor);

  const spells = byType("spell").slice().sort((a, b) => Number(a.meta?.level ?? 0) - Number(b.meta?.level ?? 0) || a.name.localeCompare(b.name));
  if (spells.length) {
    heading("Spells");
    const levels = [...new Set(spells.map((s) => Number(s.meta?.level ?? 0)))];
    for (const lv of levels) {
      const names = spells.filter((s) => Number(s.meta?.level ?? 0) === lv).map((s) => s.name).join(", ");
      entry(lv === 0 ? "Cantrips" : `Level ${lv}`, names);
    }
  }
  if (Object.keys(sh.stats).length) {
    heading("Custom stats");
    Object.entries(sh.stats).forEach(([k, v]) => entry(k, sign(v)));
  }
  if (ch.notes) {
    heading("Notes");
    entry("Imported notes", ch.notes);
  }
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

function spellCard(e: Element): CardData {
  const m = e.meta ?? {};
  const level = Number(m.level ?? 0);
  const comps = [m.hasVerbalComponent && "V", m.hasSomaticComponent && "S", m.hasMaterialComponent && "M"].filter(Boolean).join(", ");
  const tags = [m.isConcentration && "Concentration", m.isRitual && "Ritual"].filter(Boolean).join(", ");
  const subtitle = [level === 0 ? `${m.school ?? ""} Cantrip`.trim() : `Level ${level} ${m.school ?? ""}`.trim(), tags].filter(Boolean).join(" - ");
  const stats: [string, string][] = [];
  if (m.time) stats.push(["Casting Time", m.time]);
  if (m.range) stats.push(["Range", m.range]);
  if (comps) stats.push(["Components", m.materialComponent ? `${comps} (${m.materialComponent})` : comps]);
  if (m.duration) stats.push(["Duration", m.duration]);
  return { title: e.name, subtitle, stats, body: e.description ?? "", kind: "SPELL" };
}

const ITEM_KEYS: [string, string][] = [
  ["damage", "Damage"],
  ["armor", "Armor"],
  ["category", "Category"],
  ["cost", "Cost"],
  ["weight", "Weight"],
  ["quantity", "Quantity"],
  ["rarity", "Rarity"],
];

function itemCard(e: Element): CardData {
  const m = e.meta ?? {};
  const stats = ITEM_KEYS.filter(([k]) => m[k]).map(([k, l]) => [l, m[k]] as [string, string]);
  return { title: e.name, subtitle: m.category ?? "Item", stats, body: e.description ?? "", kind: "ITEM" };
}

function featureCard(e: Element): CardData {
  return { title: e.name, subtitle: label(e.type), stats: [], body: e.description ?? "", kind: "" };
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

// ---------------------------------------------------------------- entry

export async function buildPdf(ch: Character, sh: Sheet, opts: PdfOptions, fonts: FontData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(ch.name || "Character");
  pdf.setCreator("CharForge");
  const f: Fonts = {
    r: await pdf.embedFont(fonts.regular, { subset: true }),
    b: await pdf.embedFont(fonts.bold, { subset: true }),
  };
  const size = PAPER[opts.paper];
  const by = (t: Element["type"]) => sh.elements.filter((e) => e.type === t && e.meta?.hidden !== "true");

  if (opts.sheet) drawSheet(pdf, f, ch, sh, size);

  const spells = by("spell")
    .slice()
    .sort((a, b) => Number(a.meta?.level ?? 0) - Number(b.meta?.level ?? 0) || a.name.localeCompare(b.name));
  const cards: CardData[] = [];
  if (opts.spellCards) cards.push(...spells.map(spellCard));
  if (opts.itemCards) cards.push(...by("item").map(itemCard));
  if (opts.featureCards) cards.push(...[...by("feat"), ...by("feature"), ...by("subclass")].map(featureCard));
  if (cards.length) drawCards(pdf, f, cards, size);

  if (pdf.getPageCount() === 0) pdf.addPage([...size]);
  return pdf.save();
}

export function cardCounts(sh: Sheet): { spells: number; items: number; features: number } {
  const n = (...t: Element["type"][]) => sh.elements.filter((e) => t.includes(e.type)).length;
  return { spells: n("spell"), items: n("item"), features: n("feat", "feature", "subclass") };
}
