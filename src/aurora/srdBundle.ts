/**
 * The SRD bundle (Stage D2): the 5e.tools entries marked `srd` (SRD 5.1) or `srd52` (SRD 5.2), converted to elements, so
 * a character can be built with nothing imported. Ids stay those of the user's own 5e.tools copy, so loading both gives
 * one entry of each. Names follow the SRD where it names a thing differently ("Melf's Acid Arrow" is "Acid Arrow").
 */
import { convertFiveTools } from "./fivetools";
import { OWN_TEXT_TYPES, srdDescription } from "./srdText";
import type { AElement } from "./types";

export type SrdEdition = "5.1" | "5.2";
type Files = Record<string, Record<string, unknown>>;

const FLAG: Record<SrdEdition, "srd" | "srd52"> = { "5.1": "srd", "5.2": "srd52" };
/** Tables the converter reads to understand entries; they hold no entries of their own. */
const STRUCTURE = new Set(["itemProperty", "itemType", "itemTypeAdditionalEntries", "itemEntry", "itemMastery", "languageScript"]);
/** The label a bundled element shows as its source. The year is what the app reads an element's edition from. */
export const SRD_SOURCE: Record<SrdEdition, string> = { "5.1": "SRD 5.1 (2014)", "5.2": "SRD 5.2.1 (2024)" };
/** Names the SRD does not license. Nothing bundled may mention them (the guard in srdBundle.test.ts). */
export const NOT_IN_SRD = /player'?s handbook|dungeon master'?s guide|monster manual|forgotten realms|faer[uû]n|strahd|tiamat|bahamut|beholder|mind flayer|illithid|displacer beast|githyanki|xanathar|tasha|mordenkainen|bigby|tenser|otiluke|evard|leomund|drawmij|nystul|\bmelf\b|\brary\b/i;

const flagOf = (x: Record<string, unknown>, flag: string): unknown => x[flag] ?? (x.inherits as Record<string, unknown> | undefined)?.[flag];

/** Only the marked entries of one edition, and the SRD's own name of each that it renames. */
export function srdFiles(files: Files, edition: SrdEdition): { files: Files; renames: Map<string, string> } {
  const flag = FLAG[edition];
  const renames = new Map<string, string>();
  const out: Files = {};
  for (const [file, data] of Object.entries(files)) {
    const kept: Record<string, unknown> = {};
    for (const [kind, list] of Object.entries(data)) {
      if (!Array.isArray(list)) kept[kind] = list;
      else if (STRUCTURE.has(kind)) kept[kind] = list;
      else {
        const marked = list.filter((x) => x && typeof x === "object" && flagOf(x, flag));
        for (const x of marked) { const f = flagOf(x, flag); if (typeof f === "string" && typeof x.name === "string" && f !== x.name) renames.set(x.name, f); }
        if (marked.length) kept[kind] = marked;
      }
    }
    out[file] = kept;
  }
  return { files: out, renames };
}

const swapNames = (text: string, renames: [string, string][]) => renames.reduce((t, [from, to]) => t.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), to), text);

/** The bundle's elements for one edition: converted, labelled as the SRD, with the SRD's names and only its words. */
export function srdElements(files: Files, edition: SrdEdition, corpus?: string, dropped?: string[]): AElement[] {
  const { files: marked, renames } = srdFiles(files, edition);
  // Longest first, so a name inside a longer one is not swapped half way.
  const swaps = [...renames].sort((a, b) => b[0].length - a[0].length);
  const text = (el: AElement, html: string) => {
    const named = swapNames(html, swaps);
    // The generic Ability Score Improvement feat is the app's own wording of a rule, as are the types in OWN_TEXT_TYPES.
    if (!corpus || OWN_TEXT_TYPES.has(el.type) || el.name === "Ability Score Improvement") return named;
    const r = srdDescription(named, corpus, NOT_IN_SRD);
    for (const d of r.dropped) dropped?.push(`${el.type} | ${el.name} | ${d}`);
    return r.html;
  };
  return convertFiveTools({ files: marked as never }).map((el) => ({
    ...el,
    name: swapNames(el.name, swaps),
    description: el.description ? text(el, el.description) : el.description,
    ...(el.sheet ? { sheet: { ...el.sheet, descriptions: el.sheet.descriptions?.map((d) => ({ ...d, text: d.text ? text(el, d.text) : d.text })) } } : {}),
    source: SRD_SOURCE[edition],
  }));
}
