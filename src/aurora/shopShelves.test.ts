/**
 * The shop's shelves (Chris 2026-11-23): every item sorted by kind, the same for either provider's content. A 5e.tools
 * item used to be "Adventuring Gear" whatever it was, because the converter dropped 5e.tools' own item types.
 */
import { describe, expect, it } from "vitest";
import { convertFiveTools } from "./fivetools";
import { SHELVES, shelfOf } from "./shop";
import { loadContentSet } from "../engine/testContent";
import type { AElement } from "./types";

const item = (name: string, more: Record<string, unknown>) => ({ name, source: "PHB", rarity: "none", ...more });
const converted = convertFiveTools({
  files: {
    "items.json": {
      item: [
        item("Rope", { type: "G" }),
        item("Thieves' Tools", { type: "T" }),
        item("Smith's Tools", { type: "AT" }),
        item("Dice Set", { type: "GS" }),
        item("Lute", { type: "INS" }),
        item("Riding Horse", { type: "MNT" }),
        item("Rowboat", { type: "SHP" }),
        item("Explorer's Pack", { type: "G", packContents: [{ item: "rope|phb" }] }),
        item("Basic Poison", { type: "G", poison: true }),
        item("Arrows", { type: "A", packContents: [{ item: "arrow|phb", quantity: 20 }] }),
        item("Crystal", { type: "SCF" }),
        item("Wheat", { type: "TG" }),
        item("Ruby", { type: "$G" }),
        item("Potion of Healing", { type: "P", rarity: "common" }),
        item("Ring of Protection", { type: "RG", rarity: "rare" }),
        item("Wand of Web", { type: "WD", rarity: "uncommon" }),
        item("Bag of Holding", { wondrous: true, rarity: "uncommon" }),
      ],
    },
  } as never,
});
const cat = (name: string) => converted.find((e) => e.name === name)?.setters.category?.value;

describe("an item's kind from 5e.tools", () => {
  it("is its own, in the words Aurora's content uses", () => {
    expect(
      Object.fromEntries(
        ["Rope", "Thieves' Tools", "Smith's Tools", "Dice Set", "Lute", "Riding Horse", "Rowboat", "Explorer's Pack", "Basic Poison"].map(
          (n) => [n, cat(n)],
        ),
      ),
    ).toEqual({
      Rope: "Adventuring Gear",
      "Thieves' Tools": "Tools",
      "Smith's Tools": "Tools",
      "Dice Set": "Tools",
      Lute: "Musical Instruments",
      "Riding Horse": "Mounts & Vehicles",
      Rowboat: "Mounts & Vehicles",
      "Explorer's Pack": "Equipment Packs",
      "Basic Poison": "Poison",
    });
    expect(
      Object.fromEntries(
        ["Arrows", "Crystal", "Wheat", "Ruby", "Potion of Healing", "Ring of Protection", "Wand of Web", "Bag of Holding"].map((n) => [
          n,
          cat(n),
        ]),
      ),
    ).toEqual({
      Arrows: "Ammunition",
      Crystal: "Spellcasting Focus",
      Wheat: "Trade Goods",
      Ruby: "Treasure",
      "Potion of Healing": "Potions",
      "Ring of Protection": "Rings",
      "Wand of Web": "Wands",
      "Bag of Holding": "Wondrous Items",
    });
  });
});

describe("the shop's shelves", () => {
  const shelfIds = SHELVES.map((s) => s.id);
  it("give every item one shelf", () => {
    const byName = (n: string) => shelfOf(converted.find((e) => e.name === n)!);
    expect(byName("Rope")).toBe("gear");
    expect(byName("Thieves' Tools")).toBe("tools");
    expect(byName("Lute")).toBe("tools");
    expect(byName("Riding Horse")).toBe("mounts");
    expect(byName("Explorer's Pack")).toBe("packs");
    expect(byName("Basic Poison")).toBe("potions");
    expect(byName("Potion of Healing")).toBe("potions");
    expect(byName("Ring of Protection")).toBe("magic");
    expect(byName("Ruby")).toBe("treasure");
    const sword = { type: "Weapon", name: "Longsword", setters: {} } as unknown as AElement;
    const shield = { type: "Armor", name: "Shield", setters: {} } as unknown as AElement;
    expect([shelfOf(sword), shelfOf(shield)]).toEqual(["weapons", "armor"]);
  });
  it("on the built-in rules: every item has a shelf that exists, and the main shelves are stocked", () => {
    for (const set of ["srd-5.1", "srd-5.2"] as const) {
      const reg = loadContentSet("", set);
      const items = ["Item", "Weapon", "Armor", "Magic Item"].flatMap((t) => reg.ofType(t)).filter((e) => !e.compendiumHidden);
      const count = new Map<string, number>();
      for (const e of items) {
        expect(shelfIds, `${e.name} (${set})`).toContain(shelfOf(e));
        count.set(shelfOf(e), (count.get(shelfOf(e)) ?? 0) + 1);
      }
      for (const id of ["weapons", "armor", "gear", "tools", "packs", "mounts", "potions", "magic"])
        expect(count.get(id) ?? 0, `${id} (${set})`).toBeGreaterThan(0);
    }
  });
});
