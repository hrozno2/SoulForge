import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newCharacter, type Character } from "../aurora/character";
import type { CharacterRecord } from "../aurora/storage";
import { SaveQueue } from "./saveQueue";

const named = (name: string): Character => ({ ...newCharacter(), name });
const label = (c: Character) => ({ name: c.name, summary: "" });

describe("saving the open character", () => {
  let written: CharacterRecord[];
  let fail: boolean;
  let q: SaveQueue;
  beforeEach(() => {
    vi.useFakeTimers();
    written = [];
    fail = false;
    q = new SaveQueue(async (rec) => { if (fail) throw new Error("disk full"); written.push(rec); }, 800, () => 1);
  });
  afterEach(() => vi.useRealTimers());

  it("writes a little after the last edit, once", async () => {
    q.schedule("a", named("A1"), label(named("A1")));
    const a2 = named("A2");
    q.schedule("a", a2, label(a2));
    expect(q.state).toBe("pending");
    await vi.advanceTimersByTimeAsync(800);
    expect(written.map((r) => r.name)).toEqual(["A2"]);
    expect(q.state).toBe("saved");
  });

  // The bug (S1): the next character's change cleared the timer that held this one's save.
  it("keeps an edit when another character is opened before the wait is over", async () => {
    const a = named("A edited");
    q.schedule("a", a, label(a));
    const b = named("B");
    q.markStored("b", b);
    q.schedule("b", b, label(b));
    await vi.advanceTimersByTimeAsync(1000);
    expect(written.map((r) => `${r.id}:${r.name}`)).toEqual(["a:A edited"]);
    expect(q.state).toBe("saved");
  });

  it("does not save a character opened from the library until it changes", async () => {
    const a = named("A");
    q.markStored("a", a);
    q.schedule("a", a, label(a));
    await vi.advanceTimersByTimeAsync(1000);
    expect(written).toEqual([]);
    expect(q.state).toBe("saved");
    const a2 = { ...a, xp: 5 };
    q.schedule("a", a2, label(a2));
    await vi.advanceTimersByTimeAsync(800);
    expect(written.length).toBe(1);
  });

  // The bug (S2): a failed write was swallowed and the bar still said "Saved".
  it("shows a failed write and writes it at the next try", async () => {
    fail = true;
    const a = named("A");
    q.schedule("a", a, label(a));
    await vi.advanceTimersByTimeAsync(800);
    expect(q.state).toBe("failed");
    expect(q.error).toBe("disk full");
    expect(q.dirty).toBe(true);
    fail = false;
    await q.flush();
    expect(written.map((r) => r.name)).toEqual(["A"]);
    expect(q.state).toBe("saved");
  });

  it("writes at once when asked (the window is hidden or closing)", async () => {
    const a = named("A");
    q.schedule("a", a, label(a));
    await q.flush();
    expect(written.length).toBe(1);
  });

  it("a newer edit made during a failed write is the one kept", async () => {
    fail = true;
    const a1 = named("A1");
    q.schedule("a", a1, label(a1));
    const p = q.flush();
    const a2 = named("A2");
    q.schedule("a", a2, label(a2));
    await p;
    fail = false;
    await vi.advanceTimersByTimeAsync(800);
    expect(written.map((r) => r.name)).toEqual(["A2"]);
  });
});
