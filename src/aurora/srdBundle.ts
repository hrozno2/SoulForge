/**
 * The SRD bundle (Stage D2): the 5e.tools entries marked `srd` (SRD 5.1) or `srd52` (SRD 5.2), converted to elements, so
 * a character can be built with nothing imported. Ids stay those of the user's own 5e.tools copy, so loading both gives
 * one entry of each. Names follow the SRD where it names a thing differently ("Melf's Acid Arrow" is "Acid Arrow").
 */
import { convertFiveTools } from "./fivetools";
import { followSrd, type FollowReport } from "./srdFollow";
import type { SrdSection } from "./srdPdf";
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
  // 5e.tools keeps mechanics its text does not state as data in side files ("foundry.json": the choices, uses and
  // effects of an entry, by the entry's name and book). Their entries carry no SRD mark of their own, so all of them
  // were dropped, and with them a Rogue's and a Bard's Expertise choice (found 2026-11-11). A side entry is kept when
  // the entry it belongs to is marked.
  const identity = (kind: string, x: Record<string, unknown>) => `${kind}|${String(x.name).toLowerCase()}|${String(x.source).toLowerCase()}|${String(x.className ?? "").toLowerCase()}|${String(x.subclassShortName ?? "").toLowerCase()}|${String(x.level ?? "")}`;
  const isSide = (file: string) => /(^|\/)foundry[^/]*\.json$/i.test(file);
  const markedIds = new Set<string>();
  for (const [file, data] of Object.entries(files)) {
    if (isSide(file)) continue;
    for (const [kind, list] of Object.entries(data)) if (Array.isArray(list)) for (const x of list) if (x && typeof x === "object" && flagOf(x, flag)) markedIds.add(identity(kind, x));
  }
  for (const [file, data] of Object.entries(files)) {
    const kept: Record<string, unknown> = {};
    for (const [kind, list] of Object.entries(data)) {
      if (!Array.isArray(list)) kept[kind] = list;
      else if (STRUCTURE.has(kind)) kept[kind] = list;
      else if (isSide(file)) {
        const mine = list.filter((x) => x && typeof x === "object" && markedIds.has(identity(kind, x as Record<string, unknown>)));
        if (mine.length) kept[kind] = mine;
      } else {
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
export function srdElements(files: Files, edition: SrdEdition, corpus?: string, dropped?: string[], sections?: SrdSection[], follow?: { report?: FollowReport }, tableRows?: string[]): AElement[] {
  const { files: marked, renames } = srdFiles(files, edition);
  // Longest first, so a name inside a longer one is not swapped half way.
  const swaps = [...renames].sort((a, b) => b[0].length - a[0].length);
  const named = convertFiveTools({ files: marked as never }).map((el) => ({ ...el, name: swapNames(el.name, swaps), ...(el.description ? { description: swapNames(el.description, swaps).replace(/, from X?PHB\./, ".") } : {}) }));
  // The SRD decides: what the PDF has replaces what 5e.tools' copy says, before the word check reads the rest.
  let following = named;
  let fromPdf = new Set<AElement>();
  if (sections) { const f = followSrd(named, sections, edition, corpus, tableRows); following = f.elements; fromPdf = f.report.fromPdf; if (follow) follow.report = f.report; }
  const text = (el: AElement, html: string) => {
    // The generic Ability Score Improvement feat is the app's own wording of a rule, as are the types in OWN_TEXT_TYPES.
    if (!corpus || OWN_TEXT_TYPES.has(el.type) || el.name === "Ability Score Improvement") return html;
    const r = srdDescription(html, corpus, NOT_IN_SRD);
    for (const d of r.dropped) dropped?.push(`${el.type} | ${el.name} | ${d}`);
    return r.html;
  };
  return following.map((el) => ({
    ...el,
    // What came from the PDF is the SRD's by definition.
    description: el.description && !fromPdf.has(el) ? text(el, el.description) : el.description,
    ...(el.sheet ? { sheet: { ...el.sheet, descriptions: el.sheet.descriptions?.map((d) => ({ ...d, text: d.text ? text(el, d.text) : d.text })) } } : {}),
    source: SRD_SOURCE[edition],
  }));
}
