/**
 * Importers for characters made elsewhere: Foundry VTT (dnd5e actor JSON, including actors made with
 * the Plutonium module) and Roll20 (D&D 5e OGL sheet attributes as JSON). Both are best effort: the formats
 * change between versions, so this reads what it recognises, matches names against the loaded content, and
 * reports what it could not place.
 */
import { ABILITY_IDS, newCharacter, uid, type AbilityId, type Character } from "./character";
import type { AElement } from "./types";
import type { ARegistry } from "./registry";
import { resolve } from "./engine";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface ForeignImport {
  character: Character;
  notes: string[];
  matched: string[];
  missing: string[];
}

export function detectCharacterFormat(data: unknown): "foundry" | "roll20" | "charforge" | "unknown" {
  const d = data as Json;
  if (!d || typeof d !== "object") return "unknown";
  if (d.version === 2 && d.abilityBase) return "charforge";
  if (d.system && Array.isArray(d.items)) return "foundry";
  if (Array.isArray(d.attribs) || Array.isArray(d.character?.attribs) || Array.isArray(d.attributes)) return "roll20";
  return "unknown";
}

const normalize = (s: string) =>
  s.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

function findByName(reg: ARegistry, types: string[], name: string): AElement | undefined {
  const want = normalize(name);
  if (!want) return undefined;
  const hits = types.flatMap((t) => reg.ofType(t)).filter((e) => normalize(e.name) === want);
  return hits.find((e) => /2024|24/.test(e.source + e.id)) ?? hits[hits.length - 1];
}

const ITEM_TYPES = ["Item", "Weapon", "Armor", "Magic Item"];

class Importer {
  ch: Character = newCharacter();
  notes: string[] = [];
  matched: string[] = [];
  missing: string[] = [];
  private wantedChoices: { types: string[]; name: string; label: string }[] = [];
  /** What the file says the character has, used to fill open choices (skills, languages, tools, expertise, saves). */
  hints = { skills: new Set<string>(), expertise: new Set<string>(), tools: new Set<string>(), languages: new Set<string>(), saves: new Set<string>() };

  constructor(private reg: ARegistry) {}

  /** Remember something to put into whichever choice can hold it once the character is shaped. */
  want(types: string[], name: string, label: string): void {
    if (name) this.wantedChoices.push({ types, name, label });
  }

  addItem(name: string, qty: number, equipped: boolean, attuned: boolean): void {
    // "Rapier +1", "Goodberry (7hp)", "Requital (+1 Longsword)" and "+1 Shield" are a base item with a note.
    const strip = (n: string) => n.replace(/^\s*[+-]\d+\s+/, "").replace(/\s*[+-]\d+\s*$/, "");
    const inner = /\((.*?)\)/.exec(name)?.[1] ?? "";
    const candidates = [name, strip(name), name.replace(/\s*\(.*?\)\s*/g, " "), strip(name.replace(/\s*\(.*?\)\s*/g, " ")), strip(inner)].filter((n) => n.trim());
    let el: AElement | undefined;
    for (const c of candidates) {
      el = findByName(this.reg, ITEM_TYPES, c);
      if (el) break;
    }
    this.ch.inventory.push({ uid: uid(), id: el?.id ?? "", qty: Math.max(1, qty), equipped, attuned, custom: el ? undefined : { name } });
    (el ? this.matched : this.missing).push(el ? `${el.name} (${el.type})` : `${name} (item, kept as a custom item)`);
  }


  private score(slotName: string, optionName: string, scores: Partial<Record<AbilityId, number>>): number {
    const n = optionName.toLowerCase().trim();
    const inner = /\((.*)\)\s*$/.exec(n)?.[1]?.trim() ?? n;
    const h = this.hints;
    if (/^skill expertise/.test(n)) return h.expertise.has(inner) ? 100 : 0;
    if (/^tool proficiency/.test(n)) return h.tools.has(inner) ? 100 : 0;
    if (h.languages.has(n)) return 100;
    const ab = ABILITY_IDS.find((a) => a === n);
    if (ab) {
      const total = scores[ab] ?? 0;
      // A feat that grants a saving throw proficiency is best spent on one the class does not already give.
      if (/resilient/i.test(slotName)) return h.saves.has(ab) ? 60 - total : -total;
      return total;
    }
    if (h.skills.has(n)) return h.expertise.has(n) ? 95 : 90;
    return 0;
  }

