/** The Journal as the one home for notes: a note goes in once, as an entry of its own, and nothing else changes. */
import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import { addJournalNote, hasJournalNote } from "./journal";

describe("notes in the journal", () => {
  const ch = { ...newCharacter(), notes: "My own notes." };
  it("adds a dated, titled entry and leaves the character's own notes alone", () => {
    const next = addJournalNote(ch, "Import notes", "Not imported: a +1 dagger.", "2026-11-23");
    expect(next.journal?.map((e) => [e.date, e.title, e.text])).toEqual([["2026-11-23", "Import notes", "Not imported: a +1 dagger."]]);
    expect(next.notes).toBe("My own notes.");
    expect(hasJournalNote(next, "Not imported: a +1 dagger.")).toBe(true);
    expect(hasJournalNote(ch, "Not imported: a +1 dagger.")).toBe(false);
  });
  it("never adds the same note twice, and never an empty one", () => {
    const once = addJournalNote(ch, "Import notes", "Text.", "2026-11-23");
    expect(addJournalNote(once, "Import notes", "Text.", "2026-11-24")).toBe(once);
    expect(addJournalNote(ch, "Import notes", "  ", "2026-11-23")).toBe(ch);
  });
});
