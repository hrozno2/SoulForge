/**
 * Fills the official Wizards of the Coast character sheets by field name: the 2024 fillable sheet and the classic 2014 sheet,
 * in its fillable form and, from the same field positions, in its plain printing form.
 * Check boxes have no useful names on these sheets, so they are found by where they sit next to a labelled field.
 */
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFString, type PDFFont, type PDFPage, rgb } from "pdf-lib";
import type { FillData } from "./data";
import { readWidgets, type Widget } from "./widgets";

/** A field on the sheet: where it is and what kind. Positions are PDF points from the bottom left. */
export interface W {
  name: string;
  t: "Tx" | "Btn";
  p: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Somewhere the values go: the form's own fields, or text drawn onto a plain sheet. */
export interface Sink {
  text(w: W, value: string): void;
  check(w: W, on: boolean): void;
  /** The portrait goes into a picture box. */
  image?(w: W): void;
}

const trim = (s: string) => s.trim();
const cy = (w: W) => w.y + w.h / 2;
const cx = (w: W) => w.x + w.w / 2;

class Sheet {
  constructor(readonly ws: W[], readonly sink: Sink) {}

  find(name: string, page?: number): W | undefined {
    return this.ws.find((w) => trim(w.name) === name && w.t === "Tx" && (page === undefined || w.p === page));
  }

  set(name: string, value: string | number | undefined, page?: number): void {
    const w = this.find(name, page);
    if (w && value !== undefined && String(value) !== "") this.sink.text(w, String(value));
  }

  /** The nearest check box to the left of a field, on the same line. */
  boxLeftOf(field: W, reach = 30): W | undefined {
    return this.ws
      .filter((b) => b.t === "Btn" && b.p === field.p && Math.abs(cy(b) - cy(field)) <= 6 && cx(b) < field.x + 2 && field.x - cx(b) <= reach)
      .sort((a, b) => cx(b) - cx(a))[0];
  }

  boxFor(name: string, on: boolean): void {
    const f = this.find(name);
    const b = f && this.boxLeftOf(f);
    if (b) this.sink.check(b, on);
  }

