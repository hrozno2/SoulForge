import { useEffect, useRef, useState } from "react";
import { requestRoll } from "./Dice";
import { D20 } from "./icons";
import { Browse } from "./Browse";
import type { AElement } from "../aurora/types";
import type { Resolved, SelectSlot } from "../aurora/engine";
import type { Character } from "../aurora/character";

export type SetCharacter = (fn: (c: Character) => Character) => void;

export function metaLine(el: AElement): string {
  if (el.type === "Spell") {
    const lvl = el.setters.level?.value;
    return `${lvl === "0" ? "Cantrip" : `Level ${lvl ?? "?"}`} ${el.setters.school?.value ?? ""}`.trim();
  }
  if (el.type === "Feat" && el.requirements) return "has prerequisites";
  return "";
}

/** What already gives the character this option, in words, or nothing when they do not have it. */
export function ownership(r: Resolved, el: AElement, thisSlot: string | string[]): string | undefined {
  if (!r.ids.has(el.id)) return undefined;
  const other = r.slots.find((s) => ![thisSlot].flat().includes(s.key) && s.chosen.includes(el.id));
  if (other) return `You chose this for ${other.rule.name} (${other.owner.name}).`;
  const a = r.active.find((x) => x.el.id === el.id);
  const from = a?.from ? r.reg.get(a.from)?.name : undefined;
  const ch = r.character;
  const rootId = !a ? "" : a.root === "race" ? ch.race ?? "" : a.root === "background" ? ch.background ?? "" : a.root.startsWith("class:") ? a.root.slice(6) : "";
  const root = rootId ? r.reg.get(rootId)?.name : undefined;
  if (from && root && root !== from) return `Granted by ${from} (${root}).`;
  if (from || root) return `Granted by ${from ?? root}.`;
  return "Already granted by your build.";
}

export function setSelection(set: SetCharacter, key: string, ids: string[]): void {
  set((c) => ({ ...c, selections: { ...c.selections, [key]: ids } }));
}

/** Several identical choices (two spells at level 1, two more at 3, and so on) shown as one. */
export type MergedSlot = SelectSlot & { members?: SelectSlot[] };

const signature = (s: SelectSlot) => [s.owner.id, s.rule.type, s.rule.name, s.rule.supports ?? "", s.rule.spellcasting ?? "", s.rule.optional ? 1 : 0, s.listItems ? "list" : ""].join("|");

export function mergeSlots(slots: SelectSlot[]): MergedSlot[] {
  const groups = new Map<string, SelectSlot[]>();
  for (const s of slots) (groups.get(signature(s)) ?? groups.set(signature(s), []).get(signature(s))!).push(s);
  return [...groups.values()].map((g) => {
    if (g.length < 2 || g[0].listItems) return g[0];
    const options = [...new Map(g.flatMap((x) => x.options).map((o) => [o.id, o])).values()];
    return {
      ...g[0],
      rule: { ...g[0].rule, number: g.reduce((n, x) => n + x.rule.number, 0) },
      chosen: g.flatMap((x) => x.chosen),
      defaulted: g.every((x) => x.defaulted),
      options,
      blocked: new Set(g.flatMap((x) => [...x.blocked])),
      members: g,
    };
  });
}

