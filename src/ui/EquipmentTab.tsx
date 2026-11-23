import { isContainer } from "../aurora/containers";
import { choosePending, genericOptions } from "../aurora/startingEquipment";
import { useMemo, useState } from "react";
import { focusNote } from "../aurora/startingEquipment";
import { HANDS, handsUsed, setTwoHanded, toggleEquip } from "../aurora/hands";
import type { AElement } from "../aurora/types";
import type { Resolved } from "../aurora/engine";
import { buildSheet } from "../aurora/sheet";
import { itemLabel, uid, type Character, type InvItem } from "../aurora/character";
import type { SetCharacter } from "./Slots";
import { StartingEquipment } from "./StartingEquipment";
import { SellButton, Shop, ShopSettings } from "./Shop";

const ITEM_TYPES = ["Item", "Weapon", "Armor", "Magic Item"];
const COINS = ["pp", "gp", "ep", "sp", "cp"] as const;

const canEquip = (el?: AElement) => !!el && (el.type === "Weapon" || el.type === "Armor" || el.rules.length > 0 || !!el.setters.slot);
const needsAttune = (el?: AElement) =>
  !!el && (/requires attunement/i.test(el.setters.rarity?.value ?? "") || /requires attunement/i.test(el.description.slice(0, 400)));

export const ITEM_KINDS = ITEM_TYPES;

/** Adds one of an item to the inventory, onto an unequipped stack of it when it stacks. */
export const addItem = (set: SetCharacter, el: AElement) =>
  set((c) => {
    const stack = c.inventory.find((i) => i.id === el.id && !i.equipped);
    if (stack && el.setters.stackable !== undefined)
      return { ...c, inventory: c.inventory.map((i) => (i === stack ? { ...i, qty: i.qty + 1 } : i)) };
    return { ...c, inventory: [...c.inventory, { uid: uid(), id: el.id, qty: 1, equipped: false, attuned: false }] };
  });

/**
 * `part`: the build board shows the adding part (starting equipment; every other item comes from the shop) in its
 * lists and only the inventory and coins under the board.
 */
