/**
 * Checks a built character against the rules from an independent source, so the builder cannot pass its own
 * mistakes: the class tables (hit dice, saving throws, spell slots, cantrips, prepared spells, feat levels,
 * multiclass requirements, features by level) come from the 5e.tools class data (scripts/rules-cache.mjs), and the
 * rest (proficiency bonus, hit points, armor class, attack bonuses, armor and hands) are written out here from the
 * Player's Handbooks. Every finding names the rule it breaks.
 */
import { BACKGROUND_ASI_MARKER } from "../engine/backgroundOptions";
import { conceptOf } from "../engine/concepts";
import { choiceEdition, editionOfElement, offeredAcrossEditions } from "../engine/editionPolicy";
import { bookKey } from "./books";
import type { Resolved } from "./engine";
import { preparePool, weaponAbilityFits, weaponAbilityOptions, type SheetData } from "./sheet";
import type { AElement } from "./types";
import { ABILITY_IDS, type AbilityId, type Character } from "./character";
import { normalizeRules, spent as pbSpent } from "./pointBuy";
import { meets } from "./requirements";
import { reqCtx, resolve, stillToChoose } from "./engine";
import { isModern } from "./edition";

export interface RefFeature {
  name: string;
  level: number;
  optional?: boolean;
  subclass?: boolean;
}
export interface RefBackground {
  name: string;
  source: string;
  edition: "classic" | "one";
  skills: number[];
  tools: number[];
  languages: number[];
}
export interface RefClass {
  name: string;
  source: string;
  edition: "classic" | "one";
  hd: number;
  saves: AbilityId[];
  caster: string | null;
  cantrips: number[] | null;
  prepared: number[] | null;
  preparedFormula: string | null;
  known: number[] | null;
  slots: number[][] | null;
  pact: { slots: number[]; level: number[] } | null;
  features: RefFeature[];
  subclassLevel: number | null;
  /** The class table's other columns by label, one entry per level (uses, bonuses, dice). Older references lack it. */
  counters?: Record<string, (number | string | null)[]>;
  /** What the class trains at first level (5e.tools startingProficiencies). */
  startArmor?: string[];
  startWeapons?: string[];
  /** Single weapons the class trains by name ("longsword"), and the properties it trains martial weapons by. */
  startWeaponNames?: string[];
  startMartialWith?: string[];
  startTools?: string[];
  /** Skills and tools by count: at first level, and gained by multiclassing into the class (`from` null: any skill). */
  startSkills?: { count: number; from: string[] | null };
  mcSkills?: { count: number; from: string[] | null };
  startToolCounts?: number[];
  mcToolCounts?: number[];
  /** On the first entry only: what each background trains by count (each alternative's count). */
  backgrounds?: RefBackground[];
  /** On the first entry only: what each species and subrace trains by count. */
  species?: (RefBackground & { base: string })[];
  asiLevels: number[];
  epicBoon: number | null;
  multiclass: Partial<Record<AbilityId, number>> | null;
  multiclassOr: Partial<Record<AbilityId, number>>[] | null;
  primaryAbility: AbilityId[][] | null;
  subclasses: {
    name: string;
    shortName: string;
    source: string;
    caster: string | null;
    features: RefFeature[];
    /** Always-prepared spells by class level, lower case (rulesRef.ts preparedSpells). */
    spells?: Record<string, string[]> | null;
  }[];
}

export interface Finding {
  rule: string;
  detail: string;
  /** The one safe answer, when there is one (E3.1): applied with applyFix (findingFix.ts). */
  fix?: FindingFix;
}

/**
 * A feat the character may take more than once: the content says so ("allow duplicate"), the text does ("you can take
 * this feat more than once", the 2024 Magic Initiate with another spell list), or the content gives repeat copies
 * (Aurora's Magic Initiate_2). Judged by name, as "Same feat twice" counts feats across providers.
 */
export function featRepeatable(reg: Resolved["reg"], name: string): boolean {
  if (/repeatable|elemental adept|ability score improvement/i.test(name)) return true;
  return reg
    .ofType("Feat")
    .some(
      (f) =>
        f.name === name &&
        (!!f.setters["allow duplicate"] ||
          /_\d+$/.test(f.id) ||
          /(?:take|select|choose) this feat more than once|more than once\b/i.test(f.description ?? "")),
    );
}

