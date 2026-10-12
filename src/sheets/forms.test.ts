import { describe, expect, it } from "vitest";
import { maximal } from "./testdata";
import { fill2014, fill2024Form, type Sink, type W } from "./forms";
import { LAYOUTS } from "./official";

const RECTS_2014 = LAYOUTS["3p"].widgets;
import { autoFill, buildPlan } from "./automap";

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

describe("the other official layouts are matched by name", () => {
  for (const id of ["classic", "alt", "details", "spells", "adventurers"] as const) {
    it(`${id}: nearly every text field gets a value`, () => {
      const ws = LAYOUTS[id].widgets;
      const { sink, text } = recorder();
      autoFill(ws, maximal(), sink);
      const missed = unreached(ws, text);
      const total = new Set(ws.filter((w) => w.t === "Tx").map((w) => w.name.trim())).size;
      expect(missed.length / total, `${id} missed: ${missed.join(", ")}`).toBeLessThan(0.06);
    });
  }
});

describe("matching sheets with other naming styles", () => {
  const mk = (names: string[]) => names.map((n, i) => ({ name: n, t: "Tx" as const, p: 0, x: 40 + (i % 5) * 100, y: 700 - Math.floor(i / 5) * 20, w: 80, h: 14 }));
  const keysOf = (names: string[]) => {
    const { plan } = buildPlan(mk(names));
    const out: Record<string, string[]> = {};
    for (const [k, list] of plan) out[k] = list.map((f) => f.name);
    return out;
  };
  it("reads separators, plurals and word order", () => {
    const k = keysOf(["Character Name", "Class & Level", "Strength Score", "Strength Modifier", "Saving Throw - Strength", "str_mod", "DEX", "Armor Class", "Hit Points Max", "Passive Perception", "Athletics Bonus", "Sleight of Hand", "Spell Save DC", "Copper", "Gold"]);
    expect(k.name).toEqual(["Character Name"]);
    expect(k.classLevel).toEqual(["Class & Level"]);
    expect(k["strength.score"]).toEqual(["Strength Score"]);
    expect(k["strength.mod"]).toEqual(expect.arrayContaining(["Strength Modifier", "str_mod"]));
    expect(k["strength.save"]).toEqual(["Saving Throw - Strength"]);
    expect(k["dexterity.score"]).toEqual(["DEX"]);
    expect(k.ac).toEqual(["Armor Class"]);
    expect(k["hp.max"]).toEqual(["Hit Points Max"]);
    expect(k["skill.athletics"]).toEqual(["Athletics Bonus"]);
    expect(k["skill.sleight of hand"]).toEqual(["Sleight of Hand"]);
    expect(k["casting.dc"]).toEqual(["Spell Save DC"]);
    expect(k["coin.cp"]).toEqual(["Copper"]);
  });
  it("uses the printed label when the field name says nothing", async () => {
    const { attachLabels } = await import("./automap");
    const fields = [{ name: "Text Field12", t: "Tx" as const, p: 0, x: 100, y: 500, w: 60, h: 14 }, { name: "Text Field13", t: "Tx" as const, p: 0, x: 200, y: 500, w: 60, h: 14 }];
    const words = [{ p: 0, text: "Armor Class", x: 100, y: 488, w: 55, h: 8 }, { p: 0, text: "Initiative", x: 205, y: 488, w: 40, h: 8 }];
    const { plan } = buildPlan(attachLabels(fields, words));
    expect(plan.get("ac")?.[0].name).toBe("Text Field12");
    expect(plan.get("initiative")?.[0].name).toBe("Text Field13");
  });
});
