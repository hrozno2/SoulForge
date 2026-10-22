/**
 * Facts about the books content comes from: release dates, whether it is official or playtest material, and how
 * "recommended" a choice is. Dates come from the Source elements the content files carry.
 */
import type { AElement } from "./types";
import type { ARegistry } from "./registry";

export interface BookInfo {
  name: string;
  /** YYYYMMDD, when the content says. */
  release?: number;
  official: boolean;
  /** Unearthed Arcana and other playtest material. */
  playtest: boolean;
  abbr?: string;
  /** True when the content has a Source element for this book, so "official" is a fact and not a guess. */
  known?: boolean;
}

/**
 * One key per book, whichever provider names it. Aurora and 5e.tools spell the same book differently: "Player’s
 * Handbook" and "Player's Handbook (2014)", "Monsters of the Multiverse" and "Mordenkainen Presents: Monsters of the
 * Multiverse", "Strixhaven: A Curriculum Of Chaos" and "...of Chaos". The 2014 year mark, a "X Presents:" lead-in,
 * case, quotes and spacing do not make a different book.
 */
export const bookKey = (s: string) =>
  s.toLowerCase().replace(/[’‘`]/g, "'").replace(/\s*\(2014\)\s*$/, "").replace(/^[\w' ]+ presents:\s*/, "").replace(/\s+/g, " ").trim();
const key = bookKey;

export class BookIndex {
  private map = new Map<string, BookInfo>();
  constructor(reg: ARegistry) {
    for (const e of reg.ofType("Source")) {
      // Both providers can describe one book; Aurora's description is kept.
      const had = this.map.get(key(e.name));
      if (had && e.origin === "5etools") continue;
      const rel = parseInt(e.setters.release?.value ?? "", 10);
      this.map.set(key(e.name), {
        name: e.name,
        release: Number.isFinite(rel) ? rel : undefined,
        official: (e.setters.official?.value ?? "").toLowerCase() === "true",
        playtest: /unearthed arcana|playtest/i.test(e.name),
        abbr: e.setters.abbreviation?.value,
        known: true,
      });
    }
  }

  info(source: string): BookInfo {
    const hit = this.map.get(key(source));
    if (hit) return hit;
    return { name: source, official: false, playtest: /unearthed arcana|playtest/i.test(source) };
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatRelease(r: number | undefined): string {
  if (!r) return "";
  const y = Math.floor(r / 10000);
  const m = Math.floor((r % 10000) / 100);
  return m >= 1 && m <= 12 ? `${MONTHS[m - 1]} ${y}` : String(y);
}
export const yearOf = (r: number | undefined) => (r ? Math.floor(r / 10000) : undefined);

export const ruleSetOf = (book: BookInfo, source: string): "2024" | "Legacy" =>
  /2024|2025|\(24\)/.test(source) || (book.release !== undefined && book.release >= 20240917) ? "2024" : "Legacy";

/** Most-played options first, by the usual community ordering. The rest follow by book. */
const POPULAR: Record<string, string[]> = {
  Race: ["human", "elf", "dwarf", "halfling", "half-elf", "half-orc", "tiefling", "dragonborn", "gnome", "aasimar", "goliath", "orc", "tabaxi", "genasi", "goblin", "firbolg", "kenku", "lizardfolk", "triton", "bugbear", "hobgoblin", "kobold", "aarakocra", "changeling", "warforged", "shifter", "tortle", "yuan-ti pureblood", "satyr", "fairy", "harengon", "owlin", "autognome", "giff", "hadozee", "plasmoid", "thri-kreen"],
  Class: ["fighter", "wizard", "rogue", "cleric", "paladin", "ranger", "barbarian", "bard", "warlock", "sorcerer", "druid", "monk", "artificer"],
  Background: ["soldier", "acolyte", "criminal", "sage", "noble", "folk hero", "charlatan", "entertainer", "outlander", "urchin", "hermit", "guild artisan", "artisan", "sailor", "farmer", "guard", "merchant", "scribe", "wayfarer", "guide"],
  Feat: ["great weapon master", "sharpshooter", "war caster", "lucky", "alert", "resilient", "tough", "sentinel", "polearm master", "crossbow expert", "mobile", "observant", "magic initiate", "skilled", "savage attacker", "ability score improvement"],
};

/** True when the "recommended" order has anything to go on for this type: a popularity list, or choices from books of different standing. */
export function hasRecommendation(type: string, groups: Group[]): boolean {
  if (POPULAR[type]) return true;
  const tiers = new Set(groups.map((g) => Math.min(...g.variants.map((v) => bookTier(v.book, v.el.source)))));
  return tiers.size > 1;
}

export function popularity(type: string, name: string): number {
  const list = POPULAR[type];
  const i = list ? list.indexOf(name.toLowerCase()) : -1;
  return i >= 0 ? i : 1000;
}

/** Lower is better. Newest official books before older ones, playtest and unknown last. */
export function bookTier(book: BookInfo, source: string): number {
  if (/player.s handbook \(2024\)/i.test(source)) return 0;
  if (/^player.s handbook$/i.test(source)) return 1;
  if (book.playtest) return 6;
  if (book.official) return 2;
  return 5;
}

export interface Variant {
  el: AElement;
  book: BookInfo;
}

export interface Group {
  key: string;
  name: string;
  type: string;
  variants: Variant[];
  /** Variant to use when nothing says otherwise: newest official, non-playtest. */
  best: Variant;
  /** The most recently published variant, for the "Newest" tag. */
  newest: Variant;
}

const sameName = (n: string) => n.toLowerCase().replace(/[’`]/g, "'").replace(/\s*\((20\d\d|legacy|revised)\)\s*$/i, "").replace(/\s+/g, " ").trim();

