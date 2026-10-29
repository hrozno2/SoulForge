import { flyInto } from "./flight";
import { requestRoll } from "./Dice";
import { useMemo, useState } from "react";
import type { AElement } from "../aurora/types";
import type { Resolved } from "../aurora/engine";
import type { Character } from "../aurora/character";
import {
  ItemIndex, addToInventory, choosePending, genericOptions, settlePending, adventuringPacks, resolveChosenTools, anyWeaponKind, autoEquip, commonGear, expandPack, ledgerOf, removeAdded, focusNote, startingPlans, variantItems, weaponChoices, type EquipPlan, type EquipVariant, type ResolvedItem,
} from "../aurora/startingEquipment";
import type { SetCharacter } from "./Slots";

const gpText = (n: number) => (n ? `${Number.isInteger(n) ? n : n.toFixed(1)} GP` : "");

function Preview({ items, gp }: { items: ResolvedItem[]; gp: number }) {
  const lines = items.map((i) => `${i.qty > 1 ? `${i.qty} ` : ""}${i.name}${focusNote(i.name) ? ` (${focusNote(i.name)})` : ""}${i.el ? "" : " (custom)"}`);
  return <p className="muted small-text">{[...lines, gpText(gp)].filter(Boolean).join(", ") || "Nothing"}</p>;
}