  /** Fills every open choice. Ones the file speaks to are matched; the rest take the first sensible option. */
  private fillOpen(start: Character, scores: Partial<Record<AbilityId, number>>): Character {
    let cur = start;
    let guessed = 0;
    const skip = new Set<string>();
    for (let i = 0; i < 600; i++) {
      const r = resolve(cur, this.reg);
      const open = r.slots.find((s) => !skip.has(s.key) && !s.rule.optional && !s.defaulted && s.chosen.length < s.rule.number && s.options.length);
      if (!open) break;
      const taken = new Set(open.chosen);
      const candidates = open.options
        .filter((o) => !taken.has(o.id) && !open.blocked.has(o.id) && !r.ids.has(o.id))
        .map((o) => ({ o, sc: this.score(`${open.key} ${open.rule.name}`, o.name, scores) }))
        .sort((a, b) => b.sc - a.sc);
      const best = candidates[0] ?? { o: open.options.find((o) => !taken.has(o.id)), sc: 0 };
      if (!best.o) break;
      // A subclass the file names but the content lacks is better left open than guessed.
      if (best.sc <= 0 && best.o.type === "Archetype") {
        skip.add(open.key);
        continue;
      }
      if (best.sc <= 0 && !/^\s*ability score/i.test(open.rule.name)) guessed++;
      cur = { ...cur, selections: { ...cur.selections, [open.key]: [...open.chosen, best.o.id] } };
    }
    if (guessed) this.notes.push(`${guessed} choices the file did not say anything about were filled with the first option. Check the Build tab.`);
    return cur;
  }

  /** Fill choices (subclass, feats, spells) with everything wanted, then derive base scores. */
  finish(importedScores: Partial<Record<AbilityId, number>>): ForeignImport {
    let ch = this.ch;
    for (const w of this.wantedChoices) {
      const el = findByName(this.reg, w.types, w.name);
      if (!el) {
        this.missing.push(`${w.name} (${w.label})`);
        continue;
      }
      const r = resolve(ch, this.reg);
      if (r.ids.has(el.id)) {
        this.matched.push(`${el.name} (already granted)`);
        continue;
      }
      const slot = r.slots.find((s) => s.chosen.length < s.rule.number && s.options.some((o) => o.id === el.id));
      if (slot) {
        ch = { ...ch, selections: { ...ch.selections, [slot.key]: [...slot.chosen, el.id] } };
        this.matched.push(`${el.name} (${w.label})`);
      } else {
        // No open choice can hold it (a racial spell, a Magical Secrets pick): keep it as a manual addition.
        ch = { ...ch, extras: [...ch.extras, el.id] };
        this.matched.push(`${el.name} (${w.label}, added by hand)`);
      }
    }
    // Fill what is still open from the file's skills, languages, tools and scores, then with defaults.
    ch = this.fillOpen(ch, importedScores);
    // Imported scores already include species and background bonuses, so remove them to get the base.
    const r = resolve(ch, this.reg);
    const base = { ...ch.abilityBase };
    for (const a of ABILITY_IDS) {
      const total = importedScores[a];
      if (total === undefined) continue;
      const bonus = r.stats.get(a) - ch.abilityBase[a];
      base[a] = Math.max(1, total - bonus);
    }
    ch = { ...ch, abilityBase: base, abilityMethod: "manual" };
    if (this.missing.length) this.notes.push(`${this.missing.length} things were not found in your loaded content and were skipped or kept as custom items.`);
    this.notes.push(`${this.matched.length} matched.`);
    return { character: ch, notes: this.notes, matched: this.matched, missing: this.missing };
  }
}

// ---------------------------------------------------------------- Foundry

