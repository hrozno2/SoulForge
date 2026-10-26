import { isContainer } from "../aurora/containers";
import { genericOptions } from "../aurora/startingEquipment";
import { useMemo, useState } from "react";
import { focusNote } from "../aurora/startingEquipment";
import { HANDS, handsUsed, setTwoHanded, toggleEquip } from "../aurora/hands";
import type { AElement } from "../aurora/types";
import type { Resolved } from "../aurora/engine";
import { buildSheet } from "../aurora/sheet";
import { itemLabel, uid, type Character, type InvItem } from "../aurora/character";
import type { SetCharacter } from "./Slots";
import { StartingEquipment } from "./StartingEquipment";

const ITEM_TYPES = ["Item", "Weapon", "Armor", "Magic Item"];
const COINS = ["pp", "gp", "ep", "sp", "cp"] as const;

const canEquip = (el?: AElement) => !!el && (el.type === "Weapon" || el.type === "Armor" || el.rules.length > 0 || !!el.setters.slot);
const needsAttune = (el?: AElement) => !!el && (/requires attunement/i.test(el.setters.rarity?.value ?? "") || /requires attunement/i.test(el.description.slice(0, 400)));

export const ITEM_KINDS = ITEM_TYPES;

/** Adds one of an item to the inventory, onto an unequipped stack of it when it stacks. */
export const addItem = (set: SetCharacter, el: AElement) =>
  set((c) => {
    const stack = c.inventory.find((i) => i.id === el.id && !i.equipped);
    if (stack && el.setters.stackable !== undefined) return { ...c, inventory: c.inventory.map((i) => (i === stack ? { ...i, qty: i.qty + 1 } : i)) };
    return { ...c, inventory: [...c.inventory, { uid: uid(), id: el.id, qty: 1, equipped: false, attuned: false }] };
  });

/**
 * `listBeside`: items are added from a list next to this (the build board), so the search here is left out.
 * `part`: the build board shows the adding part (starting equipment and custom items) in its lists and only the
 * inventory and coins under the board.
 */
