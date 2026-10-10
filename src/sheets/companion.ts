/**
 * Writes a companion's stat block onto the DLDM 5E14 companion sheets (Familiar, Paladin Mount, Beastmaster
 * Ranger, Drakewarden Ranger). Those PDFs have no form fields, so text is placed at fixed positions.
 * The PDFs are not part of Soul Forge: the player loads their own copy.
 */
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { CompanionFill } from "./data";

export type CompanionLayout = "mount" | "ranger";

const SKILL_ORDER_A = ["acrobatics", "animal handling", "arcana", "athletics", "deception", "history", "insight", "intimidation", "investigation", "medicine", "nature", "perception", "performance", "persuasion", "religion", "sleight of hand", "stealth", "survival"];
const SKILL_ORDER_B = ["acrobatics", "athletics", "insight", "intimidation", "investigation", "perception", "performance", "sleight of hand", "stealth", "survival"];
const SKILL_ABIL: Record<string, string> = {
  acrobatics: "dexterity", "animal handling": "wisdom", arcana: "intelligence", athletics: "strength", deception: "charisma", history: "intelligence", insight: "wisdom",
  intimidation: "charisma", investigation: "intelligence", medicine: "wisdom", nature: "intelligence", perception: "wisdom", performance: "charisma", persuasion: "charisma",
  religion: "intelligence", "sleight of hand": "dexterity", stealth: "dexterity", survival: "wisdom",
};

const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));
const mod = (score: string) => (score ? Math.floor((Number(score) - 10) / 2) : 0);

/** Pages recognised by size and content: the two layout families the DLDM companion sheets use. */
export function companionLayoutOf(width: number, height: number, text: string): CompanionLayout | undefined {
  const t = text.toLowerCase();
  if (/familiar|mount|steed/.test(t) || (Math.abs(width - 592.32) < 4 && Math.abs(height - 766.56) < 4)) return "mount";
  if (/ranger|beastmaster|drakewarden|companion/.test(t) && Math.abs(width - 612) < 4) return "ranger";
  return undefined;
}

interface Spot {
  x: number;
  y: number;
  size?: number;
  width?: number;
}

/** Positions in PDF points (origin bottom left), read off the printed sheets. */
const A = {
  name: { x: 48, y: 699, size: 14, width: 190 } as Spot, type: { x: 262, y: 719, width: 190 } as Spot, cr: { x: 478, y: 719, width: 70 } as Spot,
  creature: { x: 262, y: 696, width: 100 } as Spot, size: { x: 385, y: 696, width: 80 } as Spot, align: { x: 470, y: 696, width: 90 } as Spot,
  mods: [[47, 604], [47, 532], [47, 460], [47, 388], [47, 318], [47, 247]] as [number, number][],
  scores: [[66, 586], [66, 514], [66, 442], [66, 370], [66, 300], [66, 229]] as [number, number][],
  passive: { x: 94, y: 640 } as Spot, prof: { x: 94, y: 603 } as Spot, ac: { x: 236, y: 626, size: 16 } as Spot, init: { x: 285, y: 618, size: 14 } as Spot, speed: { x: 337, y: 618, size: 12 } as Spot,
  hpMax: { x: 330, y: 578 } as Spot, hpCur: { x: 290, y: 545, size: 14 } as Spot, hd: { x: 258, y: 458 } as Spot,
  saveX: 108, saveY: [570, 557, 543, 530, 516, 503],
  skillX: 108, skillY: [455, 442, 428, 414, 400, 387, 373, 359, 346, 332, 319, 305, 292, 278, 264, 251, 237, 224].map((y) => y - 0),
  attack: { name: 214, bonus: 292, dmg: 330, ys: [382, 367, 353] },
  features: { x: 404, y: 645, width: 172, height: 205 }, other: { x: 404, y: 384, width: 172, height: 160 },
};

const B = {
  name: { x: 50, y: 709, size: 14, width: 200 } as Spot, type: { x: 272, y: 737, width: 190 } as Spot, cr: { x: 487, y: 737, width: 70 } as Spot,
  creature: { x: 272, y: 714, width: 100 } as Spot, size: { x: 394, y: 714, width: 80 } as Spot, align: { x: 487, y: 714, width: 90 } as Spot,
  mods: [[55, 612], [55, 540], [55, 470], [55, 397], [55, 328], [55, 262]] as [number, number][],
  scores: [[73, 594], [73, 522], [73, 452], [73, 379], [73, 310], [73, 244]] as [number, number][],
  passive: { x: 107, y: 659 } as Spot, prof: { x: 107, y: 619 } as Spot, ac: { x: 243, y: 641, size: 16 } as Spot, init: { x: 305, y: 640, size: 14 } as Spot, speed: { x: 358, y: 640, size: 12 } as Spot,
  hpMax: { x: 330, y: 596 } as Spot, hpCur: { x: 292, y: 563, size: 14 } as Spot, hd: { x: 262, y: 466 } as Spot,
  saveX: 114, saveY: [583, 570, 556, 543, 529, 516],
  skillX: 112, skillY: [466, 452, 439, 425, 412, 398, 385, 371, 358, 344],
  attack: { name: 220, bonus: 300, dmg: 338, ys: [395, 380, 366] },
  features: { x: 410, y: 658, width: 172, height: 220 }, other: { x: 410, y: 402, width: 172, height: 160 },
};

