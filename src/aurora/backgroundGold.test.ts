/**
 * Found 2026-11-20 by the starting equipment check on moved characters: on 5e.tools content a 2014 background's gold
 * was lost. "A pouch containing 15 gp" is written there as a pouch "with 15 GP", which the reader took for an item's
 * name; a list of two lettered options with gold in them (Ravenloft: The Horrors Within) gave no gold either; and a
 * single silver piece was written "0 GP".
 */
import { describe, expect, it } from "vitest";
import { convertFiveTools } from "./fivetools";
import { ARegistry } from "./registry";
import { parseItems, planFor } from "./startingEquipment";

describe("gold in starting equipment", () => {
  it("a pouch with gold is a pouch and the gold", () => {
    expect(parseItems("Common Clothes, Pouch (with 15 GP)")).toEqual({
      refs: [
        { text: "Common Clothes", qty: 1 },
        { text: "Pouch", qty: 1 },
      ],
      gp: 15,
    });
  });

  const bg = (name: string, startingEquipment: unknown) => ({
    name,
    source: "PHB",
    skillProficiencies: [{ insight: true, religion: true }],
    startingEquipment,
    entries: [],
  });
  const reg = new ARegistry();
  reg.addElements(
    convertFiveTools({
      files: {
        "backgrounds.json": {
          background: [
            bg("Pouch Carrier", [{ _: [{ item: "common clothes|phb" }, { item: "pouch|phb", containsValue: 1500 }] }]),
            bg("Two Ways", [{ a: [{ item: "crowbar|phb" }, { value: 1400 }], b: [{ value: 5000 }] }]),
            bg("One Silver", [{ _: [{ item: "common clothes|phb" }, { value: 10 }] }]),
          ],
        },
      } as never,
    }),
  );
  reg.build();
  const plan = (name: string) =>
    planFor(
      reg.ofType("Background").find((b) => b.name === name)!,
      "background",
      reg,
    )!;

  it("a 5e.tools background's pouch brings its gold", () => {
    expect(plan("Pouch Carrier").variants.map((v) => v.gp)).toEqual([15]);
  });
  it("two lettered options with gold are a choice of the gear with its gold, or the gold", () => {
    expect(plan("Two Ways").variants.map((v) => [v.label, v.gp, v.fixed.length])).toEqual([
      ["Option A", 14, 1],
      ["Option B", 50, 0],
    ]);
  });
  it("a silver piece is a silver piece", () => {
    expect(plan("One Silver").variants.map((v) => v.gp)).toEqual([0.1]);
  });

  // The bundled SRD 5.1 Acolyte's text comes from the SRD itself, as a paragraph: "Equipment: A holy symbol ..., and a
  // pouch containing 15 gp". The reader knew a list item, a table row and a heading; the Acolyte had no gear to take.
  it("the bundled SRD 5.1 Acolyte has its gear and its 15 gp", async () => {
    const { loadContentSet } = await import("../engine/testContent");
    const srd = loadContentSet("", "srd-5.1");
    const p = planFor(
      srd.ofType("Background").find((b) => b.name === "Acolyte")!,
      "background",
      srd,
    );
    expect(p?.variants.map((v) => v.gp)).toEqual([15]);
    expect(p?.variants[0].fixed.map((f) => f.text)).toContain("vestments");
  });

  it("every bundled class and background has starting equipment to take", async () => {
    const { loadContentSet } = await import("../engine/testContent");
    const none: string[] = [];
    for (const set of ["srd-5.1", "srd-5.2"] as const) {
      const srd = loadContentSet("", set);
      for (const kind of ["Class", "Background"] as const)
        for (const e of srd.ofType(kind))
          if (!e.compendiumHidden && !planFor(e, kind === "Class" ? "class" : "background", srd)) none.push(`${set} ${kind} ${e.name}`);
    }
    expect(none).toEqual([]);
  });
});
