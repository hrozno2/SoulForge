/**
 * The default Soul Forge character sheet: its own layout, drawn from scratch, with room for full feature text.
 * Page 1 is the play page (abilities, vitals, attacks, features), then spells, then equipment and story.
 * Anything that does not fit flows onto a continuation page, so nothing is cut off.
 */
import { rgb, type PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";
import type { FillData } from "../sheets/data";

interface Fonts {
  r: PDFFont;
  b: PDFFont;
}

const INK = rgb(0.11, 0.1, 0.12);
const MUTED = rgb(0.42, 0.4, 0.4);
const GILT = rgb(0.788, 0.678, 0.416);
const ACCENT = rgb(0.345, 0.094, 0.051);
const BAND = rgb(0.945, 0.91, 0.835);
const PANEL = rgb(0.988, 0.982, 0.965);
const RULE = rgb(0.83, 0.8, 0.74);
const STRIPE = rgb(0.972, 0.958, 0.925);

const M = 28;

const ABILITIES: { id: string; name: string; skills: string[] }[] = [
  { id: "strength", name: "Strength", skills: ["athletics"] },
  { id: "dexterity", name: "Dexterity", skills: ["acrobatics", "sleight of hand", "stealth"] },
  { id: "constitution", name: "Constitution", skills: [] },
  { id: "intelligence", name: "Intelligence", skills: ["arcana", "history", "investigation", "nature", "religion"] },
  { id: "wisdom", name: "Wisdom", skills: ["animal handling", "insight", "medicine", "perception", "survival"] },
  { id: "charisma", name: "Charisma", skills: ["deception", "intimidation", "performance", "persuasion"] },
];

const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

class Sheet {
  page!: PDFPage;
  readonly pw: number;
  readonly ph: number;
  constructor(private pdf: PDFDocument, readonly f: Fonts, size: readonly [number, number], readonly tx: (s: string) => string, private who: string) {
    [this.pw, this.ph] = size;
  }

  get W() { return this.pw - 2 * M; }
  get bottom() { return this.ph - M; }

  newPage(label?: string): number {
    this.page = this.pdf.addPage([this.pw, this.ph]);
    if (label) {
      this.text(this.who, M, M + 10, { size: 11, bold: true });
      this.text(label, this.pw - M, M + 10, { size: 8.5, color: MUTED, align: "right" });
      this.line(M, M + 16, this.pw - M, M + 16, GILT, 0.9);
      return M + 26;
    }
    return M;
  }

  private Y(top: number) { return this.ph - top; }

  fit(s: string, font: PDFFont, size: number, maxW: number): { t: string; size: number } {
    let t = this.tx(s);
    let sz = size;
    while (sz > 5.4 && font.widthOfTextAtSize(t, sz) > maxW) sz -= 0.4;
    if (font.widthOfTextAtSize(t, sz) > maxW) {
      while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, sz) > maxW) t = t.slice(0, -1);
      t = `${t}...`;
    }
    return { t, size: sz };
  }

  /** One line of text at a baseline given from the page top. Shrinks to fit maxW. */
  text(s: string, x: number, base: number, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: "left" | "center" | "right"; maxW?: number } = {}): void {
    if (!s) return;
    const font = o.bold ? this.f.b : this.f.r;
    const { t, size } = o.maxW ? this.fit(s, font, o.size ?? 8.5, o.maxW) : { t: this.tx(s), size: o.size ?? 8.5 };
    const w = font.widthOfTextAtSize(t, size);
    const px = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    this.page.drawText(t, { x: px, y: this.Y(base), size, font, color: o.color ?? INK });
  }

  line(x1: number, t1: number, x2: number, t2: number, color = RULE, w = 0.5): void {
    this.page.drawLine({ start: { x: x1, y: this.Y(t1) }, end: { x: x2, y: this.Y(t2) }, thickness: w, color });
  }

  rect(x: number, top: number, w: number, h: number, o: { fill?: ReturnType<typeof rgb>; border?: ReturnType<typeof rgb>; bw?: number } = {}): void {
    this.page.drawRectangle({ x, y: this.Y(top + h), width: w, height: h, color: o.fill, borderColor: o.border, borderWidth: o.border ? o.bw ?? 0.8 : 0 });
  }

  /** A framed block with a title band. Returns the top of its inside. */
  panel(x: number, top: number, w: number, h: number, name?: string): number {
    this.rect(x, top, w, h, { fill: PANEL, border: GILT });
    if (!name) return top + 6;
    this.rect(x, top, w, 15, { fill: BAND, border: GILT });
    this.text(name.toUpperCase(), x + w / 2, top + 10.5, { size: 7.4, bold: true, color: ACCENT, align: "center", maxW: w - 8 });
    return top + 21;
  }

  /** A small stat tile: label above, value large. */
  tile(x: number, top: number, w: number, h: number, label: string, value: string, sub?: string): void {
    this.rect(x, top, w, h, { fill: PANEL, border: GILT });
    this.text(label.toUpperCase(), x + w / 2, top + 9.5, { size: 5.8, bold: true, color: MUTED, align: "center", maxW: w - 6 });
    this.text(value, x + w / 2, top + h - (sub ? 15 : 9), { size: 16, bold: true, align: "center", maxW: w - 8 });
    if (sub) this.text(sub, x + w / 2, top + h - 5, { size: 6, color: MUTED, align: "center", maxW: w - 6 });
  }

  diamond(cx: number, cy: number, r: number, filled = false): void {
    this.page.drawSvgPath(`M 0 ${-r} L ${r} 0 L 0 ${r} L ${-r} 0 Z`, { x: cx, y: this.Y(cy), borderColor: INK, borderWidth: 0.8, color: filled ? INK : undefined });
  }

  dot(cx: number, cy: number, r: number, filled: boolean, ring = false): void {
    this.page.drawCircle({ x: cx, y: this.Y(cy), size: r, borderColor: INK, borderWidth: 0.8, color: filled ? INK : undefined });
    if (ring) this.page.drawCircle({ x: cx, y: this.Y(cy), size: r + 2, borderColor: INK, borderWidth: 0.6 });
  }

  wrap(s: string, font: PDFFont, size: number, w: number): string[] {
    const out: string[] = [];
    for (const para of this.tx(s).split("\n")) {
      let cur = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = cur ? `${cur} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= w) cur = next;
        else {
          if (cur) out.push(cur);
          cur = word;
        }
      }
      out.push(cur);
    }
    return out;
  }
}

/** A line of flowing text: a heading, or body text with an optional bold lead-in. */
interface Flow {
  text: string;
  lead?: string;
  head?: boolean;
  gap?: number;
}

function flowLines(sh: Sheet, items: { head?: string; lead?: string; body: string }[], w: number, size: number): Flow[] {
  const out: Flow[] = [];
  for (const it of items) {
    if (it.head) {
      out.push({ text: it.head.toUpperCase(), head: true, gap: out.length ? 5 : 0 });
      continue;
    }
    const leadW = it.lead ? sh.f.b.widthOfTextAtSize(`${sh.tx(it.lead)} `, size) : 0;
    // The first line has less room when it begins with a bold lead-in.
    const first = sh.wrap(it.body, sh.f.r, size, w - leadW);
    let lines = first;
    if (first.length && it.body) {
      // Re-wrap the rest at full width so only the first line is shortened.
      const used = first[0];
      const rest = sh.tx(it.body).slice(used.length).trim();
      lines = [used, ...(rest ? sh.wrap(rest, sh.f.r, size, w) : [])];
    }
    lines.forEach((l, i) => out.push({ text: l, lead: i === 0 ? it.lead : undefined, gap: i === 0 ? 2.5 : 0 }));
  }
  return out;
}

/** Draws lines top-down inside a box. Returns the lines that did not fit. */
function drawFlow(sh: Sheet, lines: Flow[], x: number, top: number, w: number, bottom: number, size: number): Flow[] {
  const lh = size * 1.28;
  let y = top;
  let i = 0;
  for (; i < lines.length; i++) {
    const l = lines[i];
    y += l.gap ?? 0;
    if (y + lh > bottom) break;
    y += lh;
    if (l.head) {
      sh.text(l.text, x, y - 2, { size: size - 1.2, bold: true, color: ACCENT });
      sh.line(x, y + 0.5, x + w, y + 0.5, RULE, 0.4);
      y += 1.5;
      continue;
    }
    let px = x;
    if (l.lead) {
      const lead = `${sh.tx(l.lead)} `;
      sh.text(lead, x, y - 2, { size, bold: true });
      px += sh.f.b.widthOfTextAtSize(lead, size);
    }
    sh.text(l.text, px, y - 2, { size });
  }
  return lines.slice(i);
}


// ---------------------------------------------------------------- page 1

function page1(sh: Sheet, d: FillData): Flow[] {
  const f = sh.f;
  let top = sh.newPage();
  const W = sh.W;

  // Identity
  sh.rect(M, top, W, 62, { fill: PANEL, border: GILT });
  let nameX = M + 12;
  if (d.portrait) {
    // The portrait is placed by the caller after the page exists; keep room for it.
    nameX = M + 74;
  }
  sh.text(d.name || "Unnamed character", nameX, top + 28, { size: 22, bold: true, maxW: W - (nameX - M) - 90 });
  sh.text([d.species, [d.className, d.level].filter(Boolean).join(" "), d.subclass && `(${d.subclass})`, d.background].filter(Boolean).join("  ·  "), nameX, top + 45, { size: 9.5, color: MUTED, maxW: W - (nameX - M) - 90 });
  if (d.alignment) sh.text(d.alignment, nameX, top + 56, { size: 7.5, color: MUTED, maxW: 200 });
  const cx = M + W - 36;
  sh.page.drawCircle({ x: cx, y: sh.ph - (top + 31), size: 25, borderColor: GILT, borderWidth: 1.4, color: BAND });
  sh.text(String(d.level), cx, top + 38, { size: 22, bold: true, align: "center" });
  sh.text("LEVEL", cx, top + 52, { size: 5.6, bold: true, color: MUTED, align: "center" });
  top += 70;

  // Vital tiles
  const gap = 5;
  const widths = [58, 58, 58, 58, 122, 74, 0];
  widths[6] = W - widths.slice(0, 6).reduce((a, b) => a + b, 0) - gap * 6;
  const pp = d.passive;
  const tiles: [string, string, string?][] = [
    ["Proficiency", d.profBonus],
    ["Initiative", d.initiative],
    ["Speed", d.speed ? `${d.speed} ft` : ""],
    ["Armor class", String(d.ac), d.shield ? "with shield" : undefined],
    ["Hit points", `${d.hpCurrent} / ${d.hpMax}`, d.hpTemp ? `+${d.hpTemp} temporary` : undefined],
    ["Hit dice", d.hdMax, d.hdSpent ? `${d.hdSpent} spent` : undefined],
    ["Passive perception", String(pp)],
  ];
  let x = M;
  tiles.forEach(([l, v, sub], i) => { sh.tile(x, top, widths[i], 44, l, v, sub); x += widths[i] + gap; });
  top += 50;

  // Strip: death saves, inspiration, size, senses, conditions
  sh.rect(M, top, W, 24, { fill: PANEL, border: GILT });
  sh.text("DEATH SAVES", M + 8, top + 15, { size: 5.8, bold: true, color: MUTED });
  for (let i = 0; i < 3; i++) {
    sh.diamond(M + 76 + i * 12, top + 12, 4.2, i < d.deathSuccess);
    sh.diamond(M + 130 + i * 12, top + 12, 4.2, i < d.deathFail);
  }
  sh.text("saved", M + 76, top + 21.5, { size: 5.4, color: MUTED });
  sh.text("failed", M + 130, top + 21.5, { size: 5.4, color: MUTED });
  sh.diamond(M + 198, top + 12, 5, d.inspiration);
  sh.text("Inspiration", M + 207, top + 15, { size: 7.5 });
  sh.text([d.size, d.darkvision && `darkvision ${d.darkvision}`].filter(Boolean).join(", "), M + 268, top + 15, { size: 7.5, maxW: 120 });
  const status = [d.conditions, d.exhaustion && `exhaustion ${d.exhaustion}`].filter(Boolean).join("; ");
  if (status) sh.text(status, M + W - 8, top + 15, { size: 7.5, bold: true, color: ACCENT, align: "right", maxW: W - 420 });
  top += 32;

  // Left column: abilities with saves and skills
  const lx = M, lw = 176;
  let ay = top;
  for (const a of ABILITIES) {
    const ab = d.abilities[a.id as keyof FillData["abilities"]];
    const rows = 1 + a.skills.length;
    const h = 30 + rows * 12.2 + 5;
    sh.rect(lx, ay, lw, h, { fill: PANEL, border: GILT });
    sh.rect(lx, ay, lw, 28, { fill: BAND, border: GILT });
    sh.text(a.name.toUpperCase(), lx + 8, ay + 12, { size: 8, bold: true, color: ACCENT });
    sh.text(`Score ${ab.score}`, lx + 8, ay + 23, { size: 7, color: MUTED });
    sh.text(ab.mod, lx + lw - 10, ay + 23, { size: 19, bold: true, align: "right" });
    let ry = ay + 30;
    const row = (label: string, bonus: string, prof: boolean, expert: boolean, bold = false) => {
      sh.dot(lx + 11, ry + 6.2, 2.9, prof, expert);
      sh.text(label, lx + 24, ry + 9, { size: 8, bold, maxW: lw - 64 });
      sh.text(bonus, lx + lw - 10, ry + 9, { size: 8.5, bold: true, align: "right" });
      sh.line(lx + 6, ry + 11.4, lx + lw - 6, ry + 11.4, RULE, 0.35);
      ry += 12.2;
    };
    row("Saving throw", ab.save, ab.saveProf, false, true);
    for (const s of a.skills) {
      const k = d.skills[s] ?? { bonus: "+0", prof: false, expert: false };
      row(title(s), k.bonus, k.prof, k.expert);
    }
    ay += h + 5;
  }

  // Right column
  const rx = M + lw + 8, rw = W - lw - 8;
  let ry = top;
  const nW = Math.max(6, Math.min(8, d.weapons.length));
  const ah = 21 + 12 + nW * 13.5 + 4;
  let iy = sh.panel(rx, ry, rw, ah, "Attacks and damage cantrips");
  const cols = [rx + 8, rx + rw * 0.36, rx + rw * 0.5, rx + rw * 0.76];
  ["Name", "Atk / DC", "Damage", "Notes"].forEach((h, i) => sh.text(h, cols[i], iy + 6, { size: 6.2, bold: true, color: MUTED }));
  iy += 9;
  for (let i = 0; i < nW; i++) {
    const w = d.weapons[i];
    if (i % 2 === 0) sh.rect(rx + 1, iy, rw - 2, 13.5, { fill: STRIPE });
    if (w) {
      sh.text(w.name, cols[0], iy + 9.6, { size: 8.4, bold: true, maxW: cols[1] - cols[0] - 6 });
      sh.text(w.bonus, cols[1], iy + 9.6, { size: 8.6, bold: true, maxW: cols[2] - cols[1] - 4 });
      sh.text(w.damage, cols[2], iy + 9.6, { size: 8.2, maxW: cols[3] - cols[2] - 4 });
      sh.text(w.notes, cols[3], iy + 9.6, { size: 7, color: MUTED, maxW: rx + rw - cols[3] - 6 });
    }
    iy += 13.5;
  }
  ry += ah + 6;

  // Training
  const langLines = sh.wrap(`Languages: ${d.languages || "Common"}`, f.r, 8, rw - 16);
  const toolLines = sh.wrap(`Tools and other: ${d.tools || "none"}`, f.r, 8, rw - 16);
  const th = 21 + 32 + (toolLines.length + langLines.length) * 10.5 + 6;
  iy = sh.panel(rx, ry, rw, th, "Training and proficiencies");
  let cxp = rx + 10;
  sh.text("Armor", cxp, iy + 8, { size: 7.5, bold: true, color: MUTED });
  cxp += 44;
  for (const [lab, on] of [["Light", d.armorTraining.light], ["Medium", d.armorTraining.medium], ["Heavy", d.armorTraining.heavy], ["Shields", d.armorTraining.shield]] as const) {
    sh.diamond(cxp + 4, iy + 5.5, 3.8, on); sh.text(lab, cxp + 11, iy + 8, { size: 8 }); cxp += 58;
  }
  cxp = rx + 10;
  sh.text("Weapons", cxp, iy + 21, { size: 7.5, bold: true, color: MUTED });
  cxp += 44;
  for (const [lab, on] of [["Simple", d.weaponTraining.simple], ["Martial", d.weaponTraining.martial]] as const) {
    sh.diamond(cxp + 4, iy + 18.5, 3.8, on); sh.text(lab, cxp + 11, iy + 21, { size: 8 }); cxp += 58;
  }
  let ty = iy + 36;
  for (const l of [...toolLines, ...langLines]) { sh.text(l, rx + 10, ty, { size: 8 }); ty += 10.5; }
  ry += th + 6;

  // Features, flowing; what does not fit continues on the next page
  const items: { head?: string; lead?: string; body: string }[] = [];
  let group = "";
  for (const ft of d.featureList) {
    if (ft.group !== group) { group = ft.group; items.push({ head: group, body: "" }); }
    items.push({ lead: `${ft.name}${ft.usage ? ` (${ft.usage})` : ""}.`, body: ft.text || " " });
  }
  const fh = sh.bottom - ry;
  const inside = sh.panel(rx, ry, rw, fh, "Features and traits");
  return drawFlow(sh, flowLines(sh, items, rw - 18, 8), rx + 9, inside, rw - 18, sh.bottom - 6, 8);
}

/** Pages of flowing text in two columns, until everything is printed. */
function continueFlow(sh: Sheet, rest: Flow[], label: string): void {
  let lines = rest;
  while (lines.length) {
    const top = sh.newPage(label);
    const colW = (sh.W - 12) / 2;
    sh.rect(M, top, sh.W, sh.bottom - top, { fill: PANEL, border: GILT });
    const left = drawFlow(sh, lines, M + 9, top + 8, colW - 12, sh.bottom - 8, 8);
    const right = left.length ? drawFlow(sh, left, M + 9 + colW + 6, top + 8, colW - 12, sh.bottom - 8, 8) : [];
    if (left.length) sh.line(M + colW + 3, top + 6, M + colW + 3, sh.bottom - 6, RULE, 0.4);
    lines = right;
    if (lines.length === rest.length) break;
  }
}

// ---------------------------------------------------------------- spells

function spellPages(sh: Sheet, d: FillData): void {
  const c = d.casting;
  if (!c && !d.spells.length) return;
  let top = sh.newPage("Spellcasting");
  const W = sh.W;
  if (c) {
    const tw = (W - 15) / 4;
    [["Spellcasting ability", c.ability], ["Modifier", c.mod], ["Spell save DC", c.dc], ["Spell attack", c.attack]].forEach(([l, v], i) => sh.tile(M + i * (tw + 5), top, tw, 42, l, v));
    top += 48;
    // Spells cast with another ability (a feat's): their own DC and attack, under the main ones.
    for (const line of d.otherCasting) {
      sh.text(line, M, top + 6, { size: 7.5, color: MUTED });
      top += 11;
    }
    // Slots: nine columns
    sh.rect(M, top, W, 52, { fill: PANEL, border: GILT });
    sh.text("SPELL SLOTS", M + 8, top + 10, { size: 6.4, bold: true, color: ACCENT });
    sh.text("filled diamond = used", M + W - 8, top + 10, { size: 6, color: MUTED, align: "right" });
    const cw = (W - 16) / 9;
    for (let i = 0; i < 9; i++) {
      const total = c.slots[i] ?? 0;
      const x = M + 8 + i * cw;
      sh.text(`LEVEL ${i + 1}`, x + cw / 2 - 2, top + 22, { size: 6.2, bold: true, color: MUTED, align: "center" });
      sh.text(total ? String(total) : "-", x + cw / 2 - 2, top + 35, { size: 11, bold: true, align: "center" });
      const n = Math.min(total, 6);
      for (let k = 0; k < n; k++) sh.diamond(x + cw / 2 - 2 + (k - (n - 1) / 2) * 8, top + 45, 3, k < (c.used[i] ?? 0));
    }
    top += 58;
  }

  // The list, grouped by level
  const head = (y: number) => {
    sh.rect(M, y, W, 14, { fill: BAND, border: GILT });
    const cs = columns();
    ["Spell", "Time", "Range", "Duration", "C", "R", "Comp.", "Notes"].forEach((h, i) => sh.text(h, cs[i], y + 10, { size: 6.4, bold: true, color: ACCENT }));
  };
  const columns = () => [M + 10, M + 188, M + 222, M + 268, M + 326, M + 340, M + 356, M + 392];
  head(top);
  top += 14;
  let lastLevel = "";
  let stripe = 0;
  for (const sp of d.spells) {
    const need = (sp.level !== lastLevel ? 13 : 0) + 13.2;
    if (top + need > sh.bottom) {
      top = sh.newPage("Spellcasting, continued");
      head(top);
      top += 14;
      lastLevel = "";
    }
    if (sp.level !== lastLevel) {
      lastLevel = sp.level;
      sh.rect(M, top, W, 12, { fill: STRIPE });
      sh.text(sp.level === "0" ? "CANTRIPS" : `LEVEL ${sp.level}`, M + 10, top + 8.8, { size: 7, bold: true, color: ACCENT });
      sh.line(M, top + 12, M + W, top + 12, GILT, 0.5);
      top += 13;
      stripe = 0;
    }
    const cs = columns();
    if (stripe++ % 2) sh.rect(M + 1, top, W - 2, 13.2, { fill: STRIPE });
    sh.text(sp.name, cs[0], top + 9.4, { size: 8.4, bold: true, maxW: 172 });
    sh.text(sp.time, cs[1], top + 9.4, { size: 7.6, maxW: 30 });
    sh.text(sp.range, cs[2], top + 9.4, { size: 7.6, maxW: 44 });
    sh.text(sp.duration, cs[3], top + 9.4, { size: 7.6, maxW: 54 });
    if (sp.concentration) sh.text("C", cs[4], top + 9.4, { size: 8, bold: true, color: ACCENT });
    if (sp.ritual) sh.text("R", cs[5], top + 9.4, { size: 8, bold: true, color: ACCENT });
    sh.text([sp.v && "V", sp.s && "S", sp.m && "M"].filter(Boolean).join(" "), cs[6], top + 9.4, { size: 7.6 });
    sh.text(sp.notes, cs[7], top + 9.4, { size: 7, color: MUTED, maxW: M + W - cs[7] - 6 });
    top += 13.2;
  }
}

// ---------------------------------------------------------------- equipment and story

function lastPages(sh: Sheet, d: FillData, portrait?: { w: number; h: number; draw: (x: number, top: number, w: number, h: number) => void }): void {
  const top = sh.newPage("Equipment and story");
  const W = sh.W;
  const lw = (W - 10) * 0.46;
  const rw = W - lw - 10;
  const rx = M + lw + 10;

  // Equipment
  const lines: Flow[] = [];
  const addList = (head: string, text: string) => {
    if (!text.trim()) return;
    lines.push({ text: head.toUpperCase(), head: true, gap: lines.length ? 5 : 0 });
    for (const l of text.split("\n").filter(Boolean)) lines.push({ text: l, lead: "•", gap: 0 });
  };
  addList("Armor worn", d.armorWorn);
  addList("Weapons", d.weaponsText);
  addList("Gear", d.otherGear);
  const coinsH = 66;
  const eqH = Math.min(330, Math.max(130, lines.length * 11.2 + 34));
  const inside = sh.panel(M, top, lw, eqH, "Equipment");
  const left = drawFlow(sh, lines.map((l) => (l.lead ? { ...l, lead: undefined, text: `• ${l.text}` } : l)), M + 9, inside, lw - 18, top + eqH - 6, 8.2);
  let ly = top + eqH + 6;
  // Magic items
  const mh = 21 + Math.max(2, d.magicItems.length) * 13 + 4;
  let my = sh.panel(M, ly, lw, mh, "Magic items and attunement");
  const mi = Math.max(2, d.magicItems.length);
  for (let i = 0; i < mi; i++) {
    const m = d.magicItems[i];
    sh.diamond(M + 14, my + 5, 4, !!m?.attuned);
    if (m) sh.text(m.name, M + 26, my + 8, { size: 8, maxW: lw - 40 });
    sh.line(M + 24, my + 11, M + lw - 8, my + 11, RULE, 0.4);
    my += 13;
  }
  ly += mh + 6;
  // Coins
  let cy = sh.panel(M, ly, lw, coinsH, "Coins");
  const cwid = (lw - 16) / 5;
  (["cp", "sp", "ep", "gp", "pp"] as const).forEach((k, i) => {
    const x = M + 8 + i * cwid;
    sh.rect(x + 2, cy, cwid - 4, 25, { fill: undefined, border: GILT });
    sh.text(k.toUpperCase(), x + cwid / 2, cy + 8, { size: 5.8, bold: true, color: MUTED, align: "center" });
    sh.text(d.coins[k], x + cwid / 2, cy + 21, { size: 11, bold: true, align: "center", maxW: cwid - 10 });
  });
  cy += 0;
  sh.text(`Carrying capacity ${d.carryCapacity} lb`, M + 10, ly + coinsH - 5, { size: 6.6, color: MUTED });

  // Story column
  let ry = top;
  const ph = portrait ? 150 : 0;
  if (portrait) {
    const inner = sh.panel(rx, ry, rw, ph + 21 + 4, "Appearance");
    portrait.draw(rx + 8, inner, 124, ph - 6);
    const ap = flowLines(sh, [{ body: d.appearance || "" }], rw - 150, 8.2);
    drawFlow(sh, ap, rx + 140, inner + 2, rw - 150, inner + ph - 4, 8.2);
    ry += ph + 21 + 10;
  } else if (d.appearance) {
    const ap = flowLines(sh, [{ body: d.appearance }], rw - 18, 8.2);
    const hh = 21 + Math.min(60, ap.length * 10.6 + 8);
    const inner = sh.panel(rx, ry, rw, hh, "Appearance");
    drawFlow(sh, ap, rx + 9, inner, rw - 18, ry + hh - 4, 8.2);
    ry += hh + 8;
  }
  const story: { head?: string; body: string }[] = [];
  if (d.personality) story.push({ head: "Personality", body: "" }, { body: d.personality });
  if (d.backstory) story.push({ head: "Backstory", body: "" }, { body: d.backstory });
  if (d.notes) story.push({ head: "Notes", body: "" }, { body: d.notes });
  const sInside = sh.panel(rx, ry, rw, sh.bottom - ry, "Story and notes");
  const rest = drawFlow(sh, flowLines(sh, story, rw - 18, 8.2), rx + 9, sInside, rw - 18, sh.bottom - 6, 8.2);
  // Anything that overflowed continues on its own pages.
  const overflow = [...left.map((l) => l), ...rest];
  if (overflow.length) continueFlow(sh, overflow, "Equipment and story, continued");
}

/** Adds the default sheet to a document. The first page also has the portrait. Returns how many lines were left out (always 0). */
export async function drawSoulForgeSheet(pdf: PDFDocument, f: Fonts, d: FillData, size: readonly [number, number], tx: (s: string) => string = (s) => s): Promise<number> {
  const sh = new Sheet(pdf, f, size, tx, d.name || "Character");
  const rest = page1(sh, d);
  const first = pdf.getPage(pdf.getPageCount() - 1);
  let img: Awaited<ReturnType<PDFDocument["embedPng"]>> | undefined;
  if (d.portrait) {
    try {
      const b64 = d.portrait.split(",")[1] ?? "";
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      img = /image\/png/.test(d.portrait.slice(0, 30)) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    } catch {
      img = undefined;
    }
  }
  if (img) {
    // Portrait in the identity block, left.
    const s = Math.min(54 / img.width, 54 / img.height);
    first.drawImage(img, { x: M + 8, y: size[1] - (M + 4) - img.height * s - (54 - img.height * s) / 2, width: img.width * s, height: img.height * s });
  }
  if (rest.length) continueFlow(sh, rest, "Features and traits, continued");
  spellPages(sh, d);
  lastPages(sh, d, img ? {
    w: 124, h: 144,
    draw: (x, top, w, h) => {
      const s = Math.min(w / img!.width, h / img!.height);
      sh.page.drawImage(img!, { x, y: sh.ph - top - img!.height * s, width: img!.width * s, height: img!.height * s });
    },
  } : undefined);
  return 0;
}
