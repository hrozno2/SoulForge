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

/** Keeps the words inside parentheses and after a colon: "Magic Initiate: Warlock" and "Magic Initiate (Warlock)" agree. */
const normalizeFull = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function findByName(reg: ARegistry, types: string[], name: string): AElement | undefined {
  const want = normalize(name);
  if (!want) return undefined;
  const pool = types.flatMap((t) => reg.ofType(t));
  const full = normalizeFull(name);
  const exact = pool.filter((e) => normalizeFull(e.name) === full);
  if (exact.length) return exact.find((e) => /2024|24/.test(e.source + e.id)) ?? exact[exact.length - 1];
  const hits = pool.filter((e) => normalize(e.name) === want);
  if (hits.length) return hits.find((e) => /2024|24/.test(e.source + e.id)) ?? hits[hits.length - 1];
  // "Featherfalling" and "Feather Falling", "lightcrossbow" and "Light Crossbow" are the same thing.
  const tight = want.replace(/ /g, "");
  const loose = pool.filter((e) => normalize(e.name).replace(/ /g, "") === tight);
  return loose.find((e) => /2024|24/.test(e.source + e.id)) ?? loose[loose.length - 1];
}

/** Other ways the same item is named: "Fine Clothes" is "Clothes, Fine"; "+1 Adamantine plate armor" is "Plate Armor". */
function itemNameVariants(name: string, base?: string): string[] {
  const out: string[] = [];
  const add = (n: string | undefined) => {
    const t = (n ?? "").replace(/\s+/g, " ").trim();
    if (t && !out.includes(t)) out.push(t);
  };
  const plus = (n: string) => n.replace(/^\s*[+-]\d+\s+/, "").replace(/\s*,?\s*[+-]\d+\s*$/, "");
  const noParens = (n: string) => n.replace(/\s*\(.*?\)\s*/g, " ");
  const noMaterial = (n: string) => n.replace(/\b(adamantine|mithral|silvered|masterwork)\b/gi, " ");
  const inner = /\((.*?)\)/.exec(name)?.[1] ?? "";
  // A "+1" item is its base item with a bonus, so the base names come first; the named variant ("Shield (+1)") in
  // some content only adds the bonus and would lose the base.
  const bonus = /[+]\d/.test(name);
  const forms = [plus(name), plus(noParens(name)), noMaterial(plus(name)), noMaterial(plus(noParens(name))), plus(inner), noParens(name)];
  for (const n of bonus ? forms : [name, ...forms]) {
    add(n);
    const words = n.trim().split(/\s+/);
    // "Fine Clothes" -> "Clothes, Fine"; "Map or scroll case" -> "Case, Map or Scroll"
    if (words.length >= 2) add(`${words[words.length - 1]}, ${words.slice(0, -1).join(" ")}`);
    if (/\barmor$/i.test(n)) add(n.replace(/\s*armor$/i, ""));
    else add(`${n} Armor`);
  }
  if (base) {
    add(base);
    add(`${base} armor`);
  }
  return out;
}

const ITEM_TYPES = ["Item", "Weapon", "Armor", "Magic Item"];

class Importer {
  ch: Character = newCharacter();
  notes: string[] = [];
  matched: string[] = [];
  missing: string[] = [];
  private wantedChoices: { types: string[]; name: string; label: string }[] = [];
  /** Weapons the character carries, for weapon mastery when the file names none. */
  private carried = new Set<string>();
  private guessed = 0;
  /** What the file says the character has, used to fill open choices (skills, languages, tools, expertise, saves). */
  hints = { skills: new Set<string>(), expertise: new Set<string>(), tools: new Set<string>(), languages: new Set<string>(), saves: new Set<string>(), names: new Set<string>(), masteries: new Set<string>(), size: "" };

  constructor(private reg: ARegistry) {}

  /** Remember something to put into whichever choice can hold it once the character is shaped. */
  want(types: string[], name: string, label: string): void {
    if (name) this.wantedChoices.push({ types, name, label });
  }

  addItem(name: string, qty: number, equipped: boolean, attuned: boolean, extra: { base?: string; magic?: number } = {}): void {
    let el: AElement | undefined;
    for (const c of itemNameVariants(name, extra.base)) {
      el = findByName(this.reg, ITEM_TYPES, c);
      if (el) break;
    }
    // "+1 Shield", "Rapier +1" and "Requital (+2 The Emerald Blade)" are a base item with a bonus.
    // An element that is already the magic version ("Rhythm-Maker's Drum, +2") carries its own bonus.
    const magic = el && /[+]\d/.test(el.name) ? 0 : extra.magic || Number(/[+]([1-3])\b/.exec(name)?.[1]) || 0;
    const plain = name.replace(/[+]\d\s*/g, "").replace(/\(\s*\)/g, "").replace(/\s+/g, " ").replace(/\s*,\s*$/, "").trim();
    const label = el && normalize(plain) !== normalize(el.name) && normalizeFull(plain) !== normalizeFull(el.name) ? plain : undefined;
    this.ch.inventory.push({ uid: uid(), id: el?.id ?? "", qty: Math.max(1, qty), equipped, attuned, custom: el ? undefined : { name }, ...(label ? { label } : {}), ...(el && magic ? { magic } : {}) });
    (el ? this.matched : this.missing).push(el ? `${el.name} (${el.type})` : `${name} (item, kept as a custom item)`);
    if (el?.type === "Weapon") this.carried.add(normalize(el.name).replace(/ /g, ""));
  }


