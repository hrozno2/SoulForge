/**
 * The shop's money (A2.3), its behaviour checked against Plutonium's equipment shop. Buying and selling change the
 * character's coins; prices are the item's cost times the character's price multiplier (Chris, 2026-10-27: per
 * character, as DMs set it per table; 1 when unset; Plutonium has one global multiplier). Selling pays half the price,
 * the usual table rule (Plutonium's shop only buys). Magic items without a price can cost their rarity's value, per
 * character as well. Coins are paid with what the purse holds, smallest first, and change comes back in the largest
 * coins that fit, so the purse never gains a larger coin than it gave (Plutonium keeps the coin mix the same way).
 */
import type { AElement } from "./types";
import type { Character, Coinage, InvItem } from "./character";

export const COPPER: Record<keyof Coinage, number> = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };
const SMALL_FIRST: (keyof Coinage)[] = ["cp", "sp", "ep", "gp", "pp"];
/** Change is given in these, largest first (no electrum, as tables rarely hand it out). */
const CHANGE: (keyof Coinage)[] = ["pp", "gp", "sp", "cp"];

const asCp = (c: { value: string; attrs?: Record<string, string> } | undefined) => {
  if (!c) return undefined;
  const n = Number(String(c.value).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const cur = (c.attrs?.currency ?? "gp").toLowerCase() as keyof Coinage;
  return Math.round(n * (COPPER[cur] ?? 100));
};

/** Magic item values by rarity, in copper (the 2024 Dungeon Master's Guide; an artifact has none). */
export const RARITY_CP: Record<string, number> = { common: 10000, uncommon: 40000, rare: 400000, "very rare": 4000000, legendary: 20000000 };

/**
 * An item's price in copper ("5" gp, "1,500" gp, "2" sp), or undefined when it has none. With `rarity`, a magic item
 * without a price of its own costs its rarity's value plus its base item's price, half for a consumable (a potion,
 * a scroll), as Plutonium's "Magic Item Values by Rarity" option prices it.
 */
export function priceCp(el: AElement | undefined, rarity = false): number | undefined {
  const own = asCp(el?.setters.cost);
  if (own !== undefined || !rarity || !el) return own;
  const r = RARITY_CP[(el.setters.rarity?.value ?? "").toLowerCase().replace(/\s*\(.*$/, "").trim()];
  if (!r) return undefined;
  return (asCp(el.setters["base cost"]) ?? 0) + (el.setters.consumable?.value === "true" ? r / 2 : r);
}

export const multiplierOf = (ch: Character) => (ch.priceMultiplier && ch.priceMultiplier > 0 ? ch.priceMultiplier : 1);

/** The coins' total in copper. */
export const purseCp = (c: Coinage) => SMALL_FIRST.reduce((n, k) => n + (c[k] || 0) * COPPER[k], 0);

/** An amount of copper as the largest coins that fit. */
export function asCoins(cp: number): Coinage {
  const out: Coinage = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  let left = Math.max(0, Math.round(cp));
  for (const k of CHANGE) { out[k] = Math.floor(left / COPPER[k]); left -= out[k] * COPPER[k]; }
  return out;
}

const add = (a: Coinage, b: Coinage): Coinage => ({ cp: a.cp + b.cp, sp: a.sp + b.sp, ep: a.ep + b.ep, gp: a.gp + b.gp, pp: a.pp + b.pp });

/**
 * Pays `cost` copper from `purse`: coins are handed over smallest first until the cost is covered, and the change
 * comes back in the largest coins that fit. Undefined when the purse holds too little.
 */
export function pay(purse: Coinage, cost: number): Coinage | undefined {
  if (cost <= 0) return { ...purse };
  if (purseCp(purse) < cost) return undefined;
  const left = { ...purse };
  let given = 0;
  for (const k of SMALL_FIRST) {
    while (left[k] > 0 && given < cost) { left[k]--; given += COPPER[k]; }
    if (given >= cost) break;
  }
  return add(left, asCoins(given - cost));
}

/** What buying costs: price times quantity times the character's multiplier, in copper. */
export const buyCost = (ch: Character, el: AElement, qty = 1) => Math.round((priceCp(el, !!ch.rarityPrices) ?? 0) * qty * multiplierOf(ch));

/** What selling pays: half the price, times quantity and the multiplier, in copper (rounded down). */
export const sellValue = (ch: Character, el: AElement, qty = 1) => Math.floor(((priceCp(el, !!ch.rarityPrices) ?? 0) * qty * multiplierOf(ch)) / 2);

export type ShopResult = { ok: true; character: Character } | { ok: false; reason: string };

/** Buys `qty` of an item: the coins go down and the item goes into the inventory (with one it already has). */
export function buy(ch: Character, el: AElement, qty = 1, uid = `shop-${el.id}-${Date.now().toString(36)}`): ShopResult {
  const cost = buyCost(ch, el, qty);
  const coins = pay(ch.coins, cost);
  if (!coins) return { ok: false, reason: `Not enough coins: ${formatCp(cost)} needed, ${formatCp(purseCp(ch.coins))} in the purse.` };
  const same = ch.inventory.find((i) => i.id === el.id && !i.custom && !i.magic && !i.label);
  const inventory: InvItem[] = same
    ? ch.inventory.map((i) => (i === same ? { ...i, qty: i.qty + qty } : i))
    : [...ch.inventory, { uid, id: el.id, qty, equipped: false, attuned: false }];
  return { ok: true, character: { ...ch, coins, inventory } };
}

/** Sells `qty` of an inventory item: the coins go up by half its price and the item goes (or its count down). */
export function sell(ch: Character, uid: string, el: AElement | undefined, qty = 1): ShopResult {
  const it = ch.inventory.find((i) => i.uid === uid);
  if (!it) return { ok: false, reason: "That item is not in the inventory." };
  const n = Math.min(qty, it.qty);
  const value = el ? sellValue(ch, el, n) : 0;
  const inventory = it.qty > n ? ch.inventory.map((i) => (i === it ? { ...i, qty: i.qty - n } : i)) : ch.inventory.filter((i) => i !== it);
  return { ok: true, character: { ...ch, inventory, coins: add(ch.coins, asCoins(value)) } };
}

/** "12 gp 5 sp" for an amount of copper. */
export function formatCp(cp: number): string {
  const c = asCoins(cp);
  const parts = CHANGE.filter((k) => c[k]).map((k) => `${c[k]} ${k}`);
  return parts.join(" ") || "0 gp";
}