/** One entry per name, with its versions from different books newest first. */
export function groupVariants(items: AElement[], books: BookIndex): Group[] {
  const map = new Map<string, Variant[]>();
  for (const el of items) {
    const k = `${el.type}|${sameName(el.name)}`;
    (map.get(k) ?? map.set(k, []).get(k)!).push({ el, book: books.info(el.source) });
  }
  const out: Group[] = [];
  for (const [k, all] of map) {
    // The same book can come from two providers (Aurora files and 5etools data). Keep one copy, preferring Aurora's.
    const seen = new Map<string, Variant>();
    for (const v of all) {
      const sk = key(v.el.source);
      const have = seen.get(sk);
      if (!have || (have.el.origin === "5etools" && v.el.origin !== "5etools")) seen.set(sk, v);
    }
    const variants = [...seen.values()];
    variants.sort((a, b) => (b.book.release ?? 0) - (a.book.release ?? 0) || a.el.source.localeCompare(b.el.source));
    const official = variants.filter((v) => !v.book.playtest);
    const best = official[0] ?? variants[0];
    const dated = variants.filter((v) => v.book.release && !v.book.playtest);
    const newest = dated[0] ?? variants[0];
    out.push({ key: k, name: variants[0].el.name, type: variants[0].el.type, variants, best, newest });
  }
  return out;
}

export type SortMode = "az" | "recommended" | "newest" | "level";

export function sortGroups(groups: Group[], mode: SortMode): Group[] {
  const arr = [...groups];
  const tier = (g: Group) => Math.min(...g.variants.map((v) => bookTier(v.book, v.el.source)));
  const rel = (g: Group) => g.newest.book.release ?? 0;
  if (mode === "az") return arr.sort((a, b) => a.name.localeCompare(b.name));
  if (mode === "newest") return arr.sort((a, b) => rel(b) - rel(a) || a.name.localeCompare(b.name));
  if (mode === "level") {
    const lv = (g: Group) => parseInt(g.best.el.setters.level?.value ?? "99", 10);
    return arr.sort((a, b) => lv(a) - lv(b) || a.name.localeCompare(b.name));
  }
  return arr.sort((a, b) => popularity(a.type, a.name) - popularity(b.type, b.name) || tier(a) - tier(b) || rel(b) - rel(a) || a.name.localeCompare(b.name));
}

/** Campaign setting and adventure books, whose options suit one world. */
const SETTING_BOOKS = /eberron|ravnica|theros|strixhaven|spelljammer|wildemount|explorer.s guide to|planescape|dragonlance|ravenloft|van richten|forgotten realms|sword coast|avernus|baldur|icewind|candlekeep|acquisitions inc|mythic odysseys|plane shift|critical role|radiant citadel|netherdeep|witchlight|journeys through|golden vault|infinite staircase|dragonlance|dark sun|greyhawk|midnight|kobold press|tal.dorei|lost laboratory|call of the|astral adventurer|boo.s astral|adventurers league|tomb of annihilation|storm king|princes of the apocalypse|out of the abyss|waterdeep|rime of the|ghosts of saltmarsh|elemental evil|tyranny of dragons|adventure with muk/i;

export type ContentFilters = { legacy: boolean; playtest: boolean; unusual: boolean };

export const ALL_CONTENT: ContentFilters = { legacy: true, playtest: true, unusual: true };

/** Which of the global content filters would hide something from this book. */
/**
 * Things that belong to no rule set or setting: skills, languages, tools, sizes and senses, and Aurora's own core
 * essentials and internal entries. The content filters never hide them; a Ranger's skill choice needs every skill.
 */
const NEUTRAL_TYPES = /^(Proficiency|Language|Size|Vision|Condition|Ability Score Improvement|Training Option)$/;
export function filterNeutral(type: string, source: string): boolean {
  return NEUTRAL_TYPES.test(type) || /^(aurora legacy essentials|internal|5etools)$/i.test(source.trim());
}

export function hiddenBy(book: BookInfo, source: string, f: ContentFilters, type = ""): boolean {
  if (filterNeutral(type, source)) return false;
  if (!f.playtest && book.playtest) return true;
  if (!f.legacy && ruleSetOf(book, source) === "Legacy" && !book.playtest) return true;
  if (!f.unusual && (SETTING_BOOKS.test(source) || (book.known && !book.official && !book.playtest))) return true;
  return false;
}
