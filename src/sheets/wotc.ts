/**
 * Writes a character onto the official 2024 D&D character sheet (the free two-page PDF Wizards of the Coast
 * publishes). That PDF has no form fields, so text and marks are placed at fixed positions.
 * The PDF is not part of Soul Forge: the player loads their own copy.
 */
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { FillData, SpellRow } from "./data";

export type WotcPage = "page1" | "page2";

export const WOTC_PAGES: Record<WotcPage, { label: string; note: string }> = {
  page1: { label: "Page 1", note: "Abilities, saves, skills, attacks, features, traits, feats" },
  page2: { label: "Page 2", note: "Spellcasting, spells, backstory, equipment, coins" },
};

/**
 * The official sheet is two Letter-ish pages. The plain printing version has no form fields. A fillable copy has the same
 * layout, so it is accepted too when its name says 2024: text is placed at the same fixed positions either way.
 */
export function looksLikeWotc2024(width: number, height: number, pages: number, fields: number, nameHint: string): boolean {
  const size = pages === 2 && Math.abs(width - 603) < 6 && Math.abs(height - 774) < 6;
  return size && (fields === 0 ? /character|sheet|2024/i.test(nameHint) : /2024/i.test(nameHint));
}

const INK = rgb(0.1, 0.09, 0.1);

export interface Pen {
  page: PDFPage;
  r: PDFFont;
  b: PDFFont;
}

const signed = (s: string) => s;

function fit(font: PDFFont, text: string, size: number, width: number): number {
  let s = size;
  while (s > 5 && font.widthOfTextAtSize(text, s) > width) s -= 0.5;
  return s;
}

function text(p: Pen, t: string, x: number, y: number, o: { size?: number; bold?: boolean; width?: number; center?: boolean } = {}): void {
  if (!t) return;
  const font = o.bold ? p.b : p.r;
  const size = o.width ? fit(font, t, o.size ?? 9, o.width) : (o.size ?? 9);
  const w = font.widthOfTextAtSize(t, size);
  p.page.drawText(t, { x: o.center ? x - w / 2 : x, y, size, font, color: INK });
}

