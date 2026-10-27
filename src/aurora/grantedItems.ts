/**
 * Items a feature gives (A4, UA3): the content writes them as a statistic "equipment:<item id>" with a positive value
 * (the 2018 playtest School of Invention's Arcanomechanical Armor). Each goes into the inventory once; the character
 * remembers it, so an item the player removes does not come back.
 */
import type { Resolved } from "./engine";
import type { Character } from "./character";
import type { AElement } from "./types";
import type { ARegistry } from "./registry";

const BY_LOWER = new WeakMap<ARegistry, Map<string, AElement>>();

/** The items the character's features give, by element. */
export function grantedItems(r: Resolved): AElement[] {
  let byLower = BY_LOWER.get(r.reg);
  if (!byLower) BY_LOWER.set(r.reg, (byLower = new Map(r.reg.all().map((e) => [e.id.toLowerCase(), e]))));
  const out: AElement[] = [];
  for (const n of r.stats.names()) {
    const m = /^equipment:(id_[a-z0-9_]+)$/i.exec(n);
    const el = m && r.stats.get(n) > 0 ? byLower.get(m[1].toLowerCase()) : undefined;
    if (el) out.push(el);
  }
  return out;
}

/** The character with each granted item it has not had yet added to the inventory; the same character when none. */
export function withGrantedItems(ch: Character, r: Resolved): Character {
  const had = new Set(ch.grantedItemsAdded ?? []);
  const fresh = grantedItems(r).filter((el) => !had.has(el.id));
  if (!fresh.length) return ch;
  return {
    ...ch,
    inventory: [...ch.inventory, ...fresh.map((el) => ({ uid: `granted-${el.id}`, id: el.id, qty: 1, equipped: false, attuned: false }))],
    grantedItemsAdded: [...had, ...fresh.map((el) => el.id)],
  };
}
