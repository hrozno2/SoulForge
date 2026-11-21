/**
 * A list's filters are kept by the list's name, apart for each list, and go only when they are set anew.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { forgetFilters, readKept, writeKept } from "./keptFilters";

describe("a list's kept filters", () => {
  beforeEach(forgetFilters);
  it("start as given, and come back as the player left them", () => {
    expect(readKept("board.Race", "search", "")).toBe("");
    writeKept("board.Race", "search", "elf");
    expect(readKept("board.Race", "search", "")).toBe("elf");
  });
  it("are each list's own", () => {
    writeKept("board.Race", "search", "elf");
    writeKept("ID_CLASS_WIZARD#abc", "search", "fire");
    expect(readKept("board.Race", "search", "")).toBe("elf");
    expect(readKept("ID_CLASS_WIZARD#abc", "search", "")).toBe("fire");
    expect(readKept("board.Class", "search", "")).toBe("");
  });
  it("keep an emptied filter empty: clearing is the player's own change", () => {
    writeKept("board.Race", "ticked", { source: new Set(["PHB"]) });
    writeKept("board.Race", "ticked", {});
    expect(readKept("board.Race", "ticked", { x: new Set(["never"]) })).toEqual({});
  });
});