export function EquipmentTab({
  r,
  ch,
  set,
  onDetail,
  part = "all",
}: {
  r: Resolved;
  ch: Character;
  set: SetCharacter;
  onDetail: (e: AElement) => void;
  part?: "all" | "adding" | "inventory";
}) {
  const sheet = useMemo(() => buildSheet(r), [r]);
  const update = (id: string, fn: (i: InvItem) => InvItem) =>
    set((c) => ({ ...c, inventory: c.inventory.map((i) => (i.uid === id ? fn(i) : i)) }));
  const remove = (id: string) =>
    set((c) => ({
      ...c,
      inventory: c.inventory.filter((i) => i.uid !== id).map((i) => (i.container === id ? { ...i, container: undefined } : i)),
    }));
  const [handsNote, setHandsNote] = useState("");
  const applyHands = (res: { inventory: InvItem[]; dropped: string[] }) => {
    set((c) => ({ ...c, inventory: res.inventory }));
    setHandsNote(res.dropped.length ? `Two hands only: put away ${res.dropped.join(", ")}.` : "");
  };
  const equip = (it: InvItem) => applyHands(toggleEquip(ch.inventory, it.uid, r.reg));
  const extract = (it: InvItem, el: AElement) =>
    set((c) => ({
      ...c,
      inventory: [
        ...c.inventory.filter((i) => i.uid !== it.uid),
        ...(el.extract ?? []).map((x) => ({ uid: uid(), id: x.id, qty: x.amount * it.qty, equipped: false, attuned: false })),
      ],
    }));
  // Everything that can hold something; each row offers only those that take its item (a quiver takes arrows).
  const containers = ch.inventory.filter(
    (i) => i.id && (isContainer(r.reg.get(i.id)) || r.reg.get(i.id)?.supports.includes("container-for")),
  );

  return (
    <div className="equip">
      {part !== "inventory" && <StartingEquipment r={r} ch={ch} set={set} onDetail={onDetail} />}
      {part !== "inventory" && (
        <p className="muted pad equip-from-shop">Everything else comes from the shop: buy it there, or add it free.</p>
      )}
      {part !== "adding" && (
        <section className="card">
          <h2>Inventory</h2>
          <div className="row summary">
            <span>
              Carrying <b>{sheet.weight.carried}</b> / {sheet.weight.capacity} lb
            </span>
            <span title="Weapons and shields held in your hands">
              Hands <b>{handsUsed(ch.inventory, r.reg)}</b> / {HANDS}
            </span>
            {handsNote && (
              <span className="notice" role="status">
                {handsNote}
              </span>
            )}
            <span>
              Armor Class <b>{sheet.ac.value}</b> <small className="muted">{sheet.ac.parts.join(" ")}</small>
            </span>
            <span className={sheet.attunement.current > sheet.attunement.max ? "warn" : ""}>
              Attuned {sheet.attunement.current} / {sheet.attunement.max}
            </span>
          </div>
          {ch.inventory.length === 0 && <p className="muted">Nothing yet. Search above to add items.</p>}
          <table className="inv">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Weight</th>
                <th>Equipped</th>
                <th>Attuned</th>
                <th>Kept in</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ch.inventory.map((it) => {
                const el = it.id ? r.reg.get(it.id) : undefined;
                const name = itemLabel(it, el?.name);
                const weight = (Number(el?.setters.weight?.attrs.lb) || it.custom?.weight || 0) * it.qty;
                return (
                  <tr key={it.uid} onMouseEnter={() => el && onDetail(el)}>
                    <td>
                      {name}
                      {focusNote(name) && <small className="muted"> ({focusNote(name)})</small>}
                      {!el && it.id && <small className="warn"> (content not loaded)</small>}
                      {it.custom?.description && <small className="muted"> {it.custom.description}</small>}
                      {it.pending && (
                        <select
                          className="pending-pick"
                          aria-label={`Choose the ${name}`}
                          value=""
                          onChange={(e) => {
                            const id = e.target.value;
                            if (id) set((c) => choosePending(c, it.uid, id));
                          }}
                        >
                          <option value="">Choose which one...</option>
                          {genericOptions(r.reg, it.pending, ch.classes[0] ? (r.reg.get(ch.classes[0].classId)?.source ?? "") : "").map(
                            (o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ),
                          )}
                        </select>
                      )}
                    </td>
                    <td>
                      <span className="stepper">
                        <button onClick={() => update(it.uid, (i) => ({ ...i, qty: Math.max(1, i.qty - 1) }))}>−</button>
                        <span>{it.qty}</span>
                        <button onClick={() => update(it.uid, (i) => ({ ...i, qty: i.qty + 1 }))}>+</button>
                      </span>
                    </td>
                    <td>{weight ? `${Math.round(weight * 10) / 10} lb` : ""}</td>
                    <td>
                      {canEquip(el) ? <input type="checkbox" checked={it.equipped} onChange={() => equip(it)} /> : ""}
                      {el?.setters.versatile && it.equipped && (
                        <label className="check small">
                          <input
                            type="checkbox"
                            checked={!!it.twoHanded}
                            onChange={() => applyHands(setTwoHanded(ch.inventory, it.uid, !it.twoHanded, r.reg))}
                          />{" "}
                          two-handed
                        </label>
                      )}
                    </td>
                    <td>
                      {needsAttune(el) ? (
                        <input
                          type="checkbox"
                          checked={it.attuned}
                          onChange={() => update(it.uid, (i) => ({ ...i, attuned: !i.attuned }))}
                        />
                      ) : (
                        ""
                      )}
                    </td>
                    <td>
                      {containers.some((c) => isContainer(r.reg.get(c.id), el)) && it.id !== "" && !isContainer(el) && (
                        <select
                          aria-label="Where this is kept"
                          title="Where this is kept: on you, or inside a container such as a backpack"
                          value={it.container ?? ""}
                          onChange={(e) => update(it.uid, (i) => ({ ...i, container: e.target.value || undefined }))}
                        >
                          <option value="">On you</option>
                          {containers
                            .filter((c) => isContainer(r.reg.get(c.id), el))
                            .map((c) => (
                              <option key={c.uid} value={c.uid}>
                                {r.reg.get(c.id)?.name}
                              </option>
                            ))}
                        </select>
                      )}
                    </td>
                    <td>
                      {/* Sell and the rest in one line; Remove an × so narrow rows do not clump (C7.14). */}
                      <span className="inv-actions">
                        {el?.extract && el.extract.length > 0 && <button onClick={() => extract(it, el)}>Open pack</button>}
                        <SellButton ch={ch} set={set} uid={it.uid} el={el} />
                        <button
                          className="board-ico inv-remove"
                          title="Remove from the inventory"
                          aria-label={`Remove ${name}`}
                          onClick={() => remove(it.uid)}
                        >
                          ×
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {part !== "adding" && (
        <section className="card">
          <h2>Coins</h2>
          <div className="row">
            {COINS.map((k) => (
              <label key={k} className="field coin">
                <span>{k.toUpperCase()}</span>
                <input
                  type="number"
                  min={0}
                  value={ch.coins[k]}
                  onChange={(e) => set((c) => ({ ...c, coins: { ...c.coins, [k]: Math.max(0, Number(e.target.value) || 0) } }))}
                />
              </label>
            ))}
          </div>
          <ShopSettings ch={ch} set={set} />
        </section>
      )}
      {part === "all" && <Shop r={r} ch={ch} set={set} />}
    </div>
  );
}
