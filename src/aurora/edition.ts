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
export function isModern(e: Pick<AElement, "id" | "source"> | undefined): boolean {
  return !!e && (MODERN_ID.test(e.id) || MODERN_SOURCE.test(e.source ?? ""));
}

export function editionOf(e: Pick<AElement, "id" | "source"> | undefined): Edition {
  return isModern(e) ? "2024" : "2014";
}

/** Unearthed Arcana and other playtest material. */
export function isPlaytest(e: Pick<AElement, "id" | "source"> | undefined): boolean {
  return !!e && (/unearthed|playtest/i.test(e.source ?? "") || /_UA\d|_UA_/.test(e.id));
}
