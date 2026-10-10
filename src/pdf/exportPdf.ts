import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { AElement } from "../aurora/types";
import type { Resolved } from "../aurora/engine";
import { ABILITY_LABEL, type Character } from "../aurora/character";
import { headerInfo, stripHtml, type SheetData } from "../aurora/sheet";
import { playTips } from "./tips";
import { translatable, translateAll, type BatchTranslator } from "./translate";

export interface PdfOptions {
  paper: "a4" | "letter";
  sheet: boolean;
  spellCards: boolean;
  itemCards: boolean;
  featureCards: boolean;
  tips?: boolean;
  /** Translate the printed text. Names the player typed are kept as they are. */
  translate?: {
    target: string;
    translator: BatchTranslator;
    cache: { get(k: string): Promise<string | undefined>; put(k: string, v: string): Promise<void> };
    onProgress?: (done: number, total: number) => void;
    onResult?: (failed: number) => void;
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
  tips: true,
};

const PAPER = { a4: [595.28, 841.89], letter: [612, 792] } as const;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.4, 0.4, 0.45);
const LINE = rgb(0.788, 0.678, 0.416); // #C9AD6A gilt
const ACCENT = rgb(0.345, 0.094, 0.051); // #58180D, the heading red of the printed books
const FILL = rgb(0.933, 0.898, 0.808); // #EEE5CE parchment

const sign = (n: number) => (n >= 0 ? `+${n}` : String(n));
const label = (id: string) => id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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

// ---------------------------------------------------------------- sheet