/** The element a saved choice key belongs to: "<id>#<hash>", or "<id>|<n>" from before stable keys. */
export const choiceBase = (key: string) => key.replace(/[#|].*$/, "");

/** Kinds of element that make up the build; a choice saved under one the character lacks has no place (W2). */
const BUILD_KIND =
  /^(Class|Archetype|Race|Sub Race|Background|Feat|Feat Feature|Class Feature|Archetype Feature|Racial Trait|Background Feature|Ability Score Improvement)$/;

/**
 * Saved choices with no place on the character (W2): under an element of the build that the character does not have,
 * even at level 20 in each class (so a character levelled down keeps the picks of the levels to come back). Never an
 * item's (unequipped or unattuned, it waits), an option's switched off, or one whose content is not loaded.
 */
export function noPlaceKeys(ch: Character, r: Resolved): string[] {
  const away = Object.keys(ch.selections).filter((k) => {
    const el = r.reg.get(choiceBase(k));
    return (ch.selections[k] ?? []).length && !!el && BUILD_KIND.test(el.type) && !r.ids.has(el.id) && !ch.options.includes(el.id);
  });
  if (!away.length) return [];
  const full = resolve({ ...ch, classes: ch.classes.map((c) => ({ ...c, level: 20 })) }, r.reg);
  return away.filter((k) => !full.ids.has(choiceBase(k)));
}

/** Take picks out of a choice (it opens again for the player), or keep only its first `keep` picks. */
export interface FindingFix {
  label: string;
  slot: string;
  /** What the choice holds now, however it was saved (an older file keeps picks under an older key). */
  picks: string[];
  /** Saved choices to forget (picks with no place on the character, W2). */
  clear?: string[];
  remove?: string[];
  keep?: number;
}

const lc = (s: string) => s.toLowerCase();
const norm = (s: string) =>
  lc(s)
    .replace(/^\s*level\s+\d+\s*:\s*/, "")
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const FULL = [
  [],
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];
/** Eldritch Knight and Arcane Trickster slots by class level (their own table, not the full caster one). */
const THIRD: number[][] = [
  [],
  [],
  [],
  [2],
  [3],
  [3],
  [3],
  [4, 2],
  [4, 2],
  [4, 2],
  [4, 3],
  [4, 3],
  [4, 3],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 1],
];
function edits(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const prof = (level: number) => 2 + Math.floor((Math.max(1, level) - 1) / 4);

/** Base armor from the equipment tables (2014 and 2024 agree). Dex cap: undefined = full, 0 = none. */
const ARMOR: [RegExp, number, number | undefined, number?][] = [
  [/^padded/i, 11, undefined],
  [/^leather/i, 11, undefined],
  [/^studded/i, 12, undefined],
  [/^hide/i, 12, 2],
  [/^chain shirt/i, 13, 2],
  [/^scale/i, 14, 2],
  [/^breastplate/i, 14, 2],
  [/^half.?plate/i, 15, 2],
  [/^ring/i, 14, 0],
  [/^chain mail/i, 16, 0, 13],
  [/^splint/i, 17, 0, 15],
  [/^plate/i, 18, 0, 15],
];

/** Which reference class a class element is: same name, same edition. */
/** Playtest material (Unearthed Arcana): the rules reference holds the published books only. */
const isPlaytest = (el: AElement) => /unearthed arcana|playtest/i.test(el.source);

export function refFor(ref: RefClass[], cls: AElement): RefClass | undefined {
  // A playtest class is not the published one of the same name (the 2017 Artificer is not Tasha's).
  if (isPlaytest(cls)) return undefined;
  const name = cls.name.replace(/\s*\(.*\)$/, "");
  const same = ref.filter((c) => lc(c.name) === lc(name));
  return same.find((c) => (c.edition === "one") === isModern(cls)) ?? same[0];
}

/** A feat's category as either provider tags it: Origin, General, Fighting Style, Epic Boon; "" for none (2014). */
function featCategory(e: AElement): string {
  const t = e.supports.map((x) => x.toLowerCase());
  if (t.includes("origin") || t.includes("category o")) return "origin";
  if (t.some((x) => /fighting style$/.test(x)) || t.some((x) => /^category fs/.test(x))) return "fighting style";
  if (t.includes("epic boon") || t.includes("category eb")) return "epic boon";
  if (t.includes("general") || t.includes("category g")) return "general";
  return "";
}

/**
 * Every choice window, not only the finished character: what each open choice offers must be something the rules
 * let the character take there. Checked apart from the code that builds the lists, so a filter, a content rule or a
 * flow that lets an illegal option through shows up even when no test happens to pick it.
 */
export function checkChoiceWindows(r: Resolved): Finding[] {
  const out: Finding[] = [];
  const add = (rule: string, detail: string) => out.push({ rule, detail });
  const vname = (n: string) =>
    n
      .toLowerCase()
      .replace(/[’‘`]/g, "'")
      .replace(/\s*\((?:20\d\d|legacy|2014|2024)\)\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
  for (const s of r.slots) {
    if (s.rule.type === "List") continue;
    const open = s.options.filter((o) => !s.blocked.has(o.id));
    // Edition: a 2014 choice offers no 2024 option; no choice offers the other edition's version of an option.
    const ed = choiceEdition(s.owner, s.root, r.character, r.reg);
    if (ed !== "none") {
      const own = new Set(open.filter((o) => editionOfElement(o) === ed).map((o) => `${o.type}|${vname(o.name)}`));
      for (const o of open) {
        const oe = editionOfElement(o);
        if (oe === "none" || oe === ed) continue;
        if (offeredAcrossEditions(o)) continue;
        if (ed === "2014") add("Choice offers a 2024 option to a 2014 choice", `${s.rule.name}: ${o.name} (${o.source})`);
        else if (own.has(`${o.type}|${vname(o.name)}`))
          add("Choice offers both versions of an option", `${s.rule.name}: ${o.name} (${o.source})`);
      }
    }
    // The same element of the same book twice.
    const seen = new Map<string, string>();
    for (const o of open) {
      const k = `${o.type}|${vname(o.name)}|${bookKey(o.source)}`;
      // A copy picked here beside the next free one is a repeat the choice has room for, not a duplicate.
      const prev = seen.get(k);
      if (prev && prev !== o.id && !(s.chosen.includes(prev) || s.chosen.includes(o.id)))
        add("Choice offers one option twice", `${s.rule.name}: ${o.name} (${o.source})`);
      if (!prev || !s.chosen.includes(prev)) seen.set(k, o.id);
    }
    // Feat categories: an origin feat choice offers origin feats, a fighting style choice fighting styles.
    if (s.rule.type === "Feat") {
      const want = /origin feat/i.test(s.rule.name) ? "origin" : /fighting style/i.test(s.rule.name) ? "fighting style" : "";
      if (want)
        for (const o of open) {
          const c = featCategory(o);
          if (c && c !== want) add("Choice offers a feat of another category", `${s.rule.name}: ${o.name} is ${c}`);
        }
    }
    // Spells: none above what the character can cast with the choice's spellcasting.
    // Only choices bounded by the spell slots: one of a stated level (Mystic Arcanum: level 6) is above them by design.
    if (s.rule.type === "Spell" && s.rule.spellcasting && /\$\(spellcasting:slots\)/.test(s.rule.supports)) {
      const key = s.rule.spellcasting.toLowerCase();
      let max = 0;
      for (let n = 1; n <= 9; n++) if (r.stats.get(`${key}:spellcasting:slots:${n}`) > 0) max = n;
      max = Math.max(max, r.stats.get(`${key}:spellcasting:slot`));
      if (max > 0)
        for (const o of open) {
          const lv = Number(o.setters.level?.value ?? 0);
          if (lv > max) add("Choice offers a spell above what can be cast", `${s.rule.name}: ${o.name} (level ${lv}, max ${max})`);
        }
    }
    // A required choice always offers something. Options the character's own build rules out (a Wizard's Scholar
    // expertise without any of its skills) leave it asking for nothing, as stillToChoose says for the whole app: by the
    // rules the feature then does nothing. Only a choice with no options at all is a hole in the content.
    if (!s.rule.optional && s.chosen.length < s.rule.number && s.options.length === 0)
      add("A required choice has nothing to take", `${s.rule.name} [${s.rule.type}]`);
  }
  return out;
}

/**
 * A skill, tool or language picked in this choice that the character already has from elsewhere counts once: the pick
 * is wasted and the character ends up a proficiency short (issue #3: Perception from Skillful and the Ranger).
 * Only when something new was left to pick: a Fighter taking Weapon Master already has every weapon, so any pick repeats.
 * Shared with the auto-fill, so a later pick (a feat taken at level 12) cannot undo an earlier one (Expertise at 9).
 */
export function repeatedPicks(r: Resolved, s: Resolved["slots"][number]): string[] {
  const out: string[] = [];
  // By concept as well as by id (W6): Aurora's Insight picked where a 5e.tools background grants 5e.tools' Insight is
  // one skill twice. The pick's own grants (an option that gives the skill) and its choice's owner do not count.
  const held = new Map<string, (typeof r.active)[number][]>();
  for (const a of r.active) {
    const c = conceptOf(a.el);
    if (c) held.set(c, [...(held.get(c) ?? []), a]);
  }
  const hadElsewhere = (id: string) => {
    const same = r.active.find((a) => a.el.id === id);
    if (same && same.from && same.from !== s.owner.id) return same.from;
    // Only a plain training: an option that gives more than the repeated part (Blessings of Knowledge: History with its
    // expertise) is not wasted when the character already has the proficiency (a moved Knowledge cleric lost it).
    const el = r.reg.get(id);
    const plain =
      !!el && (el.type === "Proficiency" || el.type === "Language") && !el.rules.some((x) => x.kind === "grant" || x.kind === "select");
    const c = plain ? conceptOf(el!) : undefined;
    const other = c
      ? held.get(c)?.find((a) => a.el.id !== id && a.from && a.from !== id && a.from !== s.owner.id && !s.chosen.includes(a.from))
      : undefined;
    return other?.from;
  };
  const hasOther = s.options.some((o) => !s.chosen.includes(o.id) && !s.blocked.has(o.id) && !r.ids.has(o.id) && !hadElsewhere(o.id));
  if ((s.rule.type === "Proficiency" || s.rule.type === "Language") && hasOther) {
    for (const id of s.chosen) {
      const from = hadElsewhere(id);
      if (from)
        out.push(`${s.rule.name}: ${r.reg.get(id)?.name} (already from ${r.reg.get(from)?.name ?? "another choice"}); choose another`);
    }
  }
  // A spell already learned in an earlier choice (a Songbook at level 1 and again at level 3): the same owner grants
  // both, so the check above cannot see it; the earlier choice keeps it, this one is the repeat.
  if (s.rule.type === "Spell" && hasOther) {
    const at = r.slots.indexOf(s);
    for (const id of s.chosen) {
      const earlier = r.slots.slice(0, at).find((o) => o.rule.type === "Spell" && o.key !== s.key && o.chosen.includes(id));
      if (earlier)
        out.push(
          `${s.rule.name}: ${r.reg.get(id)?.name} (already learned in ${earlier.rule.name}${earlier.rule.level ? ` at level ${earlier.rule.level}` : ""}); choose another`,
        );
    }
  }
  return out;
}

/**
 * The traits that rule out body armor (the Tortle's shell: "You can't wear light, medium, or heavy armor", with a
 * natural armor class that counts only unarmored), and that armor class. Shared by the rules check and the auto-equip,
 * which put armor on a Tortle and lowered its AC.
 */
export function noBodyArmor(r: Resolved): { name: string; unarmored: number }[] {
  const out: { name: string; unarmored: number }[] = [];
  for (const a of r.active) {
    const text = (a.el.description ?? "").replace(/<[^>]+>/g, " ");
    if (!/can(?:'|’)?t wear (?:light, medium, or heavy |any )?armor|cannot wear (?:light, medium, or heavy |any )?armor/i.test(text))
      continue;
    const calc = a.el.rules.find(
      (x) => x.kind === "stat" && x.name === "ac:calculation" && /armor:any|armor:none/.test(String(x.equipped ?? "")),
    );
    if (!calc || calc.kind !== "stat") continue;
    out.push({ name: a.el.name, unarmored: r.stats.get(calc.value) });
  }
  return out;
}

export function checkCharacter(r: Resolved, sh: SheetData, ref: RefClass[]): Finding[] {
  const out: Finding[] = [...checkChoiceWindows(r)];
  const add = (rule: string, detail: string, fix?: FindingFix) => out.push(fix ? { rule, detail, fix } : { rule, detail });
  const ch = r.character;
  const reg = r.reg;
  const names = new Set(r.active.map((a) => norm(a.el.name)));
  // Content spells some names differently ("Persistant Rage"): a name one or two letters off still counts.
  // Channel Divinity options are named with or without the "Channel Divinity:" prefix. A subclass can replace a
  // feature with its own version ("Wild Shape Feature Replacement", "Animal and Nature Speaker"), which counts too.
  const cd = (x: string) => x.replace(/^channel divinity /, "");
  const short = new Set([...names].map(cd));
  // Features the content names differently from 5e.tools (the 2024 Light Domain's "Improved Flare").
  const ALIAS: Record<string, string> = { [norm("Improved Warding Flare")]: norm("Improved Flare") };
  const near = (want0: string) => {
    const want = ALIAS[cd(want0)] ?? cd(want0);
    if (short.has(want) || short.has(cd(want0))) return true;
    if ([...short].some((n) => Math.abs(n.length - want.length) <= 2 && edits(n, want) <= 2)) return true;
    if (want.length >= 8 && [...short].some((n) => n.includes(want) || n === `${want} feature replacement`)) return true;
    return false;
  };
  const level = ch.classes.reduce((n, c) => n + c.level, 0);
  const score = (a: AbilityId) => sh.abilities.find((x) => x.id === a)!;
  // An ability the sheet does not know (content naming a spellcasting ability another way) is NaN, not a crash.
  const mod = (a: AbilityId) => sh.abilities.find((x) => x.id === a)?.mod ?? NaN;

  const sameChoice = (x: (typeof r.slots)[number]) => `${x.owner.id}|${x.rule.type}|${x.rule.name}|${x.rule.spellcasting ?? ""}`;
  const offered = new Map<string, Set<string>>();
  const offeredBy = (x: (typeof r.slots)[number]) => {
    const k = sameChoice(x);
    let set = offered.get(k);
    if (!set) {
      set = new Set(r.slots.filter((y) => sameChoice(y) === k).flatMap((y) => y.options.map((o) => o.id)));
      offered.set(k, set);
    }
    return set;
  };
  // W2: picks saved under something the character does not have, at any level of its classes (a class or species
  // since changed, a feat taken back): shown, never silently ignored, and clearable.
  {
    const gone = noPlaceKeys(ch, r);
    const picks = gone.flatMap((k) => ch.selections[k] ?? []).map((id) => reg.get(id)?.name ?? id);
    if (gone.length)
      add(
        "Earlier choices with no place now",
        `${picks.length} pick${picks.length === 1 ? "" : "s"} from ${[...new Set(gone.map((k) => reg.get(choiceBase(k))?.name ?? choiceBase(k)))].join(", ")}, which the character no longer has: ${picks.join(", ")}`,
        { label: "Clear them", slot: "", picks: [], clear: gone },
      );
  }
  // Completeness: every choice the rules ask for is made, none is impossible, nothing points at missing content.
  for (const s of r.slots) {
    // More picks saved than the choice allows (an edited or merged file; found 2026-11-17 by the mutation test, which
    // put a third skill in a choice of two and the check saw nothing). The engine takes the first ones and ignores the
    // rest without a word; the player is told which (W2: picks with no place are shown, not ignored).
    const saved = [...new Set(ch.selections[s.key] ?? [])];
    if (s.rule.type !== "List" && saved.length > s.rule.number)
      add(
        "A choice holds more than it allows",
        `${s.rule.name}: ${saved.length} of ${s.rule.number}; ignored ${saved
          .slice(s.rule.number)
          .map((id) => reg.get(id)?.name ?? id)
          .join(", ")}`,
        { label: `Keep the first ${s.rule.number}`, slot: s.key, picks: saved, keep: s.rule.number },
      );
    if (s.rule.optional) continue;
    if (!s.options.length) add("A required choice has no options", `${s.rule.name} [${s.rule.type}]`);
    else if (stillToChoose(s, r)) add("A required choice is not made", `${s.rule.name}: ${s.chosen.length} of ${s.rule.number}`);
    const takeOut = (id: string): FindingFix => ({
      label: `Take ${reg.get(id)?.name ?? "it"} out`,
      slot: s.key,
      picks: [...s.chosen],
      remove: [id],
    });
    for (const id of s.chosen)
      if (s.blocked.has(id)) add("A choice does not meet its requirements", `${s.rule.name}: ${reg.get(id)?.name}`, takeOut(id));
    // The engine activates whatever a saved pick names. One the choice does not offer at all (an edited file, content
    // that changed since, a pick kept through a move to other content) is on the character against its choice's rules.
    // A choice asked again at later levels (a spellbook, spells known) is one list to the player, and the Magic tab
    // hands picks to its places in order: a pick is offered when any place of the same choice offers it.
    if (s.rule.type !== "List")
      for (const id of s.chosen)
        if (reg.get(id) && !offeredBy(s).has(id))
          add("A pick its choice does not offer", `${s.rule.name}: ${reg.get(id)?.name}`, takeOut(id));
    for (const d of repeatedPicks(r, s)) {
      const id = s.chosen.find((x) => d.startsWith(`${s.rule.name}: ${reg.get(x)?.name} (`));
      add("A choice repeats something the character already has", d, id ? takeOut(id) : undefined);
    }
  }
  for (const w of r.warnings) add("Content refers to something missing", w);
  // Origins: the 2024 rules raise ability scores in the background, the 2014 rules in the species. A 2024 species
  // with a 2014 background gets neither (a 2014 species with a 2024 background is the legacy rule: the background's).
  const sp = ch.race ? reg.get(ch.race) : undefined;
  const bg = ch.background ? reg.get(ch.background) : undefined;
  // A 2014 background taken with the 2024 rules (its optional choice, backgroundOptions.ts) raises them itself.
  // The other mix: a background that raises scores (2024) with an older species. The species' own increases are
  // ignored (2024 PHB, Backgrounds and Species from Older Books); judged here from the parts of each score, by name.
  if (sp && bg && isModern(bg) && !isModern(sp)) {
    const fromSpecies = new Set([sp.name, ...r.active.filter((a) => /^(Sub ?Race|Race Variant)$/i.test(a.el.type)).map((a) => a.el.name)]);
    for (const a of sh.abilities)
      for (const p of r.stats.parts(a.id))
        if (p.value > 0 && fromSpecies.has(p.from))
          add(
            "Older species' increase counted with a 2024 background",
            `${a.id} +${p.value} from ${p.from}; ${bg.name} gives the increases`,
          );
  }
  if (sp && bg && isModern(sp) && !isModern(bg) && !/custom/i.test(bg.name) && !r.ids.has(BACKGROUND_ASI_MARKER))
    add(
      "Origin editions mixed",
      `${sp.name} (2024) gives no ability score increase and ${bg.name} (2014) gives none either; take the background's "2024 rules" option or its 2024 version`,
    );
  const inLines = new Set(sh.casting.flatMap((l) => [...l.cantripsKnown, ...l.spells, ...l.granted].map((p) => p.id)));
  for (const p of r.spellPicks) if (!inLines.has(p.id)) add("A spell is not castable (no spellcasting line)", reg.get(p.id)?.name ?? p.id);

  // Proficiency bonus by total level.
  if (sh.proficiency !== prof(level)) add("Proficiency bonus by level", `${sh.proficiency}, should be ${prof(level)} at level ${level}`);

  const refs = ch.classes.map((c) => ({
    c,
    el: reg.get(c.classId)!,
    ref: reg.get(c.classId) ? refFor(ref, reg.get(c.classId)!) : undefined,
  }));
  // A playtest class has no reference (the reference holds the published books): nothing to report.
  for (const x of refs) if (!x.ref && !(x.el && isPlaytest(x.el))) add("Class not in the rules reference", x.el?.name ?? x.c.classId);

  // Hit dice and hit points (average rule): first level the full die, then half the die + 1, Constitution each level.
  const con = mod("constitution");
  let hp = 0;
  let n = 0;
  for (const x of refs) {
    const die = x.ref?.hd ?? 0;
    const hd = sh.hitDice.find((h) => h.classId === x.c.classId);
    if (x.ref && hd && (hd.die !== die || hd.count !== x.c.level))
      add("Hit dice", `${x.el.name}: ${hd.count}d${hd.die}, should be ${x.c.level}d${die}`);
    for (let i = 0; i < x.c.level; i++) {
      n++;
      const roll = ch.hpMode === "roll" ? ch.hpRolls[String(n)] : undefined;
      // Each level adds at least 1 (the books' "minimum of 1"), written here apart from the engine's own count.
      const gained = (n === 1 ? die : (roll ?? Math.floor(die / 2) + 1)) + con;
      hp += gained < 1 ? 1 : gained;
    }
  }
  // What features add (Tough, Dwarven Toughness, Draconic Resilience, a custom bonus) comes as named parts of the
  // stat; the hit dice and Constitution are the class table's. The sheet's number is exactly their sum.
  const hpParts = r.stats.parts("hp");
  const fromParts = hpParts.reduce((t, p) => t + p.value, 0);
  if (refs.every((x) => x.ref) && sh.hp !== hp + fromParts)
    add(
      "Hit points",
      `${sh.hp}, the rules give ${hp + fromParts} (${hp} from hit dice and Constitution${hpParts.length ? ` + ${hpParts.map((p) => `${p.value} from ${p.from}`).join(" + ")}` : ""})`,
    );

  // Saving throws: the first class gives two; multiclassing gives none. Features that add more are listed.
  const first = refs[0]?.ref;
  if (first) {
    // The first class gives its two saving throws (the class table). Any other proficiency comes from an element
    // the character has (a feat, a feature, the species), which provenance shows; one granted by a later class
    // itself is the multiclass mistake: a second class gives no saving throws.
    for (const a of sh.abilities)
      if (!a.saveProficient && first.saves.includes(a.id)) add("Missing saving throw proficiency", `${a.id} from ${first.name}`);
    const later = new Map<string, string>();
    for (const x of refs.slice(1)) {
      later.set(x.c.classId, x.el.name);
      if (x.el.multiclass?.id) later.set(x.el.multiclass.id, x.el.name);
    }
    for (const act of r.active) {
      const k = conceptOf(act.el);
      if (!k?.startsWith("save:") || !later.has(act.from)) continue;
      add(
        "Saving throw proficiency without a rule giving it",
        `${act.el.name} from ${later.get(act.from)} (first class ${first.name} gives ${first.saves.join(" and ")}; a second class gives none)`,
      );
    }
    // The first class's training (a multiclass gains less, so only the first class is checked): armor, weapon
    // categories and named tools, as the class table gives them.
    const tight = (x: string) => x.toLowerCase().replace(/[^a-z]/g, "");
    const own = (list: string[], want: string) => list.some((x) => tight(x).includes(tight(want)));
    const ARMOR_NAME: Record<string, string> = { light: "light armor", medium: "medium armor", heavy: "heavy armor", shield: "shield" };
    for (const a of first.startArmor ?? [])
      if (!own(sh.proficiencies.armor, ARMOR_NAME[a])) add("Missing class training", `${ARMOR_NAME[a]} from ${first.name}`);
    for (const w of first.startWeapons ?? [])
      if (!own(sh.proficiencies.weapons, `${w} weapons`)) add("Missing class training", `${w} weapons from ${first.name}`);
    for (const t of first.startTools ?? []) if (!own(sh.proficiencies.tools, t)) add("Missing class training", `${t} from ${first.name}`);
  }

  // Training by source (W5): how many skills and tools each class gives, at first level and by multiclassing, and how
  // many skills, tools and languages the background gives, counted from where each one comes (what the class or the
  // background itself gives, not its features, subclass or feat) against the reference's numbers. A class's skills
  // are also among those its list names. Both Player's Handbooks: the class's "Proficiencies" (2014) or "Core Traits"
  // (2024), the Multiclassing table, and each background's own lines.
  {
    const RULE = "Training by source";
    // The source's own: straight from it, or through a set it lets the player choose (a Monk's artisan's tools or
    // musical instrument).
    const own = (roots: string[]) => (c: string[]) =>
      roots.includes(c[0]) && c.slice(1).every((id) => reg.get(id)?.type === "Training Option");
    // A background's own also comes through its options (a House Agent's house, a custom background's picks), though
    // never through a feat (the 2024 origin feat is the feat's training, not the background's).
    const ofBackground = (id: string) => (c: string[]) => c[0] === id && c.slice(1).every((x) => reg.get(x)?.type !== "Feat");
    // Each training once, whichever provider's id carries it (a species' own Stealth beside the same one borrowed).
    const from = (kind: string, mine: (c: string[]) => boolean) =>
      r.active
        .map((a) => ({ a, k: conceptOf(a.el) }))
        .filter((x) => x.k?.startsWith(`${kind}:`) && (r.via.get(x.a.el.id) ?? []).some(mine))
        .filter((x, i, all) => all.findIndex((y) => y.k === x.k) === i);
    const direct = (kind: string, ...roots: string[]) => from(kind, own(roots));
    const open = (...owners: string[]) => r.slots.some((s) => owners.includes(s.owner.id) && stillToChoose(s, r));
    const few = (got: number, wants: number[], undecided: boolean) => !wants.includes(got) && !(undecided && got < Math.max(...wants));
    refs.forEach((x, i) => {
      if (!x.ref?.startSkills || !x.ref.mcSkills) return;
      const roots = [x.c.classId, ...(x.el.multiclass?.id ? [x.el.multiclass.id] : [])];
      const undecided = open(...roots);
      const rule = i === 0 ? x.ref.startSkills : x.ref.mcSkills;
      const how = i === 0 ? "at first level" : "by multiclassing";
      const skills = direct("skill", ...roots);
      if (few(skills.length, [rule.count], undecided))
        add(
          RULE,
          `${x.el.name}: ${skills.length} skills ${how}, the class gives ${rule.count} (${skills.map((y) => y.a.el.name).join(", ")})`,
        );
      if (rule.from) {
        const list = new Set(rule.from.map((n) => `skill:${n.replace(/ /g, "-")}`));
        for (const y of skills) if (!list.has(y.k!)) add(RULE, `${x.el.name}: ${y.a.el.name} is not among the class's skills`);
      }
      const toolWants = (i === 0 ? x.ref.startToolCounts : x.ref.mcToolCounts) ?? [0];
      const tools = direct("tool", ...roots);
      if (few(tools.length, toolWants, undecided))
        add(
          RULE,
          `${x.el.name}: ${tools.length} tools ${how}, the class gives ${toolWants.join(" or ")} (${tools.map((y) => y.a.el.name).join(", ")})`,
        );
    });
    // The species, the same way: its skills, tools and (a 2014 species) languages by count, through its traits and
    // subrace but not a feat it gives. Aurora files a subrace apart from its species, so any entry of the species
    // (itself or one of its subraces) may be the one.
    const sp = ch.race ? reg.get(ch.race) : undefined;
    const speciesRef = ref.find((c) => c.species)?.species;
    if (sp && speciesRef && !isPlaytest(sp)) {
      const bare = lc(sp.name.replace(/\s*\(.*\)$/, ""));
      const exact = speciesRef.filter((x) => lc(x.name) === lc(sp.name));
      const same = [...new Set([...exact, ...speciesRef.filter((x) => lc(x.base) === lc(sp.name) || lc(x.base) === bare)])];
      const mine = same.filter((x) => (x.edition === "one") === isModern(sp));
      const cands = mine.length ? mine : same;
      const got = {
        skills: from("skill", ofBackground(sp.id)).length,
        tools: from("tool", ofBackground(sp.id)).length,
        languages: from("language", ofBackground(sp.id)).length,
      };
      // A choice still open, or holding a pick it does not offer (a finding of its own, "A pick its choice does not
      // offer": a moved character's longbow where the Dwarf's tool goes), leaves the count short.
      const undecided = r.slots.some(
        (x) => x.root === "race" && (stillToChoose(x, r) || x.chosen.some((id) => !x.options.some((o) => o.id === id))),
      );
      // Tasha's "Customizing Your Origin" lets a species' weapon or armor training be traded for tools: more tools
      // than the species' own are then right.
      const traded = [...r.ids].some((id) => /CUSTOMIZED_PROFICIENCY/.test(id));
      const fits = (b: RefBackground) =>
        !few(got.skills, b.skills, undecided) &&
        (!few(got.tools, b.tools, undecided) || (traded && got.tools > Math.max(...b.tools))) &&
        // Languages only where the species' own entry states them: the later books (Monsters of the Multiverse) and
        // the 2024 rules give them by a general rule, not per species.
        (b.edition === "one" || isModern(sp) || Math.max(...b.languages) === 0 || !few(got.languages, b.languages, undecided));
      if (cands.length && !cands.some(fits)) {
        const b = cands[0];
        add(
          RULE,
          `${sp.name}: ${got.skills} skills, ${got.tools} tools, ${got.languages} languages; the species gives ${[...new Set(cands.flatMap((c) => c.skills))].join(" or ")}, ${[...new Set(cands.flatMap((c) => c.tools))].join(" or ")} and ${b.edition === "one" || isModern(sp) ? "its languages by the 2024 rules" : [...new Set(cands.flatMap((c) => c.languages))].join(" or ")}`,
        );
      }
    }
    const bg = ch.background ? reg.get(ch.background) : undefined;
    const known = ref.find((c) => c.backgrounds)?.backgrounds;
    if (bg && known && !isPlaytest(bg)) {
      const same = known.filter((b) => lc(b.name) === lc(bg.name));
      const mine = same.filter((b) => (b.edition === "one") === isModern(bg));
      const cands = mine.length ? mine : same;
      const got = {
        skills: from("skill", ofBackground(bg.id)).length,
        tools: from("tool", ofBackground(bg.id)).length,
        languages: from("language", ofBackground(bg.id)).length,
      };
      const undecided = r.slots.some((s) => s.root === "background" && stillToChoose(s, r));
      const fits = (b: RefBackground) =>
        !few(got.skills, b.skills, undecided) && !few(got.tools, b.tools, undecided) && !few(got.languages, b.languages, undecided);
      if (lc(bg.name) === "custom background") {
        // The player's own background: two skills, and two tools or languages in any mix (PHB 2014 chapter 4,
        // "Customizing a Background"); under the 2024 rules two skills and one tool (DMG 2024 chapter 3, "Creating a
        // Background").
        const extra = got.tools + got.languages;
        const bad = isModern(bg)
          ? few(got.skills, [2], undecided) || few(got.tools, [1], undecided) || got.languages > 0
          : few(got.skills, [2], undecided) || few(extra, [2], undecided);
        if (bad)
          add(
            RULE,
            `${bg.name}: ${got.skills} skills, ${got.tools} tools, ${got.languages} languages; a custom background gives ${isModern(bg) ? "2 skills and 1 tool" : "2 skills and 2 tools or languages in all"}`,
          );
      } else if (cands.length && !cands.some(fits)) {
        const b = cands[0];
        add(
          RULE,
          `${bg.name}: ${got.skills} skills, ${got.tools} tools, ${got.languages} languages; the background gives ${b.skills.join(" or ")}, ${b.tools.join(" or ")} and ${b.languages.join(" or ")}`,
        );
      }
    }
  }

  // Base scores by the method the player chose (W5): the standard array is 15, 14, 13, 12, 10 and 8 in any order; point
  // buy spends at most its budget on scores within its range (27 points on 8 to 15, PHB 2014 chapter 1 "Variant:
  // Customizing Ability Scores", PHB 2024 chapter 2 "Generate Your Ability Scores"), or the table's own rules when
  // set. Read from the character's base scores, not from the sheet.
  {
    const base = ABILITY_IDS.map((a) => ch.abilityBase[a]);
    if (ch.abilityMethod === "standard" && [...base].sort((x, y) => y - x).join(",") !== "15,14,13,12,10,8")
      add("Ability scores by method", `standard array, but the base scores are ${base.join(", ")}`);
    if (ch.abilityMethod === "pointbuy") {
      const pb = normalizeRules(ch.pointBuy);
      const out = ABILITY_IDS.filter((a) => ch.abilityBase[a] < pb.min || ch.abilityBase[a] > pb.max);
      const spent = pbSpent(pb, ch.abilityBase);
      if (out.length)
        add(
          "Ability scores by method",
          `point buy allows ${pb.min} to ${pb.max}; ${out.map((a) => `${a} ${ch.abilityBase[a]}`).join(", ")}`,
        );
      else if (spent > pb.budget) add("Ability scores by method", `point buy spends ${spent} of ${pb.budget} points`);
    }
  }

  // Initiative (W5): Dexterity's modifier and the features the books say add to it, each by its own rule, never the
  // sheet's parts. Features that give advantage instead (Feral Instinct, Weapon of Warning) add nothing.
  {
    const modOf = (a: AbilityId) => sh.abilities.find((x) => x.id === a)?.mod ?? 0;
    const pb = sh.proficiency;
    const has = (name: string, edition?: "2014" | "2024") =>
      r.active.some((a) => norm(a.el.name) === norm(name) && (!edition || (edition === "2024") === isModern(a.el)));
    const parts: [string, number][] = [["Dexterity", modOf("dexterity")]];
    if (has("Alert", "2014")) parts.push(["Alert (2014)", 5]);
    if (has("Alert", "2024")) parts.push(["Alert", pb]);
    // A Dexterity check: half the proficiency bonus, rounded down (2014 Jack of All Trades) or up (2014 Remarkable
    // Athlete), only on a roll that does not already include the bonus (Alert's or Hare-Trigger's), and the two do not
    // stack (Sage Advice): the better one.
    const fullPb = has("Alert", "2024") || has("Hare-Trigger") || has("Aura of the Sentinel");
    const half = Math.max(
      has("Jack of All Trades", "2014") ? Math.floor(pb / 2) : 0,
      has("Remarkable Athlete", "2014") ? Math.ceil(pb / 2) : 0,
    );
    if (half && !fullPb) parts.push([has("Remarkable Athlete", "2014") ? "Remarkable Athlete" : "Jack of All Trades", half]);
    if (has("Dread Ambusher")) parts.push(["Dread Ambusher", modOf("wisdom")]);
    if (has("Rakish Audacity")) parts.push(["Rakish Audacity", modOf("charisma")]);
    if (has("Tactical Wit")) parts.push(["Tactical Wit", modOf("intelligence")]);
    if (has("Hare-Trigger")) parts.push(["Hare-Trigger", pb]);
    if (has("Aura of the Sentinel")) parts.push(["Aura of the Sentinel", pb]);
    if (has("Temporal Awareness")) parts.push(["Temporal Awareness", modOf("intelligence")]);
    // Any other feature's part as the sheet gives it (playtest and newer books' features this list does not know): the
    // check judges the ones it knows by their rules, and stays quiet about the rest rather than guess.
    const known =
      /^(alert|jack of all trades|remarkable athlete|dread ambusher|rakish audacity|tactical wit|hare-trigger|aura of the sentinel|temporal awareness)$/i;
    for (const p of r.stats.parts("initiative"))
      if (!known.test(p.from.replace(/^level \d+:\s*/i, "").trim()) && !/^dexterity$/i.test(p.from)) parts.push([p.from, p.value]);
    const want = parts.reduce((t, [, v]) => t + v, 0);
    if (sh.initiative !== want)
      add("Initiative", `${sh.initiative}, the rules give ${want} (${parts.map(([n, v]) => `${n} ${v >= 0 ? "+" : ""}${v}`).join(", ")})`);
  }

  // W5: ability score increases by their source, counted from what each source's elements give and never from the
  // sheet's sum. A feat raises scores by 1 in all (PHB 2014 and 2024: every feat with an increase gives one point);
  // the Ability Score Improvement by 2 (one score by 2 or two by 1); a level's improvement choice by 2 at most; a 2024
  // background by 3, no score by more than 2 (PHB 2024, chapter 4). Species are their book's own numbers.
  {
    const isAbility = (n: string): n is AbilityId => (ABILITY_IDS as readonly string[]).includes(n.toLowerCase());
    const bySlotOwner = new Map<string, Resolved["slots"]>();
    for (const s of r.slots) bySlotOwner.set(s.owner.id, [...(bySlotOwner.get(s.owner.id) ?? []), s]);
    const activeIds = new Set(r.active.map((a) => a.el.id));
    const incCtx = reqCtx(r);
    // What an element gives, itself and through the options chosen in its own choices (and theirs).
    const points = (id: string, seen = new Set<string>()): Partial<Record<AbilityId, number>> => {
      const out: Partial<Record<AbilityId, number>> = {};
      if (seen.has(id) || !activeIds.has(id)) return out;
      seen.add(id);
      const el = reg.get(id);
      for (const x of el?.rules ?? [])
        // A conditional increase counts when its condition holds ("the ability chosen for Divinely Favored").
        if (x.kind === "stat" && isAbility(x.name) && Number(x.value) > 0 && !x.bonus && meets(x.requirements, incCtx)) {
          const k = x.name.toLowerCase() as AbilityId;
          out[k] = (out[k] ?? 0) + Number(x.value);
        }
      for (const s of bySlotOwner.get(id) ?? [])
        for (const c of s.chosen) {
          // A feat chosen inside is judged as its own feat.
          if (reg.get(c)?.type === "Feat") continue;
          for (const [k, v] of Object.entries(points(c, seen))) out[k as AbilityId] = (out[k as AbilityId] ?? 0) + v;
        }
      return out;
    };
    const total = (p: Partial<Record<AbilityId, number>>) => Object.values(p).reduce((t, v) => t + (v ?? 0), 0);
    const most = (p: Partial<Record<AbilityId, number>>) => Math.max(0, ...Object.values(p).map((v) => v ?? 0));
    const RULE = "Ability increases by source";
    for (const a of r.active) {
      if (a.el.type !== "Feat") continue;
      const p = points(a.el.id);
      const cap = /^ability score (improvement|increase)/i.test(a.el.name) ? 2 : 1;
      if (total(p) > cap)
        add(
          RULE,
          `${a.el.name}: +${total(p)} in all; ${cap === 2 ? "an Ability Score Improvement gives at most +2" : "a feat gives at most +1"}`,
        );
    }
    // A class's improvement choice that is not a feat element (Aurora's improvement options).
    for (const s of r.slots) {
      if (!s.root.startsWith("class:") || !/^(Feat|Ability Score Improvement)$/.test(s.rule.type)) continue;
      if (r.slots.some((x) => x.chosen.includes(s.owner.id))) continue;
      const p: Partial<Record<AbilityId, number>> = {};
      for (const c of s.chosen)
        if (reg.get(c)?.type !== "Feat") for (const [k, v] of Object.entries(points(c))) p[k as AbilityId] = (p[k as AbilityId] ?? 0) + v;
      if (total(p) > 2) add(RULE, `${s.rule.name}: +${total(p)} in all; an improvement gives at most +2`);
    }
    // A 2024 background, or a 2014 one under the 2024 rules.
    const bg = ch.background ? reg.get(ch.background) : undefined;
    if (bg && (isModern(bg) || r.ids.has(BACKGROUND_ASI_MARKER))) {
      const p: Partial<Record<AbilityId, number>> = {};
      const add1 = (q: Partial<Record<AbilityId, number>>) => {
        for (const [k, v] of Object.entries(q)) p[k as AbilityId] = (p[k as AbilityId] ?? 0) + v;
      };
      for (const s of r.slots)
        if (
          s.root === "background" &&
          s.rule.type === "Ability Score Improvement" &&
          !r.slots.some((x) => x.rule.type === "Ability Score Improvement" && x.chosen.includes(s.owner.id))
        )
          for (const c of s.chosen) add1(points(c));
      if (total(p) > 3 || most(p) > 2)
        add(RULE, `${bg.name}: +${total(p)} in all, +${most(p)} to one score; a 2024 background gives +3 in all and at most +2 to one`);
    }
  }

  // Ability scores: no higher than 20 unless a feature or an item raises the limit.
  // A score above 20 needs a named part that raises the maximum (Primal Champion, an Epic Boon) or sets the score (a
  // Belt of Giant Strength); the stat book already stops increases at the maximum, so this catches a bypass.
  for (const a of sh.abilities) {
    // The checker's own reading of the raised maximum: the largest single raise named (they do not add up).
    const max =
      20 + Math.max(0, ...r.stats.parts(`${a.id}:max`).map((p) => p.value), ...r.stats.parts(`${a.id}:max:extra`).map((p) => p.value));
    const set = r.stats.parts(`${a.id}:score:set`).reduce((t, p) => Math.max(t, p.value), 0);
    if (a.score > Math.max(max, set, ch.abilityBase[a.id]))
      add("Ability score above its maximum", `${a.id} ${a.score} (maximum ${max}${set ? `, set to ${set}` : ""})`);
  }
  for (const a of sh.abilities) if (a.score < 1) add("Ability score below 1", `${a.id} ${a.score}`);

  // Skill and saving throw bonuses, judged here from what the character has, not from the sheet's own sums (the
  // audit's R13: neither was checked at all). A skill is its ability's modifier, plus the proficiency bonus when the
  // character has the skill (twice with expertise, half rounded down for a Bard's Jack of All Trades without it),
  // plus whatever named parts add to it. A save is the modifier, the proficiency bonus when trained, and its parts.
  {
    const had = new Set<string>();
    for (const a of r.active) {
      const k = conceptOf(a.el);
      if (k) had.add(k);
    }
    const P = sh.proficiency;
    const plainName = (a: { el: AElement }) => lc(a.el.name).replace(/^level \d+:\s*/, "");
    const jack = r.active.some((a) => plainName(a) === "jack of all trades");
    // The 2014 Remarkable Athlete: half the proficiency bonus, rounded up, on Strength, Dexterity and Constitution
    // checks without it; it does not stack with Jack of All Trades (the better one counts, Sage Advice).
    const athlete = r.active.some((a) => plainName(a) === "remarkable athlete" && !isModern(a.el));
    // What named parts add, leaving out those two (counted here by their own rules).
    const parts = (...names: string[]) =>
      names.flatMap((n) => r.stats.parts(n)).filter((p) => !/jack of all trades|remarkable athlete/i.test(p.from));
    const total = (...names: string[]) => parts(...names).reduce((t, p) => t + p.value, 0);
    for (const sk of sh.skills) {
      const slug = sk.name.replace(/ /g, "-");
      const trained = had.has(`skill:${slug}`);
      // Expertise by its own proficiency, or doubled by a feature that names the skill (the Scout's Survivalist gives
      // it as a number, with no proficiency of its own).
      const expert =
        had.has(`expertise:${slug}`) ||
        (trained && r.stats.parts(`${sk.name}:proficiency`).length > 1 && total(`${sk.name}:proficiency`) === 2 * P);
      // Expertise is chosen among the skills a character is proficient in (both Player's Handbooks).
      if (expert && !trained) {
        add("Expertise without proficiency", `${sk.name}: expertise in a skill the character is not proficient in`);
        continue;
      }
      // Training some content gives as a number, with no proficiency of its own behind it, is taken as it stands.
      const own = expert ? 2 * P : trained ? P : total(`${sk.name}:proficiency`);
      const untrained = !expert && !trained && own === 0;
      const half = untrained
        ? Math.max(jack ? Math.floor(P / 2) : 0, athlete && /^(strength|dexterity|constitution)$/.test(sk.ability) ? Math.ceil(P / 2) : 0)
        : 0;
      const want = mod(sk.ability) + own + half + total(`${sk.name}:misc`, sk.name);
      if (Number.isFinite(want) && sk.bonus !== want)
        add(
          "Skill bonus",
          `${sk.name}: ${sk.bonus}, the rules give ${want} (${sk.ability} ${mod(sk.ability)}${expert ? `, expertise ${2 * P}` : trained ? `, proficiency ${P}` : half ? `, half proficiency ${half}` : own ? `, training ${own}` : ""}${parts(
            `${sk.name}:misc`,
            sk.name,
          )
            .map((x) => `, ${x.from} ${x.value}`)
            .join("")})`,
        );
    }
    const ABBR: Record<AbilityId, string> = {
      strength: "str",
      dexterity: "dex",
      constitution: "con",
      intelligence: "int",
      wisdom: "wis",
      charisma: "cha",
    };
    for (const a of sh.abilities) {
      // Trained by a proficiency the character has, or by a feature that gives the training as a number (Diamond Soul).
      const trained = had.has(`save:${ABBR[a.id]}`) || r.stats.parts(`${a.id}:save:proficiency`).length > 0;
      const want = a.mod + (trained ? P : 0) + total(`${a.id}:save:misc`, `${a.id}:save`);
      if (a.save !== want)
        add(
          "Saving throw bonus",
          `${a.id}: ${a.save}, the rules give ${want} (modifier ${a.mod}${trained ? `, proficiency ${P}` : ""}${parts(
            `${a.id}:save:misc`,
            `${a.id}:save`,
          )
            .map((x) => `, ${x.from} ${x.value}`)
            .join("")})`,
        );
    }
  }

  // Multiclass requirements: 13 in the abilities each class names (2014), or in its primary ability (2024).
  if (ch.classes.length > 1) {
    for (const x of refs) {
      const rf = x.ref;
      if (!rf) continue;
      let ok = true;
      let need = "";
      if (rf.primaryAbility) {
        ok = rf.primaryAbility.some((group) => group.every((a) => score(a).score >= 13));
        need = rf.primaryAbility.map((g) => g.join(" and ")).join(" or ") + " 13";
      } else {
        const all = Object.entries(rf.multiclass ?? {}) as [AbilityId, number][];
        const alt = rf.multiclassOr ?? [];
        // An "or" group in the 5e.tools data means any one of its abilities (Fighter: Strength 13 or Dexterity 13).
        ok =
          all.every(([a, v]) => score(a).score >= v) &&
          (!alt.length || alt.every((o) => (Object.entries(o) as [AbilityId, number][]).some(([a, v]) => score(a).score >= v)));
        need = [
          ...all.map(([a, v]) => `${a} ${v}`),
          ...alt.map((o) =>
            Object.entries(o)
              .map(([a, v]) => `${a} ${v}`)
              .join(" or "),
          ),
        ].join(", ");
      }
      if (!ok) add("Multiclass requirement not met", `${x.el.name} needs ${need}`);
    }
  }

  // Uses of a counted feature at its class level, from the class table itself (engine plan W5): the sheet's own number
  // is never the source. Rages, Ki or Focus Points, Sorcery Points, Channel Divinity, Wild Shape, Second Wind and the
  // 2024 Ranger's Favored Enemy. A feature two classes give (Channel Divinity from Cleric and Paladin) is left alone:
  // how multiclass uses combine is the class text's, not the table's.
  const USES: [RegExp, RegExp][] = [
    [/^rages$/, /^rage$/],
    [/^(?:ki|focus) points$/, /^(?:ki|monk's focus|focus points?)$/],
    [/^sorcery points$/, /^(?:font of magic|sorcery points)$/],
    [/^channel divinity$/, /^channel divinity$/],
    [/^wild shape$/, /^wild shape$/],
    [/^second wind$/, /^second wind$/],
    [/^favored enemy$/, /^favored enemy$/],
  ];
  const usesOf = (name: RegExp) =>
    sh.features.filter((f) => name.test(norm(f.name).trim())).map((f) => Number(/^(\d+)\s*\//.exec(f.usage ?? "")?.[1] ?? NaN));
  const fromClasses = new Map<RegExp, number>();
  for (const x of refs)
    for (const [col, feat] of USES)
      if (x.ref?.counters && Object.keys(x.ref.counters).some((k) => col.test(lc(k))))
        fromClasses.set(feat, (fromClasses.get(feat) ?? 0) + 1);
  for (const x of refs) {
    if (!x.ref?.counters) continue;
    for (const [label, values] of Object.entries(x.ref.counters)) {
      const pair = USES.find(([col]) => col.test(lc(label)));
      const want = values[x.c.level - 1];
      if (!pair || typeof want !== "number" || want <= 0 || (fromClasses.get(pair[1]) ?? 0) > 1) continue;
      const have = usesOf(pair[1]);
      if (!have.length) continue;
      // More than the table is right when a feat adds to the pool (Metamagic Adept: two sorcery points); fewer never is.
      const word = lc(label).replace(/s$/, "");
      const topped = r.active.some((a) => a.el.type === "Feat" && lc(a.el.description ?? "").includes(word));
      if (!have.some((n) => n === want || (topped && n > want)))
        add(
          "Feature uses by level",
          `${x.el.name} ${x.c.level}: ${label} ${have.map((n) => (Number.isNaN(n) ? "no count" : n)).join(" / ")} (class table: ${want})`,
        );
    }
  }

  // Psionic Energy dice (Psi Warrior, Soulknife), which no class table holds: twice the proficiency bonus (Tasha's
  // Cauldron of Everything, "Psionic Power"), or the subclass's own table by class level (PHB 2024: 4 dice at level 3,
  // 6 at 5, 8 at 9, 10 at 13, 12 at 17).
  for (const x of refs) {
    const sub = r.active.find(
      (a) => a.el.type === "Archetype" && a.root === `class:${x.c.classId}` && /^(psi warrior|soulknife)$/.test(lc(a.el.name)),
    );
    if (!sub || isPlaytest(sub.el) || x.c.level < 3) continue;
    const want = isModern(sub.el) ? 2 * prof(x.c.level) : 2 * prof(level);
    // The count, with or without the die beside it ("4/Long Rest", "4d6/Long Rest").
    const have = sh.features
      .filter((f) => /^psionic power$/.test(norm(f.name).trim()))
      .map((f) => Number(/^(\d+)(?:d\d+)?\s*\//.exec(f.usage ?? "")?.[1] ?? NaN));
    if (have.length && !have.includes(want))
      add(
        "Feature uses by level",
        `${sub.el.name} ${x.c.level}: Psionic Energy dice ${have.map((n) => (Number.isNaN(n) ? "no count" : n)).join(" / ")} (the rules give ${want})`,
      );
  }

  // Subclass: chosen at the level the class gets it, not before; one per class.
  for (const x of refs) {
    if (!x.ref?.subclassLevel) continue;
    const subs = r.active.filter((a) => a.el.type === "Archetype" && a.root === `class:${x.c.classId}`);
    if (x.c.level >= x.ref.subclassLevel && subs.length !== 1)
      add("Subclass", `${x.el.name} ${x.c.level} should have one subclass (from level ${x.ref.subclassLevel}), has ${subs.length}`);
    if (x.c.level < x.ref.subclassLevel && subs.length)
      add(
        "Subclass taken too early",
        `${x.el.name} ${x.c.level}: ${subs.map((s) => s.el.name).join(", ")} (rules: level ${x.ref.subclassLevel})`,
      );
  }

  // Class and subclass features by level, against the reference. Optional features (Tasha's) and the ones that
  // are only a heading for something else are not required.
  // "Extra Elemental Discipline" is one more discipline choice, which the completeness check above already covers.
  const skip =
    /^(ability score improvement|epic boon|subclass feature|extra elemental discipline|additional .*|.* options|optional rule.*|.* improvements|.* subclass|.* feature|.* improvement|proficiencies|.* versatility|primal knowledge|martial versatility|cantrip formulas|cantrip versatility|optional class features|.*\bdivine domain|.*\bsacred oath|.*\barcane tradition|.*\bdruid circle|.*\bmonastic tradition|.*\bmartial archetype|.*\branger archetype|.*\broguish archetype|.*\bsorcerous origin|.*\botherworldly patron|.*\bbard college|.*\bprimal path|.*\bartificer specialist)$/i;
  for (const x of refs) {
    if (!x.ref) continue;
    for (const f of x.ref.features) {
      if (f.level > x.c.level || f.optional || skip.test(f.name)) continue;
      if (!near(norm(f.name))) add("Class feature missing", `${x.el.name} ${f.level}: ${f.name}`);
    }
    const sub = r.active.find((a) => a.el.type === "Archetype" && a.root === `class:${x.c.classId}`)?.el;
    if (!sub) continue;
    // Whole words only: "Twilight Domain" must not match the "Light" domain.
    const word = (hay: string, needle: string) => new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(hay);
    const exact = x.ref.subclasses.filter((s) => [s.name, s.shortName].some((n) => norm(n) === norm(sub.name)));
    const subMatches = exact.length
      ? exact
      : x.ref.subclasses.filter((s) => [s.name, s.shortName].some((n) => word(norm(sub.name), norm(n)) || word(norm(n), norm(sub.name))));
    const subEd = isModern(sub) ? ["XPHB", "EFA"] : [];
    // A playtest subclass is not the published one of the same name (the playtest Rune Knight's features differ).
    // Reprints share a name (2024's Knowledge Domain from Heroes of Faerûn, 2014's copied for the 2024 Cleric): the one this
    // subclass is, of those of its rules, is the one with the least missing.
    if (isPlaytest(sub)) continue;
    const sameRules = subMatches.filter((s) => (subEd.length ? subEd.includes(s.source) : !["XPHB", "EFA"].includes(s.source)));
    const named = x.ref.subclasses.filter((s) =>
      [s.name, s.shortName].some((n) => norm(sub.name).includes(norm(n)) || norm(n).includes(norm(sub.name))),
    );
    const candidates = sameRules.length && !isModern(sub) ? sameRules : subMatches.length ? subMatches : named;
    if (!candidates.length) continue;
    const missing = candidates.map((refSub) =>
      refSub.features.filter(
        (f) =>
          !(
            f.level > x.c.level ||
            f.optional ||
            skip.test(f.name) ||
            norm(f.name) === norm(refSub.name) ||
            norm(f.name) === norm(refSub.shortName)
          ) && !near(norm(f.name)),
      ),
    );
    const fewest = missing.reduce((a, b) => (b.length < a.length ? b : a));
    for (const f of fewest) add("Subclass feature missing", `${sub.name} ${f.level}: ${f.name}`);
    // The subclass's always-prepared spells at the levels reached, from the reference (W5): each on the character.
    const refSub = candidates[missing.indexOf(fewest)];
    if (refSub?.spells) {
      const key = (n: string) => n.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
      const had = new Set(r.spellPicks.map((p) => key(reg.get(p.id)?.name ?? "")));
      for (const [lvl, list] of Object.entries(refSub.spells))
        if (Number(lvl) <= x.c.level) for (const n of list) if (!had.has(key(n))) add("Subclass spell missing", `${sub.name} ${lvl}: ${n}`);
    }
  }

  // Feats from level choices: one at each Ability Score Improvement level the class has reached, and the Epic Boon.
  for (const x of refs) {
    if (!x.ref) continue;
    const want = x.ref.asiLevels.filter((l) => l <= x.c.level).length + (x.ref.epicBoon && x.c.level >= x.ref.epicBoon ? 1 : 0);
    const got = r.slots.filter(
      (s) =>
        s.root === `class:${x.c.classId}` &&
        s.ownerLevel <= x.c.level &&
        /ability score improvement|improvement option|epic boon|^feat \(/i.test(s.rule.name) &&
        s.owner.type !== "Feat" &&
        !/custom|\+[12]/i.test(s.rule.name),
    ).length;
    if (want && got && got !== want)
      add("Feats or ability improvements by level", `${x.el.name} ${x.c.level}: ${got} choices, the rules give ${want}`);
  }

  // Feats: requirements met; 2024 General feats from level 4, Epic Boons from level 19; no feat twice unless repeatable.
  const ctx = reqCtx(r);
  const seenFeats = new Map<string, number>();
  for (const a of r.active.filter((x) => x.el.type === "Feat")) {
    seenFeats.set(a.el.name, (seenFeats.get(a.el.name) ?? 0) + 1);
    if (a.el.requirements && !meets(a.el.requirements, ctx)) add("Feat requirements not met", a.el.name);
    const tags = a.el.supports.map(lc);
    if (tags.includes("epic boon") && level < 19) add("Epic Boon before level 19", a.el.name);
    if (tags.includes("general") && level < 4 && !/race|background/.test(a.root)) add("General feat before level 4", a.el.name);
  }
  // Repeatable: the content says so ("allow duplicate"), the text does ("you can take this feat more than once", the
  // 2024 Magic Initiate with another spell list), or the content gives repeat copies (Aurora's Magic Initiate_2).
  for (const [name, count] of seenFeats) if (count > 1 && !featRepeatable(r.reg, name)) add("Same feat twice", name);

  // Spellcasting: slots by the class tables or the multiclass table; cantrips and prepared spells by the class table;
  // spell levels within what the class can cast; DC and attack bonus by the formula.
  const casters = refs.filter(
    (x) =>
      x.ref &&
      (x.ref.caster ||
        x.ref.subclasses.some(
          (s) => s.caster && r.active.some((a) => a.el.type === "Archetype" && norm(a.el.name).includes(norm(s.shortName))),
        )),
  );
  const casterLevel = (x: (typeof refs)[number]) => {
    const c =
      x.ref!.caster ??
      x.ref!.subclasses.find(
        (s) => s.caster && r.active.some((a) => a.el.type === "Archetype" && norm(a.el.name).includes(norm(s.shortName))),
      )?.caster;
    const modern = x.ref!.edition === "one";
    if (c === "full") return x.c.level;
    if (c === "1/2") return modern ? Math.ceil(x.c.level / 2) : Math.floor(x.c.level / 2);
    if (c === "artificer") return Math.ceil(x.c.level / 2);
    if (c === "1/3") return Math.floor(x.c.level / 3);
    return 0;
  };
  // The multiclass table counts only classes that have Spellcasting at their level (a Ranger 1 has none yet in 2014):
  // with one such class, its own table gives the slots (PHB, Multiclassing).
  const castsNow = (x: (typeof refs)[number]) =>
    x.ref!.slots ? (x.ref!.slots[x.c.level - 1] ?? []).some((v) => v > 0) : casterLevel(x) > 0;
  const nonPact = casters.filter((x) => x.ref!.caster !== "pact" && castsNow(x));
  const slotRow = (row: number[]) => row.filter((v) => v > 0).join("/");
  const ours = (line: (typeof sh.casting)[number]) => slotRow(line.slots.map((s) => s.total));
  if (nonPact.length === 1) {
    const x = nonPact[0];
    // Its own line first: "Artificer Initiate" (a feat) also has the class in its name.
    const line =
      sh.casting.find((l) => norm(l.name) === norm(x.el.name)) ??
      sh.casting.find((l) => norm(l.name).includes(norm(x.el.name)) || norm(x.el.name).includes(norm(l.name))) ??
      sh.casting.find((l) => l.slots.length && !l.pactLevel);
    const want = x.ref!.slots ? slotRow(x.ref!.slots[x.c.level - 1] ?? []) : slotRow(THIRD[x.c.level] ?? []);
    if (line && want !== ours(line))
      add("Spell slots", `${x.el.name} ${x.c.level}: ${ours(line) || "none"}, the class table gives ${want || "none"}`);
    if (!line && want) add("Spell slots", `${x.el.name} ${x.c.level} has no spellcasting line; the table gives ${want}`);
  } else if (nonPact.length > 1) {
    const mc = nonPact.reduce((t, x) => t + casterLevel(x), 0);
    const want = slotRow(FULL[Math.min(20, mc)] ?? []);
    for (const line of sh.casting.filter((l) => l.slots.length && !l.pactLevel))
      if (ours(line) !== want)
        add("Multiclass spell slots", `${line.name}: ${ours(line)}, the multiclass table gives ${want} (caster level ${mc})`);
  }
  for (const x of casters.filter((y) => y.ref!.caster === "pact" && y.ref!.pact)) {
    const line = sh.casting.find((l) => l.pactLevel);
    const want = { n: x.ref!.pact!.slots[x.c.level - 1], lv: x.ref!.pact!.level[x.c.level - 1] };
    const got = line?.slots.find((s) => s.total > 0);
    if (!line || !got || got.total !== want.n || (line.pactLevel ?? got.level) !== want.lv)
      add(
        "Pact Magic slots",
        `${x.el.name} ${x.c.level}: ${got ? `${got.total} at level ${line?.pactLevel ?? got.level}` : "none"}, the table gives ${want.n} at level ${want.lv}`,
      );
  }
  for (const x of refs) {
    if (!x.ref?.cantrips) continue;
    const want = x.ref.cantrips[x.c.level - 1];
    const own = r.slots.filter(
      (s) =>
        s.root === `class:${x.c.classId}` &&
        s.rule.type === "Spell" &&
        /cantrip/i.test(s.rule.name) &&
        (s.owner.id === x.c.classId || /spellcasting|pact magic/i.test(s.owner.name)),
    );
    const got = own.reduce((t, s) => t + s.chosen.length, 0);
    if (own.length && got !== want) add("Cantrips known", `${x.el.name} ${x.c.level}: ${got}, the class table gives ${want}`);
  }
  for (const x of refs) {
    if (!x.ref) continue;
    const table = x.ref.prepared ?? x.ref.known;
    const line = sh.casting.find((l) => norm(l.name) === norm(x.el.name));
    if (!table || !line) continue;
    const want = table[x.c.level - 1];
    // Mystic Arcanum: one spell each of levels 6 to 9 at Warlock levels 11, 13, 15 and 17, outside the known spells.
    const arcanum = x.ref.pact ? [11, 13, 15, 17].filter((l) => x.c.level >= l).map((_, i) => i + 6) : [];
    const levelOf = (id: string) => Number(reg.get(id)?.setters.level?.value ?? 0);
    if (line.prepare) {
      // No spell slot of its own yet (the reference's table for this level): nothing to prepare.
      const ownSlots = (x.ref.slots?.[x.c.level - 1] ?? []).some((n: number) => n > 0) || !!x.ref.pact;
      if (x.ref.slots && !ownSlots && (line.prepareMax > 0 || (r.character.prepared[line.name] ?? []).length))
        add("Prepared spells", `${x.el.name} ${x.c.level}: prepares spells before the class has a spell slot`);
      if (line.prepareMax && line.prepareMax !== want && x.ref.prepared)
        add("Prepared spells", `${x.el.name} ${x.c.level}: may prepare ${line.prepareMax}, the class table gives ${want}`);
      // The list to prepare from must hold at least as many spells as may be prepared.
      const pool = preparePool(r, line).length;
      if (line.prepareMax && pool < line.prepareMax)
        add("Too few spells to prepare from", `${x.el.name} ${x.c.level}: ${pool} on the list, ${line.prepareMax} may be prepared`);
    } else {
      // Only the class's own spellcasting choices count; a subclass's extra spells (Magical Secrets) are on top.
      const own = r.slots.filter(
        (s) =>
          s.root === `class:${x.c.classId}` &&
          s.rule.type === "Spell" &&
          !/cantrip/i.test(s.rule.name) &&
          /spellcasting|pact magic|^magical secrets$/i.test(s.owner.name.replace(/^level \d+: /i, "")) &&
          !/arcanum/i.test(s.rule.name),
      );
      // A cantrip taken with Magical Secrets still counts against the spells known.
      const got = own.reduce(
        (t, s) =>
          t + s.chosen.filter((id) => (levelOf(id) > 0 || /magical secrets/i.test(s.owner.name)) && !arcanum.includes(levelOf(id))).length,
        0,
      );
      // Short only by picks still open: that is an open choice (reported as one), not a wrong count.
      const open = own.reduce((t, s) => t + Math.max(0, s.rule.number - s.chosen.length), 0);
      if (own.length && got !== want && !(got < want && got + open >= want))
        add("Spells known or prepared", `${x.el.name} ${x.c.level}: ${got}, the class table gives ${want}`);
    }
    const maxLv = x.ref.slots
      ? (x.ref.slots[x.c.level - 1] ?? []).filter((v) => v > 0).length
      : x.ref.pact
        ? x.ref.pact.level[x.c.level - 1]
        : 9;
    for (const p of line.spells) {
      const lv = levelOf(p.id);
      if (lv > maxLv && !arcanum.includes(lv))
        add("Spell above the level the class can cast", `${x.el.name} ${x.c.level}: ${reg.get(p.id)?.name} (level ${lv}, max ${maxLv})`);
    }
  }
  for (const line of sh.casting) {
    const m = line.ability ? mod(line.ability as AbilityId) : NaN;
    if (line.ability && !Number.isFinite(m)) add("Spellcasting ability unknown", `${line.name}: "${line.ability}"`);
    if (Number.isFinite(m) && (line.dc !== 8 + sh.proficiency + m || line.attack !== sh.proficiency + m)) {
      // Magic items and features (Robe of the Archmagi, a +1 focus) can add to these.
      const items = ch.inventory.some((i) => i.attuned || /\+\d/.test(reg.get(i.id)?.name ?? ""));
      if (!items)
        add(
          "Spell save DC or attack",
          `${line.name}: DC ${line.dc}, attack ${line.attack}; the formula gives DC ${8 + sh.proficiency + m}, attack ${sh.proficiency + m}`,
        );
    }
  }

  // Armor class with the armor tables, Dexterity caps, shields and unarmored defenses.
  const worn = ch.inventory
    .filter((i) => i.equipped && i.id)
    .map((i) => ({ i, el: reg.get(i.id)! }))
    .filter((x) => x.el?.type === "Armor");
  const body = worn.find((x) => !/shield/i.test(x.el.name) && !/shield/i.test(x.el.setters.armor?.value ?? ""));
  const shield = worn.find((x) => /shield/i.test(x.el.name) || /shield/i.test(x.el.setters.armor?.value ?? ""));
  const dex = mod("dexterity");
  // Worn armor: its base and Dexterity cap from the armor table, not from the content. Everything else that changes
  // AC (an unarmored defense, natural armor, a shield, a fighting style, an item) is a named part of a stat; AC above
  // what the table gives, with no part explaining it, is the finding.
  // Armor a species cannot wear (the Tortle's shell: "You can't wear light, medium, or heavy armor"): its natural armor
  // only counts unarmored, so worn armor quietly lowered the sheet (a Tortle in leather: AC 10, not 17).
  if (body)
    for (const n of noBodyArmor(r))
      add(
        "Armor the species cannot wear",
        `${n.name}: ${body.el.name} is worn${n.unarmored ? `; without it, armor class is ${n.unarmored}${shield ? " plus the shield" : ""}` : ""}`,
      );
  const misc = [...r.stats.parts("ac:misc"), ...r.stats.parts("ac")];
  const shieldAc = shield ? 2 + (shield.i.magic ?? 0) : 0;
  const miscSum = misc.reduce((t, p) => t + p.value, 0);
  if (body) {
    const row = ARMOR.find(([re]) => re.test(body.el.name.replace(/^\+\d\s*/, "")));
    if (row) {
      const [, base, cap] = row;
      const dexPart =
        cap === undefined ? dex : cap === 0 ? 0 : Math.min(cap === 2 ? Math.max(2, r.stats.get("ac:armored:dexterity:cap")) : cap, dex);
      const want =
        base +
        dexPart +
        (body.i.magic ?? 0) +
        (Number(body.el.setters.armorClassBonus?.value) || 0) +
        r.stats.get("ac:armored:enhancement") +
        r.stats.get("ac:armored:misc") +
        shieldAc +
        miscSum;
      if (sh.ac.value !== want)
        add(
          "Armor class",
          `${sh.ac.value}, the armor table gives ${want} (${body.el.name} ${base}, Dex ${dexPart}${shieldAc ? `, shield ${shieldAc}` : ""}${misc.map((p) => `, ${p.from} ${p.value}`).join("")})`,
        );
    }
  } else {
    const calc = r.stats.parts("ac:calculation");
    const floor = 10 + dex + shieldAc + miscSum;
    const best = Math.max(10 + dex, r.stats.get("ac:calculation")) + shieldAc + miscSum;
    if (sh.ac.value < floor) add("Armor class", `${sh.ac.value}, below 10 + Dex${shieldAc ? " + shield" : ""} (${floor})`);
    else if (sh.ac.value > floor && !calc.length)
      add("Armor class", `${sh.ac.value} with no armor and nothing giving another calculation (10 + Dex gives ${floor})`);
    else if (sh.ac.value !== best)
      add(
        "Armor class",
        `${sh.ac.value}, the parts give ${best} (${calc.map((p) => `${p.from} ${p.value}`).join(", ") || `10 + Dex ${10 + dex}`})`,
      );
  }
  if (body) {
    const kind = lc(body.el.setters.armor?.value ?? "");
    const trained = sh.proficiencies.armor.join(" ").toLowerCase();
    if (kind && !/shield/.test(kind) && !trained.includes(kind) && !trained.includes("all armor"))
      add("Wearing armor without training", `${body.el.name} (${kind})`);
  }

  // Attunement: an item only some may attune to (a wizard, any spellcaster).
  for (const it of ch.inventory.filter((i) => i.attuned && i.id)) {
    const el = reg.get(it.id);
    const req = el?.setters["attune requirements"]?.value;
    if (req && !meets(req, ctx))
      add(
        "Attuned to an item that needs someone else",
        `${el!.name} (${req
          .replace(/\[level:(\w+):1\]/g, "$1")
          .replace(/\[type:spell\]/g, "a spellcaster")
          .replace(/\|\|/g, " or ")
          .replace(/[()]/g, "")})`,
      );
  }

  // Hands: a two-handed weapon and a shield, or more than two weapons, cannot be held at once.
  const weapons = ch.inventory.filter((i) => i.equipped && i.id && reg.get(i.id)?.type === "Weapon");
  const twoHanded = weapons.filter((i) => reg.get(i.id)!.supports.some((t) => /two.?handed/i.test(t)) || i.twoHanded);
  if ((twoHanded.length && shield) || twoHanded.length > 1 || weapons.length > 2 || (twoHanded.length && weapons.length > 1))
    add("More held than two hands can hold", weapons.map((i) => reg.get(i.id)?.name).join(", ") + (shield ? ", shield" : ""));

  // Attacks from weapons: ability modifier, proficiency if trained, magic bonus.
  const altAbilities = weaponAbilityOptions(r);
  for (const a of sh.attacks.filter((x) => x.auto && x.elId)) {
    const el = reg.get(a.elId!)!;
    const it = ch.inventory.find((i) => i.uid === a.id);
    const tags = el.supports.map(lc);
    const ranged = tags.some((t) => t.includes("ranged"));
    const finesse = tags.some((t) => t.includes("finesse"));
    // A feature may allow another ability for this weapon (Hex Warrior, Pact of the Blade, Battle Ready): the better.
    const twoHandedTag = tags.some((t) => /two.?handed/.test(t));
    const alts = altAbilities
      .filter((o) =>
        weaponAbilityFits(o, {
          magic: (it?.magic ?? 0) > 0 || /^\+\d/.test(el.name) || !/^(|none|mundane|unknown)$/i.test(el.setters.rarity?.value ?? ""),
          ranged,
          twoHanded: twoHandedTag,
        }),
      )
      .map((o) => mod(o.ability));
    const plainName = el.name
      .replace(/^[+-]\d+\s*/, "")
      .replace(/\s*,?\s*[+-]\d+$/, "")
      .replace(/\s*\(.*\)\s*$/, "")
      .toLowerCase();
    const prop = (p: string) =>
      tags.some((t) => t === p || t.endsWith(`_${p.replace(/-/g, "_")}`) || t.endsWith(`_${p.replace(/-/g, "")}`));
    // The weapon's kind in either provider's tags: "simple" (5e.tools), "..._weapon_category_simple_melee" (Aurora).
    const simple = tags.some((t) => /(^|_)simple(_|$)/.test(t));
    const martial = tags.some((t) => /(^|_)martial(_|$)/.test(t));
    // Martial Arts, written here apart from the sheet's own reading: a Monk without armor or shield may use Dexterity
    // with a monk weapon (2014: shortswords and simple melee weapons that are not two-handed or heavy; 2024: simple
    // melee weapons and martial melee weapons with the Light property).
    const monk = refs.find((x) => x.el && /^monk$/i.test(x.el.name.replace(/\s*\(.*\)$/, "")))?.el;
    const monkWeapon =
      !!monk &&
      !worn.length &&
      !ranged &&
      (isModern(monk)
        ? simple || (martial && prop("light"))
        : plainName === "shortsword" || (simple && !prop("two-handed") && !prop("heavy")));
    const m = Math.max(finesse || monkWeapon ? Math.max(dex, mod("strength")) : ranged ? dex : mod("strength"), ...alts);
    const proficient = !/not proficient/.test(a.notes);
    // Trained or not is the sheet's word above, so it is judged on its own here: a weapon the first class trains (its
    // kind, its name, or a martial weapon with a property the class names) must not count as untrained. The sheet had
    // every 2014 class's named weapons as untrained on 5e.tools content, and nothing said so (2026-11-10).
    // Firearms are left out of the kinds: the Dungeon Master's Guide leaves training with them to the table, Aurora
    // asks for it by name, and Plutonium keeps "firearms" as a kind of its own beside simple and martial.
    const firearm = tags.some((t) => /firearm/.test(t)) || /FIREARM/i.test(el.setters.proficiency?.value ?? "");
    const trains =
      first &&
      ((!firearm && simple && first.startWeapons?.includes("simple")) ||
        (!firearm && martial && first.startWeapons?.includes("martial")) ||
        first.startWeaponNames?.some((n) => n === plainName || n === `${plainName}s` || `${n}s` === plainName) ||
        (martial && first.startMartialWith?.some((p) => prop(p))));
    if (!proficient && trains) add("Weapon the class trains counted as untrained", `${a.name}: ${first!.name} trains it`);
    const magic = (it?.magic ?? 0) + (Number(el.setters.attackBonus?.value) || 0);
    // Fighting styles, features and items add to every attack of a kind: named parts of "ranged:attack",
    // "melee:attack" and "attack".
    const wname = el.name
      .replace(/^[+-]\d+\s*/, "")
      .replace(/\s*,?\s*[+-]\d+$/, "")
      .replace(/\s*\(.*\)\s*$/, "")
      .toLowerCase();
    const parts = [
      ...r.stats.parts(`${ranged ? "ranged" : "melee"}:attack`),
      ...r.stats.parts("attack"),
      ...r.stats.parts(`${wname}:attack`),
    ];
    const want = m + (proficient ? sh.proficiency : 0) + magic + parts.reduce((t, p) => t + p.value, 0);
    if (a.bonus !== want && !(a.id && ch.attackEdits?.[a.id]?.bonusAdjust))
      add(
        "Weapon attack bonus",
        `${a.name}: +${a.bonus}, the rules give +${want}${parts.length ? ` (with ${parts.map((p) => `${p.from} ${p.value}`).join(", ")})` : ""}`,
      );
    // The damage, judged here too (the audit's R13: only the attack bonus was): the weapon's die (its versatile die
    // in two hands; a Monk's Martial Arts die when that is larger, by the class tables of both Player's Handbooks),
    // the same ability's modifier, the weapon's magic, the named parts, and Dueling's 2 for a lone one-handed melee
    // weapon.
    if (!(a.id && ch.attackEdits?.[a.id]?.damage)) {
      const own = it?.twoHanded && el.setters.versatile ? el.setters.versatile.value : (el.setters.damage?.value ?? "");
      const monkLevel = monk ? (refs.find((x) => x.el === monk)?.c.level ?? 0) : 0;
      const martialArts = !monkLevel
        ? 0
        : isModern(monk!)
          ? monkLevel >= 17
            ? 12
            : monkLevel >= 11
              ? 10
              : monkLevel >= 5
                ? 8
                : 6
          : monkLevel >= 17
            ? 10
            : monkLevel >= 11
              ? 8
              : monkLevel >= 5
                ? 6
                : 4;
      const single = /^1d(\d+)$/.exec(own.trim());
      const die = monkWeapon && single && martialArts > Number(single[1]) ? `1d${martialArts}` : own;
      const dueling = r.active.some((x) => /^(?:fighting style:\s*)?dueling$/i.test(lc(x.el.name).replace(/^level \d+:\s*/, "")));
      const held = ch.inventory.filter((i) => i.equipped && i.id && reg.get(i.id)?.type === "Weapon").length;
      const duel = dueling && !ranged && !twoHandedTag && !it?.twoHanded && held <= 1 ? 2 : 0;
      const dparts = [
        ...r.stats.parts(`${ranged ? "ranged" : "melee"}:damage`),
        ...r.stats.parts("damage"),
        ...r.stats.parts(`${wname}:damage`),
      ];
      const flat = m + (it?.magic ?? 0) + (Number(el.setters.damageBonus?.value) || 0) + duel + dparts.reduce((t, p) => t + p.value, 0);
      const wantDamage = die ? `${die}${flat ? (flat > 0 ? `+${flat}` : String(flat)) : ""}` : "";
      if (die && a.damage.replace(/\s+/g, "") !== wantDamage.replace(/\s+/g, ""))
        add(
          "Weapon damage",
          `${a.name}: ${a.damage}, the rules give ${wantDamage}${duel ? " (with Dueling 2)" : ""}${dparts.length ? ` (with ${dparts.map((p) => `${p.from} ${p.value}`).join(", ")})` : ""}`,
        );
    }
  }
  return out;
}
