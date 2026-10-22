/**
 * Which rules an element belongs to, decided in one place. The 2024 rules are the 2024 Player's Handbook and
 * Dungeon Master's Guide, the 2025 Monster Manual and books written for them (Eberron: Forge of the Artificer);
 * content added from 5e.tools names them by code (XPHB, XDMG, XMM, EFA). Everything else is the 2014 rules.
 */
import type { AElement } from "./types";

export type Edition = "2014" | "2024";

const MODERN_SOURCE = /\((2024|2025)\)|^(XPHB|XDMG|XMM|EFA)$|Forge of the Artificer/i;
const MODERN_ID = /_(PHB24|DMG24|MM25|XPHB|XDMG|XMM|EFA)_|^ID_(PHB24|XPHB)_/i;

/** True for an element of the 2024 rules. Takes the element, or an ID and source when only those are known. */
export function isModern(e: (Pick<AElement, "id" | "source"> & { edition?: string }) | undefined): boolean {
  if (!e) return false;
  if (e.edition) return e.edition === "2024";
  return MODERN_ID.test(e.id) || MODERN_SOURCE.test(e.source ?? "");
}

/** The 2024 Player's Handbook's release: books published from then on are written for the 2024 rules. */
export const RULES_2024 = 20240917;

/**
 * Stamps each element's edition from its book's release date (the Source elements both providers carry): Heroes of
 * Faerûn, Lorwyn: First Light and Ravenloft: The Horrors Within are 2024 rules though their names do not say so.
 * Elements whose book has no date keep the name-based reading.
 */
export function stampEditions(elements: Iterable<AElement>, releaseOf: (source: string) => number | undefined): void {
  for (const el of elements) {
    if (el.edition) continue;
    if (MODERN_ID.test(el.id) || MODERN_SOURCE.test(el.source ?? "")) { el.edition = "2024"; continue; }
    const rel = releaseOf(el.source ?? "");
    if (rel) el.edition = rel >= RULES_2024 ? "2024" : "2014";
  }
}

export function editionOf(e: Pick<AElement, "id" | "source"> | undefined): Edition {
  return isModern(e) ? "2024" : "2014";
}

/** Unearthed Arcana and other playtest material. */
export function isPlaytest(e: Pick<AElement, "id" | "source"> | undefined): boolean {
  return !!e && (/unearthed|playtest/i.test(e.source ?? "") || /_UA\d|_UA_/.test(e.id));
}