async function drawSheet(pdf: PDFDocument, f: Fonts, r: Resolved, sh: SheetData, size: readonly [number, number]): Promise<void> {
  const ch: Character = r.character;
  const [W, H] = size;
  const M = 30;
  let page = pdf.addPage([W, H]);
  const innerW = W - 2 * M;
  const head = headerInfo(r);

  text(page, ch.name || "Unnamed character", M, H - M - 18, f.b, 20);
  if (ch.portrait) {
    try {
      const bytes = Uint8Array.from(atob(ch.portrait.split(",")[1] ?? ""), (c) => c.charCodeAt(0));
      const img = await pdf.embedJpg(bytes);
      const h = 40;
      const w = (img.width / img.height) * h;
      page.drawImage(img, { x: W - M - w, y: H - M - 38, width: w, height: h });
    } catch {
      /* skip a portrait that cannot be embedded */
    }
  }
  const meta: [string, string][] = [
    ["SPECIES", head.species],
    ["CLASS", head.classLine],
    ["SUBCLASS", head.subclass],
    ["BACKGROUND", head.background],
    ["ALIGNMENT", head.alignment],
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

  top -= 40;
  const hd = sh.hitDice.map((h) => `${h.count}d${h.die}`).join("+") || "-";
  const combat: [string, string][] = [
    ["ARMOR CLASS", String(sh.ac.value)],
    ["INITIATIVE", sign(sh.initiative)],
    ["HIT POINTS", String(sh.hp)],
    ["HIT DICE", hd],
    ["PROFICIENCY", sign(sh.proficiency)],
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

  top -= 54;
  const aw = (innerW - gap * 2) / 3;
  const rowH = 124;
  sh.abilities.forEach((a, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = M + col * (aw + gap);
    const y = top - row * (rowH + gap);
    page.drawRectangle({ x, y: y - rowH, width: aw, height: rowH, borderColor: LINE, borderWidth: 0.8 });
    text(page, ABILITY_LABEL[a.id].toUpperCase(), x + 6, y - 12, f.b, 8);
    text(page, sign(a.mod), x + aw - 56, y - 16, f.b, 16);
    text(page, String(a.score), x + aw - 22, y - 12, f.r, 8, MUTED);
    page.drawLine({ start: { x: x + 4, y: y - 22 }, end: { x: x + aw - 4, y: y - 22 }, color: LINE, thickness: 0.6 });
    const rows: { name: string; bonus: number; level: "none" | "proficient" | "expertise" }[] = [
      { name: "Saving Throw", bonus: a.save, level: a.saveProficient ? "proficient" : "none" },
      ...sh.skills.filter((s) => s.ability === a.id).map((s) => ({ name: label(s.name), bonus: s.bonus, level: s.level })),
    ];
    rows.forEach((rw, j) => {
      const ly = y - 34 - j * 14;
      page.drawCircle({ x: x + 11, y: ly + 3, size: 3.2, borderColor: INK, borderWidth: 0.7, color: rw.level === "none" ? undefined : INK });
      if (rw.level === "expertise") page.drawCircle({ x: x + 11, y: ly + 3, size: 5, borderColor: INK, borderWidth: 0.5 });
      text(page, rw.name, x + 22, ly, f.r, 8.5);
      text(page, sign(rw.bonus), x + aw - 26, ly, f.b, 8.5);
    });
  });
  top -= 2 * rowH + gap + 12;

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
    for (const para of (desc ?? "").split("\n").filter(Boolean)) {
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

  const pr = sh.proficiencies;
  const profLines = ([["Armor", pr.armor], ["Weapons", pr.weapons], ["Tools", pr.tools], ["Languages", pr.languages], ["Other", pr.other], ["Senses", sh.vision]] as [string, string[]][]).filter(([, v]) => v.length);
  if (profLines.length) {
    heading("Training and proficiencies");
    profLines.forEach(([k, v]) => entry(k, v.map((x) => x.replace(/^(Armor|Weapon|Tool) Proficiency \((.*)\)$/, "$2")).join(", ")));
  }
  if (sh.attacks.length) {
    heading("Attacks");
    sh.attacks.forEach((a) => entry(a.name, `Attack ${sign(a.bonus)}. ${a.damage} ${a.damageType}. ${[a.properties, a.notes].filter(Boolean).join("; ")}`.trim()));
  }
  for (const c of sh.casting) {
    heading(`Spellcasting: ${c.name}`);
    entry("Spell save DC / attack", `DC ${c.dc}, attack ${sign(c.attack)}${c.prepare ? `, prepare ${c.prepareMax}` : ""}`);
    if (c.slots.length) entry("Spell slots", c.slots.map((s) => `Level ${s.level}: ${s.total}`).join(", "));
    const name = (id: string) => r.reg.get(id)?.name ?? id;
    if (c.cantripsKnown.length) entry("Cantrips", c.cantripsKnown.map((p) => name(p.id)).join(", "));
    const lvl = (id: string) => Number(r.reg.get(id)?.setters.level?.value ?? 0);
    const list = (c.prepare ? [...c.granted, ...c.spells.filter((s) => s.prepared)] : [...c.spells, ...c.granted]).filter((p) => lvl(p.id) > 0);
    const levels = [...new Set(list.map((p) => lvl(p.id)))].sort((a, b) => a - b);
    for (const l of levels) entry(`Level ${l}`, [...new Set(list.filter((p) => lvl(p.id) === l).map((p) => name(p.id)))].join(", "));
  }
  const groups: [string, string[]][] = [
    ["Species traits", ["Racial Trait"]],
    ["Class features", ["Class Feature"]],
    ["Subclass features", ["Archetype Feature"]],
    ["Feats", ["Feat", "Feat Feature"]],
    ["Background", ["Background Feature"]],
  ];
  for (const [title, types] of groups) {
    const list = sh.features.filter((x) => types.includes(x.type));
    if (!list.length) continue;
    heading(title);
    list.forEach((x) => entry(x.name, x.text, x.usage));
  }
  if (ch.inventory.length) {
    heading("Equipment");
    ch.inventory.forEach((i) => {
      const el = i.id ? r.reg.get(i.id) : undefined;
      entry(`${i.qty > 1 ? `${i.qty} x ` : ""}${el?.name ?? i.custom?.name ?? i.id}`, undefined, [i.equipped ? "equipped" : "", i.attuned ? "attuned" : ""].filter(Boolean).join(", "));
    });
    entry("Coins", (["pp", "gp", "ep", "sp", "cp"] as const).map((k) => `${ch.coins[k]} ${k.toUpperCase()}`).join(", "), `${sh.weight.carried}/${sh.weight.capacity} lb`);
  }
  const info = ([["Alignment", ch.info.alignment], ["Deity", ch.info.deity], ["Traits", ch.info.traits], ["Ideals", ch.info.ideals], ["Bonds", ch.info.bonds], ["Flaws", ch.info.flaws], ["Backstory", ch.info.backstory], ["Notes", ch.notes]] as [string, string][]).filter(([, v]) => v);
  if (info.length || sh.lists.length) {
    heading("Details");
    sh.lists.forEach((l) => entry(l.name, l.texts.join(" ")));
    info.forEach(([k, v]) => entry(k, v));
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

function cardSources(r: Resolved, sh: SheetData) {
  const spellIds = new Set<string>();
  for (const c of sh.casting) for (const p of [...c.cantripsKnown, ...c.spells.filter((s) => s.prepared || !c.prepare), ...c.granted]) spellIds.add(p.id);
  const spells = [...spellIds].map((id) => r.reg.get(id)).filter((e): e is AElement => !!e)
    .sort((a, b) => Number(a.setters.level?.value ?? 0) - Number(b.setters.level?.value ?? 0) || a.name.localeCompare(b.name));
  const items = r.character.inventory.map((i) => ({ el: i.id ? r.reg.get(i.id) : undefined, qty: i.qty })).filter((x): x is { el: AElement; qty: number } => !!x.el);
  const features = sh.features.filter((x) => ["Feat", "Feat Feature", "Archetype Feature", "Class Feature", "Racial Trait"].includes(x.type));
  return { spells, items, features };
}

export async function buildPdf(r: Resolved, sh: SheetData, opts: PdfOptions, fonts: FontData): Promise<Uint8Array> {
  const t = opts.translate;
  if (!t) return buildPdfOnce(r, sh, opts, fonts);
  // First pass only collects the strings that would be printed. Then they are translated, then the real pass runs.
  const seen = new Set<string>();
  const keep = new Set<string>([r.character.name, ...Object.values(r.character.info)].map((x) => String(x ?? "").trim()).filter(Boolean));
  TR = (x) => {
    if (translatable(x, keep)) seen.add(x);
    return x;
  };
  try {
    await buildPdfOnce(r, sh, opts, fonts);
    const { map, failed } = await translateAll(seen, t.target, t.translator, t.cache, t.onProgress);
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
  if (opts.sheet) await drawSheet(pdf, f, r, sh, size);

  const src = cardSources(r, sh);
  const cards: CardData[] = [];
  if (opts.spellCards) cards.push(...src.spells.map(spellCard));
  if (opts.itemCards) cards.push(...src.items.map((x) => itemCard(x.el, x.qty)));
  if (opts.featureCards) cards.push(...src.features.map((x) => ({ title: x.name, subtitle: x.type, stats: x.usage ? ([["Uses", x.usage]] as [string, string][]) : [], body: x.text, kind: "" })));
  if (cards.length) drawCards(pdf, f, cards, size);
  if (opts.tips) drawTips(pdf, f, r, sh, size);

  if (pdf.getPageCount() === 0) pdf.addPage([...size]);
  return pdf.save();
}

export function cardCounts(r: Resolved, sh: SheetData): { spells: number; items: number; features: number } {
  const s = cardSources(r, sh);
  return { spells: s.spells.length, items: s.items.length, features: s.features.length };
}
