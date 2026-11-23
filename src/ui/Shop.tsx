import { useMemo, useState } from "react";
import { flyInto } from "./flight";
import type { Resolved } from "../aurora/engine";
import type { Character } from "../aurora/character";
import type { AElement } from "../aurora/types";
import {
  buy,
  buyCost,
  formatCoins,
  formatCp,
  keeperLine,
  multiplierOf,
  priceCp,
  purseCp,
  sell,
  sellValue,
  SHELVES,
  shelfOf,
  type ShelfId,
} from "../aurora/shop";
import { uid } from "../aurora/character";
import { useKept } from "./keptFilters";
import type { SetCharacter } from "./Slots";
import { Browse } from "./Browse";
import { ITEM_KINDS } from "./EquipmentTab";

/** The keeper of the shop: a name over the door and a line for the moment (src/aurora/shop.ts, `keeperLine`). */
const KEEPER = "Mirela Coppercask";

/**
 * The shop (C3, on top of src/aurora/shop.ts), the one place items come from besides starting gear (Chris
 * 2026-11-23). A keeper greets the character; a switch says whether an item is bought with the character's coins or
 * simply added; the shelves sort everything by kind, and a shelf opens its own list, whose filters are the player's
 * to change and are kept (keptFilters.ts). As in Plutonium's equipment shop, the purse shows what is left and an
 * item that costs more is locked with what it needs.
 */
export function Shop({ r, ch, set }: { r: Resolved; ch: Character; set: SetCharacter }) {
  const items = useMemo(() => ITEM_KINDS.flatMap((t) => r.reg.ofType(t)).filter((e) => !e.compendiumHidden), [r.reg]);
  const [msg, setMsg] = useState("");
  const [mode, setMode] = useKept<"buy" | "add">("shop", "mode", "buy");
  const [shelf, setShelf] = useKept<ShelfId | "all" | "">("shop", "shelf", "");
  const free = mode === "add";
  const purse = purseCp(ch.coins);
  const stock = useMemo(() => {
    const n = new Map<string, number>();
    for (const e of items) n.set(shelfOf(e), (n.get(shelfOf(e)) ?? 0) + 1);
    return n;
  }, [items]);
  const onShelf = useMemo(() => (shelf === "all" ? items : shelf ? items.filter((e) => shelfOf(e) === shelf) : []), [items, shelf]);
  const why = (el: AElement) => {
    if (free) return undefined;
    if (priceCp(el, !!ch.rarityPrices) === undefined) return "No price: switch to Add to take it";
    const cost = buyCost(ch, el);
    return cost > purse ? `Not enough coins: ${formatCp(cost)}` : undefined;
  };
  const onBuy = (el: AElement) => {
    const res = buy(ch, el, 1, undefined, free);
    setMsg(res.ok ? (free ? `${el.name} is yours.` : `Sold: ${el.name}, for ${formatCp(buyCost(ch, el))}.`) : res.reason);
    // Paid from the character as it is when the change lands, so two quick clicks pay twice.
    if (res.ok) {
      flyInto("backpack");
      set((c) => {
        const now = buy(c, el, 1, undefined, free);
        return now.ok ? now.character : c;
      });
    }
  };
  const price = (el: AElement) => (priceCp(el, !!ch.rarityPrices) !== undefined ? formatCp(buyCost(ch, el)) : undefined);
  return (
    <section className="card shop">
      <header className="shop-keeper">
        <div className="shop-sign" aria-hidden="true">
          <span>{KEEPER.slice(0, 1)}</span>
        </div>
        <div className="shop-talk">
          <h2>{KEEPER}'s shop</h2>
          <p className="shop-line" role="status">
            {keeperLine({ purseCp: purse, mode, last: msg, shelf: SHELVES.find((x) => x.id === shelf)?.label })}
          </p>
        </div>
        <div className="shop-till">
          <span className="seg" role="group" aria-label="How items are taken">
            <button
              className={!free ? "on" : ""}
              aria-pressed={!free}
              onClick={() => setMode("buy")}
              title="Items cost the character's coins"
            >
              Buy
            </button>
            <button className={free ? "on" : ""} aria-pressed={free} onClick={() => setMode("add")} title="Items are added without paying">
              Add free
            </button>
          </span>
          <div className="row summary">
            <span title={`${formatCp(purse)} in all`}>
              Purse <b>{formatCoins(ch.coins)}</b>
            </span>
            {multiplierOf(ch) !== 1 && <span>Prices × {multiplierOf(ch)}</span>}
            {ch.rarityPrices && <span>Magic items by rarity</span>}
          </div>
        </div>
      </header>
      <div className="shop-shelves" role="group" aria-label="Shelves">
        {SHELVES.filter((x) => stock.get(x.id)).map((x) => (
          <button
            key={x.id}
            className={`shop-shelf ${shelf === x.id ? "on" : ""}`}
            aria-pressed={shelf === x.id}
            onClick={() => {
              setShelf(shelf === x.id ? "" : x.id);
              setMsg("");
            }}
          >
            <b>{x.label}</b>
            <small>{stock.get(x.id)}</small>
          </button>
        ))}
        <button
          className={`shop-shelf ${shelf === "all" ? "on" : ""}`}
          aria-pressed={shelf === "all"}
          onClick={() => {
            setShelf(shelf === "all" ? "" : "all");
            setMsg("");
          }}
        >
          <b>Everything</b>
          <small>{items.length}</small>
        </button>
      </div>
      {!shelf && <p className="muted shop-hint">Pick a shelf to see what is on it.</p>}
      {shelf && (
        <Browse
          key={shelf}
          items={onShelf}
          type="Item"
          chosen={[]}
          filterKey={`shop.${shelf}`}
          onPick={onBuy}
          disabledReason={why}
          defaultView="list"
          allowCards={false}
          viewKey="shop.Item"
          defaultLocked="hide"
          perPage={60}
          rowLabel={(el) => (free ? undefined : price(el))}
          pickLabel={(el) => (free ? "Add" : price(el) ? `Buy · ${price(el)}` : "Buy")}
        />
      )}
      <CustomItem set={set} />
    </section>
  );
}

