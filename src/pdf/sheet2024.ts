/**
 * The default Soul Forge sheet: two pages laid out like the official 2024 character sheet.
 * The frames are drawn here and the values go in through the same code that fills the official PDF,
 * so the two sheets match. Coordinates below are measured in pixels of a 130 dpi render of that layout.
 */
import { concatTransformationMatrix, popGraphicsState, pushGraphicsState, rgb, type PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";
import type { FillData } from "../sheets/data";
import { ABIL, SLOT_PIP_X, SLOT_TOTAL_X, fillPage1, fillPage2 } from "../sheets/wotc";

const SC = 1.806; // pixels per point
const W = 603;
const H = 774;
const X = (px: number) => px / SC;
const Y = (py: number) => H - py / SC;

const LINE = rgb(0.45, 0.43, 0.42);
const SOFT = rgb(0.78, 0.76, 0.74);
const LABEL = rgb(0.32, 0.3, 0.3);
const PANEL = rgb(0.972, 0.968, 0.96);
const INK = rgb(0.1, 0.09, 0.1);

interface Fonts {
  r: PDFFont;
  b: PDFFont;
}

class Chrome {
  constructor(private page: PDFPage, private f: Fonts) {}

  /** Rounded frame; px coordinates, top-left origin. */
  panel(x: number, y: number, w: number, h: number, o: { title?: string; radius?: number; fill?: boolean } = {}): void {
    const pw = w / SC;
    const ph = h / SC;
    const r = o.radius ?? 7;
    const path = `M ${r} 0 H ${pw - r} A ${r} ${r} 0 0 1 ${pw} ${r} V ${ph - r} A ${r} ${r} 0 0 1 ${pw - r} ${ph} H ${r} A ${r} ${r} 0 0 1 0 ${ph - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
    this.page.drawSvgPath(path, { x: X(x), y: Y(y), borderColor: LINE, borderWidth: 1, color: o.fill === false ? undefined : PANEL });
    if (o.title) this.text(o.title, x + w / 2, y + 17, { size: 7.4, bold: true, center: true, color: INK });
  }

  /** Shield outline with its title, for armor class. */
  shield(x: number, y: number, w: number, h: number): void {
    const pw = w / SC;
    const ph = h / SC;
    const path = `M 0 8 Q ${pw / 2} -6 ${pw} 8 V ${ph * 0.58} Q ${pw} ${ph * 0.86} ${pw / 2} ${ph} Q 0 ${ph * 0.86} 0 ${ph * 0.58} Z`;
    this.page.drawSvgPath(path, { x: X(x), y: Y(y), borderColor: LINE, borderWidth: 1, color: PANEL });
    this.text("ARMOR CLASS", x + w / 2, y + 17, { size: 7.4, bold: true, center: true, color: INK });
    this.text("SHIELD", x + w / 2, y + h - 38, { center: true, size: 5.6 });
  }

  /** Small label. px coordinates for the baseline. */
  text(t: string, px: number, py: number, o: { size?: number; bold?: boolean; center?: boolean; color?: ReturnType<typeof rgb> } = {}): void {
    const font = o.bold ? this.f.b : this.f.r;
    const size = o.size ?? 6.2;
    const w = font.widthOfTextAtSize(t, size);
    this.page.drawText(t, { x: o.center ? X(px) - w / 2 : X(px), y: Y(py), size, font, color: o.color ?? LABEL });
  }

  /** A writing line, from px x1 to x2 at py. */
  rule(x1: number, x2: number, py: number): void {
    this.page.drawLine({ start: { x: X(x1), y: Y(py) }, end: { x: X(x2), y: Y(py) }, thickness: 0.5, color: SOFT });
  }

  circle(px: number, py: number, r: number, o: { stroke?: boolean; fill?: boolean } = {}): void {
    this.page.drawCircle({ x: X(px), y: Y(py), size: r / SC, borderColor: LINE, borderWidth: 0.9, color: o.fill ? PANEL : undefined });
  }

  diamond(px: number, py: number, r = 8): void {
    const a = r / SC;
    this.page.drawSvgPath(`M 0 ${-a} L ${a} 0 L 0 ${a} L ${-a} 0 Z`, { x: X(px), y: Y(py), borderColor: LINE, borderWidth: 0.9 });
  }
}

const ABILITIES: { id: string; name: string; col: 0 | 1; top: number; height: number; skills: string[] }[] = [
  { id: "strength", name: "STRENGTH", col: 0, top: 340, height: 196, skills: ["Athletics"] },
  { id: "dexterity", name: "DEXTERITY", col: 0, top: 552, height: 258, skills: ["Acrobatics", "Sleight of Hand", "Stealth"] },
  { id: "constitution", name: "CONSTITUTION", col: 0, top: 826, height: 158, skills: [] },
  { id: "intelligence", name: "INTELLIGENCE", col: 1, top: 200, height: 297, skills: ["Arcana", "History", "Investigation", "Nature", "Religion"] },
  { id: "wisdom", name: "WISDOM", col: 1, top: 514, height: 297, skills: ["Animal Handling", "Insight", "Medicine", "Perception", "Survival"] },
  { id: "charisma", name: "CHARISMA", col: 1, top: 828, height: 272, skills: ["Deception", "Intimidation", "Performance", "Persuasion"] },
];

// Saving throw label rows and skill rows sit where fillPage1 writes their numbers (points, from the page bottom).
const SAVE_ROW: Record<string, [number, number]> = {
  strength: [34, 509], dexterity: [34, 391], constitution: [34, 245], intelligence: [141, 586], wisdom: [141, 412], charisma: [141, 238],
};
const SKILL_ROW: Record<string, [number, number]> = {
  Athletics: [34, 489], Acrobatics: [34, 371], "Sleight of Hand": [34, 357], Stealth: [34, 343],
  Arcana: [141, 566], History: [141, 552], Investigation: [141, 538], Nature: [141, 524], Religion: [141, 510],
  "Animal Handling": [141, 392], Insight: [141, 378], Medicine: [141, 364], Perception: [141, 350], Survival: [141, 336],
  Deception: [141, 218], Intimidation: [141, 204], Performance: [141, 190], Persuasion: [141, 176],
};

function chromePage1(c: Chrome, page: PDFPage): void {
  // Identity, level, armor class, hit points
  c.panel(20, 20, 445, 130);
  c.text("CHARACTER NAME", 45, 64);
  c.rule(168, 440, 66);
  c.text("BACKGROUND", 45, 104); c.rule(138, 255, 106);
  c.text("CLASS", 269, 104); c.rule(300, 440, 106);
  c.text("SPECIES", 45, 142); c.rule(100, 255, 144);
  c.text("SUBCLASS", 269, 142); c.rule(330, 440, 144);
  c.circle(499, 78, 52, { fill: true });
  c.text("LEVEL", 499, 94, { center: true, bold: true });
  c.text("XP", 499, 133, { center: true });
  c.shield(560, 20, 105, 140);
  c.panel(675, 20, 203, 130, { title: "HIT POINTS" });
  page.drawLine({ start: { x: X(780), y: Y(40) }, end: { x: X(780), y: Y(145) }, thickness: 0.5, color: SOFT });
  c.text("CURRENT", 700, 138); c.text("TEMP", 805, 100); c.text("MAX", 805, 138);
  c.rule(790, 870, 104); c.rule(790, 870, 140);
  c.panel(880, 20, 85, 130, { title: "HIT DICE" });
  c.text("SPENT", 910, 100, { center: true }); c.text("MAX", 910, 138, { center: true });
  c.panel(968, 20, 97, 130, { title: "DEATH SAVES" });
  c.text("SUCCESSES", 1016, 100, { center: true }); c.text("FAILURES", 1016, 138, { center: true });
  for (let i = 0; i < 3; i++) { c.diamond(1000 + i * 22.5, 78, 6); c.diamond(1000 + i * 22.5, 118, 6); }
  c.text("SOUL FORGE", 534, 180, { center: true, bold: true, size: 11, color: LINE });

  // Proficiency bonus, ability blocks
  c.panel(20, 200, 168, 122, { title: "PROFICIENCY BONUS" });
  for (const a of ABILITIES) {
    const x = a.col === 0 ? 20 : 210;
    c.panel(x, a.top, 170, a.height, { title: a.name });
    const pos = ABIL[a.id];
    const cx = pos.mod[0] * SC;
    const cy = (H - pos.mod[1]) * SC - 11;
    c.circle(cx, cy, 33, { fill: true });
    c.text("MODIFIER", cx, cy + 46, { center: true, size: 5.2 });
    c.text("SCORE", pos.score[0] * SC, (H - pos.score[1]) * SC + 17, { center: true, size: 5.2 });
    const [sx, sy] = SAVE_ROW[a.id];
    c.circle(((sx - 13.5) * SC), (H - sy - 0.5) * SC, 6);
    c.text("Saving Throw", (sx + 11) * SC, (H - sy) * SC, { bold: true, size: 6.8 });
    c.rule((sx - 20) * SC, (sx + 62) * SC, (H - sy + 3) * SC);
    for (const s of a.skills) {
      const [kx, ky] = SKILL_ROW[s];
      c.circle((kx - 13.5) * SC, (H - ky - 0.5) * SC, 6);
      c.text(s, (kx + 11) * SC, (H - ky) * SC, { size: 6.8 });
      c.rule((kx - 20) * SC, (kx + 62) * SC, (H - ky + 3) * SC);
    }
  }
  c.panel(20, 992, 168, 108, { title: "HEROIC INSPIRATION" });
  c.circle(104, 1068, 20);
  c.panel(20, 1118, 362, 260, { title: "EQUIPMENT TRAINING & PROFICIENCIES" });
  c.text("ARMOR TRAINING", 30, 1168, { size: 5.6 });
  for (const [pt, label] of [[62, "Light"], [97, "Medium"], [142, "Heavy"], [178, "Shields"]] as const) {
    c.diamond(pt * SC, (H - 125) * SC, 7); c.text(label, pt * SC + 11, (H - 125) * SC + 4, { size: 6.4 });
  }
  c.text("WEAPONS", 30, 1198, { size: 5.6 }); c.rule(30, 372, 1270);
  c.text("TOOLS", 30, 1308, { size: 5.6 });

  // Core numbers
  for (const [x, w, title] of [[400, 148, "INITIATIVE"], [565, 157, "SPEED"], [740, 148, "SIZE"], [905, 165, "PASSIVE PERCEPTION"]] as const) c.panel(x, 200, w, 76, { title });
  // Weapons table
  c.panel(400, 295, 670, 285, { title: "WEAPONS & DAMAGE CANTRIPS" });
  c.text("Name", 412, 352); c.text("Atk Bonus / DC", 608, 352); c.text("Damage & Type", 693, 352); c.text("Notes", 834, 352);
  for (let i = 0; i < 6; i++) c.rule(410, 1060, 380 + i * 36.1);
  c.panel(400, 592, 670, 418, { title: "CLASS FEATURES" });
  page.drawLine({ start: { x: X(735), y: Y(618) }, end: { x: X(735), y: Y(995) }, thickness: 0.4, color: SOFT });
  c.panel(400, 1028, 322, 350, { title: "SPECIES TRAITS" });
  c.panel(735, 1028, 335, 350, { title: "FEATS" });
}

function chromePage2(c: Chrome, page: PDFPage): void {
  c.panel(22, 20, 226, 212, { title: "" });
  c.text("SPELLCASTING ABILITY", 45, 66);
  c.rule(30, 238, 70);
  for (const [y, label] of [[117, "SPELLCASTING MODIFIER"], [159, "SPELL SAVE DC"], [202, "SPELL ATTACK BONUS"]] as const) {
    page.drawLine({ start: { x: X(22), y: Y(y - 22) }, end: { x: X(248), y: Y(y - 22) }, thickness: 0.4, color: SOFT });
    c.text(label, 92, y + 4, { bold: true, size: 5.6, color: INK });
  }
  c.panel(266, 98, 450, 132, { title: "SPELL SLOTS" });
  const maxes = [4, 3, 3, 3, 3, 2, 2, 1, 1];
  const labelX = [280, 438, 580];
  for (let n = 1; n <= 9; n++) {
    const row = (n - 1) % 3, col = Math.floor((n - 1) / 3);
    const y = 164 + row * 25;
    c.text(`LEVEL ${n}`, labelX[col], y, { size: 5.6, bold: true });
    const tx = SLOT_TOTAL_X[col] * SC;
    c.rule(tx - 14, tx + 14, y + 2);
    SLOT_PIP_X[col].slice(0, maxes[n - 1]).forEach((pt) => c.diamond(pt * SC, y - 4, 6));
    if (SLOT_PIP_X[col].length < maxes[n - 1]) for (let k = SLOT_PIP_X[col].length; k < maxes[n - 1]; k++) c.diamond((SLOT_PIP_X[col][SLOT_PIP_X[col].length - 1] + 10 * (k - SLOT_PIP_X[col].length + 1)) * SC, y - 4, 6);
  }
  for (const col of [0, 1, 2]) { c.text("Total", SLOT_TOTAL_X[col] * SC, 148, { size: 5.4, center: true }); c.text("Expended", SLOT_PIP_X[col][1] * SC, 148, { size: 5.4, center: true }); }
  c.panel(22, 250, 694, 1135, { title: "CANTRIPS & PREPARED SPELLS" });
  c.text("Level", 34, 316, { size: 5.6 }); c.text("Name", 76, 316, { size: 5.6 }); c.text("Casting Time", 278, 316, { size: 5.4 }); c.text("Range", 341, 316, { size: 5.6 });
  c.text("Conc.  Ritual  Material", 477, 316, { size: 5.2, center: true }); c.text("Notes", 551, 316, { size: 5.6 });
  for (let i = 0; i < 29; i++) {
    const rowPt = H - (385 + i * 39) / 2 + 2.5; // baseline of the text fillPage2 writes for this row
    c.rule(30, 706, (H - rowPt + 3.5) * SC);
    for (const px of [437, 478, 516]) c.diamond(px, (H - rowPt - 3.5) * SC, 6.5);
  }
  c.panel(735, 20, 335, 175, { title: "APPEARANCE" });
  c.panel(735, 212, 335, 350, { title: "BACKSTORY & PERSONALITY" });
  c.text("Alignment", 745, 516); c.rule(790, 1055, 520);
  c.panel(735, 580, 335, 105, { title: "LANGUAGES" });
  c.panel(735, 702, 335, 495, { title: "EQUIPMENT" });
  c.text("Magic Item Attunement", 745, 1070, { size: 6 });
  for (let i = 0; i < 3; i++) { c.diamond(763, 1090 + i * 35, 8); c.rule(780, 1055, 1100 + i * 35); }
  c.panel(735, 1208, 335, 140, { title: "COINS" });
  ["CP", "SP", "EP", "GP", "PP"].forEach((t, i) => { c.text(t, 773 + i * 65, 1258, { center: true, size: 6 }); c.panel(745 + i * 65, 1262, 56, 52, { radius: 5 }); });
}

/** Adds the two sheet pages, scaled to fit the paper. Returns how many lines of text did not fit. */
export function drawOfficialStyle(pdf: PDFDocument, f: Fonts, d: FillData, size: readonly [number, number]): number {
  const [pw, ph] = size;
  const s = Math.min(pw / W, ph / H);
  const ox = (pw - W * s) / 2;
  const oy = (ph - H * s) / 2;
  let hidden = 0;
  for (const no of [1, 2] as const) {
    const page = pdf.addPage([pw, ph]);
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(s, 0, 0, s, ox, oy));
    const c = new Chrome(page, f);
    if (no === 1) {
      chromePage1(c, page);
      hidden += fillPage1({ page, r: f.r, b: f.b }, d);
    } else {
      chromePage2(c, page);
      hidden += fillPage2({ page, r: f.r, b: f.b }, d);
    }
    page.pushOperators(popGraphicsState());
  }
  return hidden;
}
