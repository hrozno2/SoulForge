/** A character has two hands: what is wielded or carried in them cannot add up to more. */
import type { InvItem } from "./character";
import type { AElement } from "./types";
import type { ARegistry } from "./registry";

export const HANDS = 2;

export const isShieldEl = (el?: AElement): boolean => !!el && el.type === "Armor" && (el.setters.armor?.value.toLowerCase() === "shield" || /shield/i.test(el.name));

/** How many hands an item takes while equipped: 0 for anything not held. */
export function handsFor(it: InvItem, el?: AElement): number {
  if (!el) return 0;
  if (isShieldEl(el)) return 1;
  if (el.type !== "Weapon") return 0;
  const twoByRule = /twohand/i.test(el.setters.slot?.value ?? "") || el.supports.some((t) => /TWO.?HANDED/i.test(t));
  return twoByRule || (it.twoHanded && !!el.setters.versatile) ? HANDS : 1;
}

export function handsUsed(inv: InvItem[], reg: ARegistry): number {
  return inv.reduce((n, i) => n + (i.equipped && i.id ? handsFor(i, reg.get(i.id)) : 0), 0);
}

export interface HandsResult {
  inventory: InvItem[];
  /** Names of things put away to make room. */
  dropped: string[];
}

/** Frees hands for `uid` by putting away the other held items, oldest first, until it fits. */
function makeRoom(inv: InvItem[], uid: string, reg: ARegistry): HandsResult {
  const out = inv.map((i) => ({ ...i }));
  const me = out.find((i) => i.uid === uid)!;
  const need = handsFor(me, me.id ? reg.get(me.id) : undefined);
  const dropped: string[] = [];
  if (!need) return { inventory: out, dropped };
  const others = () => out.filter((i) => i.uid !== uid && i.equipped && i.id && handsFor(i, reg.get(i.id)) > 0);
  const used = () => others().reduce((n, i) => n + handsFor(i, reg.get(i.id)), 0);
  while (used() + need > HANDS) {
    const next = others()[0];
    if (!next) break;
    next.equipped = false;
    next.twoHanded = false;
    dropped.push(reg.get(next.id)?.name ?? next.custom?.name ?? "item");
  }
  return { inventory: out, dropped };
}

/** Equip or put away an item, dropping whatever no longer fits in two hands. Only one suit of armor and one shield at a time still applies. */
export function toggleEquip(inv: InvItem[], uid: string, reg: ARegistry): HandsResult {
  const it = inv.find((i) => i.uid === uid);
  if (!it) return { inventory: inv, dropped: [] };
  const el = it.id ? reg.get(it.id) : undefined;
  const want = !it.equipped;
  const next = inv.map((i) => {
    if (i.uid === uid) return { ...i, equipped: want, twoHanded: want ? i.twoHanded : false };
    const other = i.id ? reg.get(i.id) : undefined;
    if (want && el?.type === "Armor" && other?.type === "Armor" && isShieldEl(el) === isShieldEl(other)) return { ...i, equipped: false };
    return i;
  });
  if (!want) return { inventory: next, dropped: [] };
  return makeRoom(next, uid, reg);
}

/** Grip a versatile weapon with both hands, which puts everything else in the hands away. */
export function setTwoHanded(inv: InvItem[], uid: string, on: boolean, reg: ARegistry): HandsResult {
  const next = inv.map((i) => (i.uid === uid ? { ...i, twoHanded: on } : i));
  return on ? makeRoom(next, uid, reg) : { inventory: next, dropped: [] };
}
