import { describe, expect, it } from "vitest";
import { maximal } from "./testdata";
import { fill2014, fill2024Form, type Sink, type W } from "./forms";
import { LAYOUTS } from "./official";

const RECTS_2014 = LAYOUTS["3p"].widgets;
import { buildPlan } from "./automap";

const recorder = () => {
  const text = new Map<string, string>();
  const checks = new Map<string, boolean>();
  const sink: Sink = { text: (w, v) => void text.set(`${w.p}:${w.name}`, v), check: (w, on) => void checks.set(`${w.p}:${w.name}:${w.x}:${w.y}`, on), image: (w) => void checks.set(`${w.p}:${w.name}:${w.x}:${w.y}`, true) };
  return { sink, text, checks };
};

const unreached = (ws: W[], text: Map<string, string>) => [...new Set(ws.filter((w) => w.t === "Tx" && !text.has(`${w.p}:${w.name}`)).map((w) => w.name.trim()))];

describe("official sheets are fully mapped", () => {
  it("classic 2014 sheet: every text field is reached", () => {
    const { sink, text, checks } = recorder();
    fill2014(RECTS_2014, maximal(), sink);
    expect(unreached(RECTS_2014, text)).toEqual([]);
    // Saving throws, skills and prepared spells were ticked.
    expect([...checks.values()].filter(Boolean).length).toBeGreaterThan(20);
  });
  it("official 2024 sheet: every text field is reached", () => {
    const ws = LAYOUTS["2024"].widgets;
    const { sink, text, checks } = recorder();
    fill2024Form(ws, maximal(), sink);
    expect(unreached(ws, text)).toEqual([]);
    expect([...checks.values()].filter(Boolean).length).toBeGreaterThan(25);
  });
});

describe("check boxes", () => {
  const boxes = (ws: W[], checks: Map<string, boolean>) => ws.filter((w) => w.t === "Btn" && !checks.has(`${w.p}:${w.name}:${w.x}:${w.y}`)).map((w) => `${w.p}:${w.name}`);
  it("2024: every check box is decided", () => {
    const ws = LAYOUTS["2024"].widgets;
    const { sink, checks } = recorder();
    fill2024Form(ws, maximal(), sink);
    expect(boxes(ws, checks).filter((b) => !b.includes("Portrait"))).toEqual([]);
  });
  it("2014: every check box is decided", () => {
    const { sink, checks } = recorder();
    fill2014(RECTS_2014, maximal(), sink);
    expect(boxes(RECTS_2014, checks)).toEqual([]);
  });
});

describe("automatic matching of other fillable sheets", () => {
  it("recognises the fields of the classic sheet by name alone", () => {
    const { plan, unmatched } = buildPlan(RECTS_2014.map((w) => ({ ...w })));
    expect(plan.has("name")).toBe(true);
    expect(plan.has("strength.score")).toBe(true);
    expect(plan.has("skill.sleight of hand")).toBe(true);
    expect(unmatched.length).toBeLessThanOrEqual(2);
  });
});
