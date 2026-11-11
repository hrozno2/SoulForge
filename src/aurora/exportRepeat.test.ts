/** The same character always exports to the same Foundry and Roll20 file (plan principle P8). */
import { describe, expect, it } from "vitest";
import { loadContentSet } from "../engine/testContent";
import { resolve } from "./engine";
import { exportFoundry, exportRoll20 } from "./exportForeign";
import { randomCharacter } from "./randomCharacter";

describe("exports are repeatable", () => {
  const reg = loadContentSet("", "srd");
  let seed = 31;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const filters = { legacy: true, playtest: false, unusual: true, scifi: false, modern: false };

  it("twice the same file, and another character another file", () => {
    const a = resolve(randomCharacter(reg, 7, filters, rng), reg);
    const b = resolve(randomCharacter(reg, 7, filters, rng), reg);
    for (const make of [exportFoundry, exportRoll20]) {
      const first = JSON.stringify(make(a));
      // Another export in between does not disturb it.
      make(b);
      expect(JSON.stringify(make(a))).toBe(first);
      expect(JSON.stringify(make(b))).not.toBe(first);
    }
  });

  it("the ids inside one file are all different", () => {
    const r = resolve(randomCharacter(reg, 12, filters, rng), reg);
    const ids = [...JSON.stringify(exportFoundry(r)).matchAll(/"_id":"([A-Za-z0-9]{16})"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(5);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
