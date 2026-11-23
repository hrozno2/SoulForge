/**
 * Stage D7: the release app reads no Aurora content. A character built on it is not lost: its file is untouched,
 * Aurora's files stay on the computer until the player removes them, and "Move to 5e.tools" makes a 5e.tools copy.
 * This file answers the one question the app asks about such a character: does it stand on content this app no
 * longer reads?
 */
import type { Character } from "./character";
import type { AElement } from "./types";

type Lookup = { get(id: string): AElement | undefined };

/** Aurora's own element (not 5e.tools', not the SRD's, not Soul Forge's additions). */
export const isAuroraElement = (e: AElement | undefined) =>
  !!e && e.origin !== "5etools" && !e.id.startsWith("ID_5ET") && !e.id.startsWith("ID_SF_") && !/^SRD /.test(e.source);

/** An id only this app's own content carries: 5e.tools' converted elements and Soul Forge's additions. */
const ownId = (id: string) => id.startsWith("ID_5ET") || id.startsWith("ID_SF_");

/** The ids a character stands on: its classes, species and background. */
const roots = (ch: Character) => [...ch.classes.map((c) => c.classId), ch.race ?? "", ch.background ?? ""].filter(Boolean);

/** The character's class, species or background is Aurora's, as loaded: the move has something to do. */
export function usesAurora(ch: Character, reg: Lookup): boolean {
  return roots(ch).some((id) => isAuroraElement(reg.get(id)));
}

/**
 * The character stands on Aurora content the app does not read: a class, species or background that is not loaded
 * and does not carry one of this app's own ids, while Aurora's files are on the computer. (With no Aurora files
 * here, a missing class is simply missing content, and there is nothing to move from.)
 */
export function standsOnUnreadAurora(ch: Character, reg: Lookup, auroraOnDisk: boolean): boolean {
  return auroraOnDisk && roots(ch).some((id) => !reg.get(id) && !ownId(id));
}

/** The move to 5e.tools is worth offering: Aurora's content under the character, loaded or left unread. */
export const moveOffered = (ch: Character, reg: Lookup, auroraOnDisk: boolean) =>
  usesAurora(ch, reg) || standsOnUnreadAurora(ch, reg, auroraOnDisk);
