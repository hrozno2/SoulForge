/**
 * Importers for characters made elsewhere: Foundry VTT (dnd5e actor JSON, including actors made with
 * the Plutonium module) and Roll20 (D&D 5e OGL sheet attributes as JSON). Both are best effort: the formats
 * change between versions, so this reads what it recognises, matches names against the loaded content, and
 * reports what it could not place.
 */
import { ABILITY_IDS, newCharacter, uid, type AbilityId, type Character } from "./character";
import type { AElement } from "./types";
import type { ARegistry } from "./registry";
import { hitDieOf, resolve, stillToChoose } from "./engine";
import { buildSheet, preparePool } from "./sheet";
import { ItemIndex, resolveChosenTools } from "./startingEquipment";
import { isModern, isPlaytest } from "./edition";
import { conceptOf, nameKey } from "../engine/concepts";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface ForeignImport {
  character: Character;
  notes: string[];
  matched: string[];
  missing: string[];
  /** Choices the file did not settle, left open for the player: "Build: Skill Proficiency (Rogue), choose 2". */
  todo: string[];
  /** Numbers the file states that Soul Forge works out differently: "AC: the file says 18, Soul Forge 16". */
  differences: string[];
}

export function detectCharacterFormat(data: unknown): "foundry" | "roll20" | "charforge" | "unknown" {
  const d = data as Json;
  if (!d || typeof d !== "object") return "unknown";
  if (d.version === 2 && d.abilityBase) return "charforge";
  if (d.system && Array.isArray(d.items)) return "foundry";
  if (Array.isArray(d.attribs) || Array.isArray(d.character?.attribs) || Array.isArray(d.attributes)) return "roll20";
  return "unknown";
}

// The engine's name key (concepts.ts): "Melfs Acid Arrow" (FastCharacter) and "Melf’s Acid Arrow" agree.
const normalize = (s: string) => nameKey(s.replace(/\(.*?\)/g, " "));

/** Keeps the words inside parentheses and after a colon: "Magic Initiate: Warlock" and "Magic Initiate (Warlock)" agree. */
const normalizeFull = (s: string) => nameKey(s);

export type Edition = "2014" | "2024";

/** Numbers a file states (Roll20 stores its sheet's results), to compare with what Soul Forge works out. */
export interface FileNumbers {
  ac?: number;
  hpMax?: number;
  proficiency?: number;
  spellDc?: number;
  spellAttack?: number;
  saves?: Partial<Record<AbilityId, number>>;
  skills?: Record<string, number>;
  passivePerception?: number;
  /** Proficiency the file records (Foundry): skill name to 1 (proficient) or 2 (expertise), saves, languages, tools. */
  skillLevels?: Record<string, number>;
  saveProficient?: AbilityId[];
  languages?: string[];
  tools?: string[];
  initiative?: number;
  speed?: number;
  /** Weapon attacks the file lists, by name, with their bonus to hit. */
  attacks?: { name: string; bonus: number }[];
}

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
  const squeezed = pool.filter((e) => normalize(e.name).replace(/ /g, "") === tight);
  if (squeezed.length) return squeezed;
  // An option named for its effect with the thing in brackets: "Fire’s Burn (Fire Giant)" is the Fire Giant ancestry,
  // "Figurine of Wondrous Power (Bronze Griffon)" the Bronze Griffon. Only a name of two words or more, and only when
  // one element answers to it: "Water" is not the Ring of Elemental Command (Water).
  if (full.split(" ").length < 2 || /\d/.test(full)) return [];
  const bracketed = pool.filter((e) => normalizeFull(/\(([^)]+)\)\s*$/.exec(e.name)?.[1] ?? "") === full);
  return bracketed.length === 1 ? bracketed : [];
}

/**
 * Of several elements for one name, the primary provider's, as the lists show them: Aurora's content where it has
 * the element, 5e.tools' otherwise (docs/ENGINE-PLAN.md 3.1, one primary by a fixed priority).
 */
const primary = (els: AElement[]) => { const a = els.filter((e) => e.origin !== "5etools"); return a.length ? a : els; };

/** The element of that name from the character's edition when both exist (2024 when the file does not say). */
function findByName(reg: ARegistry, types: string[], name: string, edition?: Edition): AElement | undefined {
  const all = findAllByName(reg, types, name);
  if (!all.length) return undefined;
  const official = all.filter((e) => !isPlaytest(e));
  const pool = official.length ? official : all;
  const same = pool.filter((e) => isModern(e) === ((edition ?? "2024") === "2024"));
  const list = primary(same.length ? same : pool);
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
    return n - (isPlaytest(c) ? 0.5 : 0) + (edition && isModern(c) === (edition === "2024") ? 0.25 : 0) - (/rising from the last war/i.test(c.source) ? 0.1 : 0) + (c.origin !== "5etools" ? 0.05 : 0);
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
  // "Potion of Giant Strength (Fire)" is the Potion of Fire Giant Strength.
  // "Rhythm-Maker's Drum +2" is the content's "Rhythm-Maker's Drum, +2".
  const plusTail = /^(.*\S)\s*,?\s*\+(\d)$/.exec(name.trim());
  if (plusTail) add(`${plusTail[1]}, +${plusTail[2]}`);
  // "Ioun Stone of Reserve" is the Ioun Stone (Reserve).
  const ofKind = /^(.+?) of (\w+)$/i.exec(name.trim());
  if (ofKind) add(`${ofKind[1]} (${ofKind[2]})`);
  const kindOf = /^(.+?) of (.+?) \((\w+)\)$/i.exec(name.trim());
  if (kindOf) add(`${kindOf[1]} of ${kindOf[3]} ${kindOf[2]}`);
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

/** Bonuses in a Roll20 item's modifiers that are not the item's own attack or armor numbers. */
function itemBonuses(mods: string): { stat: string; value: number }[] {
  const out: { stat: string; value: number }[] = [];
  const num = (re: RegExp) => Number(re.exec(mods)?.[1]);
  const dc = num(/Spell DC\s*\+(\d+)/i);
  const atk = num(/Spell Attack\s*\+(\d+)/i);
  const saves = num(/Saving Throws?\s*\+(\d+)/i);
  if (dc) out.push({ stat: "spellcasting:dc", value: dc });
  if (atk) out.push({ stat: "spellcasting:attack", value: atk });
  if (saves) for (const a of ABILITY_IDS) out.push({ stat: `${a}:save:misc`, value: saves });
  // "AC +1" on something that is not armor or a shield (a Ring of Protection).
  const ac = num(/(?:^|,\s*)AC\s*\+(\d+)/i);
  if (ac && !/Item Type:[^,]*(Armor|Shield)/i.test(mods)) out.push({ stat: "ac:misc", value: ac });
  return out;
}

/** Letters only, for names written with different punctuation: "Brewers supplies" and "Brewer’s Supplies". */
const tight = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z]/g, "");

