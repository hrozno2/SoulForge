/**
 * Audit E4: the 5e.tools conversion runs in a worker and gives the same elements as on the calling thread; a worker
 * that cannot start or fails falls back to the calling thread, so content always loads.
 */
import { describe, expect, it } from "vitest";
import { convertOffThread } from "./convertOffThread";
import { convertTexts } from "./convertTexts";

const texts = {
  "languages.json": JSON.stringify({ language: [{ name: "Common", source: "PHB", type: "standard" }] }),
  "backgrounds.json": JSON.stringify({
    background: [{ name: "Tester", source: "PHB", skillProficiencies: [{ insight: true }], entries: [] }],
  }),
  "broken.json": "{ not json",
};

/** A stand-in worker that runs the same function a tick later, as the real one does on its own thread. */
const fake = (how: "works" | "throws on start" | "errors") => () => {
  if (how === "throws on start") throw new Error("no workers here");
  const w = {
    onmessage: null as ((e: { data: unknown }) => void) | null,
    onerror: null as (() => void) | null,
    terminated: false,
    terminate() {
      w.terminated = true;
    },
    postMessage(m: { texts: Record<string, string> }) {
      setTimeout(() => (how === "errors" ? w.onerror?.() : w.onmessage?.({ data: convertTexts(m.texts) })), 0);
    },
  };
  return w as unknown as Worker;
};

describe("converting a 5e.tools source off the main thread", () => {
  const here = convertTexts(texts);
  it("reads what it can and names the file it cannot", () => {
    expect(here.elements.some((e) => e.type === "Background" && e.name === "Tester")).toBe(true);
    expect(here.errors.length).toBe(1);
    expect(here.errors[0]).toMatch(/^broken\.json: /);
    expect(here.failed).toBeUndefined();
  });
  it("gives the same result through a worker", async () => {
    expect(await convertOffThread(texts, fake("works"))).toEqual({ ...here, offThread: true });
  });
  it("converts on the calling thread when no worker can be made, or the worker fails", async () => {
    expect(await convertOffThread(texts, undefined)).toEqual({ ...here, offThread: false });
    expect(await convertOffThread(texts, fake("throws on start"))).toEqual({ ...here, offThread: false });
    expect(await convertOffThread(texts, fake("errors"))).toEqual({ ...here, offThread: false });
  });
});