function wrap(font: PDFFont, t: string, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of t.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else {
        if (line) out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

/** Text in a box, shrinking until it fits. Returns how many lines did not fit. */
function box(p: Pen, t: string, b: { x: number; top: number; w: number; h: number }, max = 8): number {
  if (!t.trim()) return 0;
  for (const size of [max, 7.5, 7, 6.5, 6, 5.5, 5, 4.6]) {
    const lines = wrap(p.r, t, size, b.w);
    const lh = size * 1.18;
    if (lines.length * lh <= b.h || size === 4.6) {
      const fits = Math.floor(b.h / lh);
      lines.slice(0, fits).forEach((l, i) => p.page.drawText(l, { x: b.x, y: b.top - size - i * lh, size, font: p.r, color: INK }));
      return Math.max(0, lines.length - fits);
    }
  }
  return 0;
}

const dot = (p: Pen, x: number, y: number, r = 3.4) => p.page.drawCircle({ x, y, size: r, color: INK });
const diamond = (p: Pen, x: number, y: number, r = 4) =>
  p.page.drawSvgPath(`M 0 ${r} L ${r} 0 L 0 ${-r} L ${-r} 0 Z`, { x, y, color: INK });

// ---------------------------------------------------------------- page 1

export const ABIL: Record<string, { mod: [number, number]; score: [number, number]; save: [number, number]; saveDot: [number, number] }> = {
  strength: { mod: [44, 550], score: [75, 545], save: [34, 509], saveDot: [21.5, 509.5] },
  dexterity: { mod: [44, 423], score: [75, 427], save: [34, 391], saveDot: [21.5, 391.5] },
  constitution: { mod: [44, 283], score: [75, 282], save: [34, 245], saveDot: [21.5, 245.5] },
  intelligence: { mod: [160, 626], score: [190, 621], save: [141, 586], saveDot: [127.5, 586.5] },
  wisdom: { mod: [160, 450], score: [190, 454], save: [141, 412], saveDot: [127.5, 412.5] },
  charisma: { mod: [160, 277], score: [190, 281], save: [141, 238], saveDot: [127.5, 238.5] },
};

/** Skill value spot (x, y) and the position of its proficiency circle. */
const SKILLS: Record<string, [number, number]> = {
  athletics: [34, 489], acrobatics: [34, 371], "sleight of hand": [34, 357], stealth: [34, 343],
  arcana: [141, 566], history: [141, 552], investigation: [141, 538], nature: [141, 524], religion: [141, 510],
  "animal handling": [141, 392], insight: [141, 378], medicine: [141, 364], perception: [141, 350], survival: [141, 336],
  deception: [141, 218], intimidation: [141, 204], performance: [141, 190], persuasion: [141, 176],
};

export function fillPage1(p: Pen, d: FillData): number {
  text(p, d.name, 96, 736, { size: 12, bold: true, width: 190 });
  text(p, d.background, 82, 714, { size: 9, width: 62 });
  text(p, d.className, 175, 714, { size: 9, width: 70 });
  text(p, d.species, 68, 693, { size: 9, width: 76 });
  text(p, d.subclass, 185, 693, { size: 8, width: 70 });
  text(p, String(d.level), 276, 737, { size: 13, bold: true, center: true });
  text(p, d.xp ? String(d.xp) : "", 276, 711, { size: 8, center: true });
  text(p, String(d.ac), 339, 722, { size: 16, bold: true, center: true });
  text(p, String(d.hpCurrent), 400, 703, { size: 15, bold: true, center: true });
  text(p, d.hpTemp ? String(d.hpTemp) : "", 462, 728, { size: 9, center: true });
  text(p, String(d.hpMax), 462, 706, { size: 10, bold: true, center: true });
  text(p, d.hdSpent ? String(d.hdSpent) : "", 520, 728, { size: 9, center: true });
  text(p, d.hdMax, 520, 706, { size: 9, bold: true, center: true, width: 40 });
  d.deathSuccess > 0 && Array.from({ length: Math.min(3, d.deathSuccess) }, (_, i) => diamond(p, 546 + i * 12.5, 731, 3));
  d.deathFail > 0 && Array.from({ length: Math.min(3, d.deathFail) }, (_, i) => diamond(p, 546 + i * 12.5, 709, 3));

  text(p, d.profBonus, 57, 628, { size: 17, bold: true, center: true });
  text(p, d.initiative, 262, 633, { size: 15, bold: true, center: true });
  text(p, `${d.speed} ft`, 356, 633, { size: 14, bold: true, center: true });
  text(p, d.size, 451, 633, { size: 12, bold: true, center: true, width: 80 });
  text(p, String(d.skills.perception ? 10 + Number(d.skills.perception.bonus) : 10), 546, 633, { size: 15, bold: true, center: true });
  if (d.inspiration) dot(p, 57, 179, 5);

  for (const [id, a] of Object.entries(d.abilities)) {
    const s = ABIL[id];
    text(p, a.mod, s.mod[0], s.mod[1], { size: 18, bold: true, center: true });
    text(p, a.score, s.score[0], s.score[1], { size: 9, center: true });
    text(p, a.save, s.save[0], s.save[1], { size: 9, bold: true, center: true });
    if (a.saveProf) dot(p, s.saveDot[0], s.saveDot[1]);
  }
  for (const [name, [x, y]] of Object.entries(SKILLS)) {
    const k = d.skills[name];
    if (!k) continue;
    text(p, k.bonus, x, y, { size: 9, bold: true, center: true });
    if (k.prof) dot(p, x - 13.5, y + 0.5, k.expert ? 3.8 : 3.2);
    if (k.expert) p.page.drawCircle({ x: x - 13.5, y: y + 0.5, size: 5.4, borderColor: INK, borderWidth: 0.7 });
  }

  // Equipment training
  if (d.armorTraining.light) diamond(p, 62, 125);
  if (d.armorTraining.medium) diamond(p, 97, 125);
  if (d.armorTraining.heavy) diamond(p, 142, 125);
  if (d.armorTraining.shield) diamond(p, 178, 125);
  box(p, `${d.weaponTraining.simple ? "Simple" : ""}${d.weaponTraining.martial ? (d.weaponTraining.simple ? ", Martial" : "Martial") : ""}`, { x: 24, top: 118, w: 190, h: 12 }, 8);
  box(p, d.tools, { x: 24, top: 100, w: 190, h: 62 }, 7.5);

  // Weapons and damage cantrips
  d.weapons.slice(0, 6).forEach((w, i) => {
    const y = 565 - i * 20;
    text(p, w.name, 229, y, { size: 8.5, width: 100 });
    text(p, w.bonus, 336, y, { size: 9, bold: true, center: true });
    text(p, w.damage, 385, y, { size: 8, width: 72 });
    text(p, w.notes, 463, y, { size: 7, width: 118 });
  });
  const feats = d.classFeatures;
  const colA = feats.slice(0, Math.ceil(feats.length / 2));
  const colB = feats.slice(Math.ceil(feats.length / 2));
  let hidden = 0;
  hidden += box(p, colA.join("\n"), { x: 226, top: 423, w: 176, h: 210 }, 7);
  hidden += box(p, colB.join("\n"), { x: 410, top: 423, w: 176, h: 210 }, 7);
  hidden += box(p, d.traits.join("\n"), { x: 226, top: 164, w: 168, h: 142 }, 7.5);
  hidden += box(p, d.feats.join("\n"), { x: 411, top: 164, w: 176, h: 142 }, 7.5);
  return hidden;
}

// ---------------------------------------------------------------- page 2

const SLOT_ROW_Y = [683, 669, 655];
export const SLOT_TOTAL_X = [189, 276, 356];
export const SLOT_PIP_X: number[][] = [[203, 212, 222, 231.5], [290, 300, 310], [369, 378.5]];

function flag(p: Pen, x: number, y: number): void {
  diamond(p, x, y, 4);
}

export function fillPage2(p: Pen, d: FillData): number {
  let hidden = 0;
  if (d.casting) {
    text(p, d.casting.ability, 26, 745, { size: 9, bold: true, width: 100 });
    text(p, d.casting.mod, 30, 709, { size: 15, bold: true, center: true });
    text(p, d.casting.dc, 30, 686, { size: 15, bold: true, center: true });
    text(p, d.casting.attack, 30, 662, { size: 15, bold: true, center: true });
    for (let n = 1; n <= 9; n++) {
      const row = (n - 1) % 3;
      const col = Math.floor((n - 1) / 3);
      const total = d.casting.slots[n - 1];
      if (!total) continue;
      text(p, String(total), SLOT_TOTAL_X[col], SLOT_ROW_Y[row] - 3, { size: 8, bold: true, center: true });
      const used = d.casting.used[n - 1] ?? 0;
      (SLOT_PIP_X[col] ?? []).slice(0, Math.min(used, total)).forEach((x) => diamond(p, x, SLOT_ROW_Y[row], 3.3));
    }
  }
  const rows = 29;
  const spells = d.spells.slice(0, rows);
  spells.forEach((s: SpellRow, i) => {
    const y = 774 - (385 + i * 39) / 2 + 2.5;
    text(p, s.level === "0" ? "C" : s.level, 27, y, { size: 8.5, bold: true, center: true });
    text(p, s.name, 42, y, { size: 8.5, width: 108 });
    text(p, s.time, 172, y, { size: 8, width: 32, center: true });
    text(p, s.range, 208, y, { size: 7.5, width: 56 });
    if (s.concentration) flag(p, 242, y + 3.5);
    if (s.ritual) flag(p, 265, y + 3.5);
    if (s.m) flag(p, 286, y + 3.5);
    text(p, [s.notes, s.duration].filter(Boolean).join(" · "), 305, y, { size: 7.5, width: 86 });
  });
  hidden += Math.max(0, d.spells.length - rows);

  hidden += box(p, d.appearance, { x: 414, top: 744, w: 174, h: 66 }, 8);
  hidden += box(p, [d.personality, d.backstory].filter(Boolean).join("\n\n"), { x: 414, top: 634, w: 174, h: 138 }, 7.5);
  text(p, d.alignment, 456, 487, { size: 8.5, width: 140 });
  hidden += box(p, d.languages, { x: 414, top: 428, w: 174, h: 22 }, 8);
  const gear = [d.armorWorn && `Armor: ${d.armorWorn}`, d.weaponsText && `Weapons: ${d.weaponsText.replace(/\n/g, ", ")}`, d.otherGear.replace(/\n/g, ", ")].filter(Boolean).join("\n");
  hidden += box(p, gear, { x: 414, top: 366, w: 174, h: 166 }, 7.5);
  d.magicItems.slice(0, 3).forEach((m, i) => {
    const y = 170 - i * 20;
    if (m.attuned) diamond(p, 423, y + 3, 3.5);
    text(p, m.name, 436, y, { size: 8, width: 148 });
  });
  const cx = [428, 464, 499, 535, 570];
  (["cp", "sp", "ep", "gp", "pp"] as const).forEach((k, i) => text(p, d.coins[k] === "0" ? "" : d.coins[k], cx[i], 57, { size: 9, bold: true, center: true }));
  return hidden;
}

// ---------------------------------------------------------------- entry

export interface WotcResult {
  bytes: Uint8Array;
  notes: string[];
}

export async function fillWotc(template: Uint8Array | ArrayBuffer, d: FillData, opts: { pages: WotcPage[]; font: { regular: ArrayBuffer | Uint8Array; bold: ArrayBuffer | Uint8Array } }): Promise<WotcResult> {
  const doc = await PDFDocument.load(template);
  doc.registerFontkit(fontkit);
  const r = await doc.embedFont(opts.font.regular, { subset: true });
  const b = await doc.embedFont(opts.font.bold, { subset: true });
  const pages = doc.getPages();
  const notes: string[] = [];
  const want = new Set(opts.pages);
  if (want.has("page1") && pages[0]) {
    const hidden = fillPage1({ page: pages[0], r, b }, d);
    if (hidden > 0) notes.push("Some feature text did not fit page 1 and was cut.");
  }
  if (want.has("page2") && pages[1]) {
    const hidden = fillPage2({ page: pages[1], r, b }, d);
    if (hidden > 0) notes.push(`${hidden} spells or lines did not fit on page 2.`);
  }
  // Drop pages that were not asked for, last first.
  if (!want.has("page2") && pages[1]) doc.removePage(1);
  if (!want.has("page1") && pages[0]) doc.removePage(0);
  void signed;
  return { bytes: await doc.save(), notes };
}
