/**
 * The copy of the open character kept in localStorage, which is what survives a sudden quit between two saves to the
 * library. A large portrait made the whole character too big for it, and only the id was kept: the edits since the
 * last library save were then lost with the window (audit E6). Now the character is kept without its portrait, which
 * the library has, and the portrait is put back from there at the next start.
 */
import type { Character } from "../aurora/character";

export interface CurrentCopy {
  id: string;
  ch?: Character;
  /**
   * The character without its portrait, left out for size: the portrait is in the library's copy. Under a name of its
   * own, so a build from before this reads the copy as "the id only" and opens the library's character, rather than
   * taking a character with no portrait for the whole one and saving it over the library's.
   */
  chNoPortrait?: Character;
}

export type CopyKind = "whole" | "without the portrait" | "the id only" | "nothing";

/** Writes the fullest copy the storage takes, and says which. `put` throws when the text is too big. */
export function writeCurrentCopy(id: string, ch: Character, put: (text: string) => void): CopyKind {
  const tries: [CopyKind, () => CurrentCopy][] = [
    ["whole", () => ({ id, ch })],
    ["without the portrait", () => ({ id, chNoPortrait: { ...ch, portrait: undefined } })],
    ["the id only", () => ({ id })],
  ];
  for (const [kind, make] of tries) {
    // Nothing is left out of a character that has no portrait: the same text would only fail again.
    if (kind === "without the portrait" && !ch.portrait) continue;
    try {
      put(JSON.stringify(make()));
      return kind;
    } catch {
      /* too big, or the storage is unavailable: the next, smaller one */
    }
  }
  return "nothing";
}

/**
 * The open character as a copy without its portrait, whatever its size: for a character that was opened from such a
 * copy and whose portrait the library has not given back yet. Written as a whole copy it would pass for the whole
 * character at the next start, and the library's portrait would be saved away. False when the storage refuses it.
 */
export function writeCopyWithoutPortrait(id: string, ch: Character, put: (text: string) => void): boolean {
  try {
    put(JSON.stringify({ id, chNoPortrait: { ...ch, portrait: undefined } } satisfies CurrentCopy));
    return true;
  } catch {
    return false;
  }
}

/** The copy as stored; undefined when there is none or it cannot be read. */
export function readCurrentCopy(raw: string | null): CurrentCopy | undefined {
  if (!raw) return undefined;
  try {
    const p = JSON.parse(raw) as CurrentCopy;
    return p && typeof p.id === "string" ? p : undefined;
  } catch {
    return undefined;
  }
}

/** The open character with the library's portrait put back, when its copy was kept without one. */
export function withLibraryPortrait(open: Character, library: Character | undefined): Character {
  return open.portrait || !library?.portrait ? open : { ...open, portrait: library.portrait };
}