  /** Check boxes in a row: those at about this height and between two x values, left to right. */
  boxesIn(page: number, y: number, x0: number, x1: number, tol = 4): W[] {
    return this.ws.filter((b) => b.t === "Btn" && b.p === page && Math.abs(cy(b) - y) <= tol && cx(b) >= x0 && cx(b) <= x1).sort((a, b) => cx(a) - cx(b));
  }
}

const SKILLS_2024: Record<string, string> = {
  acrobatics: "ACROBATICS", "animal handling": "ANIMAL HANDLING", arcana: "ARCANA", athletics: "ATHLETICS", deception: "DECEPTION", history: "HISTORY", insight: "INSIGHT",
  intimidation: "INTIMIDATE", investigation: "INVESTIGATION", medicine: "MEDICINE", nature: "NATURE", perception: "PERCEPTION", performance: "PERFORMANCE", persuasion: "PERSUASION",
  religion: "RELIGION", "sleight of hand": "SLEIGHT OF HAND", stealth: "STEALTH", survival: "SURVIVAL",
};
const ABIL_KEYS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;
const SHORT = { strength: "STR", dexterity: "DEX", constitution: "CON", intelligence: "INT", wisdom: "WIS", charisma: "CHA" } as const;

const joinLines = (a: string[]) => a.join("\n");

/** Spell rows: the name fields from top to bottom, with the other fields on the same line. */
function spellRows(s: Sheet, page: number, d: FillData, ctx: { level: string; name: string; time: string; range: string; notes: string; boxX: [number, number, number] }): void {
  const names = s.ws.filter((w) => w.t === "Tx" && w.p === page && w.name.startsWith(ctx.name)).sort((a, b) => b.y - a.y);
  const seen = new Set<number>();
  const rows = names.filter((w) => (seen.has(Math.round(w.y)) ? false : (seen.add(Math.round(w.y)), true)));
  const sameLine = (prefix: string, row: W) => s.ws.find((w) => w.t === "Tx" && w.p === page && w.name.startsWith(prefix) && Math.abs(cy(w) - cy(row)) <= 5);
  d.spells.slice(0, rows.length).forEach((sp, i) => {
    const row = rows[i];
    s.sink.text(row, sp.name);
    const lv = sameLine(ctx.level, row);
    if (lv) s.sink.text(lv, sp.level === "0" ? "C" : sp.level);
    const tm = sameLine(ctx.time, row);
    if (tm) s.sink.text(tm, sp.time);
    const rg = sameLine(ctx.range, row);
    if (rg) s.sink.text(rg, sp.range);
    const nt = sameLine(ctx.notes, row);
    const note = [sp.duration, sp.notes].filter(Boolean).join(", ");
    if (nt && note) s.sink.text(nt, note);
    const boxes = s.boxesIn(page, cy(row), ctx.boxX[0] - 6, ctx.boxX[2] + 6);
    [sp.concentration, sp.ritual, sp.m].forEach((on, k) => { if (boxes[k]) s.sink.check(boxes[k], on); });
  });
}

// ---------------------------------------------------------------- 2024 fillable

export function fill2024Form(ws: W[], d: FillData, sink: Sink): void {
  const s = new Sheet(ws, sink);
  s.set("Name", d.name); s.set("Background", d.background); s.set("Class", d.className); s.set("Species", d.species); s.set("Subclass", d.subclass);
  s.set("Level", d.level); s.set("XP Points", d.xp || ""); s.set("Armor Class", d.ac); s.set("Current HP", d.hpCurrent); s.set("Max HP", d.hpMax); s.set("Temp HP", d.hpTemp || "");
  s.set("Spent HD", d.hdSpent || ""); s.set("Max HD", d.hdMax);
  s.set("init", d.initiative); s.set("SPEED", d.speed ? `${d.speed} ft` : ""); s.set("SIZE", d.size); s.set("PROF BONUS", d.profBonus);
  s.set("PASSIVE PERCEPTION", String(10 + Number((d.skills.perception?.bonus ?? "+0").replace("+", ""))));
  for (const a of ABIL_KEYS) {
    const ab = d.abilities[a];
    s.set(`${SHORT[a]} SCORE`, ab.score); s.set(`${SHORT[a]} MOD`, ab.mod);
    // The Wisdom save field kept a default name on this sheet.
    const saveName = a === "wisdom" ? "Text Field71" : `${SHORT[a]} SAVE`;
    s.set(saveName, ab.save);
    s.boxFor(saveName, ab.saveProf);
  }
  for (const [skill, field] of Object.entries(SKILLS_2024)) {
    const k = d.skills[skill];
    if (!k) continue;
    s.set(field, k.bonus);
    s.boxFor(field, k.prof);
  }
  d.weapons.slice(0, 6).forEach((wp, i) => {
    s.set(`NAME - WEAPON ${i + 1}`, wp.name); s.set(`BONUS/DC - WEAPON ${i + 1}`, wp.bonus); s.set(`DAMAGE/TYPE - WEAPON ${i + 1}`, wp.damage); s.set(`NOTES - WEAPON ${i + 1}`, wp.notes);
  });
  const feats = d.featureList.filter((f) => f.group === "Class features").map((f) => `${f.name}${f.usage ? ` (${f.usage})` : ""}: ${f.text}`);
  const half = Math.ceil(feats.length / 2);
  s.set("CLASS FEATURES 1", joinLines(feats.slice(0, half))); s.set("CLASS FEATURES 2", joinLines(feats.slice(half)));
  s.set("SPECIES TRAITS", joinLines(d.featureList.filter((f) => f.group === "Species traits").map((f) => `${f.name}: ${f.text}`)));
  s.set("FEATS", joinLines(d.featureList.filter((f) => f.group === "Feats").map((f) => `${f.name}: ${f.text}`)));
  s.set("TOOL PROF", d.tools);
  s.set("WEAPON PROF", [d.weaponTraining.simple && "Simple", d.weaponTraining.martial && "Martial"].filter(Boolean).join(", "));
  // Armor training boxes sit in a row near the bottom left, then the shield, heroic inspiration and death saves.
  const armor = s.boxesIn(0, 125, 40, 200, 6);
  [d.armorTraining.light, d.armorTraining.medium, d.armorTraining.heavy, d.armorTraining.shield].forEach((on, i) => armor[i] && sink.check(armor[i], on));
  for (const b of ws) {
    if (b.t !== "Btn" || b.p !== 0) continue;
    if (b.name === "shield chk") sink.check(b, d.shield);
    if (/^SUCCESS (LEFT L|CTR|RIGHT) chk$/.test(b.name)) sink.check(b, d.deathSuccess >= ({ "SUCCESS LEFT L chk": 1, "SUCCESS CTR chk": 2, "SUCCESS RIGHT chk": 3 } as Record<string, number>)[b.name]);
    if (/^FAILURE (LEFT|CTR|RIGHT) chk$/.test(b.name)) sink.check(b, d.deathFail >= ({ "FAILURE LEFT chk": 1, "FAILURE CTR chk": 2, "FAILURE RIGHT chk": 3 } as Record<string, number>)[b.name]);
    if (b.name === "Check Box1") sink.check(b, d.inspiration);
  }

  // Page 2: spellcasting, slots, spell rows, personal notes
  s.set("SPELLCASTING ABILITY", d.casting?.ability, 1); s.set("SPELLCASTING MOD", d.casting?.mod, 1); s.set("SPELL SAVE DC", d.casting?.dc, 1); s.set("SPELL ATTACK BONUS", d.casting?.attack, 1);
  for (let n = 1; n <= 9; n++) {
    const total = d.casting?.slots[n - 1] ?? 0;
    if (total) s.set(`LVL${n} TOTAL`, total, 1);
    const colX: [number, number][] = [[195, 232], [284, 314], [364, 384]];
    const [x0, x1] = colX[Math.floor((n - 1) / 3)];
    const row = [680, 666, 652][(n - 1) % 3];
    const boxes = s.boxesIn(1, row + 3.5, x0, x1, 5);
    // The boxes you have are ticked as spent; the rest stay empty.
    boxes.forEach((b, i) => sink.check(b, i < Math.min(total, d.casting?.used[n - 1] ?? 0)));
  }
  spellRows(s, 1, d, { level: "SPELL LEVEL", name: "SPELL NAME", time: "CASTING TIME", range: "RANGE", notes: "SPELL NOTES", boxX: [239, 261, 283] });
  s.set("LANGUAGES", d.languages, 1);
  s.set("EQUIPMENT", [d.armorWorn && `Armor: ${d.armorWorn}`, d.weaponsText && `Weapons: ${d.weaponsText.replace(/\n/g, ", ")}`, d.otherGear.replace(/\n/g, ", ")].filter(Boolean).join("\n"), 1);
  d.magicItems.slice(0, 3).forEach((m, i) => { s.set(`ATTUNMENT ${i + 1}`, m.name, 1); s.boxFor(`ATTUNMENT ${i + 1}`, m.attuned); });
  for (let i = d.magicItems.length; i < 3; i++) s.boxFor(`ATTUNMENT ${i + 1}`, false);
  for (const b of ws) if (b.t === "Btn" && /portrait|image/i.test(b.name)) sink.image?.(b);
  s.set("PERSONALITY", [d.appearance, d.personality].filter(Boolean).join("\n\n"), 1);
  // Newer copies of the sheet split the text into three boxes.
  s.set("APPEARANCE", d.appearance, 1); s.set("Alignment", d.alignment, 1); s.set("BACKSTORY / PERSONALITY", [d.personality, d.backstory].filter(Boolean).join("\n\n"), 1);
  for (const k of ["cp", "sp", "ep", "gp", "pp"] as const) s.set(k.toUpperCase(), d.coins[k] === "0" ? "" : d.coins[k], 1);
}

// ---------------------------------------------------------------- 2014 classic

const SKILLS_2014: Record<string, string> = {
  acrobatics: "Acrobatics", "animal handling": "Animal", arcana: "Arcana", athletics: "Athletics", deception: "Deception", history: "History", insight: "Insight", intimidation: "Intimidation",
  investigation: "Investigation", medicine: "Medicine", nature: "Nature", perception: "Perception", performance: "Performance", persuasion: "Persuasion", religion: "Religion",
  "sleight of hand": "SleightofHand", stealth: "Stealth", survival: "Survival",
};

export function fill2014(ws: W[], d: FillData, sink: Sink): void {
  const s = new Sheet(ws, sink);
  s.set("CharacterName", d.name); s.set("CharacterName 2", d.name); s.set("PlayerName", d.body.player);
  s.set("ClassLevel", [d.className, d.level].filter(Boolean).join(" ")); s.set("Background", d.background); s.set("Race", d.species);
  s.set("Alignment", d.alignment); s.set("XP", d.xp || "");
  s.set("Inspiration", d.inspiration ? "1" : "");
  s.set("ProfBonus", d.profBonus); s.set("AC", d.ac); s.set("Initiative", d.initiative); s.set("Speed", d.speed);
  s.set("HPMax", d.hpMax); s.set("HPCurrent", d.hpCurrent); s.set("HPTemp", d.hpTemp || "");
  s.set("HDTotal", d.hdMax); s.set("HD", d.hdMax.replace(/^\d+/, String(Math.max(0, parseInt(d.hdMax, 10) - d.hdSpent || 0))));
  s.set("Passive", String(10 + Number((d.skills.perception?.bonus ?? "+0").replace("+", ""))));
  const mods: Record<string, string> = { strength: "STRmod", dexterity: "DEXmod", constitution: "CONmod", intelligence: "INTmod", wisdom: "WISmod", charisma: "CHamod" };
  const names2014: Record<string, string> = { strength: "ST Strength", dexterity: "ST Dexterity", constitution: "ST Constitution", intelligence: "ST Intelligence", wisdom: "ST Wisdom", charisma: "ST Charisma" };
  for (const a of ABIL_KEYS) {
    const ab = d.abilities[a];
    s.set(SHORT[a], ab.score); s.set(mods[a], ab.mod);
    s.set(names2014[a], ab.save); s.boxFor(names2014[a], ab.saveProf);
  }
  for (const [skill, field] of Object.entries(SKILLS_2014)) {
    const k = d.skills[skill];
    if (!k) continue;
    s.set(field, k.bonus); s.boxFor(field, k.prof || k.expert);
  }
  d.weapons.slice(0, 3).forEach((wp, i) => {
    const n = i === 0 ? "" : ` ${i + 1}`;
    s.set(`Wpn Name${n}`, wp.name); s.set(`Wpn${i + 1} AtkBonus`, wp.bonus); s.set(`Wpn${i + 1} Damage`, wp.damage);
  });
  const extra = d.weapons.slice(3).map((wp) => `${wp.name} ${wp.bonus}, ${wp.damage}`);
  s.set("AttacksSpellcasting", joinLines([...extra, d.casting ? `Spell save DC ${d.casting.dc}, spell attack ${d.casting.attack}` : ""].filter(Boolean)));
  s.set("ProficienciesLang", [d.languages && `Languages: ${d.languages}`, d.tools && `Tools: ${d.tools}`, `Armor: ${[d.armorTraining.light && "light", d.armorTraining.medium && "medium", d.armorTraining.heavy && "heavy", d.armorTraining.shield && "shields"].filter(Boolean).join(", ") || "none"}`, `Weapons: ${[d.weaponTraining.simple && "simple", d.weaponTraining.martial && "martial"].filter(Boolean).join(", ") || "none"}`].filter(Boolean).join("\n"));
  for (const k of ["cp", "sp", "ep", "gp", "pp"] as const) s.set(k.toUpperCase(), d.coins[k] === "0" ? "" : d.coins[k]);
  s.set("Equipment", [d.armorWorn, d.weaponsText.replace(/\n/g, ", "), d.otherGear.replace(/\n/g, ", ")].filter(Boolean).join("\n"));
  const feats = d.featureList.map((f) => `${f.name}${f.usage ? ` (${f.usage})` : ""}: ${f.text}`);
  s.set("Features and Traits", joinLines(feats));
  // Death saves: the six boxes by the Death Saves panel, successes above failures.
  const death = ws.filter((b) => b.t === "Btn" && b.p === 0 && /^Check Box 1[2-7]$/.test(trim(b.name))).sort((a, b) => b.y - a.y || a.x - b.x);
  death.forEach((b, i) => sink.check(b, i < 3 ? i < d.deathSuccess : i - 3 < d.deathFail));
  for (const b of ws) if (b.t === "Btn" && /image/i.test(b.name)) sink.image?.(b);
  // Personality text and notes
  const person = d.personality.split("\n");
  const pick = (label: string) => person.find((l) => l.toLowerCase().startsWith(`${label}:`))?.replace(/^[^:]+:\s*/, "") ?? "";
  s.set("PersonalityTraits", pick("traits") || pick("personality traits")); s.set("Ideals", pick("ideals")); s.set("Bonds", pick("bonds")); s.set("Flaws", pick("flaws"));
  if (!pick("traits") && !pick("ideals") && !pick("bonds") && !pick("flaws")) s.set("PersonalityTraits", d.personality);
  s.set("Backstory", d.backstory); s.set("Allies", d.body.allies); s.set("Treasure", d.magicItems.map((m) => m.name).join(", "));
  s.set("Age", d.body.age); s.set("Height", d.body.height); s.set("Weight", d.body.weight); s.set("Eyes", d.body.eyes); s.set("Skin", d.body.skin); s.set("Hair", d.body.hair);
  s.set("FactionName", d.body.deity); s.set("Feat+Traits", d.notes);

  // Spellcasting page
  if (d.casting) {
    s.set("Spellcasting Class 2", d.className); s.set("SpellcastingAbility 2", d.casting.ability); s.set("SpellSaveDC  2", d.casting.dc); s.set("SpellAtkBonus 2", d.casting.attack);
    for (let n = 1; n <= 9; n++) {
      const total = d.casting.slots[n - 1] ?? 0;
      s.set(`SlotsTotal ${18 + n}`, total || "", 2);
      s.set(`SlotsRemaining ${18 + n}`, total ? Math.max(0, total - (d.casting.used[n - 1] ?? 0)) : "", 2);
    }
  }
  // The spell name boxes belong to a level by the heading above them in the same column.
  const headers = ws.filter((w) => w.p === 2 && /^SlotsTotal \d+$/.test(trim(w.name)));
  const column = (x: number) => (x < 200 ? 0 : x < 380 ? 1 : 2);
  const levelOf = (f: W): number => {
    const above = headers.filter((h) => column(h.x) === column(f.x) && h.y >= f.y).sort((a, b) => a.y - b.y)[0];
    return above ? Number(trim(above.name).replace("SlotsTotal ", "")) - 18 : 0;
  };
  const fields = ws.filter((w) => w.t === "Tx" && w.p === 2 && /^Spells \d+$/.test(trim(w.name)));
  const byLevel = new Map<number, W[]>();
  for (const f of fields) (byLevel.get(levelOf(f)) ?? byLevel.set(levelOf(f), []).get(levelOf(f))!).push(f);
  for (const list of byLevel.values()) list.sort((a, b) => b.y - a.y);
  const used = new Map<number, number>();
  for (const sp of d.spells) {
    const lv = Number(sp.level) || 0;
    const slotField = byLevel.get(lv)?.[used.get(lv) ?? 0];
    if (!slotField) continue;
    used.set(lv, (used.get(lv) ?? 0) + 1);
    sink.text(slotField, sp.name);
    const box = ws.find((b) => b.t === "Btn" && b.p === 2 && Math.abs(cy(b) - cy(slotField)) <= 5 && cx(b) < slotField.x && slotField.x - cx(b) < 24);
    if (box) sink.check(box, lv === 0 ? false : /prepared|always/.test(sp.notes));
  }
}

// ---------------------------------------------------------------- sinks

const BLACK = rgb(0.05, 0.05, 0.08);

/** Whether text belongs in a tall box as several lines, or on one line in a short one. */
function wantsMulti(font: PDFFont, value: string, w: W): boolean {
  return w.h > 40 || value.includes("\n") || (w.h > 24 && font.widthOfTextAtSize(value, 9) > w.w - 4);
}

/** Fits text into a box: the largest size that keeps every line inside. */
function layout(font: PDFFont, text: string, w: number, h: number, multi: boolean): { lines: string[]; size: number } {
  const tries = multi ? [9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5, 5, 4.5, 4] : [11, 10, 9, 8, 7, 6.5, 6, 5.5, 5].filter((t) => t <= Math.max(5, h * 0.78));
  for (const size of tries) {
    if (!multi) {
      if (font.widthOfTextAtSize(text, size) <= w - 3 && size * 1.1 <= h + 1) return { lines: [text], size };
      continue;
    }
    const lines: string[] = [];
    for (const para of text.split("\n")) {
      let cur = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = cur ? `${cur} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= w - 5) cur = next;
        else {
          if (cur) lines.push(cur);
          cur = word;
        }
      }
      lines.push(cur);
    }
    if (lines.length * size * 1.15 <= h - 2) return { lines, size };
  }
  return { lines: [text], size: 4 };
}

/** Writes into the form's own fields. Text keeps being editable. */
export function formSink(doc: PDFDocument, font: PDFFont): Sink & { done(): void; widgets: Widget[]; images: W[] } {
  const form = doc.getForm();
  const widgets = readWidgets(doc);
  const images: W[] = [];
  return {
    widgets,
    images,
    image(w) {
      images.push(w);
    },
    text(w, value) {
      // Two widgets with one name are one field to the form, so they would show the same value. Draw those instead.
      if (widgets.filter((x) => x.name === w.name).length > 1) {
        const page = doc.getPage(w.p);
        const multi = wantsMulti(font, value, w);
        const { lines, size } = layout(font, value, w.w, w.h, multi);
        lines.forEach((l, i) => page.drawText(l, { x: w.x + (!multi && w.w <= 50 ? (w.w - font.widthOfTextAtSize(l, size)) / 2 : 2), y: multi ? w.y + w.h - 2 - size - i * size * 1.15 : w.y + (w.h - size * 0.72) / 2, size, font, color: BLACK }));
        return;
      }
      try {
        const f = form.getTextField(w.name);
        f.setText(value);
        const multi = f.isMultiline() || wantsMulti(font, value, w);
        const { size } = layout(font, value, w.w, w.h, multi);
        try {
          f.setFontSize(size);
        } catch {
          // Some sheets leave the field without a default appearance; give it one.
          f.acroField.setDefaultAppearance(`0 g /${font.name} ${size} Tf`);
        }
        // A widget can carry its own default appearance, which wins over the field's. Keep them in step.
        const da = f.acroField.getDefaultAppearance();
        if (da) for (const x of widgets.filter((y) => y.name === w.name)) if (x.dict.has(PDFName.of("DA"))) x.dict.set(PDFName.of("DA"), PDFString.of(da));
      } catch {
        /* a field the sheet does not have */
      }
    },
    check(w, on) {
      try {
        const b = form.getCheckBox(w.name);
        // Leave boxes that stay empty alone, so the sheet keeps its own drawing of them.
        if (on && !b.isChecked()) b.check();
        else if (!on && b.isChecked()) b.uncheck();
      } catch {
        /* not a check box on this copy */
      }
    },
    done() {
      // Only text fields are redrawn. Check boxes keep the sheet's own drawing of a tick.
      for (const f of form.getFields()) if (f.constructor.name === "PDFTextField") (f as unknown as { updateAppearances(font: PDFFont): void }).updateAppearances(font);
    },
  };
}

/** Draws onto a plain printing sheet, at the positions of the fields of the fillable copy. */
export function overlaySink(doc: PDFDocument, font: PDFFont): Sink {
  const pages = doc.getPages();
  const draw = (w: W, fn: (page: PDFPage) => void) => {
    const page = pages[w.p];
    if (page) fn(page);
  };
  return {
    text(w, value) {
      draw(w, (page) => {
        const multi = wantsMulti(font, value, w);
        const { lines, size } = layout(font, value, w.w, w.h, multi);
        // Small boxes (scores, modifiers, bonuses) are centred like the printed numbers around them.
        const centre = !multi && w.w <= 50;
        lines.forEach((l, i) => {
          const y = multi ? w.y + w.h - 2 - size - i * size * 1.15 : w.y + (w.h - size * 0.72) / 2;
          const x = centre ? w.x + (w.w - font.widthOfTextAtSize(l, size)) / 2 : w.x + 2;
          page.drawText(l, { x, y, size, font, color: BLACK });
        });
      });
    },
    check(w, on) {
      if (!on) return;
      draw(w, (page) => {
        page.drawCircle({ x: cx(w), y: cy(w), size: Math.min(w.w, w.h) * 0.38, color: BLACK });
      });
    },
  };
}

/** Puts the portrait in the first picture box. On a plain sheet it is drawn there; on a form it goes into the button field. */
export async function placePortrait(doc: PDFDocument, data: FillData, boxes: W[], notes: string[], draw = false): Promise<void> {
  if (!data.portrait || !boxes.length) return;
  try {
    const bytes = Uint8Array.from(atob(data.portrait.split(",")[1] ?? ""), (c) => c.charCodeAt(0));
    const img = /image\/png/.test(data.portrait.slice(0, 30)) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const box = boxes.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];
    if (draw) {
      const s = Math.min(box.w / img.width, box.h / img.height);
      doc.getPage(box.p).drawImage(img, { x: box.x + (box.w - img.width * s) / 2, y: box.y + (box.h - img.height * s) / 2, width: img.width * s, height: img.height * s });
    } else {
      doc.getForm().getButton(box.name).setImage(img);
    }
  } catch {
    notes.push("The portrait could not be placed.");
  }
}

export interface FormFillResult {
  bytes: Uint8Array;
  notes: string[];
}

/** Every field of a PDF as the automatic matcher wants it, with its tooltip. */
export function autoFields(doc: PDFDocument): import("./automap").AutoField[] {
  return readWidgets(doc).map((w) => {
    let tip = "";
    let cur: PDFDict | undefined = w.dict;
    while (cur) {
      const v = cur.lookup(PDFName.of("TU"));
      if (v instanceof PDFString || v instanceof PDFHexString) {
        tip = v.decodeText();
        break;
      }
      const parent: unknown = cur.lookup(PDFName.of("Parent"));
      cur = parent instanceof PDFDict ? parent : undefined;
    }
    return { name: w.name, t: w.type === "Btn" ? "Btn" : "Tx", p: w.page, x: w.x, y: w.y, w: w.w, h: w.h, tip, multiline: w.multiline };
  });
}

export interface AutoFillResult extends FormFillResult {
  matched: number;
  total: number;
  unmatched: string[];
}

/** Fills any fillable sheet by reading its field names and tooltips. */
export async function fillAuto(template: Uint8Array | ArrayBuffer, data: FillData, font: { regular: ArrayBuffer | Uint8Array }): Promise<AutoFillResult> {
  const doc = await PDFDocument.load(template, { ignoreEncryption: true });
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  doc.registerFontkit(fontkit);
  const f = await doc.embedFont(font.regular, { subset: true });
  const sink = formSink(doc, f);
  const { autoFill, attachLabels } = await import("./automap");
  let fields = autoFields(doc);
  // Names like "Text Field12" say nothing, so read the printed words around the fields and use them as clues.
  if (fields.some((f) => /^(text ?field|check ?box|button)[\s_.-]*\d*$/i.test(f.name.trim()))) {
    try {
      const { openPdf } = await import("../pdf/preview");
      const pdf = await openPdf(new Uint8Array(template as ArrayBuffer));
      const words: { p: number; text: string; x: number; y: number; w: number; h: number }[] = [];
      for (let i = 0; i < pdf.count; i++) for (const w of await pdf.words(i)) words.push({ p: i, ...w });
      pdf.destroy();
      fields = attachLabels(fields, words);
    } catch {
      /* without the printed words, the names and tooltips still do the matching */
    }
  }
  const res = autoFill(fields, data, sink);
  sink.done();
  const notes = [`Matched ${res.matched} entries to ${res.total} fields.`];
  if (res.unmatched.length) notes.push(`Not matched, fill by hand: ${res.unmatched.slice(0, 12).join(", ")}${res.unmatched.length > 12 ? ` and ${res.unmatched.length - 12} more` : ""}.`);
  return { bytes: await doc.save({ updateFieldAppearances: false }), notes, ...res };
}
