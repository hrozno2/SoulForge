/**
 * Audit E6: a character too big for the quick-recovery copy (a large portrait) keeps everything but the portrait
 * there, so a sudden quit loses no edit; the portrait comes back from the library.
 */
import { describe, expect, it } from "vitest";
import { newCharacter } from "../aurora/character";
import { readCurrentCopy, withLibraryPortrait, writeCurrentCopy } from "./currentCopy";

const storage = (limit: number) => {
  const box = { text: null as string | null };
  return {
    box,
    put: (t: string) => {
      if (t.length > limit) throw new Error("QuotaExceededError");
      box.text = t;
    },
  };
};
const portrait = `data:image/png;base64,${"A".repeat(50000)}`;
const ch = { ...newCharacter(), name: "Edited a moment ago", portrait };

describe("the copy of the open character", () => {
  it("is whole when it fits", () => {
    const s = storage(1e9);
    expect(writeCurrentCopy("c1", ch, s.put)).toBe("whole");
    expect(readCurrentCopy(s.box.text)?.ch?.portrait).toBe(portrait);
  });
  it("keeps everything but the portrait when the portrait makes it too big", () => {
    const s = storage(20000);
    expect(writeCurrentCopy("c1", ch, s.put)).toBe("without the portrait");
    const back = readCurrentCopy(s.box.text)!;
    expect(back.chNoPortrait?.name).toBe("Edited a moment ago");
    expect(back.chNoPortrait?.portrait).toBeUndefined();
    // A build from before this finds no character in the copy, only the id: it opens the library's.
    expect(back.ch).toBeUndefined();
  });
  it("keeps the id when even that does not fit, and says so when nothing does", () => {
    const s = storage(60);
    expect(writeCurrentCopy("c1", ch, s.put)).toBe("the id only");
    expect(readCurrentCopy(s.box.text)).toEqual({ id: "c1" });
    expect(writeCurrentCopy("c1", ch, storage(3).put)).toBe("nothing");
  });
  it("reads nothing from a damaged copy", () => {
    expect(readCurrentCopy("{ not json")).toBeUndefined();
    expect(readCurrentCopy(null)).toBeUndefined();
  });
});

describe("the portrait put back from the library", () => {
  const open = { ...ch, portrait: undefined };
  it("joins the open character's newer edits", () => {
    const joined = withLibraryPortrait(open, { ...newCharacter(), name: "Older", portrait });
    expect(joined.name).toBe("Edited a moment ago");
    expect(joined.portrait).toBe(portrait);
  });
  it("never replaces a portrait the open character has, and changes nothing when the library has none", () => {
    expect(withLibraryPortrait(ch, { ...newCharacter(), portrait: "data:other" })).toBe(ch);
    expect(withLibraryPortrait(open, newCharacter())).toBe(open);
    expect(withLibraryPortrait(open, undefined)).toBe(open);
  });
});
