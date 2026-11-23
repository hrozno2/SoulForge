/**
 * A list's filters are kept by the list's name, apart for each list, and go only when they are set anew.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { forgetFilters, readKept, restartFilters, writeKept } from "./keptFilters";

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

// Chris, 2026-11-23: the filters come back after the app is closed and opened again.
describe("kept filters through a restart", () => {
  const box = new Map<string, string>();
  const storage = {
    getItem: (k: string) => box.get(k) ?? null,
    setItem: (k: string, v: string) => void box.set(k, v),
    removeItem: (k: string) => void box.delete(k),
  };
  beforeEach(() => {
    box.clear();
    (globalThis as { localStorage?: unknown }).localStorage = storage;
    forgetFilters();
  });
  it("come back as they were, ticked values and all", () => {
    writeKept("board.Race", "search", "elf");
    writeKept("board.Race", "ticked", { source: new Set(["PHB", "XGE"]), level: new Set<string>() });
    writeKept("board.Race", "panel", true);
    restartFilters();
    expect(readKept("board.Race", "search", "")).toBe("elf");
    const ticked = readKept<Record<string, Set<string>>>("board.Race", "ticked", {});
    expect(ticked.source).toBeInstanceOf(Set);
    expect([...ticked.source]).toEqual(["PHB", "XGE"]);
    expect(ticked.level.size).toBe(0);
    expect(readKept("board.Race", "panel", false)).toBe(true);
  });
  it("stay cleared after a restart once the player cleared them", () => {
    writeKept("board.Race", "ticked", { source: new Set(["PHB"]) });
    writeKept("board.Race", "ticked", {});
    writeKept("board.Race", "search", "");
    restartFilters();
    expect(readKept("board.Race", "ticked", { x: new Set(["never"]) })).toEqual({});
    expect(readKept("board.Race", "search", "start")).toBe("");
  });
  it("start empty from a damaged copy, without failing", () => {
    box.set("charforge.filters.v1", "{ not json");
    restartFilters();
    expect(readKept("board.Race", "search", "")).toBe("");
    writeKept("board.Race", "search", "orc");
    restartFilters();
    expect(readKept("board.Race", "search", "")).toBe("orc");
  });
});