/** Something the shelves do not hold: an item of the player's own, by name. */
export function CustomItem({ set }: { set: SetCharacter }) {
  const [custom, setCustom] = useState({ name: "", weight: "", cost: "", description: "" });
  return (
    <details className="shop-custom">
      <summary>Something not on the shelves</summary>
      <div className="row">
        <input
          placeholder="Name"
          aria-label="Item name"
          value={custom.name}
          onChange={(e) => setCustom({ ...custom, name: e.target.value })}
        />
        <input
          placeholder="Weight (lb)"
          aria-label="Weight in pounds"
          value={custom.weight}
          onChange={(e) => setCustom({ ...custom, weight: e.target.value })}
          style={{ width: 100 }}
        />
        <input
          placeholder="Cost"
          aria-label="Cost"
          value={custom.cost}
          onChange={(e) => setCustom({ ...custom, cost: e.target.value })}
          style={{ width: 100 }}
        />
        <input
          placeholder="Notes"
          aria-label="Notes"
          value={custom.description}
          onChange={(e) => setCustom({ ...custom, description: e.target.value })}
          style={{ flex: 1 }}
        />
        <button
          disabled={!custom.name.trim()}
          onClick={() => {
            set((c) => ({
              ...c,
              inventory: [
                ...c.inventory,
                {
                  uid: uid(),
                  id: "",
                  qty: 1,
                  equipped: false,
                  attuned: false,
                  custom: {
                    name: custom.name.trim(),
                    weight: Number(custom.weight) || 0,
                    cost: custom.cost,
                    description: custom.description,
                  },
                },
              ],
            }));
            setCustom({ name: "", weight: "", cost: "", description: "" });
          }}
        >
          Add
        </button>
      </div>
    </details>
  );
}

/** The shop's settings for this character: its price multiplier and rarity prices (both per character, A2.3). */
export function ShopSettings({ ch, set }: { ch: Character; set: SetCharacter }) {
  return (
    <div className="row shop-settings">
      <label className="field" title="The table's price multiplier for this character: 1 is the book price, 1.5 half again, 0.5 half">
        <span>Price multiplier</span>
        <input
          type="number"
          min={0.1}
          step={0.1}
          value={ch.priceMultiplier ?? 1}
          onChange={(e) => {
            const v = Number(e.target.value);
            set((c) => ({ ...c, priceMultiplier: v > 0 ? v : 1 }));
          }}
        />
      </label>
      <label
        className="check"
        title="Magic items without a price cost their rarity's value (2024 Dungeon Master's Guide), half for potions and scrolls"
      >
        <input type="checkbox" checked={!!ch.rarityPrices} onChange={(e) => set((c) => ({ ...c, rarityPrices: e.target.checked }))} /> Price
        magic items by rarity
      </label>
    </div>
  );
}

/** "Sell" on an inventory row: the price times the multiplier, as buying, one at a time. Nothing when it has no price. */
export function SellButton({ ch, set, uid, el }: { ch: Character; set: SetCharacter; uid: string; el?: AElement }) {
  if (!el || priceCp(el, !!ch.rarityPrices) === undefined) return null;
  const value = sellValue(ch, el);
  return (
    <button
      title={`Sell one for ${formatCp(value)} (what it costs to buy)`}
      onClick={() =>
        set((c) => {
          const res = sell(c, uid, el);
          return res.ok ? res.character : c;
        })
      }
    >
      Sell · {formatCp(value)}
    </button>
  );
}