/** "Choose which one..." for an open item (an instrument of your choice), the same list in the box and the inventory. */
export function PendingPick({ kind, name, reg, prefer, value, onPick }: { kind: NonNullable<ResolvedItem["pending"]>; name: string; reg: Resolved["reg"]; prefer: string; value?: string; onPick: (id: string) => void }) {
  return (
    <label className="pending-row">
      <span>{name}:</span>
      <select className="pending-pick" aria-label={`Choose the ${name}`} value={value ?? ""} onChange={(e) => e.target.value && onPick(e.target.value)}>
        <option value="">Choose which one...</option>
        {genericOptions(reg, kind, prefer).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}

function VariantCard({ plan, v, idx, prefer, settle, onAdd, added, replaces }: { plan: EquipPlan; v: EquipVariant; idx: ItemIndex; prefer: string; settle: (items: ResolvedItem[]) => ResolvedItem[]; onAdd: (items: ResolvedItem[], gp: number) => void; added: boolean; replaces: boolean }) {
  const [picks, setPicks] = useState<number[]>([]);
  const [weapons, setWeapons] = useState<Record<string, string>>({});
  const [generic, setGeneric] = useState<Record<number, string>>({});
  const [open, setOpen] = useState(true);
  // Open items (an instrument of your choice) are chosen right here in the box, before the gear goes in.
  const items = useMemo(() => settlePending(settle(variantItems(v, picks, idx, prefer, open, weapons)), generic, idx.registry), [v, picks, idx, prefer, open, weapons, generic, settle]);
  const raw = useMemo(() => settle(variantItems(v, picks, idx, prefer, open, weapons)), [v, picks, idx, prefer, open, weapons, settle]);
  return (
    <div className={added ? "equip-card chosen" : "equip-card"}>
      <div className="row">
        <b>{v.label}</b>
        {added && <span className="done-mark">✓ Added</span>}
        {v.goldRoll && !added && (
          <button className="primary" title="Roll the class's starting gold and take it instead of the gear" onClick={() => { const g = v.goldRoll!; requestRoll(`Starting gold (${plan.title})`, g.dice, (res) => onAdd([], res.total * g.times)); }}>
            Roll {v.goldRoll.dice}{v.goldRoll.times > 1 ? ` × ${v.goldRoll.times}` : ""} gp
          </button>
        )}
      </div>
      {v.goldRoll && <p className="muted small-text">The 2014 rules let you roll for gold and buy your own gear (the shop is on the backpack) instead of taking the class's.</p>}
      {v.choices.map((g, gi) => (
        <div key={gi} className="choice-group">
          {g.options.map((o, oi) => (
            <label key={oi} className="check">
              <input type="radio" name={`${plan.title}-${v.label}-${gi}`} checked={(picks[gi] ?? 0) === oi} onChange={() => setPicks((p) => { const n = [...p]; n[gi] = oi; return n; })} />
              {o.map((r, ri) => {
                const kind = anyWeaponKind(r.text);
                if (!kind) return `${ri ? " and " : ""}${r.qty > 1 ? `${r.qty} ` : ""}${r.text}`;
                return (
                  <select key={ri} value={weapons[`${gi}:${oi}:${ri}`] ?? ""} onClick={(e) => e.stopPropagation()} onChange={(e) => { setPicks((p) => { const n = [...p]; n[gi] = oi; return n; }); setWeapons((w) => ({ ...w, [`${gi}:${oi}:${ri}`]: e.target.value })); }}>
                    <option value="">{r.text}</option>
                    {weaponChoices(idx.registry, kind).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                );
              })}
            </label>
          ))}
        </div>
      ))}
      {!added && raw.map((it, i) => it.pending && <PendingPick key={i} kind={it.pending} name={it.name} reg={idx.registry} prefer={prefer} value={generic[i]} onPick={(id) => setGeneric((g) => ({ ...g, [i]: id }))} />)}
      <Preview items={items} gp={v.gp} />
      {/* Add comes after the picks, at the foot of the box. */}
      {!v.goldRoll && !added && <button className="primary" onClick={() => onAdd(items, v.gp)}>{replaces ? "Use these instead" : "Add these"}</button>}
      <label className="check small"><input type="checkbox" checked={open} onChange={() => setOpen(!open)} /> open packs into separate items</label>
    </div>
  );
}

/**
 * A class's or background's options in one box, as the older "(a) or (b)" lists are (Chris 2026-10-29: "use that for
 * everything"): Option A or B as a radio list with what each holds, then the chosen one's picks and its Add button.
 */
function VariantGroup({ plan, variants, idx, settle, mine, add }: { plan: EquipPlan; variants: EquipVariant[]; idx: ItemIndex; settle: (items: ResolvedItem[]) => ResolvedItem[]; mine: string[]; add: (items: ResolvedItem[], gp: number, label: string, plan?: EquipPlan) => void }) {
  const keyOf = (v: EquipVariant) => `${plan.title}, ${v.label.toLowerCase()}`;
  const [pick, setPick] = useState(() => Math.max(0, variants.findIndex((v) => mine.includes(keyOf(v)))));
  if (!variants.length) return null;
  const card = (v: EquipVariant) => <VariantCard key={v.label} plan={plan} v={v} idx={idx} prefer={plan.source} settle={settle} onAdd={(items, gp) => add(items, gp, keyOf(v), plan)} added={mine.includes(keyOf(v))} replaces={mine.length > 0} />;
  if (variants.length === 1) return card(variants[0]);
  const summary = (v: EquipVariant) => {
    const items = variantItems(v, [], idx, plan.source, false);
    const names = items.map((i) => `${i.qty > 1 ? `${i.qty} ` : ""}${i.name}`);
    return [...names, v.gp ? `${v.gp} GP` : ""].filter(Boolean).join(", ");
  };
  return (
    <div className="equip-card equip-group">
      <b>Starting equipment</b>
      <div className="choice-group">
        {variants.map((v, i) => (
          <label key={v.label} className="check equip-option">
            <input type="radio" name={`${plan.title}-options`} checked={pick === i} onChange={() => setPick(i)} />
            <span><b>{v.label}</b>{mine.includes(keyOf(v)) && <span className="done-mark"> ✓ Added</span>}<small className="muted"> {summary(v)}</small></span>
          </label>
        ))}
      </div>
      {card(variants[Math.min(pick, variants.length - 1)])}
    </div>
  );
}

/** Buttons that put the usual starting gear into the inventory. */
export function StartingEquipment({ r, ch, set, onDetail }: { r: Resolved; ch: Character; set: SetCharacter; onDetail: (e: AElement) => void }) {
  const [equip, setEquip] = useState(true);
  const [note, setNote] = useState("");
  const [show, setShow] = useState(false);
  const added = ch.equipmentAdded ?? [];
  const idx = useMemo(() => new ItemIndex(r.reg), [r.reg]);
  const plans = useMemo(() => startingPlans(ch, r.reg), [ch.classes, ch.background, r.reg]); // eslint-disable-line react-hooks/exhaustive-deps
  const prefer = ch.classes[0] ? r.reg.get(ch.classes[0].classId)?.source ?? "" : "";
  const packs = useMemo(() => adventuringPacks(r.reg, prefer), [r.reg, prefer]);
  const gear = useMemo(() => commonGear(r.reg, prefer), [r.reg, prefer]);

  // Class and background fold away one by one as each is added; the whole panel folds only when both are.
  const [reopened, setReopened] = useState<string[]>([]);
  const addedFor = (title: string, list: string[]) => list.filter((l) => l.startsWith(`${title}, `));
  const allDone = (list: string[]) => plans.length > 0 && plans.every((p) => addedFor(p.title, list).length > 0);
  const add = (items: ResolvedItem[], gp: number, label: string, plan?: EquipPlan) => {
    flyInto("backpack");
    set((c) => {
      // Choosing another option for the same class or background takes the earlier one back out first.
      const earlier = plan ? addedFor(plan.title, c.equipmentAdded ?? []) : [];
      let next = earlier.length ? removeAdded(c, earlier) : c;
      next = addToInventory(next, settle(items), gp);
      if (equip) next = autoEquip(next, r.reg);
      return { ...next, equipmentAdded: [...(next.equipmentAdded ?? []), label], equipmentLedger: { ...(next.equipmentLedger ?? {}), [label]: ledgerOf(items, gp) } };
    });
    setNote(`Added ${label.replace(/^.*, /, "")}`);
    if (plan) setReopened((o) => o.filter((k) => k !== plan.kind));
    const after = plan ? [...added.filter((l) => !l.startsWith(`${plan.title}, `)), label] : [...added, label];
    // Adding a pack or a piece of gear leaves the panel open so you can add more and see what went in.
    if (plan && allDone(after)) setShow(false);
  };
  const settle = useMemo(() => (items: ResolvedItem[]) => resolveChosenTools(items, r.ids, r.reg, prefer), [r.ids, r.reg, prefer]);
  const count = (name: string) => added.filter((l) => l === name).length;
  const addOne = (el: AElement, open: boolean) => add(open && el.extract?.length ? expandPack(el, r.reg) : [{ el, name: el.name, qty: 1 }], 0, el.name);

  // Open items already in the inventory are chosen where their box was, once (not under both class and background).
  const openPicks = ch.inventory.filter((i) => i.pending).map((i) => <PendingPick key={i.uid} kind={i.pending!} name={i.custom?.name ?? "Item"} reg={r.reg} prefer={prefer} onPick={(id) => set((c) => choosePending(c, i.uid, id))} />);
  if (added.length > 0 && !show && (allDone(added) || plans.length === 0)) {
    return (
      <section className="card equip-done">
        <div className="row">
          <h2>Starting equipment</h2>
          <span className="done-mark">✓ Added</span>
          <button onClick={() => setShow(true)}>Add more...</button>
          <button className="more" title="Take the starting gear and gold back out and start the choice again" onClick={() => set((c) => ({ ...removeAdded(c, c.equipmentAdded ?? []), equipmentAdded: [] }))}>Start over</button>
        </div>
        <p className="muted small-text">{added.join(" · ")}. Edit or remove items in the list below; open "Add more" for other packs, gear or the starting options again.</p>
        {openPicks}
      </section>
    );
  }
  return (
    <section className="card">
      <div className="row"><h2>Starting equipment</h2>{added.length > 0 && (allDone(added) || plans.length === 0) && <button onClick={() => setShow(false)}>Hide</button>}</div>
      <p className="muted">One click adds what your class and background offer. Choose an option, or take the gold instead. Armor, shield and the first weapons are equipped for you unless you turn that off.</p>
      <label className="check"><input type="checkbox" checked={equip} onChange={() => setEquip(!equip)} /> Equip armor, shield and weapons automatically</label>
      {ch.classes.length === 0 && !ch.background && <p className="notice">Pick a class and a background on the Build tab to see their starting equipment.</p>}
      {plans.map((p) => {
        const mine = addedFor(p.title, added);
        if (mine.length > 0 && !reopened.includes(p.kind)) {
          return (
            <div key={p.kind} className="equip-origin equip-origin-done">
              <h3>{p.kind === "class" ? "Class" : "Background"}: {p.title} <span className="done-mark">✓ Added</span></h3>
              <p className="muted small-text">{mine.map((l) => l.slice(p.title.length + 2)).join(" · ")}</p>
              {p === plans.find((q) => addedFor(q.title, added).length) && openPicks}
              <button onClick={() => setReopened((o) => [...o, p.kind])}>Change</button>
              <button title="Take these items and gold back out" onClick={() => set((c) => removeAdded(c, addedFor(p.title, c.equipmentAdded ?? [])))}>Remove</button>
            </div>
          );
        }
        return (
        <div key={p.kind} className="equip-origin">
          <h3>{p.kind === "class" ? "Class" : "Background"}: {p.title}</h3>
          <div className="equip-grid">
            <VariantGroup plan={p} variants={p.variants.filter((v) => !v.goldRoll)} idx={idx} settle={settle} mine={mine} add={add} />
            {p.variants.filter((v) => v.goldRoll).map((v) => <VariantCard key={v.label} plan={p} v={v} idx={idx} prefer={p.source} settle={settle} onAdd={(items, gp) => add(items, gp, `${p.title}, ${v.label.toLowerCase()}`, p)} added={mine.includes(`${p.title}, ${v.label.toLowerCase()}`)} replaces={mine.length > 0} />)}
          </div>
        </div>
        );
      })}
      {(ch.classes.length > 0 || ch.background) && plans.length === 0 && <p className="muted">The loaded content does not list starting equipment for your class or background.</p>}

      {packs.length > 0 && (
        <>
          <h3>Adventuring packs</h3>
          <div className="chips">
            {packs.map((p) => (
              <span key={p.id} className={count(p.name) ? "pack-btn added" : "pack-btn"}>
                <button onClick={() => addOne(p, true)} onMouseEnter={() => onDetail(p)} title="Add the contents of the pack">{count(p.name) > 0 && "✓ "}{p.name}{count(p.name) > 1 ? ` ×${count(p.name)}` : ""}</button>
                <button className="more tiny" onClick={() => addOne(p, false)} title="Add as one item">1×</button>
              </span>
            ))}
          </div>
          <p className="muted small-text">The pack name adds its contents. The 1× button keeps it as a single pack.</p>
        </>
      )}
      {gear.length > 0 && (
        <>
          <h3>Common gear</h3>
          <div className="chips">
            {gear.map((g) => <button key={g.id} className={count(g.name) ? "pill active" : "pill"} onClick={() => addOne(g, false)} onMouseEnter={() => onDetail(g)}>{count(g.name) ? "✓" : "+"} {g.name}{count(g.name) > 1 ? ` ×${count(g.name)}` : ""}</button>)}
          </div>
        </>
      )}
      {note && <p className="notice" role="status">{note}</p>}
    </section>
  );
}