function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
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

function put(page: PDFPage, font: PDFFont, text: string, s: Spot, defaultSize = 9): void {
  if (!text) return;
  let size = s.size ?? defaultSize;
  if (s.width) while (size > 5 && font.widthOfTextAtSize(text, size) > s.width) size -= 0.5;
  page.drawText(text, { x: s.x, y: s.y, size, font, color: rgb(0.08, 0.08, 0.1) });
}

function box(page: PDFPage, font: PDFFont, text: string, b: { x: number; y: number; width: number; height: number }): void {
  for (const size of [8, 7.5, 7, 6.5, 6, 5.5, 5]) {
    const lines = wrapText(text, font, size, b.width);
    if (lines.length * size * 1.2 <= b.height || size === 5) {
      const max = Math.floor(b.height / (size * 1.2));
      lines.slice(0, max).forEach((l, i) => page.drawText(l, { x: b.x, y: b.y - i * size * 1.2, size, font, color: rgb(0.08, 0.08, 0.1) }));
      return;
    }
  }
}

export interface CompanionOptions {
  font: { regular: ArrayBuffer | Uint8Array };
  profBonus: string;
  /** Which layout the sheet has. */
  layout: CompanionLayout;
}

export async function fillCompanion(template: Uint8Array | ArrayBuffer, k: CompanionFill, opts: CompanionOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.load(template);
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(opts.font.regular, { subset: true });
  const page = doc.getPage(0);
  const L = opts.layout === "mount" ? A : B;
  const abil = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];

  put(page, font, k.name, L.name);
  put(page, font, k.type, L.type); put(page, font, k.cr, L.cr);
  put(page, font, k.creature, L.creature); put(page, font, k.size, L.size); put(page, font, k.alignment, L.align);
  abil.forEach((a, i) => {
    const sc = k.abilities[a] ?? "";
    if (!sc) return;
    put(page, font, signed(mod(sc)), { x: L.mods[i][0] - 7, y: L.mods[i][1], size: 13 });
    put(page, font, sc, { x: L.scores[i][0], y: L.scores[i][1], size: 8 });
  });
  const wis = mod(k.abilities.wisdom ?? "10");
  const skills = new Map<string, number>();
  for (const m of k.skills.matchAll(/([A-Za-z ]+?)\s*([+-]\d+)/g)) skills.set(m[1].trim().toLowerCase(), Number(m[2]));
  const passive = k.senses.match(/passive perception\s*(\d+)/i)?.[1] ?? String(10 + (skills.get("perception") ?? wis));
  put(page, font, passive, L.passive); put(page, font, opts.profBonus, L.prof);
  put(page, font, k.ac, L.ac); put(page, font, signed(mod(k.abilities.dexterity ?? "10")), L.init); put(page, font, k.speed.replace(/\s*ft\.?/g, ""), L.speed);
  put(page, font, k.hp.match(/\d+/)?.[0] ?? "", L.hpMax); put(page, font, k.hp.match(/\d+/)?.[0] ?? "", L.hpCur); put(page, font, k.hitDice, L.hd);
  abil.forEach((a, i) => put(page, font, signed(mod(k.abilities[a] ?? "10")), { x: L.saveX, y: L.saveY[i], size: 8 }));
  const list = opts.layout === "mount" ? SKILL_ORDER_A : SKILL_ORDER_B;
  list.forEach((s, i) => {
    const v = skills.get(s) ?? mod(k.abilities[SKILL_ABIL[s]] ?? "10");
    put(page, font, signed(v), { x: L.skillX, y: L.skillY[i], size: 8 });
  });
  k.actions.slice(0, 3).forEach((a, i) => {
    put(page, font, a.name, { x: L.attack.name, y: L.attack.ys[i], width: 74 }, 8);
    put(page, font, a.bonus, { x: L.attack.bonus, y: L.attack.ys[i], width: 36 }, 8);
    put(page, font, a.damage, { x: L.attack.dmg, y: L.attack.ys[i], width: 56 }, 8);
  });
  box(page, font, k.traits, L.features);
  box(page, font, [k.languages && `Languages: ${k.languages}`, k.senses && `Senses: ${k.senses}`].filter(Boolean).join("\n"), L.other);
  return doc.save();
}

/** Reads the text of the first page, to tell which companion sheet a PDF is. */
export async function companionLayoutOfPdf(template: Uint8Array | ArrayBuffer, nameHint: string): Promise<CompanionLayout | undefined> {
  const doc = await PDFDocument.load(template);
  if (doc.getForm().getFields().length > 0) return undefined;
  const { width, height } = doc.getPage(0).getSize();
  return companionLayoutOf(width, height, nameHint);
}