  private score(slotName: string, optionName: string, scores: Partial<Record<AbilityId, number>>): number {
    const n = optionName.toLowerCase().trim();
    const inner = /\((.*)\)\s*$/.exec(n)?.[1]?.trim() ?? n;
    const h = this.hints;
    if (/^skill expertise/.test(n)) return h.expertise.has(inner) ? 100 : 0;
    if (/^tool proficiency/.test(n)) return [...h.tools].some((t) => inner.includes(t) || t.includes(inner)) ? 100 : 0;
    if (h.names.has(normalizeFull(optionName))) return 100;
    // Weapon mastery options read "Longsword (Sap)".
    const mastery = normalize(optionName).replace(/ /g, "");
    if (h.masteries.size ? h.masteries.has(mastery) : /\((cleave|graze|nick|push|sap|slow|topple|vex)\)/i.test(optionName) && this.carried.has(mastery)) return 100;
    if (h.size && n === h.size) return 100;
    if (h.languages.has(n)) return 100;
    const ab = ABILITY_IDS.find((a) => a === n);
    if (ab) {
      const total = scores[ab] ?? 0;
      // A feat that grants a saving throw proficiency is best spent on one the class does not already give.
      if (/resilient/i.test(slotName)) return h.saves.has(ab) ? 60 - total : -total;
      return total;
    }
    if (h.skills.has(n)) return h.expertise.has(n) ? 95 : 90;
    // "Strength +1, Dexterity +1" style options: favour the abilities the character is best at.
    const mentioned = ABILITY_IDS.filter((a) => n.includes(a));
    if (mentioned.length && /[+]\d/.test(n)) return 2 + mentioned.reduce((t, a) => t + (scores[a] ?? 0), 0) / 10;
    // Without data, a level choice takes the plain score improvement rather than an arbitrary feat, and Medium size.
    if (/^ability score improvement/.test(n) || n === "medium") return 1;
    return 0;
  }

  /** Fills every open choice. Ones the file speaks to are matched; the rest take the first sensible option. */
  private fillOpen(start: Character, scores: Partial<Record<AbilityId, number>>, skipSpells = false): Character {
    let cur = start;
    // When the file says nothing, an option from the same books as the character beats one from elsewhere
    // (a 2024 fighter's weapon mastery is a longsword, not a firearm from the Dungeon Master's Guide).
    const own = new Set([...start.classes.map((c) => c.classId), start.race ?? "", start.background ?? ""].map((id) => this.reg.get(id)?.source).filter(Boolean) as string[]);
    let guessed = 0;
    const skip = new Set<string>();
    for (let i = 0; i < 600; i++) {
      const r = resolve(cur, this.reg);
      const open = r.slots.find((s) => !skip.has(s.key) && !(skipSpells && s.rule.type === "Spell") && !s.rule.optional && !s.defaulted && s.chosen.length < s.rule.number && s.options.length);
      if (!open) break;
      const taken = new Set(open.chosen);
      const candidates = open.options
        .filter((o) => !taken.has(o.id) && !open.blocked.has(o.id) && !r.ids.has(o.id))
        .map((o) => ({ o, sc: this.score(`${open.key} ${open.rule.name}`, o.name, scores) + (own.has(o.source) ? 0.5 : 0) }))
        .sort((a, b) => b.sc - a.sc);
      const best = candidates[0] ?? { o: open.options.find((o) => !taken.has(o.id)), sc: 0 };
      if (!best.o) break;
      // A subclass the file names but the content lacks is better left open than guessed.
      if (best.sc <= 0.5 && best.o.type === "Archetype") {
        skip.add(open.key);
        continue;
      }
      if (best.sc <= 0.5 && !/^\s*ability score/i.test(open.rule.name)) guessed++;
      cur = { ...cur, selections: { ...cur.selections, [open.key]: [...open.chosen, best.o.id] } };
    }
    this.guessed += guessed;
    return cur;
  }

