/** The app's log (A2.11): events are kept; `timed` logs only slow work. */
import { describe, expect, it } from "vitest";
import { logEvent, logLines, timed } from "./logbook";

describe("logbook", () => {
  it("keeps events with their area", () => {
    logEvent("import", "test event 1");
    expect(logLines().some((l) => / import test event 1$/.test(l))).toBe(true);
  });

  it("logs work only when it is slow", () => {
    const before = logLines().length;
    expect(timed("engine", "fast thing", () => 42, 1000)).toBe(42);
    expect(logLines().length).toBe(before);
    timed("engine", "slow thing", () => { const end = performance.now() + 5; while (performance.now() < end) { /* busy */ } }, 1, () => "detail");
    expect(logLines().at(-1)).toMatch(/engine slow: slow thing took \d+ ms \(detail\)$/);
  });
});