export function Slot({ slot, r, set, onDetail }: { slot: MergedSlot; r: Resolved; set: SetCharacter; onDetail: (e: AElement) => void }) {
  const { rule, chosen } = slot;
  const [open, setOpen] = useState(chosen.length < rule.number);
  const full = chosen.length >= rule.number;
  // A choice that just got filled folds away so the next one is in view. Opening it again stays open.
  const wasFull = useRef(full);
  useEffect(() => {
    if (full && !wasFull.current) setOpen(false);
    wasFull.current = full;
  }, [full]);

  // A merged choice hands its picks back to the underlying choices, filling the earlier ones first.
  const commit = (next: string[]) => {
    if (!slot.members) return setSelection(set, slot.key, next);
    let at = 0;
    const entries = slot.members.map((m) => {
      const part = next.slice(at, at + m.rule.number);
      at += m.rule.number;
      return [m.key, part] as const;
    });
    set((c) => ({ ...c, selections: { ...c.selections, ...Object.fromEntries(entries) } }));
  };
  const toggle = (el: AElement) => {
    let next: string[];
    if (chosen.includes(el.id) && !slot.defaulted) next = chosen.filter((c) => c !== el.id);
    else if (rule.number === 1) next = [el.id];
    else if (chosen.length < rule.number) next = [...(slot.defaulted ? [] : chosen), el.id];
    else return;
    commit(next);
    if (rule.number === 1) setOpen(false);
  };
  const swap = (from: AElement, to: AElement) => {
    if (slot.blocked.has(to.id)) return;
    commit(chosen.map((c) => (c === from.id ? to.id : c)));
  };
  const toggleItem = (id: string) => {
    const next = chosen.includes(id) ? chosen.filter((c) => c !== id) : rule.number === 1 ? [id] : chosen.length < rule.number ? [...chosen, id] : chosen;
    commit(next);
  };
  const chosenNames = slot.listItems ? chosen.map((id) => slot.listItems!.find((i) => i.id === id)?.text ?? id) : chosen.map((id) => r.reg.get(id)?.name ?? id);
  const need = rule.number;
  const type = rule.type;
  const reason = (el: AElement): string | undefined => (slot.blocked.has(el.id) ? "requirements not met" : undefined);
  const owned = (el: AElement): string | undefined => (chosen.includes(el.id) ? undefined : ownership(r, el, slot.members ? slot.members.map((m) => m.key) : slot.key));

  // A table (a 2014 background's personality traits, ideals, bonds and flaws) can be rolled on: a die per pick,
  // shown in the dice log, a repeat rolled again.
  const rollTable = () => {
    const items = slot.listItems;
    if (!items?.length) return;
    const picked: string[] = [];
    const one = () => requestRoll(`${rule.name}: d${items.length}`, `1d${items.length}`, (res) => {
      const it = items[Math.max(0, Math.min(items.length - 1, res.total - 1))];
      if (!picked.includes(it.id)) picked.push(it.id);
      if (picked.length < Math.min(rule.number, items.length)) one();
      else commit(picked);
    });
    one();
  };
  return (
    <div className={`slot ${full ? "done" : "todo"} ${slot.listItems ? "has-roll" : ""}`}>
      {slot.listItems && slot.listItems.length > 1 && <button className="slot-roll" title={`Roll on the table (d${slot.listItems.length})`} aria-label={`Roll ${rule.name}`} onClick={rollTable}><D20 size={16} /></button>}
      <button className="slot-head" onClick={() => setOpen(!open)}>
        <span className="slot-title">
          <span className="slot-name">{rule.name}</span>
          <span className={`slot-count ${full ? "full" : ""}`} title={`${chosen.length} of ${need} chosen`}>{chosen.length}/{need}</span>
          <span className="slot-need">{slot.listItems ? "optional" : full ? "done" : need === 1 ? "choose 1" : `choose ${need - chosen.length} more (${need} total)`}</span>
        </span>
        <span className="slot-chosen">
          {chosenNames.join(" · ")}
          {slot.defaulted ? " (default)" : ""}
        </span>
        <span className="chev">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="slot-body">
          {slot.listItems ? (
            <ul className="options">
              {slot.listItems.map((i) => (
                <li key={i.id} className={chosen.includes(i.id) ? "picked" : ""}>
                  <button onClick={() => toggleItem(i.id)}>
                    <span className="tick">{chosen.includes(i.id) ? "✓" : ""}</span>
                    <span className="opt-name wrapText">{i.text}</span>
                    <span className="opt-meta" />
                    <span className="opt-src" />
                  </button>
                </li>
              ))}
            </ul>
          ) : slot.options.length === 0 ? (
            <p className="muted">Nothing matches this choice in the loaded content.</p>
          ) : (
            <Browse items={slot.options} type={type} chosen={chosen} onPick={toggle} onSwap={swap} onHover={onDetail} disabledReason={reason} ownedBy={owned} defaultView="list" allowCards={!["Spell", "Language", "Proficiency", "Ability Score Improvement", "Companion"].includes(type)} perPage={60} />
          )}
          <button className="ghost slot-done" onClick={() => setOpen(false)}>Done</button>
        </div>
      )}
    </div>
  );
}

export function SlotList({ slots: given, r, set, onDetail, empty, merge = true }: { slots: SelectSlot[]; r: Resolved; set: SetCharacter; onDetail: (e: AElement) => void; empty?: string; merge?: boolean }) {
  const slots: MergedSlot[] = merge ? mergeSlots(given) : given;
  if (!slots.length) return empty ? <p className="muted">{empty}</p> : null;
  return (
    <>
      {slots.map((s) => (
        <Slot key={s.key} slot={s} r={r} set={set} onDetail={onDetail} />
      ))}
    </>
  );
}

/** Which Build sub-tab a choice belongs on, following the layout of the original builder. */
export function tabOfSlot(s: SelectSlot): "race" | "class" | "background" | "abilities" | "languages" | "proficiencies" | "feats" | "magic" | "other" {
  const t = s.rule.type;
  if (t === "Ability Score Improvement") return "abilities";
  if (t === "Language") return "languages";
  if (t === "Proficiency") return "proficiencies";
  if (t === "Feat") return "feats";
  if (t === "Spell") return "magic";
  if (s.root === "race") return "race";
  if (s.root === "background") return "background";
  if (s.root.startsWith("class:")) return "class";
  return "other";
}
