import { useMemo, useState } from "react";
import type { Resolved } from "../aurora/engine";
import type { Character } from "../aurora/character";
import type { AElement } from "../aurora/types";
import { buy, buyCost, formatCoins, formatCp, multiplierOf, priceCp, purseCp, sell, sellValue } from "../aurora/shop";
import type { SetCharacter } from "./Slots";
import { Browse } from "./Browse";
import { ITEM_KINDS } from "./EquipmentTab";

/**
 * The shop (C3, on top of src/aurora/shop.ts): every item with its price for this character, bought with the
 * character's coins. As in Plutonium's equipment shop, the purse shows what is left and an item that costs more is
 * locked with what it needs; an item without a price cannot be bought (unless rarity prices are on for magic items).
 */
export function Shop({ r, ch, set }: { r: Resolved; ch: Character; set: SetCharacter }) {
  const items = useMemo(() => ITEM_KINDS.flatMap((t) => r.reg.ofType(t)).filter((e) => !e.compendiumHidden), [r.reg]);
  const [msg, setMsg] = useState("");
  const purse = purseCp(ch.coins);
  const why = (el: AElement) => {
    if (priceCp(el, !!ch.rarityPrices) === undefined) return "No price";
    const cost = buyCost(ch, el);
    return cost > purse ? `Not enough coins: ${formatCp(cost)}` : undefined;
  };
  const onBuy = (el: AElement) => {
    const res = buy(ch, el);
    setMsg(res.ok ? `Bought ${el.name} for ${formatCp(buyCost(ch, el))}.` : res.reason);
    // Paid from the character as it is when the change lands, so two quick clicks pay twice.
    if (res.ok) set((c) => { const now = buy(c, el); return now.ok ? now.character : c; });
  };
  return (
    <section className="card shop">
      <h2>Shop</h2>
      <div className="row summary">
        <span title={`${formatCp(purse)} in all`}>Purse <b>{formatCoins(ch.coins)}</b></span>
        {multiplierOf(ch) !== 1 && <span>Prices × {multiplierOf(ch)}</span>}
        {ch.rarityPrices && <span>Magic items by rarity</span>}
        {msg && <span className="notice" role="status">{msg}</span>}
      </div>
      <Browse items={items} type="Item" chosen={[]} onPick={onBuy} disabledReason={why} defaultView="list" allowCards={false} viewKey="shop.Item" perPage={60}
        rowLabel={(el) => (priceCp(el, !!ch.rarityPrices) !== undefined ? formatCp(buyCost(ch, el)) : undefined)}
        pickLabel={(el) => (priceCp(el, !!ch.rarityPrices) !== undefined ? `Buy · ${formatCp(buyCost(ch, el))}` : "Buy")} />
    </section>
  );
}

/** The shop's settings for this character: its price multiplier and rarity prices (both per character, A2.3). */
export function ShopSettings({ ch, set }: { ch: Character; set: SetCharacter }) {
  return (
    <div className="row shop-settings">
      <label className="field" title="The table's price multiplier for this character: 1 is the book price, 1.5 half again, 0.5 half">
        <span>Price multiplier</span>
        <input type="number" min={0.1} step={0.1} value={ch.priceMultiplier ?? 1} onChange={(e) => { const v = Number(e.target.value); set((c) => ({ ...c, priceMultiplier: v > 0 ? v : 1 })); }} />
      </label>
      <label className="check" title="Magic items without a price cost their rarity's value (2024 Dungeon Master's Guide), half for potions and scrolls">
        <input type="checkbox" checked={!!ch.rarityPrices} onChange={(e) => set((c) => ({ ...c, rarityPrices: e.target.checked }))} /> Price magic items by rarity
      </label>
    </div>
  );
}

/** "Sell" on an inventory row: half the price times the multiplier, one at a time. Nothing when it has no price. */
export function SellButton({ ch, set, uid, el }: { ch: Character; set: SetCharacter; uid: string; el?: AElement }) {
  if (!el || priceCp(el, !!ch.rarityPrices) === undefined) return null;
  const value = sellValue(ch, el);
  return (
    <button title={`Sell one for ${formatCp(value)} (half its price)`} onClick={() => set((c) => { const res = sell(c, uid, el); return res.ok ? res.character : c; })}>
      Sell · {formatCp(value)}
    </button>
  );
}
