/** The door for content: a sound element passes untouched, a damaged one is repaired, a nameless thing is left out. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { soundElement, soundElements } from "./elementShape";
import type { AElement } from "./types";

const good: AElement = {
  id: "ID_X",
  name: "X",
  type: "Feat",
  source: "Book",
  supports: ["A"],
  description: "<p>Text</p>",
  compendiumHidden: false,
  setters: { keywords: { value: "a", attrs: {} } },
  rules: [
    { kind: "grant", type: "Language", id: "ID_L" },
    { kind: "select", type: "Feat", name: "Pick", supports: "A", number: 1 },
    { kind: "stat", name: "ac", value: "1", bonus: "base" },
  ],
};

describe("the door for content", () => {
  it("passes a sound element through as the same object", () => {
    expect(soundElement(good)).toBe(good);
  });
  it("passes every element of the bundled rules untouched", () => {
    for (const v of ["5.1", "5.2"]) {
      const { elements } = JSON.parse(readFileSync(`public/srd/srd-${v}.json`, "utf8")) as { elements: AElement[] };
      const res = soundElements(elements);
      expect([v, res.repaired, res.dropped]).toEqual([v, 0, 0]);
      expect(res.elements.length).toBe(elements.length);
    }
  });
  it("repairs fields of the wrong kind to a harmless shape", () => {
    const e = soundElement({
      ...good,
      name: null,
      supports: "Wizard",
      description: { a: 1 },
      setters: { ok: { value: "1", attrs: {} }, n: { value: 3 }, bad: null },
      rules: [
        null,
        3,
        "grant",
        {},
        { kind: "grant", type: "Feat" },
        { kind: "grant", type: "Feat", id: "ID_F", level: "3", requirements: 5 },
        good.rules[2],
      ],
      sheet: { display: true, descriptions: null },
      requirements: 7,
    })!;
    expect(e.name).toBe("ID_X");
    expect(e.supports).toEqual(["Wizard"]);
    expect(e.description).toBe("");
    expect(e.setters).toEqual({ ok: { value: "1", attrs: {} }, n: { value: "3", attrs: {} } });
    expect(e.rules).toEqual([{ kind: "grant", type: "Feat", id: "ID_F", level: 3 }, good.rules[2]]);
    expect(e.sheet?.descriptions).toEqual([]);
    expect(e.requirements).toBeUndefined();
  });
  it("leaves out what has no id or no type, and what is no element at all", () => {
    const res = soundElements([good, null, 3, "x", [], {}, { ...good, id: "" }, { ...good, type: undefined }, { ...good, rules: null }]);
    expect(res.elements.map((e) => e.id)).toEqual(["ID_X", "ID_X"]);
    expect([res.repaired, res.dropped]).toEqual([1, 7]);
  });
  // With the test cache: the converter's and the parser's whole output is sound, so the door costs a look and no more.
  const cache = process.env.SOULFORGE_RULES;
  it.skipIf(!cache)(
    "passes all of the 5e.tools and Aurora content untouched",
    async () => {
      const { loadContentSet } = await import("../engine/testContent");
      for (const set of ["5etools", "aurora"] as const) {
        const reg = loadContentSet(cache!, set);
        expect([set, reg.shape.repaired, reg.shape.dropped]).toEqual([set, 0, 0]);
        expect(reg.all().length).toBeGreaterThan(1000);
      }
    },
    600000,
  );
});
