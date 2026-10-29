import type { AElement } from "./types";

/**
 * Whether an item holds other items (a backpack, a pouch, a chest, a bag of holding), for where things are kept in
 * the inventory. 5e.tools marks containers with a capacity; Aurora does not mark them, but their text says what they
 * hold ("can hold 1 cubic foot/30 pounds of gear"). Aurora's "container" setter is something else: the group an item
 * belongs to (a Staff is an "Arcane Focus", an Amulet a "Holy Symbol"), so it is not read here.
 */
export function isContainer(el: AElement | undefined, item?: AElement): boolean {
  if (!el) return false;
  if (el.supports.includes("container")) return true;
  // A quiver, a bolt case, a scroll case: only what it is made for (C7.3).
  if (el.supports.includes("container-for")) return !!item && holdsItem(el, item);
  // A volume of solid things, or "pounds of gear". A liquid measure (a waterskin's pints, a flask, a jug) holds no
  // gear (C7.3, Chris 2026-10-29: items could be put in a waterskin); what an Immovable Rod or a Rope of Climbing
  // "can hold" is weight it bears.
  return /\b(?:can hold|holds(?: up to)?|capacity of)\b[^.]{0,80}?\b(?:cubic f(?:oo|ee)t|pounds? of (?:gear|goods|items|equipment|contents))\b/i.test(el.description ?? "");
}

/** Whether a container made for certain things (its "holds" list: "arrow; crossbow bolt") takes this item. */
function holdsItem(el: AElement, item: AElement): boolean {
  const name = item.name.toLowerCase().replace(/\s*\(.*\)\s*$/, "");
  return (el.setters.holds?.value ?? "").split(";").map((x) => x.trim().toLowerCase()).filter(Boolean)
    .some((h) => name === h || name === `${h}s` || name.startsWith(`${h} `) || h.startsWith(name.replace(/s$/, "")));
}
