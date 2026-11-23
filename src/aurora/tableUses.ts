/**
 * "What this table uses" (Chris 2026-11-23): the switches that decide what every list shows, in one panel that each
 * list's filter bar opens, with the number of that list's options each switch stands for. The switches themselves
 * are the app's settings; this file is the one list of them and the counting.
 */
import { hiddenBy, type BookInfo, type ContentFilters } from "./books";

export type TableSwitch = "legacy" | "playtest" | "unusual" | "scifi" | "modern";

/** The switches in the order shown, each with the setting that holds it and its words. */
export const TABLE_SWITCHES: {
  key: TableSwitch;
  setting: "showLegacy" | "showPlaytest" | "showUnusual" | "showSciFi" | "showModern";
  label: string;
  hint: string;
}[] = [
  { key: "legacy", setting: "showLegacy", label: "2014 rules", hint: "Species, classes, spells and items from before the 2024 books" },
  { key: "playtest", setting: "showPlaytest", label: "Unearthed Arcana and playtest", hint: "Draft material that may change" },
  {
    key: "unusual",
    setting: "showUnusual",
    label: "Settings and other sources",
    hint: "Eberron, Ravnica, Theros and other worlds, plus third party and homebrew books",
  },
  { key: "scifi", setting: "showSciFi", label: "Sci-fi technology", hint: "Futuristic gear: laser and antimatter guns, powered armor" },
  {
    key: "modern",
    setting: "showModern",
    label: "Modern technology",
    hint: "Renaissance and modern gear: pistols, revolvers, muskets, rifles, shotguns, modern vehicles",
  },
];

/** The content filters of the app's settings, the one place the two are matched. */
export function contentFilters(p: {
  showLegacy: boolean;
  showPlaytest: boolean;
  showUnusual: boolean;
  showSciFi?: boolean;
  showModern?: boolean;
}): ContentFilters {
  return { legacy: p.showLegacy, playtest: p.showPlaytest, unusual: p.showUnusual, scifi: p.showSciFi, modern: p.showModern };
}

const EVERYTHING: Required<ContentFilters> = { legacy: true, playtest: true, unusual: true, scifi: true, modern: true };

type Listed = { source: string; type: string; supports?: string[] };

/**
 * For each switch, how many of a list's options it stands for: the ones that switch alone would hide. An option
 * two switches cover (a playtest book of another world) counts under both, so the numbers may add up to more than
 * the list hides.
 */
export function switchCounts(items: readonly Listed[], info: (source: string) => BookInfo): Record<TableSwitch, number> {
  const out: Record<TableSwitch, number> = { legacy: 0, playtest: 0, unusual: 0, scifi: 0, modern: 0 };
  for (const e of items) {
    const book = info(e.source);
    for (const { key } of TABLE_SWITCHES) if (hiddenBy(book, e.source, { ...EVERYTHING, [key]: false }, e.type, e.supports)) out[key]++;
  }
  return out;
}
