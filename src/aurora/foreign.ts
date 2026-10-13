/**
 * Importers for characters made elsewhere: Foundry VTT (dnd5e actor JSON, including actors made with
 * the Plutonium module) and Roll20 (D&D 5e OGL sheet attributes as JSON). Both are best effort: the formats
 * change between versions, so this reads what it recognises, matches names against the loaded content, and
 * reports what it could not place.
 */
import { ABILITY_IDS, newCharacter, uid, type AbilityId, type Character } from "./character";
import type { AElement } from "./types";
import type { ARegistry } from "./registry";
import { hitDieOf, resolve } from "./engine";
import { buildSheet, preparePool } from "./sheet";
import { ItemIndex, resolveChosenTools } from "./startingEquipment";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface ForeignImport {
  character: Character;
  notes: string[];
  matched: string[];
  missing: string[];
  /** Choices the file did not settle, with what was chosen for them. */
  guessed: string[];
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

export type Edition = "2014" | "2024";
const isModern = (e: AElement) => /PHB24|XPHB|2024|DMG24|MM25/i.test(`${e.id} ${e.source}`);

/** Every element with this name, by the closest match first: exact, then without parentheses, then without spaces. */
function findAllByName(reg: ARegistry, types: string[], name: string): AElement[] {
  const want = normalize(name);
  if (!want) return [];
  const pool = types.flatMap((t) => reg.ofType(t));
  const full = normalizeFull(name);
  const exact = pool.filter((e) => normalizeFull(e.name) === full);
  if (exact.length) return exact;
  const hits = pool.filter((e) => normalize(e.name) === want);
  if (hits.length) return hits;
  // "Featherfalling" and "Feather Falling", "lightcrossbow" and "Light Crossbow" are the same thing.
  const tight = want.replace(/ /g, "");
  return pool.filter((e) => normalize(e.name).replace(/ /g, "") === tight);
}

/** The element of that name from the character's edition when both exist (2024 when the file does not say). */
function findByName(reg: ARegistry, types: string[], name: string, edition?: Edition): AElement | undefined {
  const all = findAllByName(reg, types, name);
  if (!all.length) return undefined;
  const official = all.filter((e) => !isPlaytest(e));
  const pool = official.length ? official : all;
  const same = pool.filter((e) => isModern(e) === ((edition ?? "2024") === "2024"));
  const list = same.length ? same : pool;
  return list[list.length - 1];
}

/** The names of the features an element grants by its own rules, and those they grant in turn. */
function grantedNames(reg: ARegistry, el: AElement, depth = 0, out = new Set<string>()): Set<string> {
  for (const r of el.rules) {
    if (r.kind !== "grant") continue;
    const g = reg.get(r.id);
    if (!g || out.has(featureKey(g.name))) continue;
    out.add(featureKey(g.name));
    if (depth < 1) grantedNames(reg, g, depth + 1, out);
  }
  return out;
}

/** A feature name to compare: the 2024 content writes "Level 1: Divine Order", sheets write "Divine Order". */
const featureKey = (name: string) => normalize(name.replace(/^\s*level\s+\d+\s*:\s*/i, ""));

/** Of the versions of a species, the one whose own traits the file lists (MPMM Orc: Adrenaline Rush; Volo's: Menacing). */
function raceByTraits(reg: ARegistry, candidates: AElement[], traitNames: Set<string>, edition?: Edition): AElement | undefined {
  if (candidates.length < 2) return candidates[0];
  const score = (c: AElement) => {
    let n = 0;
    for (const name of grantedNames(reg, c)) if (traitNames.has(name)) n++;
    return n - (isPlaytest(c) ? 0.5 : 0) + (edition && isModern(c) === (edition === "2024") ? 0.25 : 0);
  };
  return [...candidates].sort((a, b) => score(b) - score(a))[0];
}

const isPlaytest = (e: AElement) => /unearthed|playtest/i.test(e.source) || /_UA\d|_UA_/.test(e.id);

/**
 * Of the versions of a class (2014, 2024, playtest), the one whose own features the file lists. The class features
 * of ID_..._CLASS_CLERIC are ID_..._CLASS_FEATURE_CLERIC_..., so their names are counted against the file's.
 */
function classByFeatures(reg: ARegistry, name: string, featureNames: Set<string>, edition?: Edition): AElement | undefined {
  const all = findAllByName(reg, ["Class"], name);
  if (all.length < 2 || !featureNames.size) return findByName(reg, ["Class"], name, edition);
  const score = (c: AElement) => {
    let n = 0;
    for (const name of grantedNames(reg, c)) if (featureNames.has(name)) n++;
    // Tasha's Cauldron reprints the Eberron artificer with changes; the newer one wins a tie.
    return n - (isPlaytest(c) ? 0.5 : 0) + (edition && isModern(c) === (edition === "2024") ? 0.25 : 0) - (/rising from the last war/i.test(c.source) ? 0.1 : 0);
  };
  return [...all].sort((a, b) => score(b) - score(a))[0];
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
  const noMaterial = (n: string) => n.replace(/\b(adamantine|mithral|silvered|masterwork|simple|plain|wooden|common)\b/gi, " ");
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
  // "Spell Scroll (1st Level) chromatic orb" is a Spell Scroll (Level 1); "Blowgun Needles" a Blowgun Needle;
  // "Slumbering Scaled Ornament" the Scaled Ornament (Slumbering); "Belt Pouch" a Pouch.
  const potion = /^potion of (\w+) resistance$/i.exec(name.trim());
  if (potion) add(`Potion of Resistance (${potion[1]})`);
  const scroll = /spell scroll\s*\(?\s*(cantrip|(\d)(?:st|nd|rd|th)?[- ]?level|level\s*(\d))/i.exec(name);
  if (scroll) add(/cantrip/i.test(scroll[1]) ? "Spell Scroll (Cantrip)" : `Spell Scroll (Level ${scroll[2] ?? scroll[3]})`);
  // Background gear written out in full: "Set of Manacles", "Small Book of Religious Text", "Amulet with a Symbol of
  // Your Chosen God", "Uniform in the Style of Your Unit".
  const lead = (n: string) => n.replace(/^(?:(?:a|an|one|set of|a set of|pair of|small|large|tiny|little)\s+)+/i, "");
  const head = (n: string) => n.replace(/\s+(?:with|from|containing|in the style|of your|of house|that|engraved)\b.*$/i, "");
  add(lead(name));
  add(head(lead(name)));
  // "10 Feet of String" is String (10 feet); "Component: Diamond" a Diamond.
  const feet = /^(\d+)\s*(?:feet|ft\.?)\s+of\s+(.+)$/i.exec(name.trim());
  if (feet) add(`${feet[2]} (${feet[1]} feet)`);
  const tag = /^(?:component|material|gem|ingredient)\s*:\s*(.+)$/i.exec(name.trim());
  if (tag) add(tag[1]);
  for (const n of [...out]) {
    if (/[^s]s$/i.test(n)) add(n.slice(0, -1));
    const w = n.split(/\s+/);
    if (w.length >= 3 && !/\(/.test(n)) add(`${w.slice(1).join(" ")} (${w[0]})`);
    if (/^belt\s+/i.test(n)) add(n.replace(/^belt\s+/i, ""));
  }
  if (base) {
    add(base);
    add(`${base} armor`);
  }
  return out;
}

const ITEM_TYPES = ["Item", "Weapon", "Armor", "Magic Item"];

/** Letters only, for names written with different punctuation: "Brewers supplies" and "Brewer’s Supplies". */
const tight = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z]/g, "");

/** Edit distance, stopping early past `max`. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * An item name with a typo or cut short: "Cloack of elvenkind", "Travelerth's Clothes", "Armor of Magical Stre".
 * Only a single clear match counts.
 */
function fuzzyItem(reg: ARegistry, name: string, edition?: Edition): AElement | undefined {
  const want = normalizeFull(name);
  if (want.length < 8) return undefined;
  const pool = ITEM_TYPES.flatMap((t) => reg.ofType(t));
  const names = new Map<string, AElement[]>();
  for (const e of pool) { const k = normalizeFull(e.name); (names.get(k) ?? names.set(k, []).get(k)!).push(e); }
  const pickOf = (k: string) => findByName(reg, ITEM_TYPES, names.get(k)![0].name, edition);
  // Cut short: the start of exactly one name.
  if (want.length >= 12) {
    const starts = [...names.keys()].filter((k) => k.startsWith(want));
    if (starts.length === 1) return pickOf(starts[0]);
  }
  const max = want.length >= 14 ? 2 : 1;
  let best: string[] = [];
  let bestD = max + 1;
  for (const k of names.keys()) {
    const d = distance(want, k, max);
    if (d < bestD) { bestD = d; best = [k]; } else if (d === bestD) best.push(k);
  }
  return bestD <= max && best.length === 1 ? pickOf(best[0]) : undefined;
}

class Importer {
  ch: Character = newCharacter();
  notes: string[] = [];
  matched: string[] = [];
  missing: string[] = [];
  private wantedChoices: { types: string[]; name: string; label: string; alts?: string[] }[] = [];
  /** Which rules the character was made with, when the file says. Picks the 2014 or 2024 version of a name. */
  edition?: Edition;
  /** Weapons the character carries, for weapon mastery when the file names none. */
  private carried = new Set<string>();
  private scores: Partial<Record<AbilityId, number>> = {};
  /** Spells the file marks as prepared, by name. */
  prepared = new Set<string>();
  /** Species traits the file lists, to tell versions of a species apart. */
  speciesTraits = new Set<string>();
  private guessed = 0;
  private index?: ItemIndex;
  /** The background is the Custom Background standing in for one the content lacks. */
  private customBg = false;
  /** Each choice the file said nothing about, with what was put in, for the import report. */
  guesses: string[] = [];
  /** What the file says the character has, used to fill open choices (skills, languages, tools, expertise, saves). */
  hints = { skills: new Set<string>(), expertise: new Set<string>(), tools: new Set<string>(), languages: new Set<string>(), saves: new Set<string>(), names: new Set<string>(), masteries: new Set<string>(), size: "", armor: new Set<string>(), weapons: new Set<string>(), spells: new Set<string>() };

  /**
   * A feature or option name the file lists. "Replicate Bag of Holding" is the Replicate Magic Item infusion with
   * the Bag of Holding; "Channel Divinity: Path to the Grave" is also "Path to the Grave".
   */
  addName(n: string): void {
    const t = n.trim();
    if (!t) return;
    this.hints.names.add(normalizeFull(t));
    // "Elven Lineage, Wood Elf" also names the Wood Elf lineage.
    const comma = /^[^,]+,\s*(.+)$/.exec(t);
    if (comma) this.hints.names.add(normalizeFull(comma[1]));
    const rep = /^replicate\s+(?:magic item\s*)?[:(-]?\s*(.+?)\)?$/i.exec(t);
    if (rep) { this.hints.names.add("replicate magic item"); this.hints.names.add(normalizeFull(rep[1])); }
    const colon = /^[^:]+:\s*(.+)$/.exec(t);
    if (colon) this.hints.names.add(normalizeFull(colon[1]));
  }

  /**
   * A background the content lacks (homebrew, or a book not loaded) becomes the Custom Background, so the skills,
   * tools and languages the file lists still have a place; its choices are filled from the file.
   */
  customBackground(): void {
    const name = this.missing.find((m) => / \(background\)$/.test(m));
    if (this.ch.background || !name) return;
    const custom = this.reg.ofType("Background").find((e) => /^custom background$/i.test(e.name));
    if (!custom) return;
    this.ch.background = custom.id;
    this.customBg = true;
    this.notes.push(`${name.replace(/ \(background\)$/, "")} is not in your loaded content, so the character has a Custom Background with the skills, tools and languages from the file.`);
  }

  /** A language the file lists; "Any" and blanks say nothing. */
  addLanguage(n: string): void {
    for (const part of n.split(/[,;]/)) {
      const l = part.replace(/\(.*?\)/g, "").trim().toLowerCase();
      if (l && !/^(any|other|none|-)$/.test(l)) this.hints.languages.add(l);
    }
  }

  constructor(private reg: ARegistry) {}

  /** Remember something to put into whichever choice can hold it once the character is shaped. */
  want(types: string[], name: string, label: string, alts: string[] = []): void {
    if (name && label === "spell") this.hints.spells.add(normalize(name));
    if (name) this.wantedChoices.push({ types, name, label, alts });
  }

  addItem(name: string, qty: number, equipped: boolean, attuned: boolean, extra: { base?: string; magic?: number } = {}): void {
    // "Crossbow Bolts (20)" and "Blowgun Needles (50)" are a count of the item.
    const count = /^(.*\S)\s*\((\d{1,4})\)$/.exec(name);
    if (count && qty <= 1) {
      name = count[1];
      qty = Number(count[2]);
    }
    // "Spell Scroll: Detect Poison and Disease" is a scroll of that spell's level.
    const scrollOf = /^spell scroll\s*[:\-–]\s*(.+)$/i.exec(name.trim());
    if (scrollOf && !extra.base) {
      const sp = findByName(this.reg, ["Spell"], scrollOf[1], this.edition);
      const lv = Number(sp?.setters.level?.value ?? NaN);
      if (sp && Number.isFinite(lv)) extra = { ...extra, base: lv === 0 ? "Spell Scroll (Cantrip)" : `Spell Scroll (Level ${lv})` };
    }
    let el: AElement | undefined;
    for (const c of itemNameVariants(name, extra.base)) {
      el = findByName(this.reg, ITEM_TYPES, c, this.edition);
      if (el) break;
    }
    // The names starting equipment uses ("Holy Symbol" is an Amulet, Emblem or Reliquary), then typos and cut-off names.
    if (!el) el = (this.index ??= new ItemIndex(this.reg)).find(name);
    for (const c of itemNameVariants(name, extra.base).slice(0, 4)) if (!el) el = fuzzyItem(this.reg, c, this.edition);
    // "Rusty Manacles", "Cracked Hourglass", "Pale Robes": plain adventuring gear with a describing word in front.
    const words = name.replace(/^(?:a|an|set of|pair of)\s+/i, "").trim().split(/\s+/);
    const plainWord = /^(rusty|cracked|pale|old|worn|broken|battered|tattered|dirty|torn|small|large|little|simple|plain|wooden|iron|steel|leather|silk|black|white|red|blue|green|pink|gr[ae]y|brown|golden|gold|silver|copper|travel|spare|cheap|sturdy)$/i;
    if (!el && words.length === 2 && plainWord.test(words[0])) el = findAllByName(this.reg, ["Item"], words[1]).find((e) => !e.compendiumHidden);
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
    if (/^skill proficiency/.test(n)) return h.skills.has(inner) ? 90 : 0;
    if (/^tool proficiency/.test(n)) {
      const ti = tight(inner);
      return [...h.tools].some((t) => { const tt = tight(t); return tt.length >= 4 && (ti.includes(tt) || tt.includes(ti)); }) ? 100 : 0;
    }
    if (h.names.has(normalizeFull(optionName)) || h.names.has(normalize(optionName))) return 100;
    // A one-word option the file names as part of a longer name: "Witherbloom" in "Witherbloom Initiate".
    const word = normalize(optionName);
    if (word.length >= 6 && !word.includes(" ") && [...h.names].some((x) => x.startsWith(`${word} `))) return 60;
    // Weapon mastery options read "Longsword (Sap)".
    const mastery = normalize(optionName).replace(/ /g, "");
    if (h.masteries.size ? h.masteries.has(mastery) : /\((cleave|graze|nick|push|sap|slow|topple|vex)\)/i.test(optionName) && this.carried.has(mastery)) return 100;
    if (h.size && n === h.size) return 100;
    if (h.languages.has(n) || [...h.languages].some((l) => tight(l) === tight(n))) return 100;
    // "Strength", "Resilient (Strength)" and "Ability Score Increase (Strength)" all name an ability.
    const ab = ABILITY_IDS.find((a) => a === n || (a === inner && /^(resilient|ability score|increase|improvement)/.test(n)));
    if (ab) {
      const total = scores[ab] ?? 0;
      // A feat that grants a saving throw proficiency is best spent on one the class does not already give.
      if (/resilient/i.test(slotName) || /^resilient/.test(n)) return h.saves.has(ab) ? 60 - total : -total;
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

  /**
   * An option that brings armor or weapon training (the Protector divine order: heavy armor, martial weapons) fits
   * when the file lists that training and does not when the file lacks it.
   */
  private trainingScore(o: AElement): number {
    const h = this.hints;
    if (!h.armor.size && !h.weapons.size) return 0;
    const names: string[] = [];
    const walk = (el: AElement, depth: number) => {
      for (const r of el.rules) {
        if (r.kind !== "grant") continue;
        const g = this.reg.get(r.id);
        if (!g) continue;
        if (g.type === "Proficiency") names.push(g.name.toLowerCase());
        else if (depth < 2) walk(g, depth + 1);
      }
    };
    walk(o, 0);
    let sc = 0;
    for (const n of names) {
      const armor = /armor proficiency \((light|medium|heavy) armor\)|armor proficiency \((shields?)\)/.exec(n)?.slice(1).find(Boolean);
      const weapon = /weapon proficiency \((simple|martial) weapons\)/.exec(n)?.[1];
      if (armor) sc += [...h.armor].some((a) => a.startsWith(armor.slice(0, 4))) ? 40 : -10;
      if (weapon) sc += h.weapons.has(weapon) ? 40 : -10;
    }
    return sc;
  }

  /**
   * A choice of class spell list (Magic Initiate: Wizard): the class whose list holds the most of the file's spells.
   * Mage Hand, Message and Find Familiar point to the wizard.
   */
  private spellListScore(o: AElement): number {
    const cls = /^(?:magic initiate\s*[:(]\s*)?(artificer|bard|cleric|druid|paladin|ranger|sorcerer|warlock|wizard)\)?$/i.exec(o.name.trim())?.[1];
    if (!cls || !this.hints.spells.size) return 0;
    let n = 0;
    for (const sp of this.reg.ofType("Spell")) if (this.hints.spells.has(normalize(sp.name)) && sp.supports.some((x) => x.toLowerCase() === cls.toLowerCase())) n++;
    // Counted once per spell name, at most a point each; enough to beat a guess, not a file's named choice.
    return Math.min(n, 20) * 2;
  }

  /** An option that grants spells the file lists (a Divine Soul's Good affinity brings Cure Wounds). */
  private grantedSpellScore(o: AElement): number {
    if (!this.hints.spells.size) return 0;
    let n = 0;
    for (const r of o.rules) {
      // A spell granted outright, or the spell a choice starts on (Divine Soul: Cure Wounds for Good).
      const id = r.kind === "grant" ? r.id : (r as { default?: string }).default;
      const g = id ? this.reg.get(id) : undefined;
      if (g?.type === "Spell" && this.hints.spells.has(normalize(g.name))) n++;
    }
    return n * 30;
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
      // The narrowest choice first: a class's skill list before a background that takes any skill, so the file's
      // skills land where only they fit.
      const open = r.slots.filter((s) => !skip.has(s.key) && !(skipSpells && s.rule.type === "Spell") && !s.rule.optional && !s.defaulted && s.chosen.length < s.rule.number && s.options.length)
        .sort((a, b) => a.options.length - b.options.length)[0];
      if (!open) break;
      const taken = new Set(open.chosen);
      const candidates = open.options
        .filter((o) => !taken.has(o.id) && !open.blocked.has(o.id) && !r.ids.has(o.id))
        .map((o) => ({ o, sc: this.score(`${open.key} ${open.rule.name}`, o.name, scores) + this.trainingScore(o) + this.spellListScore(o) + this.grantedSpellScore(o) + (own.has(o.source) ? 0.5 : 0) }))
        .sort((a, b) => b.sc - a.sc);
      const best = candidates[0] ?? { o: open.options.find((o) => !taken.has(o.id)), sc: 0 };
      if (!best.o) break;
      // A subclass the file names but the content lacks is better left open than guessed.
      // The Custom Background stands in for a background the content lacks: what the file does not say stays open,
      // so no feat or tool is made up for it.
      if (best.sc <= 0.5 && this.customBg && open.root === "background") {
        skip.add(open.key);
        continue;
      }
      if (best.sc <= 0.5 && best.o.type === "Archetype") {
        skip.add(open.key);
        continue;
      }
      if (best.sc <= 0.5 && !/^\s*ability score/i.test(open.rule.name)) {
        guessed++;
        this.guesses.push(`${open.rule.name}: ${best.o.name}`);
      }
      cur = { ...cur, selections: { ...cur.selections, [open.key]: [...open.chosen, best.o.id] } };
    }
    this.guessed += guessed;
    return cur;
  }

  /** Sets rolled hit points for levels 2 and up so the maximum matches the file, staying within each hit die. */
  private matchHitPoints(ch: Character, target: number): Character {
    const now = resolve(ch, this.reg).stats.get("hp");
    let delta = target - now;
    if (!delta) return ch;
    const dice: number[] = [];
    for (const c of ch.classes) for (let i = 0; i < c.level; i++) dice.push(hitDieOf(this.reg.get(c.classId)));
    if (dice.length < 2) return ch;
    const rolls: Record<string, number> = {};
    for (let n = 2; n <= dice.length; n++) rolls[String(n)] = ch.hpMode === "roll" && ch.hpRolls[String(n)] ? ch.hpRolls[String(n)] : Math.floor(dice[n - 1] / 2) + 1;
    // Spread the difference one point at a time across the levels, as evenly as the dice allow.
    for (let guard = 0; delta !== 0 && guard < 400; guard++) {
      let moved = false;
      for (let n = 2; n <= dice.length && delta !== 0; n++) {
        const k = String(n);
        if (delta > 0 && rolls[k] < dice[n - 1]) { rolls[k]++; delta--; moved = true; }
        else if (delta < 0 && rolls[k] > 1) { rolls[k]--; delta++; moved = true; }
      }
      if (!moved) break;
    }
    if (delta !== 0) this.notes.push(`Hit points: the file's maximum of ${target} is outside what the hit dice allow, so it is ${target - delta}.`);
    return { ...ch, hpMode: "roll", hpRolls: rolls };
  }

  /** Fill choices (subclass, feats, spells) with everything wanted, then derive base scores. */
  /**
   * Sets the species from a name as the file writes it: "Hill Dwarf", "Halfling (Lotusden)", "Aasimar (Fallen)",
   * "Elf; Wood Elf Lineage" or "Half-Elf (Variant; Wood Elf Descent)". The part that is a subrace or lineage
   * becomes a wanted choice.
   */
  setSpecies(raw: string): boolean {
    // Foundry's 2024 species read "Elf, Wood": the Elf with the Wood Elf lineage.
    const flipped = /^([^,;()]+),\s*([^,;()]+)$/.exec(raw.trim());
    if (flipped) raw = `${flipped[1].trim()}; ${flipped[2].trim()} ${flipped[1].trim()}`;
    const parts = raw.split(/;(?![^(]*\))/).map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return false;
    const main = parts[0];
    const m = /^(.*?)\s*\((.*)\)\s*$/.exec(main);
    const base = (m?.[1] ?? main).trim();
    const inner = (m?.[2] ?? "").split(";").map((x) => x.trim()).filter(Boolean);
    const extras = [...inner, ...parts.slice(1)].map((x) => x.replace(/\b(lineage|legacy|descent|variant)\b/gi, "").trim()).filter(Boolean);
    const RACE = ["Race"];
    const SUB = ["Sub Race", "Race Variant"];
    const pick = (n: string) => (this.speciesTraits.size ? raceByTraits(this.reg, findAllByName(this.reg, RACE, n), this.speciesTraits, this.edition) : findByName(this.reg, RACE, n, this.edition));
    let race = pick(main) ?? (inner.length ? pick(`${inner[0]} ${base}`) : undefined);
    let rest = race && race.name.toLowerCase() !== base.toLowerCase() ? [] : extras;
    if (!race) race = pick(base);
    if (!race) {
      // "Hill Dwarf" is the Hill Dwarf subrace of the Dwarf.
      const sub = findByName(this.reg, SUB, main, this.edition);
      const parent = sub && this.reg.ofType("Race").filter((r) => new RegExp(`\\b${r.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(sub.name));
      const pick = parent?.length ? parent.find((r) => isModern(r) === isModern(sub!)) ?? parent[0] : undefined;
      if (sub && pick) {
        race = pick;
        rest = [sub.name];
      }
    }
    if (!race) return false;
    this.ch.race = race.id;
    this.matched.push(`${race.name} (species)`);
    for (const x of rest) this.want([...SUB, "Racial Trait"], `${x} ${base}`, "subrace or lineage", [x, `${base} (${x})`, `${x} ${race.name}`]);
    return true;
  }

  /** Puts one wanted thing into a choice that can hold it. Spells and feats nothing can hold are added by hand. */
  private place(ch: Character, w: { types: string[]; name: string; label: string; alts?: string[] }): Character {
    // "Magic Initiate: Warlock" is the Magic Initiate feat with Warlock chosen inside it.
    const base = w.name.split(/[:(]/)[0].trim();
    const inner = w.name.slice(base.length).replace(/[:()]/g, " ").trim();
    const clean = w.name.replace(/\s+-\s+(race|class|feat|item)$/i, "").trim();
    let all = findAllByName(this.reg, w.types, clean);
    for (const alt of w.alts ?? []) if (!all.length) all = findAllByName(this.reg, w.types, alt);
    if (!all.length && base !== clean) all = findAllByName(this.reg, w.types, base);
    // Sheets write a subclass short: "Grave" for the Grave Domain, "Eloquence" for the College of Eloquence.
    if (!all.length && w.label === "subclass") {
      const words = new RegExp(`\\b${normalize(clean).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      all = this.reg.ofType("Archetype").filter((e) => words.test(normalize(e.name)));
    }
    if (!all.length && w.label === "feat") {
      // Foundry keeps class, subclass and species features as feats: "The Fiend" is the warlock's patron, "Sorcery
      // Points" and "Favored Enemy improvement" come with the class, "Dwarf (Hill)" is the species. The subclass is
      // placed; the others come from the content itself and are only noted.
      const sub = findAllByName(this.reg, ["Archetype"], clean);
      if (sub.length) all = sub;
      else {
        const key = featureKey(clean.replace(/\b(improvements?|upgrades?)\b/gi, "").split(/\s+and\s+/i)[0]);
        const FEATURES = ["Class Feature", "Archetype Feature", "Racial Trait", "Race", "Sub Race"];
        // Or a part a feature of the character describes: Font of Magic tells of Sorcery Points and Flexible Casting.
        const said = clean.toLowerCase();
        const described = () => resolve(ch, this.reg).active.some((a) => /feature|archetype|trait/i.test(a.el.type) && a.el.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase().includes(said));
        const known = key.length >= 4 && (FEATURES.some((t) => this.reg.ofType(t).some((e) => featureKey(e.name) === key)) || (said.length >= 8 && described()));
        if (known) {
          this.addName(clean);
          this.matched.push(`${w.name} (comes with the class or species)`);
          return ch;
        }
      }
    }
    if (!all.length) {
      this.missing.push(`${w.name} (${w.label})`);
      return ch;
    }
    if (inner) this.hints.names.add(normalizeFull(inner));
    const r = resolve(ch, this.reg);
    // A spell the character already has under this name (a domain spell in the other edition) is not taken twice.
    if (all[0].type === "Spell" && [...r.ids].some((id) => { const e = this.reg.get(id); return e?.type === "Spell" && normalize(e.name) === normalize(all[0].name); })) {
      this.matched.push(`${all[0].name} (already granted)`);
      return ch;
    }
    // Of the elements with this name, the one an open choice can take wins (a 2014 subclass for a 2014 class);
    // otherwise the one from the character's edition.
    const fits = all.filter((e) => r.slots.some((s) => s.chosen.length < s.rule.number && s.options.some((o) => o.id === e.id)));
    const pool = fits.length ? fits : all;
    const sameEd = pool.filter((e) => isModern(e) === ((this.edition ?? "2024") === "2024"));
    const list = sameEd.length ? sameEd : pool;
    // Several versions of one feat ("Resilient (Wisdom)", "Resilient (Strength)"): the one the file's data points to.
    const rank = (e: AElement) => {
      const inner = (/\((.*)\)\s*$/.exec(e.name)?.[1] ?? "").toLowerCase();
      const ab = ABILITY_IDS.find((a) => a === inner);
      if (ab && /resilient/i.test(e.name)) return this.hints.saves.has(ab) && !r.ids.has(`ID_PROFICIENCY_SAVINGTHROW_${ab.toUpperCase()}`) ? 100 : 0;
      return this.score(w.label, e.name, this.scores);
    };
    const el = list.length > 1 ? [...list].sort((x, y) => rank(y) - rank(x))[0] : list[0];
    if (r.ids.has(el.id)) {
      this.matched.push(`${el.name} (already granted)`);
      return ch;
    }
    const slot = r.slots.find((s) => s.chosen.length < s.rule.number && s.options.some((o) => o.id === el.id));
    if (slot) {
      this.matched.push(`${el.name} (${w.label})`);
      return { ...ch, selections: { ...ch.selections, [slot.key]: [...slot.chosen, el.id] } };
    }
    if (el.type === "Spell" || el.type === "Feat") {
      // No open choice can hold it (a racial spell, a Magical Secrets pick): keep it as a manual addition.
      this.matched.push(`${el.name} (${w.label}, added by hand)`);
      return { ...ch, extras: [...ch.extras, el.id] };
    }
    // A species or class trait no choice offers comes from the content itself; it is not added on top of it.
    this.hints.names.add(normalizeFull(el.name));
    if (w.label === "subclass") {
      const lv = ch.classes.map((c) => `${this.reg.get(c.classId)?.name ?? "?"} ${c.level}`).join(", ");
      this.notes.push(`${w.name}: the file gives this subclass, but the class does not offer it at this level (${lv}), so it was left out. Add it on the Build tab when the class reaches the subclass level.`);
    }
    return ch;
  }

  /** Fill choices (subclass, feats, spells) with everything wanted, then derive base scores. */
  finish(importedScores: Partial<Record<AbilityId, number>>, opts: { scoresIncludeItems?: boolean; hpMax?: number } = {}): ForeignImport {
    this.scores = importedScores;
    let ch = this.ch;
    // Subclasses and lineages first, so the spell lists and granted spells they bring exist; then feats; then the
    // remaining non-spell choices; spells last, so spells a species or subclass already grants are not picked twice.
    // Cantrips come before the other choices too: invocations such as Agonizing Blast need Eldritch Blast.
    const cantrip = (w: { label: string; name: string }) => w.label === "spell" && findAllByName(this.reg, ["Spell"], w.name).some((e) => Number(e.setters.level?.value) === 0);
    const order = (w: { label: string; name: string }) => (w.label === "subclass" ? 0 : /subrace|lineage/.test(w.label) ? 1 : w.label === "feat" ? 2 : cantrip(w) ? 3 : 4);
    const wanted = [...this.wantedChoices].sort((x, y) => order(x) - order(y));
    for (const w of wanted.filter((x) => order(x) < 4)) ch = this.place(ch, w);
    ch = this.fillOpen(ch, importedScores, true);
    for (const w of wanted.filter((x) => order(x) >= 4)) ch = this.place(ch, w);
    // Fill what is still open from the file's skills, languages, tools and scores, then with defaults. Spells the
    // file does not list are left for the player to choose rather than guessed.
    ch = this.fillOpen(ch, importedScores, true);
    const openSpells = resolve(ch, this.reg).slots.filter((s) => s.rule.type === "Spell" && !s.rule.optional && s.chosen.length < s.rule.number && s.options.length).reduce((n, s) => n + s.rule.number - s.chosen.length, 0);
    if (openSpells) this.notes.push(`${openSpells} spell choices the file does not fill are left open on the Magic tab.`);
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
    // "Gaming Set" and "Musical Instrument" in the inventory are the ones the character is proficient in.
    const generic = ch.inventory.map((it) => (!it.id && it.custom ? { name: it.custom.name } : undefined));
    if (generic.some(Boolean)) {
      const ids = resolve(ch, this.reg).ids;
      const done = resolveChosenTools(generic.map((g) => ({ name: g?.name ?? "", el: undefined, qty: 1 })), ids, this.reg);
      ch = { ...ch, inventory: ch.inventory.map((it, i) => {
        const el = generic[i] && done[i]?.el;
        if (!el) return it;
        this.missing = this.missing.filter((m) => m !== `${it.custom!.name} (item, kept as a custom item)`);
        this.matched.push(`${el.name} (${it.custom!.name})`);
        return { ...it, id: el.id, custom: undefined };
      }) };
    }
    // Hit points: the file's maximum wins. The difference from the average goes into the rolls of levels 2 and up.
    if (opts.hpMax) ch = this.matchHitPoints(ch, opts.hpMax);
    // Prepared spells as the file has them, up to what the rules allow.
    if (this.prepared.size) {
      const rr = resolve(ch, this.reg);
      const prepared: Record<string, string[]> = { ...ch.prepared };
      for (const line of buildSheet(rr).casting) {
        if (!line.prepare) continue;
        // Spells the class or subclass always has prepared (domain spells) are not counted against the limit.
        const always = new Set([...line.granted.map((g) => normalize(rr.reg.get(g.id)?.name ?? "")), ...line.spells.filter((p) => p.granted).map((p) => normalize(rr.reg.get(p.id)?.name ?? ""))]);
        const ids = preparePool(rr, line).filter((e) => this.prepared.has(normalize(e.name)) && !always.has(normalize(e.name))).map((e) => e.id);
        const max = line.prepareMax > 0 ? line.prepareMax : ids.length;
        if (ids.length > max) this.notes.push(`${line.name}: the file prepares ${ids.length} spells; the rules allow ${max}, so the first ${max} are prepared.`);
        if (ids.length) prepared[line.name] = [...new Set(ids)].slice(0, max);
      }
      ch = { ...ch, prepared };
    }
    if (this.missing.length) this.notes.push(`${this.missing.length} things were not found in your loaded content and were skipped or kept as custom items.`);
    this.notes.push(`${this.matched.length} matched.`);
    return { character: ch, notes: this.notes, matched: this.matched, missing: this.missing, guessed: this.guesses };
  }
}

// ---------------------------------------------------------------- Foundry

const cap = (s: unknown) => (typeof s === "string" && s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const ABBR: Record<string, AbilityId> = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" };

/** Foundry's language keys that differ from the language's name. */
const FLANG: Record<string, string> = { sign: "common sign language", deep: "deep speech", cant: "thieves' cant", thieves: "thieves' cant", gith: "githyanki", aarakocra: "auran" };

/** Foundry's tool keys (dnd5e system): the kits and instruments by their short names. */
const FTOOL: Record<string, string> = {
  thief: "thieves' tools", disg: "disguise kit", forg: "forgery kit", herb: "herbalism kit", navg: "navigator's tools", pois: "poisoner's kit",
  alchemist: "alchemist's supplies", brewer: "brewer's supplies", calligrapher: "calligrapher's supplies", carpenter: "carpenter's tools",
  cartographer: "cartographer's tools", cobbler: "cobbler's tools", cook: "cook's utensils", glassblower: "glassblower's tools",
  jeweler: "jeweler's tools", leatherworker: "leatherworker's tools", mason: "mason's tools", painter: "painter's supplies",
  potter: "potter's tools", smith: "smith's tools", tinker: "tinker's tools", weaver: "weaver's tools", woodcarver: "woodcarver's tools",
  chess: "dragonchess set", card: "playing card set", dice: "dice set", "three-dragon": "three-dragon ante set",
  bagpipes: "bagpipes", drum: "drum", dulcimer: "dulcimer", flute: "flute", horn: "horn", lute: "lute", lyre: "lyre", panflute: "pan flute", shawm: "shawm", viol: "viol",
  air: "vehicles (air)", land: "vehicles (land)", space: "vehicles (space)", water: "vehicles (water)",
};

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
  // The species traits the file lists tell the versions of a species apart (the Dungeon Master's Guide aasimar has
  // Celestial Legacy, Volo's has a subrace).
  b.speciesTraits = new Set(items.filter((it) => it.type === "feat" && String(it.system?.type?.value ?? "") === "race").map((it) => featureKey(String(it.name ?? ""))).filter(Boolean));
  // The rules a character uses: Foundry marks classes "2014" or "2024"; otherwise the books named say it.
  const ruleOf = (it: Json): Edition | undefined => {
    const src: Json = it.system?.source ?? {};
    const rules = String(src.rules ?? "");
    if (rules === "2014" || rules === "2024") return rules;
    const book = `${src.book ?? ""} ${src.custom ?? ""}`;
    if (/2024|XPHB|PHB'?24|SRD 5\.2/i.test(book)) return "2024";
    if (/\b(PHB|SRD 5\.1|XGE|TCE|TCoE|VGM|MPMM|SCAG|PHB'?14)\b/i.test(book)) return "2014";
    return undefined;
  };
  const votes = items.filter((it) => ["class", "subclass", "race", "background"].includes(it.type)).map(ruleOf).filter(Boolean);
  if (votes.length) b.edition = votes.filter((v) => v === "2024").length > votes.length / 2 ? "2024" : "2014";
  const subclasses: string[] = [];
  let speciesSet = false;
  for (const it of items) {
    const name = String(it.name ?? "");
    const isys: Json = it.system ?? {};
    if (!name) continue;
    switch (it.type as string) {
      case "class": {
        const el = findByName(reg, ["Class"], name, ruleOf(it) ?? b.edition);
        if (el) {
          b.ch.classes.push({ classId: el.id, level: Math.max(1, Math.min(20, Number(isys.levels) || 1)) });
          b.matched.push(`${el.name} (class)`);
        } else b.missing.push(`${name} (class)`);
        break;
      }
      case "subclass":
        subclasses.push(name);
        break;
      case "race":
        speciesSet = b.setSpecies(name);
        if (!speciesSet) b.missing.push(`${name} (species)`);
        break;
      case "background": {
        const el = findByName(reg, ["Background"], name, ruleOf(it) ?? b.edition) ?? findByName(reg, ["Background"], name.replace(/^variant\s+/i, "").replace(/\s*\(.*\)\s*$/, ""), b.edition) ?? findByName(reg, ["Background"], /\((.*)\)/.exec(name)?.[1] ?? "", b.edition);
        if (el) {
          b.ch.background = el.id;
          b.matched.push(`${el.name} (background)`);
        } else b.missing.push(`${name} (background)`);
        break;
      }
      case "feat": {
        // Class, species and background features come from the content itself. Only real feats are choices.
        // Plutonium stores species traits ("Age", "Languages", "Speed") and background features as untyped feats.
        const kind = String(isys.type?.value ?? "");
        const trait = /^(age|alignment|size|speed|languages?|creature type|darkvision|feature:|variant feature|optional rule|infusions?:|ability score (increase|improvement)s?$)/i.test(name);
        if (kind === "feat" || (!kind && !trait)) b.want(["Feat", "Feat Feature", "Racial Trait", "Class Feature", "Archetype Feature"], name, "feat");
        else b.addName(name);
        break;
      }
      case "spell": {
        b.want(["Spell"], name, "spell");
        const prep = isys.prepared ?? isys.preparation?.prepared;
        // Spells a feature keeps prepared (mode "always", or prepared 2: oath and domain spells) and innate, pact or at-will spells do not
        // count against the prepared limit.
        const mode = String(isys.preparation?.mode ?? isys.method ?? "prepared");
        // Foundry 5 writes 1 for prepared and 2 for always prepared.
        if ((prep === true || Number(prep) === 1) && /^(prepared|spell)$/.test(mode)) b.prepared.add(normalize(name));
        break;
      }
      case "weapon":
      case "equipment":
      case "consumable":
      case "tool":
      case "loot":
      case "container": {
        // The unarmed strike is part of every character, not an item.
        if (/^unarmed strike$/i.test(name)) break;
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
  // Older exports and Plutonium keep the species and background as text when there is no item for them.
  const det0: Json = sys.details ?? {};
  const textName = (v: unknown) => (typeof v === "string" && v.trim() && !/^[A-Za-z0-9]{16}$/.test(v.trim()) ? v.trim() : "");
  if (!speciesSet && textName(det0.race)) {
    if (!b.setSpecies(textName(det0.race))) b.missing.push(`${textName(det0.race)} (species)`);
  }
  if (!b.ch.background && textName(det0.background)) {
    const n = textName(det0.background);
    const el = findByName(reg, ["Background"], n, b.edition) ?? findByName(reg, ["Background"], n.replace(/^variant\s+/i, "").replace(/\s*\(.*\)\s*$/, ""), b.edition);
    if (el) {
      b.ch.background = el.id;
      b.matched.push(`${el.name} (background)`);
    } else b.missing.push(`${n} (background)`);
  }
  b.customBackground();
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
  for (const it of items) if (it?.name && ["feat", "subclass"].includes(it.type)) b.addName(String(it.name));
  for (const l of sys.traits?.languages?.value ?? []) b.addLanguage(FLANG[String(l).toLowerCase()] ?? String(l));
  for (const l of sys.traits?.languages?.custom ? String(sys.traits.languages.custom).split(/[;,]/) : []) if (l.trim()) b.hints.languages.add(l.trim().toLowerCase());
  for (const [k, t] of Object.entries<Json>(sys.tools ?? {})) if (Number(t?.value) >= 1) b.hints.tools.add(FTOOL[k.toLowerCase()] ?? k.toLowerCase());
  // Instruments and kits the character carries name the kind a generic "music" or "game" proficiency means.
  for (const it of items) {
    const base = String(it.system?.type?.baseItem ?? "").toLowerCase();
    if (it.type === "tool" && base && FTOOL[base]) b.hints.tools.add(FTOOL[base]);
  }
  // The choices the class, species and background items record: "skills:ath", "tool:art:smith", "languages:exotic:draconic".
  for (const it of items) {
    const adv = it.system?.advancement;
    for (const a of (Array.isArray(adv) ? adv : Object.values<Json>(adv ?? {})) as Json[]) {
      if (a?.type !== "Trait") continue;
      for (const c of (a.value?.chosen ?? []) as string[]) {
        const [kind, ...rest] = String(c).split(":");
        const last = rest[rest.length - 1] ?? "";
        if (kind === "skills" && FSKILL[last]) b.hints.skills.add(FSKILL[last]);
        else if (kind === "languages") b.addLanguage(FLANG[last] ?? last);
        else if (kind === "tool") b.hints.tools.add(FTOOL[last] ?? last);
        else if (kind === "saves" && ABBR[last]) b.hints.saves.add(ABBR[last]);
        else if (kind === "armor") b.hints.armor.add(({ lgt: "light", med: "medium", hvy: "heavy", shl: "shields" } as Record<string, string>)[last] ?? last);
        else if (kind === "weapon" && /^(sim|mar)$/.test(last)) b.hints.weapons.add(last === "sim" ? "simple" : "martial");
        // "weapon:mar:greataxe" names one weapon: a weapon mastery in the 2024 rules.
        else if (kind === "weapon" && rest.length === 2) b.hints.masteries.add(last.replace(/[^a-z]/g, ""));
      }
    }
  }
  for (const a of (sys.traits?.armorProf?.value ?? []) as string[]) b.hints.armor.add(({ lgt: "light", med: "medium", hvy: "heavy", shl: "shields" } as Record<string, string>)[a] ?? a);
  for (const w of (sys.traits?.weaponProf?.value ?? []) as string[]) if (/^(sim|mar)$/.test(w)) b.hints.weapons.add(w === "sim" ? "simple" : "martial");
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
  const hpMax = Number(sys.attributes?.hp?.max);
  return b.finish(scores, { scoresIncludeItems: false, hpMax: Number.isFinite(hpMax) && hpMax > 0 ? hpMax : undefined });
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
    // Roll20 only saves what was changed; a score that is not in the file is the sheet's default of 10.
    const n = Number(val(a) || val(`${a}_base`) || 10);
    if (Number.isFinite(n) && n > 0) scores[a] = n;
  }
  const lvl = Math.min(20, Math.max(1, Number(val("base_level") || val("level")) || 1));
  const className = val("class").replace(/\d+/g, "").trim();
  // The class features the sheet lists tell the 2014 and the 2024 class apart.
  const traitRows = [...(rows.get("traits")?.values() ?? [])];
  const featureNames = new Set(traitRows.filter((f) => /class/i.test(f.source ?? "")).map((f) => featureKey(f.name ?? "")).filter(Boolean));
  b.speciesTraits = new Set(traitRows.filter((f) => /rac/i.test(f.source ?? "")).map((f) => featureKey(f.name ?? "")).filter(Boolean));
  const cls = className ? classByFeatures(reg, className, featureNames) : undefined;
  if (cls) b.edition = isModern(cls) ? "2024" : "2014";
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
  } else if (className) b.missing.push(`${className} (class)`);
  else b.notes.push("No class found in the file.");
  for (const c of extraClasses) {
    const el = classByFeatures(reg, c.name, featureNames, b.edition);
    if (el) { b.ch.classes.push({ classId: el.id, level: c.level }); b.matched.push(`${el.name} (class)`); } else b.missing.push(`${c.name} (class)`);
  }
  if (val("race") && !b.setSpecies(val("race"))) b.missing.push(`${val("race")} (species)`);
  // "Dark Elf (Drow)" is the Drow subrace in the older content; the match ignores the parenthesis, so try both parts.
  const sub = val("subrace");
  if (sub) {
    const inner = /\((.*?)\)/.exec(sub)?.[1];
    for (const n of [sub, inner ?? ""]) if (n) b.want(["Sub Race", "Race Variant", "Race", "Racial Trait"], n, "subrace or lineage");
  }
  const bg = findByName(reg, ["Background"], val("background"), b.edition) ?? findByName(reg, ["Background"], val("background").replace(/^variant\s+/i, "").replace(/\s*\(.*\)\s*$/, ""), b.edition);
  if (bg) { b.ch.background = bg.id; b.matched.push(`${bg.name} (background)`); } else if (val("background")) b.missing.push(`${val("background")} (background)`);
  if (val("subclass")) b.want(["Archetype"], val("subclass"), "subclass");
  if (val("background")) b.customBackground();

  // Only feats are choices. Class, species and background traits come from the content itself.
  const FEATURE_TYPES = ["Feat", "Feat Feature", "Racial Trait", "Class Feature", "Archetype Feature"];
  for (const [section, byId] of rows) {
    for (const f of byId.values()) {
      if (section.startsWith("spell-") && f.spellname) {
        const spell = f.spellname.replace(/\s*\(.*$/, "").trim();
        b.want(["Spell"], spell, "spell");
        // Roll20 marks spells that do not count against the prepared limit: "Bane (SC)" for a subclass, "(innate)",
        // "(feat)", "(race)", "(item)".
        // "(A)" is always prepared (a Twilight cleric's domain spells).
        const extra = /\((a|always|sc|subclass|domain|innate|feat|race|species|item|background)\b/i.test(f.spellname);
        if ((f.spellprepared === "1" || f.spellprepared === "on") && !extra) b.prepared.add(normalize(spell));
      }
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
  // The proficiency rows: the type is only saved when it is not the default, LANGUAGE, and one row can hold several
  // names ("Common, Giant, Orc"). Tools sometimes sit here as OTHER ("Brewers supplies").
  for (const f of rows.get("proficiencies")?.values() ?? []) {
    const type = (f.prof_type ?? "").toUpperCase();
    const name = f.name ?? "";
    if (!type || type === "LANGUAGE") b.addLanguage(name);
    else if (type === "ARMOR") for (const a of name.split(/[,;]/)) { const t = a.trim().toLowerCase(); if (t) b.hints.armor.add(/^all/.test(t) ? "light medium heavy" : t); }
    else if (type === "WEAPON") for (const w of name.split(/[,;]/)) { const t = w.trim().toLowerCase(); if (/^(simple|martial)/.test(t)) b.hints.weapons.add(t.split(" ")[0]); }
    else if (/tools?|supplies|kit|set|utensils|instrument/i.test(name)) b.hints.tools.add(name.trim().toLowerCase());
  }
  if ([...b.hints.armor].some((a) => a.includes("light medium heavy"))) for (const a of ["light", "medium", "heavy"]) b.hints.armor.add(a);
  for (const f of rows.get("traits")?.values() ?? []) {
    if (f.name) b.addName(f.name);
    // An artificer's infusions: "Replicate Bag of Holding" comes with the source type "Replicate Magic Item".
    if (/infusion/i.test(f.source ?? "") && f.source_type) b.addName(f.source_type);
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
  const hpMax = Number(flat.get("hp")?.max);
  return b.finish(scores, { hpMax: Number.isFinite(hpMax) && hpMax > 0 ? hpMax : undefined });
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
