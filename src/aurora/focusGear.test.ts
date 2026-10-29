/** "An arcane focus" in starting gear is the player's pick of the group, not its first item (C7.7). */
import { describe, expect, it } from "vitest";
import { loadRegistry } from "./fixture";
import { ItemIndex, genericOptions, resolveRef } from "./startingEquipment";

const reg = loadRegistry("fixtures/content");

describe("focus gear", () => {
  it("leaves a focus group open, with its items to pick", () => {
    const idx = new ItemIndex(reg);
    for (const text of ["an arcane focus", "Arcane Focus", "arcane focus of your choice"]) expect(resolveRef({ text, qty: 1 } as never, idx, "").pending).toBe("arcane");
    expect(resolveRef({ text: "a holy symbol", qty: 1 } as never, idx, "").pending).toBe("holy");
    expect(genericOptions(reg, "arcane").map((e) => e.name)).toEqual(["Bone Wand", "Glass Prism"]);
  });
  it("takes a named focus as that item", () => {
    expect(resolveRef({ text: "Arcane Focus (Quarterstaff)", qty: 1 } as never, new ItemIndex(reg), "").pending).toBeUndefined();
  });
});

describe("artisan's tools or a musical instrument (the 2024 Monk)", () => {
  it("stays open to both kinds, not only instruments", async () => {
    const { resolveChosenTools } = await import("./startingEquipment");
    const [it] = resolveChosenTools([{ name: "Artisan's Tools or Musical Instrument chosen for the tool proficiency above", qty: 1 }], [], reg);
    expect(it.pending).toBe("artisanOrInstrument");
    const names = genericOptions(reg, "artisanOrInstrument").map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(genericOptions(reg, "instrument").map((e) => e.name)));
    expect(names.length).toBe(genericOptions(reg, "artisan").length + genericOptions(reg, "instrument").length);
  });
});
