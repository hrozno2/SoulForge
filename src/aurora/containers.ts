import type { AElement } from "./types";

/**
 * Whether an item holds other items (a backpack, a pouch, a chest, a bag of holding), for where things are kept in
 * the inventory. 5e.tools marks containers with a capacity; Aurora does not mark them, but their text says what they
 * hold ("can hold 1 cubic foot/30 pounds of gear"). Aurora's "container" setter is something else: the group an item
 * belongs to (a Staff is an "Arcane Focus", an Amulet a "Holy Symbol"), so it is not read here.
 */
export function isContainer(el: AElement | undefined): boolean {
  if (!el) return false;
  if (el.supports.includes("container")) return true;
  // A volume, or "pounds of gear": what an Immovable Rod or a Rope of Climbing "can hold" is weight it bears.
  return /\b(?:can hold|holds(?: up to)?|capacity of)\b[^.]{0,80}?\b(?:cubic f(?:oo|ee)t|gallons?|pints?|quarts?|ounces?|pounds? of (?:gear|goods|items|equipment|contents))\b/i.test(el.description ?? "");
}