const cap = (s: unknown) => (typeof s === "string" && s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const ABBR: Record<string, AbilityId> = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" };

export function importFoundry(data: Json, reg: ARegistry): ForeignImport {
  const b = new Importer(reg);
  const sys: Json = data.system ?? {};
  b.ch.name = String(data.name ?? "");
  const scores: Partial<Record<AbilityId, number>> = {};
  for (const [k, a] of Object.entries(ABBR)) {
    const v = Number(sys.abilities?.[k]?.value);
    if (Number.isFinite(v)) scores[a] = v;
  }
  const items: Json[] = Array.isArray(data.items) ? data.items : [];
  const subclasses: string[] = [];
  for (const it of items) {
    const name = String(it.name ?? "");
    const isys: Json = it.system ?? {};
    if (!name) continue;
    switch (it.type as string) {
      case "class": {
        const el = findByName(reg, ["Class"], name);
        if (el) {
          b.ch.classes.push({ classId: el.id, level: Math.max(1, Math.min(20, Number(isys.levels) || 1)) });
          b.matched.push(`${el.name} (class)`);
        } else b.missing.push(`${name} (class)`);
        break;
      }
      case "subclass":
        subclasses.push(name);
        break;
      case "race": {
        const el = findByName(reg, ["Race"], name);
        if (el) {
          b.ch.race = el.id;
          b.matched.push(`${el.name} (species)`);
        } else b.missing.push(`${name} (species)`);
        break;
      }
      case "background": {
        const el = findByName(reg, ["Background"], name);
        if (el) {
          b.ch.background = el.id;
          b.matched.push(`${el.name} (background)`);
        } else b.missing.push(`${name} (background)`);
        break;
      }
      case "feat":
        // Class, species and background features come from the content itself. Only real feats are choices.
        if (!isys.type?.value || isys.type.value === "feat") b.want(["Feat", "Feat Feature", "Racial Trait", "Class Feature", "Archetype Feature"], name, "feat");
        break;
      case "spell":
        b.want(["Spell"], name, "spell");
        break;
      case "weapon":
      case "equipment":
      case "consumable":
      case "tool":
      case "loot":
      case "container": {
        const equipped = !!(isys.equipped ?? isys.equipment?.equipped);
        const attuned = isys.attuned === true || isys.attunement === 2 || isys.attuned === 1;
        b.addItem(name, Number(isys.quantity) || 1, equipped, attuned);
        break;
      }
      default:
        b.notes.push(`Skipped "${name}" (${it.type})`);
    }
  }
  if (!b.ch.classes.length) b.notes.push("No class found in the file.");
  // Subclasses are choices of the class, so place them after the classes are set.
  for (const s of subclasses) b.want(["Archetype"], s, "subclass");
  const FSKILL: Record<string, string> = { acr: "acrobatics", ani: "animal handling", arc: "arcana", ath: "athletics", dec: "deception", his: "history", ins: "insight", itm: "intimidation", inv: "investigation", med: "medicine", nat: "nature", prc: "perception", prf: "performance", per: "persuasion", rel: "religion", slt: "sleight of hand", ste: "stealth", sur: "survival" };
  for (const [k, name] of Object.entries(FSKILL)) {
    const v = Number(sys.skills?.[k]?.value);
    if (v >= 1) b.hints.skills.add(name);
    if (v >= 2) b.hints.expertise.add(name);
  }
  for (const [k, a] of Object.entries(ABBR)) if (Number(sys.abilities?.[k]?.proficient) >= 1) b.hints.saves.add(a);
  for (const l of sys.traits?.languages?.value ?? []) b.hints.languages.add(String(l).toLowerCase());
  for (const l of sys.traits?.languages?.custom ? String(sys.traits.languages.custom).split(/[;,]/) : []) if (l.trim()) b.hints.languages.add(l.trim().toLowerCase());
  for (const [k, t] of Object.entries<Json>(sys.tools ?? {})) if (Number(t?.value) >= 1) b.hints.tools.add(k.toLowerCase());
  const hp = Number(sys.attributes?.hp?.value);
  if (Number.isFinite(hp) && hp > 0) b.ch.play.hp = hp;
  const det: Json = sys.details ?? {};
  const info = b.ch.info;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  info.gender = str(det.gender);
  info.age = str(det.age);
  info.height = str(det.height);
  info.weight = str(det.weight);
  info.eyes = str(det.eyes);
  info.hair = str(det.hair);
  info.skin = str(det.skin);
  info.deity = str(det.faith) === "N/A" ? "" : str(det.faith);
  info.traits = str(det.trait);
  info.ideals = str(det.ideal);
  info.bonds = str(det.bond);
  info.flaws = str(det.flaw);
  const xp = Number(det.xp?.value);
  if (Number.isFinite(xp) && xp > 0) b.ch.xp = xp;
  const bio = typeof sys.details?.biography?.value === "string" ? sys.details.biography.value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
  if (bio) info.backstory = bio.slice(0, 3000);
  const coins = sys.currency ?? {};
  for (const k of ["cp", "sp", "ep", "gp", "pp"] as const) if (Number.isFinite(Number(coins[k]))) b.ch.coins[k] = Number(coins[k]);
  const alignment = sys.details?.alignment;
  if (typeof alignment === "string") b.ch.info.alignment = alignment;
  return b.finish(scores);
}

// ---------------------------------------------------------------- Roll20

interface Attrib { name: string; current?: unknown; max?: unknown }

export function importRoll20(data: Json, reg: ARegistry): ForeignImport {
  const b = new Importer(reg);
  const raw = data.attribs ?? data.character?.attribs ?? data.attributes;
  const attribs: Attrib[] = Array.isArray(raw) ? raw : [];
  const flat = new Map<string, Attrib>();
  const rows = new Map<string, Map<string, Record<string, string>>>();
  const rowRe = /^repeating_([a-z0-9-]+?)_(-[A-Za-z0-9_-]{19})_(.+)$/;
  const rowFallback = /^repeating_([a-z0-9-]+?)_(-[^_]+)_(.+)$/;
  for (const a of attribs) {
    if (!a || typeof a.name !== "string") continue;
    const m = rowRe.exec(a.name) ?? rowFallback.exec(a.name);
    if (m) {
      const [, section, id, field] = m;
      const sec = rows.get(section) ?? rows.set(section, new Map()).get(section)!;
      const row = sec.get(id) ?? sec.set(id, {}).get(id)!;
      row[field] = String(a.current ?? "");
    } else flat.set(a.name, a);
  }
  const val = (name: string) => String(flat.get(name)?.current ?? "").trim();
  b.ch.name = String(data.name ?? data.character?.name ?? val("character_name") ?? "");

  const scores: Partial<Record<AbilityId, number>> = {};
  for (const a of ABILITY_IDS) {
    const n = Number(val(a));
    if (Number.isFinite(n) && n > 0) scores[a] = n;
  }
  const lvl = Math.min(20, Math.max(1, Number(val("base_level") || val("level")) || 1));
  const className = val("class").replace(/\d+/g, "").trim();
  const cls = className ? findByName(reg, ["Class"], className) : undefined;
  // Multiclass levels sit in multiclass1..3 with their own level; the main class level is what is left.
  const extraClasses: { name: string; level: number }[] = [];
  for (const i of [1, 2, 3]) {
    const n = val(`multiclass${i}`);
    const l = Number(val(`multiclass${i}_lvl`)) || 0;
    if (n && l > 0) extraClasses.push({ name: n, level: l });
  }
  const mainLevel = Math.max(1, lvl - extraClasses.reduce((t, c) => t + c.level, 0));
  if (cls) {
    b.ch.classes.push({ classId: cls.id, level: mainLevel });
    b.matched.push(`${cls.name} (class)`);
  } else b.notes.push(className ? `Class "${className}" is not in your loaded content.` : "No class found in the file.");
  for (const c of extraClasses) {
    const el = findByName(reg, ["Class"], c.name);
    if (el) { b.ch.classes.push({ classId: el.id, level: c.level }); b.matched.push(`${el.name} (class)`); } else b.missing.push(`${c.name} (class)`);
  }
  const race = findByName(reg, ["Race"], val("race"));
  if (race) { b.ch.race = race.id; b.matched.push(`${race.name} (species)`); } else if (val("race")) b.missing.push(`${val("race")} (species)`);
  // "Dark Elf (Drow)" is the Drow subrace in the older content; the match ignores the parenthesis, so try both parts.
  const sub = val("subrace");
  if (sub) {
    const inner = /\((.*?)\)/.exec(sub)?.[1];
    for (const n of [sub, inner ?? ""]) if (n) b.want(["Sub Race", "Race Variant", "Race", "Racial Trait"], n, "subrace or lineage");
  }
  const bg = findByName(reg, ["Background"], val("background"));
  if (bg) { b.ch.background = bg.id; b.matched.push(`${bg.name} (background)`); } else if (val("background")) b.missing.push(`${val("background")} (background)`);
  if (val("subclass")) b.want(["Archetype"], val("subclass"), "subclass");

  // Only feats are choices. Class, species and background traits come from the content itself.
  const FEATURE_TYPES = ["Feat", "Feat Feature", "Racial Trait", "Class Feature", "Archetype Feature"];
  for (const [section, byId] of rows) {
    for (const f of byId.values()) {
      if (section.startsWith("spell-") && f.spellname) b.want(["Spell"], f.spellname.replace(/\s*\(.*?\)\s*$/, ""), "spell");
      else if (section === "inventory" && f.itemname) b.addItem(f.itemname, Number(f.itemcount) || 1, false, false);
      else if (section === "traits" && f.name && /^feat$/i.test(f.source ?? "")) b.want(FEATURE_TYPES, f.name, "feat");
    }
  }

  // What the sheet says the character is proficient in, to settle the open choices.
  const on = (k: string) => !["", "0"].includes(val(k));
  const SKILLS = ["acrobatics", "animal_handling", "arcana", "athletics", "deception", "history", "insight", "intimidation", "investigation", "medicine", "nature", "perception", "performance", "persuasion", "religion", "sleight_of_hand", "stealth", "survival"];
  for (const k of SKILLS) {
    const name = k.replace(/_/g, " ");
    if (on(`${k}_prof`)) b.hints.skills.add(name);
    if (val(`${k}_type`) === "2") { b.hints.expertise.add(name); b.hints.skills.add(name); }
  }
  for (const a of ABILITY_IDS) if (on(`${a}_save_prof`)) b.hints.saves.add(a);
  for (const f of rows.get("proficiencies")?.values() ?? []) {
    if (/language/i.test(f.prof_type ?? "") && f.name) b.hints.languages.add(f.name.trim().toLowerCase());
  }
  for (const f of rows.get("tool")?.values() ?? []) if (f.toolname) b.hints.tools.add(f.toolname.trim().toLowerCase());

  // Details
  const num = (k: string) => (Number(val(k)) > 0 ? Number(val(k)) : 0);
  for (const k of ["cp", "sp", "ep", "gp", "pp"] as const) b.ch.coins[k] = num(k);
  const hp = Number(flat.get("hp")?.current);
  if (Number.isFinite(hp) && hp > 0) b.ch.play.hp = hp;
  const info = b.ch.info;
  info.alignment = val("alignment");
  info.age = val("age");
  info.height = val("height");
  info.weight = val("weight");
  info.eyes = val("eyes");
  info.hair = val("hair");
  info.skin = val("skin");
  info.gender = val("gender");
  info.traits = val("personality_traits");
  info.ideals = val("ideals");
  info.bonds = val("bonds");
  info.flaws = val("flaws");
  const bio = String(data.bio ?? data.character?.bio ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (bio) info.backstory = bio.slice(0, 3000);
  const xp = Number(val("xp"));
  if (Number.isFinite(xp) && xp > 0) b.ch.xp = xp;
  return b.finish(scores);
}

export function importForeignCharacter(data: unknown, reg: ARegistry): ForeignImport {
  switch (detectCharacterFormat(data)) {
    case "foundry":
      return importFoundry(data as Json, reg);
    case "roll20":
      return importRoll20(data as Json, reg);
    default:
      throw new Error("Not a recognised Foundry or Roll20 character file.");
  }
}

export { cap };
