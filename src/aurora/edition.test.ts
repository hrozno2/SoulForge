import { expect, it } from "vitest";
import { editionOf, isPlaytest } from "./edition";

it("tells the 2024 rules from the 2014 rules in one place", () => {
  expect(editionOf({ id: "ID_WOTC_PHB24_CLASS_CLERIC", source: "Player’s Handbook (2024)" })).toBe("2024");
  expect(editionOf({ id: "ID_WOTC_DMG24_MAGIC_ITEM_ALCHEMY_JUG", source: "Dungeon Master’s Guide (2024)" })).toBe("2024");
  expect(editionOf({ id: "ID_WOTC_MM25_X", source: "Monster Manual (2025)" })).toBe("2024");
  expect(editionOf({ id: "ID_5E_X", source: "XPHB" })).toBe("2024");
  expect(editionOf({ id: "ID_PHB_SPELL_FIREBALL", source: "Player’s Handbook" })).toBe("2014");
  expect(editionOf({ id: "ID_WOTC_TCOE_CLASS_ARTIFICER", source: "Tasha’s Cauldron of Everything" })).toBe("2014");
  expect(isPlaytest({ id: "ID_WOTC_UA20200224_X", source: "Unearthed Arcana: Subclasses, Part 3" })).toBe(true);
  expect(isPlaytest({ id: "ID_PHB_X", source: "Player’s Handbook" })).toBe(false);
});