export function EquipmentTab({ r, ch, set, onDetail, listBeside = false, part = "all" }: { r: Resolved; ch: Character; set: SetCharacter; onDetail: (e: AElement) => void; listBeside?: boolean; part?: "all" | "adding" | "inventory" }) {
  const sheet = useMemo(() => buildSheet(r), [r]);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [custom, setCustom] = useState({ name: "", weight: "", cost: "", description: "" });

  const results = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return [];
    const pool = type === "all" ? ITEM_TYPES.flatMap((t) => r.reg.ofType(t)) : r.reg.ofType(type);
    return pool.filter((e) => e.name.toLowerCase().includes(n) && !e.compendiumHidden).slice(0, 60);
  }, [q, type, r.reg]);

  const update = (id: string, fn: (i: InvItem) => InvItem) => set((c) => ({ ...c, inventory: c.inventory.map((i) => (i.uid === id ? fn(i) : i)) }));
  const add = (el: AElement) => addItem(set, el);
  const remove = (id: string) => set((c) => ({ ...c, inventory: c.inventory.filter((i) => i.uid !== id).map((i) => (i.container === id ? { ...i, container: undefined } : i)) }));
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
  const containers = ch.inventory.filter((i) => i.id && isContainer(r.reg.get(i.id)));

  return (
    <div className="equip">
      {part !== "inventory" && <StartingEquipment r={r} ch={ch} set={set} onDetail={onDetail} />}
      {part !== "inventory" && <section className="card">
        <h2>{listBeside ? "Custom items" : "Add equipment"}</h2>
        {!listBeside && <><div className="row">
          <input placeholder="Search items, weapons, armor" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
          <select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All</option>
            {ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <ul className="options boxed">
          {results.map((o) => (
            <li key={o.id}>
              <button onClick={() => add(o)} onMouseEnter={() => onDetail(o)}>
                <span className="tick">+</span>
                <span className="opt-name">{o.name}</span>
                <span className="opt-meta">{o.type}{o.setters.cost ? ` · ${o.setters.cost.value} ${o.setters.cost.attrs.currency ?? ""}` : ""}</span>
                <span className="opt-src" title={o.source}>{o.source}</span>
              </button>
            </li>
          ))}
          {q.trim() && !results.length && <li className="muted pad">No items match. Load more content on the Content tab, or add a custom item below.</li>}
        </ul></>}
        <details>
          <summary>Custom item</summary>
          <div className="row">
            <input placeholder="Name" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
            <input placeholder="Weight (lb)" value={custom.weight} onChange={(e) => setCustom({ ...custom, weight: e.target.value })} style={{ width: 100 }} />
            <input placeholder="Cost" value={custom.cost} onChange={(e) => setCustom({ ...custom, cost: e.target.value })} style={{ width: 100 }} />
            <input placeholder="Notes" value={custom.description} onChange={(e) => setCustom({ ...custom, description: e.target.value })} style={{ flex: 1 }} />
            <button disabled={!custom.name.trim()} onClick={() => { set((c) => ({ ...c, inventory: [...c.inventory, { uid: uid(), id: "", qty: 1, equipped: false, attuned: false, custom: { name: custom.name.trim(), weight: Number(custom.weight) || 0, cost: custom.cost, description: custom.description } }] })); setCustom({ name: "", weight: "", cost: "", description: "" }); }}>Add</button>
          </div>
        </details>
      </section>}

      {part !== "adding" && <section className="card">
        <h2>Inventory</h2>
        <div className="row summary">
          <span>Carrying <b>{sheet.weight.carried}</b> / {sheet.weight.capacity} lb</span>
          <span title="Weapons and shields held in your hands">Hands <b>{handsUsed(ch.inventory, r.reg)}</b> / {HANDS}</span>
          {handsNote && <span className="notice" role="status">{handsNote}</span>}
          <span>Armor Class <b>{sheet.ac.value}</b> <small className="muted">{sheet.ac.parts.join(" ")}</small></span>
          <span className={sheet.attunement.current > sheet.attunement.max ? "warn" : ""}>Attuned {sheet.attunement.current} / {sheet.attunement.max}</span>
        </div>
        {ch.inventory.length === 0 && <p className="muted">Nothing yet. Search above to add items.</p>}
        <table className="inv">
          <thead><tr><th>Item</th><th>Qty</th><th>Weight</th><th>Equipped</th><th>Attuned</th><th>Kept in</th><th /></tr></thead>
          <tbody>
            {ch.inventory.map((it) => {
              const el = it.id ? r.reg.get(it.id) : undefined;
              const name = itemLabel(it, el?.name);
              const weight = (Number(el?.setters.weight?.attrs.lb) || it.custom?.weight || 0) * it.qty;
              return (
                <tr key={it.uid} onMouseEnter={() => el && onDetail(el)}>
                  <td>{name}{focusNote(name) && <small className="muted"> ({focusNote(name)})</small>}{!el && it.id && <small className="warn"> (content not loaded)</small>}{it.custom?.description && <small className="muted"> {it.custom.description}</small>}
                    {it.pending && (
                      <select className="pending-pick" aria-label={`Choose the ${name}`} value="" onChange={(e) => { const id = e.target.value; if (id) update(it.uid, (i) => ({ ...i, id, custom: undefined, pending: undefined })); }}>
                        <option value="">Choose which one...</option>
                        {genericOptions(r.reg, it.pending, ch.classes[0] ? r.reg.get(ch.classes[0].classId)?.source ?? "" : "").map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
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
                    {el?.setters.versatile && it.equipped && <label className="check small"><input type="checkbox" checked={!!it.twoHanded} onChange={() => applyHands(setTwoHanded(ch.inventory, it.uid, !it.twoHanded, r.reg))} /> two-handed</label>}
                  </td>
                  <td>{needsAttune(el) ? <input type="checkbox" checked={it.attuned} onChange={() => update(it.uid, (i) => ({ ...i, attuned: !i.attuned }))} /> : ""}</td>
                  <td>
                    {containers.length > 0 && it.id !== "" && !isContainer(el) && (
                      <select aria-label="Where this is kept" title="Where this is kept: on you, or inside a container such as a backpack" value={it.container ?? ""} onChange={(e) => update(it.uid, (i) => ({ ...i, container: e.target.value || undefined }))}>
                        <option value="">On you</option>
                        {containers.map((c) => <option key={c.uid} value={c.uid}>{r.reg.get(c.id)?.name}</option>)}
                      </select>
                    )}
                  </td>
                  <td>
                    {el?.extract && el.extract.length > 0 && <button onClick={() => extract(it, el)}>Open pack</button>}
                    <button onClick={() => remove(it.uid)}>Remove</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>}

      {part !== "adding" && <section className="card">
        <h2>Coins</h2>
        <div className="row">
          {COINS.map((k) => (
            <label key={k} className="field coin">
              <span>{k.toUpperCase()}</span>
              <input type="number" min={0} value={ch.coins[k]} onChange={(e) => set((c) => ({ ...c, coins: { ...c.coins, [k]: Math.max(0, Number(e.target.value) || 0) } }))} />
            </label>
          ))}
        </div>
      </section>}
    </div>
  );
}
