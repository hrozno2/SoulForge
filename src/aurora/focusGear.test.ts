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
