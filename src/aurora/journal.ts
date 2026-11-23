/**
 * The Journal is the one home for a character's notes (Chris 2026-11-23): what an import brought and left, what a
 * move to 5e.tools changed, what a damaged file had wrong, what "Make it legal" changed. Each goes in as an entry of
 * its own, dated and titled, never twice.
 */
import { uid, type Character, type JournalEntry } from "./character";

/** Whether the journal already holds this text (under any title). */
export function hasJournalNote(ch: Pick<Character, "journal">, text: string): boolean {
  return !!text && (ch.journal ?? []).some((e) => e.text === text);
}

/** The character with the note as a journal entry; unchanged when the same text is there already, or it is empty. */
export function addJournalNote(ch: Character, title: string, text: string, date: string): Character {
  if (!text.trim() || hasJournalNote(ch, text)) return ch;
  const entry: JournalEntry = { uid: uid(), date, title, text };
  return { ...ch, journal: [...(ch.journal ?? []), entry] };
}