/** One name's words all appear in the other ("dice" and "Dice set"), ignoring punctuation and brackets. */
function sameWords(a: string, b: string): boolean {
  // Singular words, so "Playing cards" is the "Playing card set".
  const words = (x: string) => x.toLowerCase().replace(/[’']/g, "").replace(/\(.*?\)/g, " ").split(/[^a-z]+/).filter(Boolean).map((w) => (w.length > 3 ? w.replace(/s$/, "") : w));
  const [wa, wb] = [words(a), words(b)];
  if (!wa.length || !wb.length) return false;
  const [small, big] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  // Only generic words may be extra: "dice" is the "Dice set", but "flute" is not the "Pan flute".
  const GENERIC = ["set", "kit", "tool", "supplie", "supply", "instrument", "utensil", "game", "gaming", "of", "the"];
  return small.every((w) => big.includes(w)) && big.filter((w) => !small.includes(w)).every((w) => GENERIC.includes(w));
}

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

const COUNT_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20 };
/** A plural noun to its singular: "potions" "potion", "javelins" "javelin", "flasks" "flask", "torches" "torch". */
const singular = (w: string) => (/(us|ss|is)$/i.test(w) ? w : /axes$/i.test(w) ? w.slice(0, -1) : /(ch|sh|x|ss)es$/i.test(w) ? w.slice(0, -2) : /ies$/i.test(w) ? `${w.slice(0, -3)}y` : /[^s]s$/i.test(w) ? w.slice(0, -1) : w);

/**
 * An item as a sheet writes it in words, to the item and how many: "2 potions of healing" is 2 Potion of Healing,
 * "five (5) javelins" 5 Javelin, "ammunition: arrows (20)" 20 Arrow, "arcane focus: crystal" a Crystal.
 */
export function textItem(raw: string): { name: string; qty: number } {
  let t = raw.trim();
  let qty = 1;
  const focus = /^(?:arcane|druidic|holy) (?:focus|symbol)\s*:\s*(.+)$|^holy symbol\s*:\s*(.+)$|^ammunition\s*:\s*(.+)$/i.exec(t);
  if (focus) t = (focus[1] ?? focus[2] ?? focus[3]).trim();
  const tail = /^(.*\S)\s*\((\d+)\)$/.exec(t);
  if (tail) { t = tail[1]; qty = Number(tail[2]); }
  const lead = /^(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twenty)\s+(?:\((\d+)\)\s+)?(.+)$/i.exec(t);
  if (lead) { qty = Number(lead[2] ?? (/^\d+$/.test(lead[1]) ? lead[1] : COUNT_WORDS[lead[1].toLowerCase()])) || qty; t = lead[3]; }
  // The head noun is the last word before "of" ("potions of healing"), or the last word.
  const of = /^(.+?)(\s+of\s+.+)$/i.exec(t);
  const head = of ? of[1] : t;
  const words = head.split(/\s+/);
  if (qty > 1 || /s$/i.test(words[words.length - 1])) words[words.length - 1] = singular(words[words.length - 1]);
  t = words.join(" ") + (of ? of[2] : "");
  return { name: t, qty };
}

class Importer {
  ch: Character = newCharacter();
  notes: string[] = [];
  matched: string[] = [];
  missing: string[] = [];
  /** `early`: placed with the cantrips, before the open choices are filled (a spell a feat's text names). */
  private wantedChoices: { types: string[]; name: string; label: string; alts?: string[]; from?: string; edition?: Edition; early?: boolean }[] = [];
  /** Which rules the character was made with, when the file says. Picks the 2014 or 2024 version of a name. */
  edition?: Edition;
  /** Weapons the character carries, for weapon mastery when the file names none. */
  private carried = new Set<string>();
  private scores: Partial<Record<AbilityId, number>> = {};
  /** Spells the file marks as prepared, by name. */
  prepared = new Set<string>();
  /** The file says which spells are prepared (Foundry and Roll20 do); otherwise every listed spell counts. */
  preparedKnown = false;
  /** Species traits the file lists, to tell versions of a species apart. */
  speciesTraits = new Set<string>();
  private index?: ItemIndex;
  /**
   * What each source in the file chose, by source name (Foundry records it: the Druid took Nature and Survival, the
   * Skilled feat took Insight and Perception). A choice of that source takes from its own picks.
   */
  sourced = new Map<string, { skills: Set<string>; expertise: Set<string>; tools: Set<string>; languages: Set<string> }>();
  /** The sources of the choice being filled: its owner, and the class, species or background it belongs to. */
  private slotSources: string[] = [];
  /** The name the file gives a background the content lacks (the Custom Background stands in for it). */
  missingBackground = "";
  /** Records a pick a source made. */
  sourcedPick(source: string, kind: "skills" | "expertise" | "tools" | "languages", value: string): void {
    const key = normalize(source);
    if (!key) return;
    const rec = this.sourced.get(key) ?? this.sourced.set(key, { skills: new Set(), expertise: new Set(), tools: new Set(), languages: new Set() }).get(key)!;
    rec[kind].add(value.toLowerCase());
  }
  /** Option names that, without their brackets, name several options of the choice being filled. */
  private ambiguous = new Set<string>();
  /** How many times the file lists each feat: a repeatable feat (Skilled, Magic Initiate) is taken no more often. */
  private featCount = new Map<string, number>();
  /** How many level-up improvements the file records as ability scores rather than feats. */
  asiTaken = 0;
  /** Spells no choice can hold yet: tried again once the other choices are made (a Magic Initiate list). */
  private deferring = false;
  private deferred: { types: string[]; name: string; label: string; alts?: string[]; from?: string; edition?: Edition }[] = [];
  /** What the file says the character has, used to fill open choices (skills, languages, tools, expertise, saves). */
  hints = { skills: new Set<string>(), expertise: new Set<string>(), tools: new Set<string>(), languages: new Set<string>(), saves: new Set<string>(), names: new Set<string>(), masteries: new Set<string>(), size: "", armor: new Set<string>(), weapons: new Set<string>(), spells: new Set<string>(), resist: new Set<string>() };

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
    this.missingBackground = name.replace(/ \(background\)$/, "");
    this.notes.push(`${name.replace(/ \(background\)$/, "")} is not in your loaded content, so the character has a Custom Background with the skills, tools and languages from the file.`);
  }

  /** The 2024 books drop the wizard from some spell names: "Tiny Hut" is Leomund's Tiny Hut, "Arcane Hand" Bigby's Hand. */
  renamedSpell(name: string): AElement[] {
    const RENAMED: Record<string, string> = { "arcane hand": "Bigby’s Hand", "arcane sword": "Mordenkainen’s Sword" };
    const tail = normalize(name);
    if (RENAMED[tail]) return findAllByName(this.reg, ["Spell"], RENAMED[tail]);
    return this.reg.ofType("Spell").filter((e) => { const n = normalize(e.name.replace(/^[\w-]+[’']s\s+/, "")); return n === tail && n !== normalize(e.name); });
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
  /** `from` names where the file says it came from ("magic initiate"), to pick the choice that holds it. */
  want(types: string[], name: string, label: string, alts: string[] = [], from?: string, edition?: Edition, early?: boolean): void {
    if (name && label === "spell") this.hints.spells.add(normalize(name));
    if (name && label === "feat") this.featCount.set(normalize(name), (this.featCount.get(normalize(name)) ?? 0) + 1);
    if (name) this.wantedChoices.push({ types, name, label, alts, from, edition, early });
  }

  addItem(name: string, qty: number, equipped: boolean, attuned: boolean, extra: { base?: string; magic?: number; bonuses?: { stat: string; value: number }[]; edition?: Edition } = {}): void {
    const edition = extra.edition ?? this.edition;
    // How sheets write a count, a plural or a focus: "2 potions of healing", "five (5) javelins", "ammunition:
    // arrows (20)", "arcane focus: crystal", "holy symbol: amulet". The item itself, and how many.
    // Only when the spoken form names an item: "Bracers" stays Bracers, "10 Feet of String" stays for the rules below.
    const spoken = textItem(name);
    if (spoken.name !== name && !findByName(this.reg, ITEM_TYPES, name, edition) && itemNameVariants(spoken.name).some((v) => findByName(this.reg, ITEM_TYPES, v, edition))) { name = spoken.name; if (qty <= 1) qty = spoken.qty; }
    // "Crossbow Bolts (20)" and "Blowgun Needles (50)" are a count of the item.
    const count = /^(.*\S)\s*\((\d{1,4})\)$/.exec(name);
    if (count && qty <= 1) {
      name = count[1];
      qty = Number(count[2]);
    }
    // "Spell Scroll: Detect Poison and Disease" is a scroll of that spell's level.
    const scrollOf = /^spell scroll\s*[:\-–]\s*(.+)$/i.exec(name.trim());
    if (scrollOf && !extra.base) {
      const sp = findByName(this.reg, ["Spell"], scrollOf[1], this.edition) ?? this.renamedSpell(scrollOf[1])[0];
      const lv = Number(sp?.setters.level?.value ?? NaN);
      if (sp && Number.isFinite(lv)) extra = { ...extra, base: lv === 0 ? "Spell Scroll (Cantrip)" : `Spell Scroll (Level ${lv})` };
    }
    let el: AElement | undefined;
    for (const c of itemNameVariants(name, extra.base)) {
      el = findByName(this.reg, ITEM_TYPES, c, edition);
      if (el) break;
    }
    // A magic weapon named for its base: "+1 Shortsword of Vengeance" is a shortsword (the Sword of Vengeance), so
    // it is the base weapon with the magic item's name and bonus, and it has an attack.
    const ofMagic = !el ? /^(?:\+(\d)\s+)?(.+?)\s+of\s+(.+)$/i.exec(name.trim()) : null;
    if (ofMagic) {
      const weapon = findByName(this.reg, ["Weapon"], ofMagic[2], edition);
      if (weapon) {
        el = weapon;
        extra = { ...extra, magic: extra.magic || Number(ofMagic[1]) || 0 };
      }
    }
    // The names starting equipment uses ("Holy Symbol" is an Amulet, Emblem or Reliquary), then typos and cut-off names.
    if (!el) el = (this.index ??= new ItemIndex(this.reg)).find(name);
    for (const c of itemNameVariants(name, extra.base).slice(0, 4)) if (!el) el = fuzzyItem(this.reg, c, edition);
    // "Rusty Manacles", "Cracked Hourglass", "Pale Robes": plain adventuring gear with a describing word in front.
    const words = name.replace(/^(?:a|an|set of|pair of)\s+/i, "").trim().split(/\s+/);
    const plainWord = /^(rusty|cracked|pale|old|worn|broken|battered|tattered|dirty|torn|small|large|little|simple|plain|wooden|iron|steel|leather|silk|black|white|red|blue|green|pink|gr[ae]y|brown|golden|gold|silver|copper|travel|spare|cheap|sturdy)$/i;
    if (!el && words.length === 2 && plainWord.test(words[0])) el = findAllByName(this.reg, ["Item"], words[1]).find((e) => !e.compendiumHidden);
    // "+1 Shield", "Rapier +1" and "Requital (+2 The Emerald Blade)" are a base item with a bonus.
    // An element that is already the magic version ("Rhythm-Maker's Drum, +2") carries its own bonus.
    const magic = el && /[+]\d/.test(el.name) ? 0 : extra.magic || Number(/[+]([1-3])\b/.exec(name)?.[1]) || 0;
    const plain = name.replace(/[+]\d\s*/g, "").replace(/\(\s*\)/g, "").replace(/\s+/g, " ").replace(/\s*,\s*$/, "").trim();
    const label = el && normalize(plain) !== normalize(el.name) && normalizeFull(plain) !== normalizeFull(el.name) ? plain : undefined;
    // A custom item's bonuses the file applies (Roll20 item modifiers) become custom bonuses named after it.
    if (!el) for (const bo of extra.bonuses ?? []) this.ch.customStats.push({ id: uid(), stat: bo.stat, value: bo.value, note: `${name} (from the file)` });
    this.ch.inventory.push({ uid: uid(), id: el?.id ?? "", qty: Math.max(1, qty), equipped, attuned, custom: el ? undefined : { name }, ...(label ? { label } : {}), ...(el && magic ? { magic } : {}) });
    (el ? this.matched : this.missing).push(el ? `${el.name} (${el.type})` : `${name} (item, kept as a custom item)`);
    if (el?.type === "Weapon") this.carried.add(normalize(el.name).replace(/ /g, ""));
  }


  private score(slotName: string, optionName: string, scores: Partial<Record<AbilityId, number>>, el?: AElement): number {
    const n = optionName.toLowerCase().trim();
    const inner = /\((.*)\)\s*$/.exec(n)?.[1]?.trim() ?? n;
    const h = this.hints;
    // A choice whose source the file says chose something of this kind takes from those picks only: a class's
    // skill list does not take the skills a feat chose.
    const kind: "skills" | "expertise" | "tools" | "languages" | undefined = el?.type === "Language" ? "languages" : /^tool proficiency/.test(n) ? "tools" : /^skill expertise/.test(n) ? "expertise" : /^skill proficiency/.test(n) || SKILL_NAMES.includes(n) || SKILL_NAMES.includes(inner) ? "skills" : undefined;
    if (kind) {
      const recs = this.slotSources.map((x) => this.sourced.get(x)?.[kind]).filter((x): x is Set<string> => !!x && x.size > 0);
      if (recs.length) {
        const value = kind === "languages" ? n : kind === "tools" ? inner : SKILL_NAMES.includes(n) ? n : inner;
        const hit = recs.some((rec) => [...rec].some((x) => tight(x) === tight(value) || (kind === "tools" && sameWords(x, value))));
        return hit ? 100 : 0;
      }
    }
    if (/^skill expertise/.test(n)) return h.expertise.has(inner) ? 100 : 0;
    if (/^skill proficiency/.test(n)) return h.skills.has(inner) ? 90 : 0;
    if (/^tool proficiency/.test(n)) {
      // The same tool by name first; then a name inside the other one, but only as whole words: "dice" is the "Dice
      // set", while "lute" is not the "Flute" and "flute" is not the "Pan flute".
      if ([...h.tools].some((t) => tight(t) === tight(inner))) return 100;
      return [...h.tools].some((t) => sameWords(t, inner)) ? 60 : 0;
    }
    // Without the brackets only when that names one option: "Cloud's Jaunt" is "Cloud's Jaunt (Cloud Giant)", but
    // "Resilient" names all of "Resilient (Strength)" to "Resilient (Charisma)".
    if (h.names.has(normalizeFull(optionName)) || (h.names.has(normalize(optionName)) && !this.ambiguous.has(normalize(optionName)))) return 100;
    // "Infernal Legacy" for a file that says "Tiefling, Infernal": the option without its kind word.
    const core = normalize(optionName).replace(/\b(legacy|lineage|ancestry|heritage|descent)\b/g, " ").replace(/\s+/g, " ").trim();
    if (core && core !== normalize(optionName) && h.names.has(core)) return 100;
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
    // Only spells the character's own classes do not have count: those are the ones a feat brought.
    const own = new Set(this.ch.classes.map((c) => (this.reg.get(c.classId)?.name ?? "").toLowerCase()));
    const offList = (sp: AElement) => !sp.supports.some((x) => own.has(x.toLowerCase()));
    const offNames = new Set(this.reg.ofType("Spell").filter((sp) => this.hints.spells.has(normalize(sp.name))).filter((sp) => !this.reg.ofType("Spell").some((o) => normalize(o.name) === normalize(sp.name) && !offList(o))).map((sp) => normalize(sp.name)));
    for (const name of offNames) if (this.reg.ofType("Spell").some((sp) => normalize(sp.name) === name && sp.supports.some((x) => x.toLowerCase() === cls.toLowerCase()))) n++;
    // The feat may use the character's own class list (a cleric's Magic Initiate: Cleric for two more cleric
    // cantrips). Without spells from outside the class, the own list is the likelier pick, but still a guess.
    if (!n && own.has(cls.toLowerCase())) return 0.4;
    // Counted once per spell name, at most a point each; enough to beat a guess, not a file's named choice.
    return Math.min(n, 20) * 2;
  }

  /**
   * An option that grants a damage resistance the file lists and nothing else gives yet (a draconic sorcerer's
   * Elemental Affinity: poison when the tiefling already covers fire).
   */
  private resistScore(o: AElement, has: Set<string>): number {
    if (!this.hints.resist.size) return 0;
    let sc = 0;
    for (const r of o.rules) {
      if (r.kind !== "grant") continue;
      const m = /DAMAGE_RESISTANCE_([A-Z]+)$/.exec(r.id);
      if (!m) continue;
      sc += this.hints.resist.has(m[1].toLowerCase()) ? (has.has(r.id) ? 5 : 40) : -5;
    }
    return sc;
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

  /**
   * Fills the open choices the file speaks to. A choice the file says nothing about is left open for the player
   * (decision D1): it shows in the import report's to-do list, not filled with a guess. Ability score choices are
   * the exception: the file's scores settle them.
   */
  /**
   * The assignment solver (docs/ENGINE-PLAN.md 3.6): the trainings the file states (skills, expertise, languages,
   * tools) against every open choice that can hold them, matched all at once so each fact finds a place when one
   * exists. One at a time, a broad choice could take a skill that only it could hold for another. Deterministic:
   * facts and choices in sorted order, augmenting paths (Kuhn's algorithm).
   */
  private assignTrainings(start: Character): Character {
    const r = resolve(start, this.reg);
    const slug = (x: string) => x.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const had = new Set(r.active.map((a) => conceptOf(a.el)).filter(Boolean) as string[]);
    const facts = [
      ...[...this.hints.skills].map((x) => `skill:${slug(x)}`),
      ...[...this.hints.expertise].map((x) => `expertise:${slug(x)}`),
      ...[...this.hints.languages].map((x) => `language:${slug(x)}`),
      ...[...this.hints.tools].map((x) => `tool:${slug(x)}`),
    ].filter((k, i, a) => a.indexOf(k) === i && !had.has(k))
      // A skill the file also gives expertise in goes first: the expertise needs the proficiency.
      .sort((a, b) => Number(this.hints.expertise.has(b.replace(/^skill:/, "").replace(/-/g, " "))) - Number(this.hints.expertise.has(a.replace(/^skill:/, "").replace(/-/g, " "))) || a.localeCompare(b));
    if (!facts.length) return start;
    // One node per open place in a training choice.
    const places: { key: string; options: Map<string, string> }[] = [];
    for (const s of [...r.slots].sort((a, b) => a.key.localeCompare(b.key))) {
      if (s.rule.optional || s.defaulted || !["Proficiency", "Language"].includes(s.rule.type)) continue;
      const free = s.rule.number - s.chosen.length;
      if (free <= 0) continue;
      const options = new Map<string, string>();
      for (const o of s.options) { const k = conceptOf(o); if (k && !s.blocked.has(o.id) && !s.chosen.includes(o.id) && !options.has(k)) options.set(k, o.id); }
      for (let i = 0; i < free; i++) places.push({ key: s.key, options });
    }
    const placeOf = new Map<string, number>(); // fact -> place
    const factAt = new Map<number, string>(); // place -> fact
    const tryFact = (f: string, seen: Set<number>): boolean => {
      for (let p = 0; p < places.length; p++) {
        if (!places[p].options.has(f) || seen.has(p)) continue;
        seen.add(p);
        const other = factAt.get(p);
        if (other === undefined || tryFact(other, seen)) { factAt.set(p, f); placeOf.set(f, p); return true; }
      }
      return false;
    };
    for (const f of facts) tryFact(f, new Set());
    if (!factAt.size) return start;
    const selections = { ...start.selections };
    for (const [p, f] of [...factAt].sort((a, b) => a[0] - b[0])) {
      const { key, options } = places[p];
      const id = options.get(f)!;
      const now = selections[key] ?? r.slots.find((s) => s.key === key)!.chosen;
      if (!now.includes(id)) selections[key] = [...now, id];
    }
    return { ...start, selections };
  }

  private fillOpen(start: Character, scores: Partial<Record<AbilityId, number>>, skipSpells = false): Character {
    let cur = this.assignTrainings(start);
    // When the file says nothing, an option from the same books as the character beats one from elsewhere
    // (a 2024 fighter's weapon mastery is a longsword, not a firearm from the Dungeon Master's Guide).
    const own = new Set([...start.classes.map((c) => c.classId), start.race ?? "", start.background ?? ""].map((id) => this.reg.get(id)?.source).filter(Boolean) as string[]);
    const skip = new Set<string>();
    for (let i = 0; i < 600; i++) {
      const r = resolve(cur, this.reg);
      // The narrowest choice first: a class's skill list before a background that takes any skill, so the file's
      // skills land where only they fit.
      const open = r.slots.filter((s) => !skip.has(s.key) && !(skipSpells && s.rule.type === "Spell") && !s.rule.optional && !s.defaulted && s.chosen.length < s.rule.number && s.options.length)
        .sort((a, b) => a.options.length - b.options.length)[0];
      if (!open) break;
      const taken = new Set(open.chosen);
      const feats = new Map<string, number>();
      for (const a of r.active) if (a.el.type === "Feat") feats.set(normalize(a.el.name), (feats.get(normalize(a.el.name)) ?? 0) + 1);
      // A feat the file lists once is taken once, even where the content lets it repeat.
      // The file's list of feats is the whole list: a feat it does not name is not taken (the score improvements it
      // records stay score improvements).
      // A background's feat given as the feat's own part (the Sage's ID_..._MAGIC_INITIATE_WIZARD) counts too.
      for (const a of r.active) {
        if (a.el.type === "Feat") continue;
        const base = this.reg.ofType("Feat").find((f) => a.el.id.startsWith(`${f.id}_`) && !r.active.some((b) => b.el.id === f.id));
        if (base) feats.set(normalize(base.name), (feats.get(normalize(base.name)) ?? 0) + 1);
      }
      // Only when picking a feat: a feat's own choice whose options are stored as feats ("Resilient (Constitution)")
      // is settled by the file's other data.
      const featPick = open.owner.type !== "Feat";
      const spent = (o: AElement) => featPick && o.type === "Feat" && !/^ability score improvement/i.test(o.name) && (this.featCount.size > 0 || this.asiTaken > 0) && (this.featCount.has(normalize(o.name)) ? (feats.get(normalize(o.name)) ?? 0) >= this.featCount.get(normalize(o.name))! : !this.hints.names.has(normalizeFull(o.name)) && !this.hints.names.has(normalize(o.name)));
      // The sources of this choice: the element offering it and the class, species or background it belongs to.
      const rootName = open.root.startsWith("class:") ? this.reg.get(open.root.slice(6))?.name : open.root === "race" ? this.reg.get(cur.race ?? "")?.name : open.root === "background" ? this.reg.get(cur.background ?? "")?.name : undefined;
      // Every source above the choice: the feature offering it, the subclass or feat it belongs to, the class.
      const chain: string[] = [];
      const fromOf = new Map(r.active.map((a) => [a.el.id, a.from]));
      for (let id: string | undefined = open.owner.id, i = 0; id && i < 6; id = fromOf.get(id), i++) chain.push(this.reg.get(id)?.name ?? "");
      this.slotSources = [...chain, rootName ?? "", open.root === "background" ? this.missingBackground : ""].map((x) => normalize(x.replace(/^level \d+: /i, ""))).filter(Boolean);
      const counts = new Map<string, number>();
      for (const o of open.options) counts.set(normalize(o.name), (counts.get(normalize(o.name)) ?? 0) + 1);
      this.ambiguous = new Set([...counts].filter(([, n]) => n > 1).map(([k]) => k));
      // Something the character already has, under any provider's id (Common from the species and Common offered
      // by the background), is not taken again.
      const hadConcepts = new Set([...r.active].map((a) => conceptOf(a.el)).filter(Boolean));
      const had = (o: AElement) => r.ids.has(o.id) || (!!conceptOf(o) && hadConcepts.has(conceptOf(o)));
      // A feat the file never names is not taken to account for a spell (decision D1: no guesses): a bard's Shield
      // is no reason for Abjuration Adept or Magic Initiate, nor Mage Hand for Telekinetic. A feature's option (a
      // Divine Soul's affinity, a Circle of the Land's terrain) still is.
      // The class list inside a feat already taken (the 2024 Magic Initiate's "Wizard", a feat-type option) is scored.
      const LIST = /^(artificer|bard|cleric|druid|paladin|ranger|sorcerer|warlock|wizard)$/i;
      const named = (o: AElement) => o.type !== "Feat" || LIST.test(o.name.trim()) || this.featCount.has(normalize(o.name)) || this.hints.names.has(normalizeFull(o.name));
      const spellScore = (o: AElement) => (named(o) ? this.spellListScore(o) + this.grantedSpellScore(o) : 0);
      const candidates = open.options
        .filter((o) => !taken.has(o.id) && !open.blocked.has(o.id) && !had(o) && !spent(o))
        .map((o) => ({ o, sc: this.score(`${open.key} ${open.rule.name}`, o.name, scores, o) + this.trainingScore(o) + spellScore(o) + this.resistScore(o, r.ids) + (own.has(o.source) ? 0.5 : 0) }))
        .sort((a, b) => b.sc - a.sc);
      const best = candidates[0] ?? { o: open.options.find((o) => !taken.has(o.id)), sc: 0 };
      if (!best.o) break;
      if (best.sc <= 0.5 && !/^\s*ability score/i.test(open.rule.name)) {
        skip.add(open.key);
        continue;
      }
      cur = { ...cur, selections: { ...cur.selections, [open.key]: [...open.chosen, best.o.id] } };
    }
    return cur;
  }

  /** The file's own numbers against Soul Forge's (plan principle P5: an answer key). Only numbers the file states. */
  private compare(ch: Character, f: FileNumbers | undefined): string[] {
    if (!f) return [];
    const sh = buildSheet(resolve(ch, this.reg));
    const out: string[] = [];
    const diff = (what: string, file: number | undefined, ours: number | undefined) => {
      if (file === undefined || ours === undefined || !Number.isFinite(file) || file === ours) return;
      out.push(`${what}: the file says ${file}, Soul Forge works out ${ours}`);
    };
    diff("Armor class", f.ac, sh.ac.value);
    diff("Hit points", f.hpMax, sh.hp);
    diff("Proficiency bonus", f.proficiency, sh.proficiency);
    diff("Spell save DC", f.spellDc, sh.casting[0]?.dc);
    diff("Spell attack", f.spellAttack, sh.casting[0]?.attack);
    for (const a of sh.abilities) diff(`${a.id.charAt(0).toUpperCase()}${a.id.slice(1)} saving throw`, f.saves?.[a.id], a.save);
    for (const k of sh.skills) diff(`${k.name.charAt(0).toUpperCase()}${k.name.slice(1)}`, f.skills?.[k.name.toLowerCase()], k.bonus);
    diff("Passive Perception", f.passivePerception, sh.skills.find((k) => /^perception$/i.test(k.name))?.passive);
    diff("Initiative", f.initiative, sh.initiative);
    diff("Speed", f.speed, sh.speed);
    for (const at of f.attacks ?? []) {
      // The line of the same name first ("Scimitar" is the plain one, "+2 Magic Scimitar" the magic one).
      const bare = tight(at.name.replace(/^\+\d\s*(magic\s*)?/i, ""));
      const named = (x: { name: string }) => tight(x.name.replace(/^\+\d\s*/, ""));
      const magic = /^\+\d/.test(at.name);
      const ours = sh.attacksCarried.find((x) => named(x).startsWith(bare) && (x.magic ?? 0) > 0 === magic) ?? sh.attacksCarried.find((x) => named(x) === bare) ?? sh.attacksCarried.find((x) => tight(x.name).includes(bare));
      if (ours) diff(`${at.name} attack`, at.bonus, ours.bonus);
      else out.push(`${at.name} attack: in the file, not on the Soul Forge sheet`);
    }
    const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
    const LV = ["no proficiency", "proficiency", "expertise"];
    if (f.skillLevels) for (const k of sh.skills) {
      const file = Math.min(2, Math.floor(f.skillLevels[k.name.toLowerCase()] ?? 0));
      const ours = k.level === "expertise" ? 2 : k.level === "proficient" ? 1 : 0;
      if (file !== ours) out.push(`${cap(k.name)}: the file has ${LV[file]}, Soul Forge has ${LV[ours]}`);
    }
    if (f.saveProficient) for (const a of sh.abilities) {
      const file = f.saveProficient.includes(a.id);
      if (file !== a.saveProficient) out.push(`${cap(a.id)} saving throw: the file ${file ? "is" : "is not"} proficient, Soul Forge ${a.saveProficient ? "is" : "is not"}`);
    }
    const has = (list: string[], x: string) => list.some((y) => tight(y) === tight(x) || sameWords(y, x));
    if (f.languages) {
      const ours = sh.proficiencies.languages;
      for (const l of f.languages) if (!has(ours, l)) out.push(`Language ${cap(l)}: in the file, not in Soul Forge`);
      for (const l of ours) if (!has(f.languages, l)) out.push(`Language ${l}: in Soul Forge, not in the file`);
    }
    if (f.tools) {
      // The sheet names them "Tool Proficiency (Thieves' tools)".
      const ours = sh.proficiencies.tools.map((t) => /^Tool Proficiency \((.*)\)$/i.exec(t)?.[1] ?? t);
      for (const t of f.tools) if (!has(ours, t)) out.push(`Tool ${t}: in the file, not in Soul Forge`);
    }
    return out;
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
  private place(ch: Character, w: { types: string[]; name: string; label: string; alts?: string[]; from?: string; edition?: Edition }): Character {
    // "Magic Initiate: Warlock" is the Magic Initiate feat with Warlock chosen inside it.
    const base = w.name.split(/[:(]/)[0].trim();
    const inner = w.name.slice(base.length).replace(/[:()]/g, " ").trim();
    const clean = w.name.replace(/\s+-\s+(race|class|feat|item)$/i, "").trim();
    let all = findAllByName(this.reg, w.types, clean);
    for (const alt of w.alts ?? []) if (!all.length) all = findAllByName(this.reg, w.types, alt);
    if (!all.length && base !== clean) all = findAllByName(this.reg, w.types, base);
    // The 2024 books drop the wizard from some spell names: "Tiny Hut" is Leomund's Tiny Hut.
    if (!all.length && w.label === "spell") all = this.renamedSpell(clean);
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
    let fits = all.filter((e) => r.slots.some((s) => s.chosen.length < s.rule.number && s.options.some((o) => o.id === e.id)));
    // Nothing open takes it by name: an open option of the same kind whose distinctive words are the wanted name's
    // ("Abyssal" is the Abyssal Legacy, "Red Dragon" the Red ancestry, "Fire Giant" the Fire's Burn (Fire Giant)).
    if (!fits.length && /subrace|lineage|subclass/.test(w.label)) {
      const GENERIC = new Set(["legacy", "ancestry", "lineage", "heritage", "dragon", "giant", "the", "of"]);
      const words = (t: string) => new Set(normalizeFull(t).split(" ").filter((x) => x && !GENERIC.has(x)));
      const want = words(w.alts?.[0] ?? w.name);
      const open = r.slots.filter((s) => s.chosen.length < s.rule.number && w.types.includes(s.rule.type));
      const near = open.flatMap((s) => s.options.filter((o) => { const ow = words(o.name.replace(/^.*?\((.+)\)$/, "$1")); return ow.size > 0 && [...ow].every((x) => want.has(x)) && [...want].every((x) => ow.has(x) || [...ow].some((y) => y.startsWith(x))); }));
      if (near.length === 1) fits = near;
    }
    const pool = fits.length ? fits : all;
    // The item's own edition when the file says (a 2014 spell on a 2024 character), else the character's.
    const sameEd = pool.filter((e) => isModern(e) === ((w.edition ?? this.edition ?? "2024") === "2024"));
    const list = fits.length ? (sameEd.length ? sameEd : pool) : primary(sameEd.length ? sameEd : pool);
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
    // A feat the background or species already gives (the 2024 Sage's Magic Initiate) is the one the file lists.
    if (el.type === "Feat") {
      // The Sage grants Magic Initiate (Wizard) as the feat's own part, ID_..._FEAT_MAGIC_INITIATE_WIZARD.
      const asPart = r.active.some((a) => a.el.type !== "Feat" && a.el.id.startsWith(`${el.id}_`)) && !r.active.some((a) => a.el.type === "Feat" && normalize(a.el.name) === normalize(el.name));
      const have = r.active.filter((a) => a.el.type === "Feat" && normalize(a.el.name) === normalize(el.name)).length + (asPart ? 1 : 0);
      if (have >= (this.featCount.get(normalize(w.name)) ?? 1)) {
        this.matched.push(`${el.name} (already granted)`);
        return ch;
      }
    }
    // Of the choices that can hold it: the one the file says it came from (Magic Initiate), then the narrowest, so an
    // Evocation Savant or a feat's list is not left empty while the class's own spells take everything.
    const from = w.from ? normalize(w.from) : "";
    // A prepared caster (a 2024 cleric, druid or paladin) chooses its prepared spells; Foundry lists the whole class
    // list as well. Only spells the file marks prepared go into those choices; the rest are simply the class list.
    // A class that prepares its spells: flagged so in the content, or any 2024 class (in the 2024 rules every
    // caster prepares; the content has them choose the prepared spells).
    const prepares = (e: { prepare?: boolean; owner: string } | undefined) => !!e && (!!e.prepare || isModern(this.reg.get(e.owner)));
    const isPrepareChoice = (s: (typeof r.slots)[number]) => {
      const e = s.rule.spellcasting ? r.spellcasting.get(s.rule.spellcasting.toLowerCase()) : undefined;
      return prepares(e) && !/spellbook/i.test(s.rule.name) && s.rule.type === "Spell" && Number(el.setters.level?.value ?? 0) > 0;
    };
    const filePrepared = this.prepared.has(normalize(el.name)) || !this.preparedKnown;
    const fits2 = r.slots.filter((s) => s.chosen.length < s.rule.number && s.options.some((o) => o.id === el.id) && (filePrepared || !isPrepareChoice(s)));
    // A wizard's spellbook holds more than the level-up picks (copied spells): those are kept, as additions.
    const spellbookOf = (e: { name: string }) => r.slots.some((s) => /spellbook/i.test(s.rule.name) && (s.rule.spellcasting ?? "").toLowerCase() === e.name.toLowerCase());
    const onClassList = el.type === "Spell" && [...r.spellcasting.values()].some((e) => prepares(e) && !spellbookOf(e) && e.lists.some((l) => el.supports.includes(l)));
    // A spell on the list of a class that prepares from its whole list (a cleric's, a druid's) needs no choice: it is
    // on the list already, and prepared (below, from the file's marks) if the file says so. Adding it by hand would
    // give the character a second copy outside the class.
    const leveled = Number(el.setters.level?.value ?? 0) > 0;
    if (!fits2.length && onClassList && (!filePrepared || (leveled && !this.deferring))) {
      this.matched.push(`${el.name} (on the class spell list)`);
      return ch;
    }
    const origin = (s: (typeof fits2)[number]) => (from && (normalize(s.owner.name).includes(from) || normalize(s.owner.id.replace(/_/g, " ")).includes(from) || normalize(s.rule.name).includes(from)) ? 0 : 1);
    // A spell the file says came from a feat whose choice is not open yet (the Magic Initiate list is picked later)
    // waits for it rather than filling the class's own spells.
    if (this.deferring && from && el.type === "Spell" && !fits2.some((s) => origin(s) === 0) && !/^(class|race|species|background)\b/.test(from) && !this.reg.ofType("Class").some((c) => normalize(c.name) === from)) {
      this.deferred.push(w);
      return ch;
    }
    const slot = [...fits2].sort((a, b) => origin(a) - origin(b) || a.options.length - b.options.length)[0];
    if (slot) {
      this.matched.push(`${el.name} (${w.label})`);
      return { ...ch, selections: { ...ch.selections, [slot.key]: [...slot.chosen, el.id] } };
    }
    if (el.type === "Spell" && this.deferring) {
      this.deferred.push(w);
      return ch;
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
  finish(importedScores: Partial<Record<AbilityId, number>>, opts: { scoresIncludeItems?: boolean; hpMax?: number; numbers?: FileNumbers } = {}): ForeignImport {
    this.scores = importedScores;
    let ch = this.ch;
    // Subclasses and lineages first, so the spell lists and granted spells they bring exist; then feats; then the
    // remaining non-spell choices; spells last, so spells a species or subclass already grants are not picked twice.
    // Cantrips come before the other choices too: invocations such as Agonizing Blast need Eldritch Blast.
    const cantrip = (w: { label: string; name: string }) => w.label === "spell" && findAllByName(this.reg, ["Spell"], w.name).some((e) => Number(e.setters.level?.value) === 0);
    // A spell a feat gives (Magic Initiate's) goes in with the cantrips too, before the open choices are filled, so
    // they see it is had and do not take another feat for it.
    const order = (w: { label: string; name: string; early?: boolean }) => (w.label === "subclass" ? 0 : /subrace|lineage/.test(w.label) ? 1 : w.label === "feat" ? 2 : cantrip(w) || w.early ? 3 : 4);
    const wanted = [...this.wantedChoices].sort((x, y) => order(x) - order(y));
    this.deferring = true;
    for (const w of wanted.filter((x) => order(x) < 4)) ch = this.place(ch, w);
    this.deferring = false;
    ch = this.fillOpen(ch, importedScores, true);
    for (const w of [...this.deferred, ...wanted.filter((x) => order(x) >= 4)]) ch = this.place(ch, w);
    // Fill what is still open from the file's skills, languages, tools and scores, then with defaults. Spells the
    // file does not list are left for the player to choose rather than guessed.
    ch = this.fillOpen(ch, importedScores, true);
    // What the file leaves open, as a to-do list: spells on the Magic tab, everything else on Build.
    const done = resolve(ch, this.reg);
    const todo = done.slots
      .filter((s) => stillToChoose(s, done))
      .map((s) => `${s.rule.type === "Spell" ? "Magic" : "Build"}: ${s.rule.name}, choose ${s.rule.number - s.chosen.length}`);
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
    return { character: ch, notes: this.notes, matched: this.matched, missing: this.missing, todo, differences: this.compare(ch, opts.numbers) };
  }
}

// ---------------------------------------------------------------- Foundry

const cap = (s: unknown) => (typeof s === "string" && s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const ABBR: Record<string, AbilityId> = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" };

const SKILL_NAMES = ["acrobatics", "animal handling", "arcana", "athletics", "deception", "history", "insight", "intimidation", "investigation", "medicine", "nature", "perception", "performance", "persuasion", "religion", "sleight of hand", "stealth", "survival"];

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
    // Where the item came from: dnd5e's 2024 packs end in 24 (spells24, feats24, origins24, classes24,
    // equipment24); Plutonium keeps the 5e.tools source code (XPHB for the 2024 handbook).
    const origin = String(it._stats?.compendiumSource ?? it.flags?.core?.sourceId ?? "");
    const pack = /Compendium\.dnd5e\.([a-z]+?)(24)?\./.exec(origin);
    if (pack) return pack[2] ? "2024" : "2014";
    const pluto = String(it.flags?.plutonium?.source ?? it.flags?.srd5e?.source ?? "");
    if (/^X(PHB|DMG|MM)$/.test(pluto)) return "2024";
    if (pluto) return "2014";
    const book = `${src.book ?? ""} ${src.custom ?? ""}`;
    if (/2024|XPHB|PHB'?24|SRD 5\.2/i.test(book)) return "2024";
    if (/\b(PHB|SRD 5\.1|XGE|TCE|TCoE|VGM|MPMM|SCAG|PHB'?14)\b/i.test(book)) return "2014";
    return undefined;
  };
  const votes = items.filter((it) => ["class", "subclass", "race", "background"].includes(it.type)).map(ruleOf).filter(Boolean);
  if (votes.length) b.edition = votes.filter((v) => v === "2024").length > votes.length / 2 ? "2024" : "2014";
  const subclasses: string[] = [];
  let speciesSet = false;
  // An item Soul Forge exported names its element (flags.soulforge.id): when the content has it, that is the one.
  const sfEl = (it: Json): AElement | undefined => { const id = it.flags?.soulforge?.id; return typeof id === "string" ? reg.get(id) : undefined; };
  for (const it of items) {
    const name = String(it.name ?? "");
    const isys: Json = it.system ?? {};
    if (!name) continue;
    switch (it.type as string) {
      case "class": {
        const own = sfEl(it);
        const el = own?.type === "Class" ? own : findByName(reg, ["Class"], name, ruleOf(it) ?? b.edition);
        if (el) {
          b.ch.classes.push({ classId: el.id, level: Math.max(1, Math.min(20, Number(isys.levels) || 1)) });
          b.matched.push(`${el.name} (class)`);
        } else b.missing.push(`${name} (class)`);
        break;
      }
      case "subclass": {
        const own = sfEl(it);
        subclasses.push(own?.type === "Archetype" ? own.name : name);
        break;
      }
      case "race": {
        // Exported by Soul Forge: the species and its lineages by id (flags.soulforge).
        const own = sfEl(it);
        if (own?.type === "Race") {
          b.ch.race = own.id;
          b.matched.push(`${own.name} (species)`);
          for (const id of (it.flags?.soulforge?.lineages ?? []) as string[]) { const l = reg.get(id); if (l) b.want(["Sub Race", "Race Variant", "Racial Trait"], l.name, "subrace or lineage", [], undefined, l.edition); }
          speciesSet = true;
          break;
        }
        // "Tiefling, Infernal" also names the legacy to choose.
        b.addName(name);
        speciesSet = b.setSpecies(name);
        if (!speciesSet) b.missing.push(`${name} (species)`);
        break;
      }
      case "background": {
        const own = sfEl(it);
        const el = own?.type === "Background" ? own : findByName(reg, ["Background"], name, ruleOf(it) ?? b.edition) ?? findByName(reg, ["Background"], name.replace(/^variant\s+/i, "").replace(/\s*\(.*\)\s*$/, ""), b.edition) ?? findByName(reg, ["Background"], /\((.*)\)/.exec(name)?.[1] ?? "", b.edition);
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
        const ownFeat = sfEl(it);
        if (ownFeat?.type === "Feat") b.want(["Feat"], ownFeat.name, "feat", [], undefined, ownFeat.edition);
        else if (kind === "feat" || (!kind && !trait)) b.want(["Feat", "Feat Feature", "Racial Trait", "Class Feature", "Archetype Feature"], name, "feat", [], undefined, ruleOf(it));
        else b.addName(name);
        break;
      }
      case "spell": {
        // Foundry 5 says where a spell came from: "class:wizard", "feat:magic-initiate", "race:gnome-rock".
        const origin = String(isys.sourceItem ?? "").replace(/^\w+:/, "").replace(/-/g, " ");
        b.want(["Spell"], name, "spell", [], origin || undefined, ruleOf(it));
        const prep = isys.prepared ?? isys.preparation?.prepared;
        // Spells a feature keeps prepared (mode "always", or prepared 2: oath and domain spells) and innate, pact or at-will spells do not
        // count against the prepared limit.
        const mode = String(isys.preparation?.mode ?? isys.method ?? "prepared");
        // Foundry 5 writes 1 for prepared and 2 for always prepared.
        if (prep !== undefined) b.preparedKnown = true;
        if ((prep === true || Number(prep) === 1) && /^(prepared|spell)$/.test(mode)) b.prepared.add(normalize(name));
        break;
      }
      case "weapon":
      case "equipment":
      case "consumable":
      case "tool":
      case "loot":
      case "container": {
        // The unarmed strike is part of every character, not an item; a quiver's compartments are parts of the quiver.
        if (/^unarmed strike$/i.test(name) || (isys.container && /\bcompartment$/i.test(name))) break;
        const equipped = !!(isys.equipped ?? isys.equipment?.equipped);
        const attuned = isys.attuned === true || isys.attunement === 2 || isys.attuned === 1;
        const magic = Number(isys.magicalBonus ?? isys.armor?.magicalBonus) || 0;
        // Foundry names the base item by its key: "dice" is the Dice Set, "thief" the thieves' tools.
        const baseKey = String(isys.type?.baseItem ?? "");
        b.addItem(name, Number(isys.quantity) || 1, equipped, attuned, { base: FTOOL[baseKey] ?? (baseKey || undefined), magic, edition: ruleOf(it) });
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
  for (const it of items) {
    if (it.type !== "class") continue;
    const adv = it.system?.advancement;
    for (const a of (Array.isArray(adv) ? adv : Object.values<Json>(adv ?? {})) as Json[]) if (a?.type === "AbilityScoreImprovement" && a.value?.type === "asi" && Object.keys(a.value?.assignments ?? {}).length) b.asiTaken++;
  }
  // The choices the class, species and background items record: "skills:ath", "tool:art:smith", "languages:exotic:draconic".
  for (const it of items) {
    const adv = it.system?.advancement;
    for (const a of (Array.isArray(adv) ? adv : Object.values<Json>(adv ?? {})) as Json[]) {
      if (a?.type !== "Trait") continue;
      for (const c of (a.value?.chosen ?? []) as string[]) {
        const [kind, ...rest] = String(c).split(":");
        const last = rest[rest.length - 1] ?? "";
        // Each pick also under the item that made it (the class, the background, a feat), for its own choices.
        // Under the item's name and the record's own title ("Elf, High" and "Keen Senses").
        const source = String(it.name ?? "");
        const title = String(a.title ?? a.name ?? "");
        // Expertise records are their own (a Rogue's Expertise is not its skill choice); mastery is a weapon matter.
        const mode = String(a.configuration?.mode ?? "default");
        if (kind === "skills" && FSKILL[last]) { b.hints.skills.add(FSKILL[last]); for (const src of [source, title]) { if (mode === "expertise") b.sourcedPick(src, "expertise", FSKILL[last]); else if (mode === "default") b.sourcedPick(src, "skills", FSKILL[last]); } }
        else if (kind === "languages") { b.addLanguage(FLANG[last] ?? last); for (const src of [source, title]) b.sourcedPick(src, "languages", FLANG[last] ?? last); }
        else if (kind === "tool") { b.hints.tools.add(FTOOL[last] ?? last); for (const src of [source, title]) b.sourcedPick(src, "tools", FTOOL[last] ?? last); }
        else if (kind === "saves" && ABBR[last]) b.hints.saves.add(ABBR[last]);
        else if (kind === "armor") b.hints.armor.add(({ lgt: "light", med: "medium", hvy: "heavy", shl: "shields" } as Record<string, string>)[last] ?? last);
        else if (kind === "weapon" && /^(sim|mar)$/.test(last)) b.hints.weapons.add(last === "sim" ? "simple" : "martial");
        // "weapon:mar:greataxe" names one weapon: a weapon mastery in the 2024 rules.
        else if (kind === "weapon" && rest.length === 2) b.hints.masteries.add(last.replace(/[^a-z]/g, ""));
      }
    }
  }
  for (const d of (sys.traits?.dr?.value ?? []) as string[]) b.hints.resist.add(String(d).toLowerCase());
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
  // What the file records as proficient, to compare with Soul Forge's (the generic "any artisan's tools" and
  // "any instrument" keys are left out: they do not say which).
  const numbers: FileNumbers = {
    hpMax: Number.isFinite(hpMax) && hpMax > 0 ? hpMax : undefined,
    skillLevels: Object.fromEntries(Object.entries(FSKILL).map(([k, name]) => [name, Number(sys.skills?.[k]?.value) || 0])),
    saveProficient: Object.entries(ABBR).filter(([k]) => Number(sys.abilities?.[k]?.proficient) >= 1).map(([, a]) => a),
    languages: [...b.hints.languages],
    tools: Object.entries<Json>(sys.tools ?? {}).filter(([k, t]) => Number(t?.value) >= 1 && FTOOL[k]).map(([k]) => FTOOL[k]),
  };
  return b.finish(scores, { scoresIncludeItems: false, hpMax: Number.isFinite(hpMax) && hpMax > 0 ? hpMax : undefined, numbers });
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
        if (f.spellprepared !== undefined) b.preparedKnown = true;
        if ((f.spellprepared === "1" || f.spellprepared === "on") && !extra) b.prepared.add(normalize(spell));
      }
      else if (section === "inventory" && f.itemname) {
        // Roll20 only saves the equipped box when it was changed from its default (ticked), so an item with no value
        // counts as worn when it is a weapon with an attack or armor that gives AC.
        const mods = f.itemmodifiers ?? "";
        const worn = f.equipped !== undefined ? f.equipped === "1" || f.equipped === "on" : f.hasattack === "1" || /Item Type:[^,]*(Armor|Shield)/i.test(mods);
        const magic = Number(/\b(?:AC|Attack(?: Bonus)?|Damage(?: Bonus)?)\s*\+(\d)/i.exec(mods)?.[1]) || 0;
        // Bonuses the sheet applies from this item ("Spell Attack +2, Spell DC +2"): a content item that needs
        // attunement is attuned, so its own rules apply; a custom item's bonuses become custom bonuses.
        const bonuses = itemBonuses(mods);
        const active = bonuses.length > 0 && f.equipped !== "0";
        b.addItem(f.itemname, Number(f.itemcount) || 1, worn || active, active, { magic, bonuses: active ? bonuses : [] });
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
  // The sheet's spell DC and attack modifiers add up its items' bonuses and anything typed in by hand. What the items
  // do not explain was typed in (a table ruling, a homebrew effect) and becomes a custom bonus.
  const itemSum = (stat: string) => [...(rows.get("inventory")?.values() ?? [])].filter((f) => f.equipped !== "0").flatMap((f) => itemBonuses(f.itemmodifiers ?? "")).filter((x) => x.stat === stat).reduce((t, x) => t + x.value, 0);
  for (const [attr, stat, label] of [["spell_dc_mod", "spellcasting:dc", "Spell save DC"], ["spell_attack_mod", "spellcasting:attack", "Spell attack"]] as const) {
    // A modifier the file does not store says nothing (it is not 0).
    if (val(attr) === "") continue;
    const typed = (Number(val(attr)) || 0) - itemSum(stat);
    if (typed) b.ch.customStats.push({ id: uid(), stat, value: typed, note: `${label} modifier typed into the Roll20 sheet` });
  }
  // AC modifier rows switched on in the Roll20 sheet (a table ruling, a homebrew effect) become custom bonuses.
  for (const f of rows.get("acmod")?.values() ?? []) {
    const v = Number(f.global_ac_val);
    if (f.global_ac_active_flag === "1" && Number.isFinite(v) && v !== 0) b.ch.customStats.push({ id: uid(), stat: "ac:misc", value: v, note: `${f.global_ac_name || "AC modifier"} (from the Roll20 sheet)` });
  }
  // The sheet's own results, to compare with Soul Forge's. Roll20 saves them as the sheet last worked them out.
  const n = (k: string) => { const v = Number(String(flat.get(k)?.current ?? "").replace(/^\+/, "")); return String(flat.get(k)?.current ?? "").trim() !== "" && Number.isFinite(v) ? v : undefined; };
  const numbers: FileNumbers = {
    ac: n("ac"), hpMax: Number.isFinite(hpMax) && hpMax > 0 ? hpMax : undefined, proficiency: n("pb"),
    spellDc: n("spell_save_dc"), spellAttack: n("spell_attack_bonus"), passivePerception: n("passive_wisdom"),
    saves: Object.fromEntries(ABILITY_IDS.map((a) => [a, n(`${a}_save_bonus`)]).filter(([, v]) => v !== undefined)),
    skills: Object.fromEntries(SKILLS.map((k) => [k.replace(/_/g, " "), n(`${k}_bonus`)]).filter(([, v]) => v !== undefined)),
  };
  // A caster's DC and attack only mean something when the character casts.
  return b.finish(scores, { hpMax: Number.isFinite(hpMax) && hpMax > 0 ? hpMax : undefined, numbers });
}

// ---------------------------------------------------------------- FastCharacter

/** True for the text of a FastCharacter (fastcharacter.com) sheet. */
export function isFastCharacterText(text: string): boolean {
  return /fastcharacter\.com/i.test(text) && /Class & Level:/.test(text);
}

/**
 * FastCharacter's own spellings, to the books': "Duelling" is the Dueling style, "Cthonic" the Chthonic tiefling,
 * "Drudic" Druidic, "Thamaturge" the Thaumaturge order; its metamagic drops the "-ed" ("Heighten Spell" is
 * Heightened Spell).
 */
const FC_SPELLING: Record<string, string> = {
  duelling: "Dueling", cthonic: "Chthonic", drudic: "Druidic", thamaturge: "Thaumaturge",
  "heighten spell": "Heightened Spell", "quicken spell": "Quickened Spell", "extend spell": "Extended Spell", "twin spell": "Twinned Spell", "empower spell": "Empowered Spell",
};
const fcSpell = (s: string) => s.replace(/\b(duelling|cthonic|drudic|thamaturge|(?:heighten|quicken|extend|twin|empower) spell)\b/gi, (w) => FC_SPELLING[w.toLowerCase()] ?? w);

/**
 * A FastCharacter sheet (the text format of fastcharacter.com's 2024 generator, saved as text or HTML text). It
 * names the species, class, subclass, background, feats, trainings and spells, and states the numbers it worked
 * out, which become the answer key the import compares against.
 */
export function importFastCharacter(text: string, reg: ARegistry): ForeignImport {
  const b = new Importer(reg);
  b.edition = /PHB 2024/.test(text) ? "2024" : "2014";
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const field = (label: string) => fcSpell(lines.find((l) => l.startsWith(`${label}:`))?.slice(label.length + 1).trim() ?? "");
  b.ch.name = field("Name");
  b.ch.info.alignment = field("Alignment");
  const xp = Number(field("Experience").replace(/[^\d]/g, ""));
  if (xp > 0) b.ch.xp = xp;

  // Class & Level: "Druid 17 (Circle of the Sea)".
  const cl = /^(.+?)\s+(\d+)\s*(?:\((.+)\))?$/.exec(field("Class & Level"));
  const featureNames = new Set<string>();
  if (cl) {
    const cls = classByFeatures(reg, cl[1], featureNames, b.edition);
    if (cls) { b.ch.classes.push({ classId: cls.id, level: Math.min(20, Number(cl[2])) }); b.matched.push(`${cls.name} (class)`); }
    else b.missing.push(`${cl[1]} (class)`);
    if (cl[3]) b.want(["Archetype"], cl[3], "subclass");
  }
  // Species: "Orc", "Wood Elf", "Tiefling (Abyssal)", "Goliath (Hill Giant Ancestry)", "Dragonborn (Red Dragon Ancestry)".
  let sp = field("Race/Ancestry/Heritage");
  const anc = /^(.+?)\s*\((.+?)\s+ancestry\)$/i.exec(sp);
  if (anc) sp = `${anc[1]} (${anc[2]})`;
  const lead = /^(\w+)\s+(elf|gnome|dwarf|halfling)$/i.exec(sp);
  if (lead) sp = `${lead[2]}; ${sp}`;
  if (sp && !b.setSpecies(sp)) b.missing.push(`${sp} (species)`);
  const bgName = field("Background");
  const bg = findByName(reg, ["Background"], bgName, b.edition);
  if (bg) { b.ch.background = bg.id; b.matched.push(`${bg.name} (background)`); } else if (bgName) { b.missing.push(`${bgName} (background)`); b.customBackground(); }

  // Ability scores ("Strength 10") and the numbers FastCharacter worked out.
  const scores: Partial<Record<AbilityId, number>> = {};
  const saves: Partial<Record<AbilityId, number>> = {};
  const skills: Record<string, number> = {};
  const skillLevels: Record<string, number> = {};
  const saveProficient: AbilityId[] = [];
  for (const l of lines) {
    let m = /^(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) (\d+)$/.exec(l);
    if (m) scores[m[1].toLowerCase() as AbilityId] = Number(m[2]);
    m = /^([+-]\d+) \.\.\. (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throws( \*)?$/.exec(l);
    if (m) { const a = m[2].toLowerCase() as AbilityId; saves[a] = Number(m[1]); if (m[3]) { saveProficient.push(a); b.hints.saves.add(a); } }
    m = /^([+-]\d+) \.\.\. (.+?) Skill\s*(\*{1,2})?$/.exec(l);
    if (m) {
      const k = m[2].toLowerCase();
      skills[k] = Number(m[1]);
      skillLevels[k] = m[3]?.length === 2 ? 2 : m[3] ? 1 : 0;
      if (m[3]) b.hints.skills.add(k);
      if (m[3]?.length === 2) b.hints.expertise.add(k);
    }
  }
  const num = (re: RegExp) => { for (const l of lines) { const m = re.exec(l); if (m) return Number(m[1].replace(/,/g, "")); } return undefined; };

  // Feats: "Lucky Feat [PHB 2024, p. 201]: ..." and the fighting style, "Fighting Style: Duelling [PHB 2024, p. 209]".
  // The sheet repeats a feature's line where it is used (a fighting style under the feats and the class); each feat
  // counts once. A style without a page reference ("Fighting Style: Protection. Use reaction...") is one too.
  const featsSeen = new Set<string>();
  const feat = (types: string[], name: string) => { const k = normalize(name); if (featsSeen.has(k)) return; featsSeen.add(k); b.want(types, name, "feat"); };
  for (const l of lines) {
    let m = /^(.+?) Feat \[/.exec(l);
    if (m) feat(["Feat"], fcSpell(m[1]));
    m = /^Fighting Style: ([A-Za-z' -]+?)\s*[.[:]/.exec(l);
    if (m) feat(["Feat", "Class Feature", "Archetype Feature"], fcSpell(m[1]));
    m = /^• Weapon Mastery \(([^)]+)\)$/.exec(l);
    if (m && !/\d+ weapons/.test(m[1])) for (const w of m[1].split(",")) b.hints.masteries.add(w.trim().toLowerCase().replace(/[^a-z]/g, ""));
    // Class and species features by name ("• Primal Order (Warden)"): they settle the choices that offer them.
    m = /^• ([^(:]+?)(?: \(([^)]*)\))?$/.exec(l);
    if (m) { b.addName(fcSpell(m[1])); if (m[2] && !/\d/.test(m[2])) b.addName(fcSpell(m[2])); }
    // "• Divine Order: Thaumaturge (...)" names the option taken; "• Hunter's Prey: Colossus Slayer (...) or Horde
    // Breaker (...)" only lists the options, so it settles nothing.
    m = /^• ([^(:]+?): ([^(]+?)(?: \(.*)?$/.exec(l);
    if (m && !/\bor\b/.test(l.replace(/\([^)]*\)/g, ""))) b.addName(fcSpell(`${m[1]}: ${m[2]}`));
  }
  // Trainings and languages, as the sheet lists them.
  const list = (label: string) => fcSpell(lines.find((l) => l.startsWith(`• ${label}:`))?.slice(label.length + 3).trim() ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  for (const t of list("Tools")) b.hints.tools.add(t.replace(/^gaming set \((.+)\)$/i, "$1").replace(/^musical instrument \((.+)\)$/i, "$1").toLowerCase());
  for (const a of list("Armor")) b.hints.armor.add(a.toLowerCase().replace(/ armor$/, "").replace(/^shields$/, "shield"));
  for (const w of list("Weapons")) b.hints.weapons.add(w.toLowerCase().split(" ")[0]);
  const languages = list("Languages");
  for (const l of languages) b.addLanguage(l);

  // Spells a feat gives, named only in its text: "Magic Initiate (Druid) [...]: Know the Produce Flame and Guidance
  // cantrips, and can cast Cure Wounds once betw. long rests."
  for (const l of lines) {
    const m = /\b[Kk]now (?:the )?(.+?) cantrips?\b(?:, and can cast\s+(.+?) once\b)?/.exec(l);
    if (!m) continue;
    const from = /^(.+?)\s*(?:\[|:)/.exec(l)?.[1].replace(/\s*\(.*$/, "");
    for (const name of [...m[1].split(/,\s*|\s+and\s+/), ...(m[2] ? m[2].split(/\s+and\s+/) : [])].map((x) => x.trim()).filter(Boolean)) b.want(["Spell"], fcSpell(name), "spell", [], from, undefined, true);
  }

  // Spells: every one listed is known or prepared (FastCharacter lists the prepared spells).
  b.preparedKnown = true;
  for (const l of lines) {
    const m = /^(?:Cantrips Known|\d+(?:st|nd|rd|th) Level \(\d+ slots?\)): (.+)$/.exec(l);
    if (!m) continue;
    for (const raw of m[1].split(",")) {
      const name = raw.trim();
      if (!name || /^none$/i.test(name)) continue;
      b.want(["Spell"], name, "spell");
      b.prepared.add(normalize(name));
    }
  }

  // Equipment: the armor worn is equipped; carried gear and magic items are carried, attuned when marked "(a)".
  const worn = /^Armor Class \d+ \.\.\. Armor worn: (.+)$/.exec(lines.find((l) => /^Armor Class \d+ \.\.\./.test(l)) ?? "")?.[1] ?? "";
  for (const w of worn.split(",").map((x) => x.trim()).filter((x) => x && !/^none\b/i.test(x))) b.addItem(w.replace(/^wooden /, ""), 1, true, false);
  const gear = /^Carried Gear[^:]*:\s*(.+)$/.exec(lines.find((l) => l.startsWith("Carried Gear")) ?? "")?.[1] ?? "";
  // Commas inside brackets belong to a pack's contents; the load note at the end is not an item.
  let depth = 0, cur = "";
  const items: string[] = [];
  for (const ch of gear.replace(/\(This load.*$/, "")) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { items.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) items.push(cur.trim().replace(/\.$/, ""));
  const wornNames = new Set(worn.split(",").map((x) => normalize(x.replace(/^wooden /, ""))));
  for (const it of items) {
    // A pack's contents in brackets go; a count in brackets stays for the item reader ("ammunition: arrows (20)").
    const clean = it.replace(/\s*\((?!\d+\)$)[^)]*\)\s*$/, "").replace(/^(?:set of)\s+/i, "").trim();
    const qty = 1;
    if (!clean || wornNames.has(normalize(clean))) continue;
    const pair = /^(.+?) and (\d+ .+)$/.exec(clean);
    if (pair) { b.addItem(pair[1], qty, false, false); b.addItem(pair[2], 1, false, false); continue; }
    b.addItem(clean, qty, false, false);
  }
  let inMagic = false;
  for (const l of lines) {
    if (/^Magic Items/.test(l)) { inMagic = true; continue; }
    if (inMagic && !l.startsWith("•")) inMagic = false;
    if (!inMagic) continue;
    const name = l.replace(/^•\s*/, "");
    const attuned = /\(a\)$/.test(name);
    b.addItem(name.replace(/\s*\(a\)$/, "").replace(/\s*\([^)]*\)$/, "").replace(/\bmagic\s+/i, ""), 1, attuned, attuned);
  }
  // Coins: "32,505 gold pieces (gp);".
  for (const [k, word] of [["gp", "gold"], ["sp", "silver"], ["cp", "copper"], ["ep", "electrum"], ["pp", "platinum"]] as const) {
    const v = num(new RegExp(`^([\\d,]+) ${word} pieces`));
    if (v) b.ch.coins[k] = v;
  }

  const numbers: FileNumbers = {
    ac: num(/^Armor Class (\d+) \.\.\./),
    hpMax: num(/^(\d+) hit points \.\.\./),
    proficiency: num(/^• Proficiency Bonus: \+(\d+)$/),
    spellDc: num(/^Spell Save DC (\d+)$/),
    spellAttack: num(/^Spell Attack Modifier \+(\d+)$/),
    passivePerception: num(/^(\d+) \.\.\. Passive Perception$/),
    initiative: num(/^([+-]\d+) \.\.\. Initiative Modifier$/),
    speed: num(/^(\d+) ft\. Speed \.\.\./),
    saves, skills, skillLevels, saveProficient,
    languages: languages.filter((l) => !/^any/i.test(l)),
    tools: list("Tools").map((t) => t.replace(/^gaming set \((.+)\)$/i, "$1").replace(/^musical instrument \((.+)\)$/i, "$1")),
    attacks: lines.map((l) => /^(.+?)\. (?:Melee|Ranged|Melee or Ranged) Weapon Attack: ([+-]\d+) to hit/.exec(l)).filter(Boolean).map((m) => ({ name: m![1], bonus: Number(m![2]) })),
  };
  return b.finish(scores, { numbers });
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
