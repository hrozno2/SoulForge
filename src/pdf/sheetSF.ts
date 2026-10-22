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


// ---------------------------------------------------------------- page 1 (the play page)
//
// The layout follows the DLDM "5E24" sheet's first page, in Soul Forge's own drawing: a header with who the character
// is, level, armor class, hit points, hit dice and death saves; the six abilities in two columns with their saves and
// skills under each; training under them; speed, conditions, attacks, class features, species traits and feats on
// the right.

/** One ability block: name band, modifier and score, then its save and skills (and Initiative under Dexterity). */
function abilityBlock(sh: Sheet, d: FillData, a: (typeof ABILITIES)[number], x: number, top: number, w: number): number {
  const ab = d.abilities[a.id as keyof FillData["abilities"]];
  const rows: [string, string, boolean, boolean, boolean][] = [["Saving throw", ab.save, ab.saveProf, false, true]];
  if (a.id === "dexterity") rows.push(["Initiative", d.initiative, false, false, true]);
  for (const s of a.skills) { const k = d.skills[s] ?? { bonus: "+0", prof: false, expert: false }; rows.push([title(s), k.bonus, k.prof, k.expert, false]); }
  const rh = 11.2;
  const h = 15 + 34 + rows.length * rh + 4;
  sh.rect(x, top, w, h, { fill: PANEL, border: GILT });
  sh.rect(x, top, w, 15, { fill: BAND, border: GILT });
  sh.text(a.name.toUpperCase(), x + w / 2, top + 10.5, { size: 7.4, bold: true, color: ACCENT, align: "center" });
  // Modifier in a ring, score in a tab beside it.
  const cx = x + 22, cy = top + 15 + 17;
  sh.page.drawCircle({ x: cx, y: sh.ph - cy, size: 14, borderColor: GILT, borderWidth: 1.2, color: rgb(1, 1, 1) });
  sh.text(ab.mod, cx, cy + 5, { size: 13, bold: true, align: "center" });
  sh.rect(x + 40, cy - 9, w - 46, 18, { fill: rgb(1, 1, 1), border: GILT, bw: 0.6 });
  sh.text(ab.score, x + 40 + (w - 46) / 2, cy + 4.5, { size: 11, bold: true, align: "center" });
  sh.text("MODIFIER", cx, top + 15 + 33.5, { size: 4.6, bold: true, color: MUTED, align: "center" });
  sh.text("SCORE", x + 40 + (w - 46) / 2, cy + 15, { size: 4.6, bold: true, color: MUTED, align: "center" });
  let ry = top + 15 + 34;
  for (const [label, bonus, prof, expert, bold] of rows) {
    sh.line(x + 4, ry, x + w - 4, ry, RULE, 0.35);
    sh.dot(x + 9, ry + 5.6, 2.6, prof, expert);
    sh.text(bonus, x + 26, ry + 8.2, { size: 7.6, bold: true, align: "right" });
    sh.text(label, x + 30, ry + 8.2, { size: 7.2, bold, maxW: w - 34 });
    ry += rh;
  }
  return top + h;
}

/** A box of flowing feature text (title band, one or two columns). Returns the lines that did not fit. */
function featureBox(sh: Sheet, name: string, items: { head?: string; lead?: string; body: string }[], x: number, top: number, w: number, h: number, columns: 1 | 2, sub?: string): Flow[] {
  let inside = sh.panel(x, top, w, h, name);
  if (sub) { sh.text(sub, x + 9, inside + 4, { size: 7, color: MUTED, maxW: w - 18 }); sh.line(x + 6, inside + 7, x + w - 6, inside + 7, RULE, 0.35); inside += 10; }
  const colW = columns === 2 ? (w - 12) / 2 : w;
  const lines = flowLines(sh, items, colW - 16, 7.4);
  const left = drawFlow(sh, lines, x + 8, inside, colW - 16, top + h - 5, 7.4);
  if (columns === 1 || !left.length) return left;
  sh.line(x + colW + 6, inside, x + colW + 6, top + h - 5, RULE, 0.4);
  return drawFlow(sh, left, x + colW + 14, inside, colW - 16, top + h - 5, 7.4);
}