  /** Fill choices (subclass, feats, spells) with everything wanted, then derive base scores. */
  /** Puts one wanted thing into a choice that can hold it. Spells and feats nothing can hold are added by hand. */
  private place(ch: Character, w: { types: string[]; name: string; label: string }): Character {
    // "Magic Initiate: Warlock" is the Magic Initiate feat with Warlock chosen inside it.
    const base = w.name.split(/[:(]/)[0].trim();
    const inner = w.name.slice(base.length).replace(/[:()]/g, " ").trim();
    const el = findByName(this.reg, w.types, w.name) ?? (base !== w.name.trim() ? findByName(this.reg, w.types, base) : undefined);
    if (!el) {
      this.missing.push(`${w.name} (${w.label})`);
      return ch;
    }
    if (inner) this.hints.names.add(normalizeFull(inner));
    const r = resolve(ch, this.reg);
    if (r.ids.has(el.id)) {
      this.matched.push(`${el.name} (already granted)`);
      return ch;
    }
    const slot = r.slots.find((s) => s.chosen.length < s.rule.number && s.options.some((o) => o.id === el.id));
    if (slot) {
      this.matched.push(`${el.name} (${w.label})`);
      return { ...ch, selections: { ...ch.selections, [slot.key]: [...slot.chosen, el.id] } };
    }
    if (el.type === "Spell" || /feat/i.test(el.type)) {
      // No open choice can hold it (a racial spell, a Magical Secrets pick): keep it as a manual addition.
      this.matched.push(`${el.name} (${w.label}, added by hand)`);
      return { ...ch, extras: [...ch.extras, el.id] };
    }
    // A species or class trait no choice offers is left to the content rather than added on top of it.
    this.hints.names.add(normalizeFull(el.name));
    if (!/subrace|lineage/.test(w.label)) this.notes.push(`${w.name} could not be placed and was left out.`);
    return ch;
  }

  /** Fill choices (subclass, feats, spells) with everything wanted, then derive base scores. */
  finish(importedScores: Partial<Record<AbilityId, number>>, opts: { scoresIncludeItems?: boolean } = {}): ForeignImport {
    let ch = this.ch;
    // Subclasses and lineages first, so the spell lists and granted spells they bring exist; then feats; then the
    // remaining non-spell choices; spells last, so spells a species or subclass already grants are not picked twice.
    const order = (w: { label: string }) => (w.label === "subclass" ? 0 : /subrace|lineage/.test(w.label) ? 1 : w.label === "feat" ? 2 : 4);
    const wanted = [...this.wantedChoices].sort((x, y) => order(x) - order(y));
    for (const w of wanted.filter((x) => order(x) < 4)) ch = this.place(ch, w);
    ch = this.fillOpen(ch, importedScores, true);
    for (const w of wanted.filter((x) => order(x) >= 4)) ch = this.place(ch, w);
    // Fill what is still open from the file's skills, languages, tools and scores, then with defaults.
    ch = this.fillOpen(ch, importedScores);
    if (this.guessed) this.notes.push(`${this.guessed} choices the file did not say anything about were filled with the first option. Check the Build tab.`);
    // Imported scores already include species and background bonuses, so remove them to get the base.
    // Foundry keeps the scores without what magic items add (a Headband of Intellect sets 19 on top), so items are left
    // out when working out the bonus; Roll20 shows the score with everything.
    const unworn = { ...ch, inventory: ch.inventory.map((i) => ({ ...i, equipped: false, attuned: false })) };
    const r = resolve(opts.scoresIncludeItems === false ? unworn : ch, this.reg);
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
        const magic = Number(isys.magicalBonus ?? isys.armor?.magicalBonus) || 0;
        b.addItem(name, Number(isys.quantity) || 1, equipped, attuned, { base: String(isys.type?.baseItem ?? "") || undefined, magic });
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
  const SIZE: Record<string, string> = { tiny: "tiny", sm: "small", med: "medium", lg: "large", huge: "huge", grg: "gargantuan" };
  b.hints.size = SIZE[String(sys.traits?.size ?? "")] ?? "";
  for (const it of items) if (it?.name && ["feat", "subclass"].includes(it.type)) b.hints.names.add(normalizeFull(String(it.name)));
  for (const l of sys.traits?.languages?.value ?? []) b.hints.languages.add(String(l).toLowerCase());
  for (const l of sys.traits?.languages?.custom ? String(sys.traits.languages.custom).split(/[;,]/) : []) if (l.trim()) b.hints.languages.add(l.trim().toLowerCase());
  for (const [k, t] of Object.entries<Json>(sys.tools ?? {})) if (Number(t?.value) >= 1) b.hints.tools.add(k.toLowerCase());
  for (const m of sys.traits?.weaponProf?.mastery?.value ?? []) b.hints.masteries.add(String(m).toLowerCase().replace(/[^a-z]/g, ""));
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
  return b.finish(scores, { scoresIncludeItems: false });
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
      else if (section === "inventory" && f.itemname) {
        // Roll20 only saves the equipped box when it was changed from its default (ticked), so an item with no value
        // counts as worn when it is a weapon with an attack or armor that gives AC.
        const mods = f.itemmodifiers ?? "";
        const worn = f.equipped !== undefined ? f.equipped === "1" || f.equipped === "on" : f.hasattack === "1" || /Item Type:[^,]*(Armor|Shield)/i.test(mods);
        const magic = Number(/\b(?:AC|Attack(?: Bonus)?|Damage(?: Bonus)?)\s*\+(\d)/i.exec(mods)?.[1]) || 0;
        b.addItem(f.itemname, Number(f.itemcount) || 1, worn, false, { magic });
      }
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
  for (const f of rows.get("traits")?.values() ?? []) if (f.name) b.hints.names.add(normalizeFull(f.name));
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