function page1(sh: Sheet, d: FillData): Flow[] {
  let top = sh.newPage();
  const W = sh.W;
  const g = 5;

  // Header: identity, level and XP, armor class, hit points, hit dice, death saves.
  const hh = 70;
  const idW = Math.round(W * 0.4), lvW = 48, acW = 50;
  const hpW = W - idW - lvW - acW - g * 3;
  sh.rect(M, top, idW, hh, { fill: PANEL, border: GILT });
  const nameX = d.portrait ? M + 64 : M + 8;
  const field = (label: string, value: string, x: number, base: number, w: number, size = 9) => {
    sh.text(value, x, base - 2, { size, bold: true, maxW: w });
    sh.line(x, base, x + w, base, RULE, 0.5);
    sh.text(label, x, base + 6.5, { size: 4.8, bold: true, color: MUTED });
  };
  const idInner = M + idW - nameX - 8;
  field("CHARACTER NAME", d.name || "Unnamed character", nameX, top + 22, idInner, 14);
  field("BACKGROUND", d.background, nameX, top + 42, idInner / 2 - 4);
  field("CLASS", d.className, nameX + idInner / 2 + 4, top + 42, idInner / 2 - 4);
  field("SPECIES", d.species, nameX, top + 60, idInner / 2 - 4);
  field("SUBCLASS", d.subclass, nameX + idInner / 2 + 4, top + 60, idInner / 2 - 4);
  let x = M + idW + g;
  sh.rect(x, top, lvW, hh, { fill: BAND, border: GILT });
  sh.text("LEVEL", x + lvW / 2, top + 11, { size: 5.6, bold: true, color: ACCENT, align: "center" });
  sh.text(String(d.level), x + lvW / 2, top + 34, { size: 20, bold: true, align: "center" });
  sh.line(x + 6, top + 44, x + lvW - 6, top + 44, RULE, 0.5);
  sh.text("XP", x + lvW / 2, top + 52, { size: 5.2, bold: true, color: MUTED, align: "center" });
  sh.text(d.xp ? String(d.xp) : "", x + lvW / 2, top + 63, { size: 7.5, align: "center", maxW: lvW - 6 });
  x += lvW + g;
  sh.rect(x, top, acW, hh, { fill: PANEL, border: GILT });
  sh.text("ARMOR", x + acW / 2, top + 11, { size: 5.6, bold: true, color: ACCENT, align: "center" });
  sh.text("CLASS", x + acW / 2, top + 18, { size: 5.6, bold: true, color: ACCENT, align: "center" });
  sh.text(String(d.ac), x + acW / 2, top + 42, { size: 20, bold: true, align: "center" });
  sh.diamond(x + acW / 2 - 12, top + 58, 3.4, d.shield);
  sh.text("SHIELD", x + acW / 2 - 6, top + 60.5, { size: 5.2, bold: true, color: MUTED });
  x += acW + g;
  // Hit points, hit dice and death saves share one frame, in three parts.
  sh.rect(x, top, hpW, hh, { fill: PANEL, border: GILT });
  const hpPart = hpW * 0.5, hdPart = hpW * 0.24;
  sh.text("HIT POINTS", x + hpPart / 2, top + 11, { size: 6.4, bold: true, color: ACCENT, align: "center" });
  sh.text(String(d.hpCurrent), x + hpPart * 0.3, top + 40, { size: 18, bold: true, align: "center" });
  sh.line(x + 6, top + 50, x + hpPart * 0.6 - 4, top + 50, RULE, 0.5);
  sh.text("CURRENT", x + 8, top + 62, { size: 5, bold: true, color: MUTED });
  sh.line(x + hpPart * 0.6, top + 16, x + hpPart * 0.6, top + hh - 6, RULE, 0.4);
  sh.text(d.hpTemp ? String(d.hpTemp) : "", x + hpPart * 0.8, top + 32, { size: 10, bold: true, align: "center" });
  sh.text("TEMP", x + hpPart * 0.62 + 2, top + 40, { size: 5, bold: true, color: MUTED });
  sh.text(String(d.hpMax), x + hpPart * 0.8, top + 56, { size: 10, bold: true, align: "center" });
  sh.text("MAX", x + hpPart * 0.62 + 2, top + 64, { size: 5, bold: true, color: MUTED });
  let px = x + hpPart;
  sh.line(px, top + 4, px, top + hh - 4, GILT, 0.6);
  sh.text("HIT DICE", px + hdPart / 2, top + 11, { size: 6.4, bold: true, color: ACCENT, align: "center" });
  sh.text(d.hdSpent ? String(d.hdSpent) : "", px + hdPart / 2, top + 30, { size: 9, bold: true, align: "center" });
  sh.text("SPENT", px + 6, top + 38, { size: 5, bold: true, color: MUTED });
  sh.text(d.hdMax, px + hdPart / 2, top + 56, { size: 9, bold: true, align: "center", maxW: hdPart - 8 });
  sh.text("MAX", px + 6, top + 64, { size: 5, bold: true, color: MUTED });
  px += hdPart;
  sh.line(px, top + 4, px, top + hh - 4, GILT, 0.6);
  const dsW = x + hpW - px;
  sh.text("DEATH SAVES", px + dsW / 2, top + 11, { size: 6, bold: true, color: ACCENT, align: "center", maxW: dsW - 4 });
  for (let i = 0; i < 3; i++) {
    sh.diamond(px + dsW / 2 - 10 + i * 10, top + 26, 3.6, i < d.deathSuccess);
    sh.diamond(px + dsW / 2 - 10 + i * 10, top + 50, 3.6, i < d.deathFail);
  }
  sh.text("SUCCESSES", px + dsW / 2, top + 37, { size: 4.8, bold: true, color: MUTED, align: "center" });
  sh.text("FAILURES", px + dsW / 2, top + 61, { size: 4.8, bold: true, color: MUTED, align: "center" });
  top += hh + 8;

  // Left: two columns of abilities. Proficiency bonus and Heroic Inspiration head the first.
  const cw = 92;
  const ax = M, bx = M + cw + g;
  sh.rect(ax, top, cw, 46, { fill: PANEL, border: GILT });
  sh.text("PROFICIENCY BONUS", ax + cw / 2, top + 10, { size: 5.8, bold: true, color: ACCENT, align: "center" });
  sh.text(d.profBonus, ax + cw / 2, top + 28, { size: 15, bold: true, align: "center" });
  sh.diamond(ax + 14, top + 39, 3.6, d.inspiration);
  sh.text("HEROIC INSPIRATION", ax + 21, top + 41.5, { size: 5.2, bold: true, color: MUTED });
  let ya = top + 46 + g;
  for (const a of ABILITIES.slice(0, 3)) ya = abilityBlock(sh, d, a, ax, ya, cw) + g;
  let yb = top;
  for (const a of ABILITIES.slice(3)) yb = abilityBlock(sh, d, a, bx, yb, cw) + g;
  const leftW = cw * 2 + g;

  // Under the abilities: training (armor and weapon diamonds, tools and other weapons, languages).
  const ty = Math.max(ya, yb);
  const tIn = sh.panel(M, ty, leftW, sh.bottom - ty, "Equipment training and proficiencies");
  let cy2 = tIn + 6;
  sh.text("ARMOR", M + 6, cy2 + 2, { size: 5.4, bold: true, color: MUTED });
  let cx2 = M + 36;
  for (const [lab, on] of [["Light", d.armorTraining.light], ["Medium", d.armorTraining.medium], ["Heavy", d.armorTraining.heavy], ["Shields", d.armorTraining.shield]] as const) {
    sh.diamond(cx2 + 3, cy2, 3, on); sh.text(lab, cx2 + 8, cy2 + 2.6, { size: 6.6 }); cx2 += lab.length > 5 ? 36 : 30;
  }
  cy2 += 12;
  sh.text("WEAPONS", M + 6, cy2 + 2, { size: 5.4, bold: true, color: MUTED });
  cx2 = M + 36;
  for (const [lab, on] of [["Simple", d.weaponTraining.simple], ["Martial", d.weaponTraining.martial], ["Improvised", d.weaponTraining.improvised]] as const) {
    sh.diamond(cx2 + 3, cy2, 3, on); sh.text(lab, cx2 + 8, cy2 + 2.6, { size: 6.6 }); cx2 += 42;
  }
  cy2 += 8;
  const tItems: { head?: string; lead?: string; body: string }[] = [
    { head: "Tools and other weapons", body: "" }, { body: [d.toolsOnly, d.weaponsOther].filter(Boolean).join("; ") || "None" },
    { head: "Languages", body: "" }, { body: d.languages || "Common" },
  ];
  if (d.defenses) tItems.push({ head: "Resistances and immunities", body: "" }, { body: d.defenses });
  const tRest = drawFlow(sh, flowLines(sh, tItems, leftW - 14, 7.2), M + 7, cy2, leftW - 14, sh.bottom - 5, 7.2);

  // Right: speed, conditions and exhaustion; attacks; class features; species traits and feats.
  const rx = M + leftW + g, rw = W - leftW - g;
  let ry = top;
  const spW = 64, exW = 58;
  sh.rect(rx, ry, spW, 46, { fill: PANEL, border: GILT });
  sh.text("SPEED", rx + spW / 2, ry + 10, { size: 6.2, bold: true, color: ACCENT, align: "center" });
  sh.text(d.speed ? `${d.speed} ft` : "", rx + spW / 2, ry + 29, { size: 13, bold: true, align: "center", maxW: spW - 6 });
  sh.text(`Passive Perception ${d.passive}`, rx + spW / 2, ry + 41, { size: 4.8, color: MUTED, align: "center", maxW: spW - 4 });
  const coW = rw - spW - exW - g * 2;
  const coIn = sh.panel(rx + spW + g, ry, coW, 46, "Conditions and effects");
  sh.text(d.conditions || "", rx + spW + g + 8, coIn + 8, { size: 7.6, bold: true, color: ACCENT, maxW: coW - 16 });
  const exX = rx + spW + g + coW + g;
  sh.rect(exX, ry, exW, 46, { fill: PANEL, border: GILT });
  sh.text("EXHAUSTION", exX + exW / 2, ry + 10, { size: 5.8, bold: true, color: ACCENT, align: "center" });
  sh.text(d.exhaustion || "", exX + exW / 2, ry + 30, { size: 13, bold: true, align: "center" });
  sh.line(exX + 8, ry + 34, exX + exW - 8, ry + 34, RULE, 0.5);
  sh.text("LEVEL", exX + exW / 2, ry + 42, { size: 4.8, bold: true, color: MUTED, align: "center" });
  ry += 46 + g;

  // Weapons and damage cantrips
  const nW = Math.max(6, Math.min(8, d.weapons.length));
  const ah = 21 + 10 + nW * 13 + 4;
  let iy = sh.panel(rx, ry, rw, ah, "Weapons and damage cantrips");
  const cols = [rx + 8, rx + rw * 0.4, rx + rw * 0.56, rx + rw * 0.78];
  ["Name", "Atk bonus / DC", "Damage and type", "Notes"].forEach((h, i) => sh.text(h, cols[i], iy + 5, { size: 5.8, bold: true, color: MUTED }));
  iy += 8;
  for (let i = 0; i < nW; i++) {
    const w = d.weapons[i];
    sh.line(rx + 6, iy + 13, rx + rw - 6, iy + 13, RULE, 0.4);
    if (w) {
      sh.text(w.name, cols[0], iy + 10, { size: 7.8, bold: true, maxW: cols[1] - cols[0] - 6 });
      sh.text(w.bonus, cols[1], iy + 10, { size: 8, bold: true, maxW: cols[2] - cols[1] - 4 });
      sh.text(w.damage, cols[2], iy + 10, { size: 7.4, maxW: cols[3] - cols[2] - 4 });
      sh.text(w.notes, cols[3], iy + 10, { size: 6.4, color: MUTED, maxW: rx + rw - cols[3] - 6 });
    }
    iy += 13;
  }
  ry += ah + g;

  // Class features (two columns), then species traits and feats side by side at the bottom.
  const item = (f: FillData["featureList"][number]) => ({ lead: `${f.name}${f.usage ? ` (${f.usage})` : ""}.`, body: f.text || " " });
  const byGroup = (gname: string) => d.featureList.filter((f) => f.group === gname).map(item);
  const bottomH = Math.round((sh.bottom - ry) * 0.38);
  const cfH = sh.bottom - ry - bottomH - g;
  const restClass = featureBox(sh, "Class features", byGroup("Class features"), rx, ry, rw, cfH, 2);
  ry += cfH + g;
  const halfW = (rw - g) / 2;
  const restSpecies = featureBox(sh, "Species traits", byGroup("Species traits"), rx, ry, halfW, bottomH, 1, [d.size && `Size: ${d.size}`, d.darkvision && `Darkvision: ${d.darkvision}`].filter(Boolean).join("     "));
  const restFeats = featureBox(sh, "Feats", byGroup("Feats"), rx + halfW + g, ry, halfW, bottomH, 1);

  // What did not fit continues on the next pages, under its own heading.
  const cont: Flow[] = [];
  const add = (head: string, rest: Flow[]) => { if (rest.length) cont.push({ text: head.toUpperCase(), head: true, gap: cont.length ? 5 : 0 }, ...rest); };
  add("Class features, continued", restClass);
  add("Species traits, continued", restSpecies);
  add("Feats, continued", restFeats);
  add("Training and proficiencies, continued", tRest);
  return cont;
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

// ---------------------------------------------------------------- page 2 (spells, equipment, story)
//
// Follows the DLDM sheet's spellcasting page: spellcasting ability, modifier, save DC and attack bonus; spell slots;
// cantrips and prepared spells with casting time, range, concentration, ritual and components; backstory and
// personality under them; appearance, equipment with attuned magic items, and coins down the right side.

type Portrait = { draw: (x: number, top: number, w: number, h: number) => void };

/** The x of each flag diamond (concentration, ritual, then verbal, somatic, material), from the flags column. */
const flagX = (start: number) => [start + 3, start + 12, start + 24, start + 32, start + 40];

function spellHeader(sh: Sheet, x: number, top: number, w: number): number[] {
  const cs = [x + 6, x + 26, x + w * 0.46, x + w * 0.55, x + w * 0.64, x + w * 0.64 + 52];
  ["Level", "Name", "Time", "Range"].forEach((h, i) => sh.text(h, cs[i], top + 7, { size: 5.8, bold: true, color: MUTED }));
  ["C", "R", "V", "S", "M"].forEach((h, i) => sh.text(h, flagX(cs[4])[i], top + 7, { size: 5.8, bold: true, color: MUTED, align: "center" }));
  sh.text("Notes", cs[5], top + 7, { size: 5.8, bold: true, color: MUTED });
  sh.line(x + 4, top + 10, x + w - 4, top + 10, GILT, 0.5);
  return cs;
}

function spellRow(sh: Sheet, sp: FillData["spells"][number] | undefined, cs: number[], x: number, top: number, w: number, rh: number): void {
  sh.line(x + 4, top + rh, x + w - 4, top + rh, RULE, 0.35);
  // Concentration, ritual and the components as diamonds, filled where they apply.
  const flags: [boolean, string][] = [[!!sp?.concentration, "C"], [!!sp?.ritual, "R"], [!!sp?.v, "V"], [!!sp?.s, "S"], [!!sp?.m, "M"]];
  flags.forEach(([on], i) => sh.diamond(flagX(cs[4])[i], top + rh / 2, 2.4, on));
  if (!sp) return;
  sh.text(sp.level === "0" ? "C" : sp.level, cs[0] + 6, top + rh - 3.5, { size: 7.4, bold: true, align: "center" });
  sh.text(sp.name, cs[1], top + rh - 3.5, { size: 7.6, bold: true, maxW: cs[2] - cs[1] - 4 });
  sh.text(sp.time, cs[2], top + rh - 3.5, { size: 6.8, maxW: cs[3] - cs[2] - 3 });
  sh.text(sp.range, cs[3], top + rh - 3.5, { size: 6.8, maxW: cs[4] - cs[3] - 3 });
  sh.text(sp.notes, cs[5], top + rh - 3.5, { size: 6.2, color: MUTED, maxW: x + w - cs[5] - 6 });
}

function page2(sh: Sheet, d: FillData, portrait?: Portrait): Flow[] {
  let top = sh.newPage();
  const W = sh.W, g = 5;
  const rcW = 150, rcX = M + W - rcW;
  const lw = W - rcW - g;
  const c = d.casting;

  // Spellcasting ability, modifier, save DC, attack bonus
  const scW = 150, scH = 76;
  sh.rect(M, top, scW, scH, { fill: PANEL, border: GILT });
  sh.text(c?.ability ?? "", M + 8, top + 13, { size: 9, bold: true, maxW: scW - 16 });
  sh.line(M + 6, top + 16, M + scW - 6, top + 16, RULE, 0.5);
  sh.text("SPELLCASTING ABILITY", M + 8, top + 22, { size: 4.8, bold: true, color: MUTED });
  [["Spellcasting modifier", c?.mod ?? ""], ["Spell save DC", c?.dc ?? ""], ["Spell attack bonus", c?.attack ?? ""]].forEach(([l, v], i) => {
    const y = top + 27 + i * 16;
    sh.rect(M + 6, y, 34, 14, { fill: rgb(1, 1, 1), border: GILT, bw: 0.6 });
    sh.text(v, M + 23, y + 10.5, { size: 9.5, bold: true, align: "center" });
    sh.text(l.toUpperCase(), M + 46, y + 9.5, { size: 6, bold: true, color: ACCENT, maxW: scW - 52 });
  });

  // Spell slots: levels 1 to 9 in three columns, total and expended
  const ssX = M + scW + g, ssW = lw - scW - g;
  const ssIn = sh.panel(ssX, top, ssW, scH, "Spell slots");
  const colW = (ssW - 12) / 3;
  for (let i = 0; i < 9; i++) {
    const cx = ssX + 6 + Math.floor(i / 3) * colW, cy = ssIn + 6 + (i % 3) * 16;
    const total = c?.slots[i] ?? 0;
    sh.text(`LEVEL ${i + 1}`, cx, cy + 4, { size: 5.2, bold: true, color: MUTED });
    sh.text(total ? String(total) : "", cx + 30, cy + 4.5, { size: 8, bold: true, align: "center" });
    sh.line(cx + 25, cy + 6, cx + 35, cy + 6, RULE, 0.4);
    // One diamond per slot, filled when used (up to four, as on the DLDM sheet).
    for (let k = 0; k < Math.min(total, 4); k++) sh.diamond(cx + 42 + k * 7, cy + 2, 2.6, k < (c?.used[i] ?? 0));
  }
  const otherH = d.otherCasting.length * 9;
  d.otherCasting.forEach((line, i) => sh.text(line, M + 4, top + scH + 8 + i * 9, { size: 6.4, color: MUTED, maxW: lw - 8 }));
  let ly = top + scH + g + otherH;

  // Cantrips and prepared spells; what does not fit continues on its own pages
  const rh = 12.6;
  const listH = Math.round((sh.bottom - ly) * 0.66);
  const lIn = sh.panel(M, ly, lw, listH, "Cantrips and prepared spells");
  const cs = spellHeader(sh, M, lIn - 4, lw);
  let sy = lIn + 8;
  const rowsFit = Math.floor((ly + listH - 4 - sy) / rh);
  for (let i = 0; i < rowsFit; i++) { spellRow(sh, d.spells[i], cs, M, sy, lw, rh); sy += rh; }
  const spellRest = d.spells.slice(rowsFit);
  ly += listH + g;

  // Backstory and personality
  const story: { head?: string; body: string }[] = [];
  if (d.personality) story.push({ head: "Personality", body: "" }, { body: d.personality });
  if (d.backstory) story.push({ head: "Backstory", body: "" }, { body: d.backstory });
  if (d.alignment) story.push({ head: "Alignment", body: "" }, { body: d.alignment });
  if (d.notes) story.push({ head: "Notes", body: "" }, { body: d.notes });
  const bIn = sh.panel(M, ly, lw, sh.bottom - ly, "Backstory and personality");
  const storyRest = drawFlow(sh, flowLines(sh, story, lw - 18, 7.6), M + 9, bIn, lw - 18, sh.bottom - 5, 7.6);

  // Right side: appearance, equipment (with attuned magic items), coins
  let ry = top;
  const apH = 150;
  const aIn = sh.panel(rcX, ry, rcW, apH, "Appearance");
  if (portrait) portrait.draw(rcX + 8, aIn, rcW - 16, apH - 21 - 40);
  const apLines = flowLines(sh, [{ body: d.appearance || "" }], rcW - 16, 7);
  drawFlow(sh, apLines, rcX + 8, portrait ? ry + apH - 40 : aIn, rcW - 16, ry + apH - 4, 7);
  ry += apH + g;
  const coinsH = 64;
  const eqH = sh.bottom - ry - coinsH - g;
  const eIn = sh.panel(rcX, ry, rcW, eqH, "Equipment");
  const mCount = Math.max(3, Math.min(6, d.magicItems.length));
  const magicH = 12 + mCount * 12;
  const gear: Flow[] = [];
  const addList = (head: string, text: string) => {
    gear.push({ text: head.toUpperCase(), head: true, gap: gear.length ? 4 : 0 });
    for (const l of (text || "").split("\n").filter(Boolean)) gear.push({ text: `• ${l}`, gap: 0 });
  };
  addList("Armor worn", d.armorWorn);
  addList("Weapons", d.weaponsText);
  addList("Other gear", d.otherGear);
  const gearRest = drawFlow(sh, gear, rcX + 8, eIn, rcW - 16, ry + eqH - magicH - 4, 7.2);
  let my = ry + eqH - magicH;
  sh.text("ATTUNED  MAGIC ITEM", rcX + 8, my + 6, { size: 5.4, bold: true, color: MUTED });
  my += 9;
  for (let i = 0; i < mCount; i++) {
    const m = d.magicItems[i];
    sh.diamond(rcX + 14, my + 5, 3.2, !!m?.attuned);
    if (m) sh.text(m.name, rcX + 24, my + 8, { size: 7, maxW: rcW - 32 });
    sh.line(rcX + 22, my + 10, rcX + rcW - 8, my + 10, RULE, 0.4);
    my += 12;
  }
  ry += eqH + g;
  const cIn = sh.panel(rcX, ry, rcW, coinsH, "Coins");
  const cwid = (rcW - 12) / 5;
  (["cp", "sp", "ep", "gp", "pp"] as const).forEach((k, i) => {
    const x = rcX + 6 + i * cwid;
    sh.text(k.toUpperCase(), x + cwid / 2, cIn + 3, { size: 5.4, bold: true, color: MUTED, align: "center" });
    sh.rect(x + 1.5, cIn + 6, cwid - 3, 18, { fill: rgb(1, 1, 1), border: GILT, bw: 0.6 });
    sh.text(d.coins[k], x + cwid / 2, cIn + 19, { size: 8.5, bold: true, align: "center", maxW: cwid - 6 });
  });
  sh.text(`Carrying capacity ${d.carryCapacity} lb`, rcX + 8, ry + coinsH - 5, { size: 5.8, color: MUTED });

  // Spells that did not fit: their own pages, full width.
  let rest = spellRest;
  while (rest.length) {
    let t = sh.newPage("Spells, continued");
    const inside = sh.panel(M, t, W, sh.bottom - t, "Cantrips and prepared spells");
    const cs2 = spellHeader(sh, M, inside - 4, W);
    t = inside + 8;
    const n = Math.floor((sh.bottom - 4 - t) / rh);
    for (let i = 0; i < n; i++) { spellRow(sh, rest[i], cs2, M, t, W, rh); t += rh; }
    rest = rest.slice(n);
  }
  const cont: Flow[] = [];
  const add = (head: string, r: Flow[]) => { if (r.length) cont.push({ text: head.toUpperCase(), head: true, gap: cont.length ? 5 : 0 }, ...r); };
  add("Equipment, continued", gearRest);
  add("Backstory and personality, continued", storyRest);
  return cont;
}

/**
 * Adds the default sheet to a document: the play page, the spells-equipment-story page, then continuation pages for
 * anything that did not fit (features first, then spells, equipment and story). Returns how many lines were left out
 * (always 0: everything continues).
 */
export async function drawSoulForgeSheet(pdf: PDFDocument, f: Fonts, d: FillData, size: readonly [number, number], tx: (s: string) => string = (s) => s): Promise<number> {
  const sh = new Sheet(pdf, f, size, tx, d.name || "Character");
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
  const rest1 = page1(sh, d);
  if (img) {
    // A small portrait at the left of the identity block.
    const first = pdf.getPage(pdf.getPageCount() - 1);
    const s = Math.min(52 / img.width, 62 / img.height);
    first.drawImage(img, { x: M + 6 + (52 - img.width * s) / 2, y: size[1] - (M + 4) - img.height * s, width: img.width * s, height: img.height * s });
  }
  const portrait: Portrait | undefined = img ? {
    draw: (x, top, w, h) => {
      const s = Math.min(w / img!.width, h / img!.height);
      sh.page.drawImage(img!, { x: x + (w - img!.width * s) / 2, y: sh.ph - top - img!.height * s, width: img!.width * s, height: img!.height * s });
    },
  } : undefined;
  const rest2 = page2(sh, d, portrait);
  const more = [...rest1, ...rest2];
  if (more.length) continueFlow(sh, more, "Additional features and notes");
  return 0;
}
