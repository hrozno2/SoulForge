import { useEffect, useRef, useState } from "react";
import { findGrids } from "../aurora/improvements";
import { ImprovementGrid } from "./ImprovementGrid";
import { requestRoll } from "./Dice";
import { D20 } from "./icons";
import { Browse } from "./Browse";
import type { AElement } from "../aurora/types";
import { skippable, type Resolved, type SelectSlot } from "../aurora/engine";
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

const signature = (s: SelectSlot) => [s.owner.id, s.rule.type, s.rule.name, s.rule.supports ?? "", s.rule.spellcasting ?? "", s.rule.optional ? 1 : 0, s.declined ? 1 : 0, s.listItems ? "list" : ""].join("|");

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
      whyBlocked: (id: string) => g.map((x) => x.whyBlocked?.(id)).find(Boolean),
      members: g,
    };
  });
}

export function Slot({ slot, r, set, onDetail }: { slot: MergedSlot; r: Resolved; set: SetCharacter; onDetail: (e: AElement) => void }) {
  const { rule, chosen } = slot;
  const declined = !!slot.declined;
  const [open, setOpen] = useState(chosen.length < rule.number && !declined);
  const full = chosen.length >= rule.number || declined;
  // A variant or optional choice has a box: unticked, it is not taken, its picks go and it counts as done.
  const canSkip = !slot.listItems && skippable(rule);
  const keys = slot.members ? slot.members.map((m) => m.key) : [slot.key];
  // An optional choice with a single option (a package such as a 2014 background's "2024 rules") is that option:
  // ticking the box takes it, with nothing more to pick.
  const only = keys.length === 1 && rule.number === 1 && slot.options.length === 1 ? slot.options[0].id : undefined;
  const setTaking = (take: boolean) => {
    set((c) => ({
      ...c,
      declined: take ? (c.declined ?? []).filter((k) => !keys.includes(k)) : [...new Set([...(c.declined ?? []), ...keys])],
      taken: take ? [...new Set([...(c.taken ?? []), ...keys])] : (c.taken ?? []).filter((k) => !keys.includes(k)),
      selections: take ? (only ? { ...c.selections, [keys[0]]: [only] } : c.selections) : { ...c.selections, ...Object.fromEntries(keys.map((k) => [k, []])) },
    }));
    setOpen(take && !only);
  };
  // A choice that just got filled folds away so the next one is in view. Opening it again stays open.
  const wasFull = useRef(full);
  useEffect(() => {
    if (full && !wasFull.current) setOpen(false);
    wasFull.current = full;
  }, [full]);

  // A merged choice hands its picks back to the underlying choices: each pick to one where it is allowed (a 2nd-level
  // spell to the choice made at level 3, not the one at level 1), matched all at once, earlier choices first; by order
  // only when no allowed assignment exists.
  const commit = (next: string[]) => {
    if (!slot.members) return setSelection(set, slot.key, next);
    const places = slot.members.flatMap((m, mi) => Array.from({ length: m.rule.number }, () => mi));
    const fits = (id: string, p: number) => !slot.members![places[p]].blocked.has(id);
    const at = new Map<number, string>();
    const tryPick = (id: string, seen: Set<number>): boolean => {
      for (let p = 0; p < places.length; p++) {
        if (seen.has(p) || !fits(id, p)) continue;
        seen.add(p);
        const other = at.get(p);
        if (other === undefined || tryPick(other, seen)) { at.set(p, id); return true; }
      }
      return false;
    };
    const placedAll = next.every((id) => tryPick(id, new Set()));
    const parts = slot.members.map(() => [] as string[]);
    if (placedAll) for (const [p, id] of [...at].sort((a, b) => a[0] - b[0])) parts[places[p]].push(id);
    else next.forEach((id, i) => { if (i < places.length) parts[places[i]].push(id); });
    set((c) => ({ ...c, selections: { ...c.selections, ...Object.fromEntries(slot.members!.map((m, i) => [m.key, parts[i]])) } }));
  };
  const toggle = (el: AElement) => {
    let next: string[];
    if (chosen.includes(el.id) && !slot.defaulted) next = chosen.filter((c) => c !== el.id);
    else if (rule.number === 1) next = [el.id];
    else if (chosen.length < rule.number) next = [...(slot.defaulted ? [] : chosen), el.id];
    else return;
    commit(next);
    // A one-pick choice folds once its pick is made (or swapped); deselecting never folds it (C1.2).
    if (rule.number === 1 && next.length) setOpen(false);
  };
  const swap = (from: AElement, to: AElement) => {
    if (slot.blocked.has(to.id)) return;
    commit(chosen.map((c) => (c === from.id ? to.id : c)));
  };
  const toggleItem = (id: string) => {
    const next = chosen.includes(id) ? chosen.filter((c) => c !== id) : rule.number === 1 ? [id] : chosen.length < rule.number ? [...chosen, id] : chosen;
    commit(next);
  };
  // The override: when the choice's own filter, its requirements or the content filters leave nothing (or not what
  // the player needs), the whole list of that kind is offered. The rules check still flags a pick the rules forbid.
  const [all, setAll] = useState(false);
  const nothingLeft = !slot.listItems && (slot.options.length === 0 || slot.options.every((o) => slot.blocked.has(o.id) && !chosen.includes(o.id)));
  const pool = all ? r.reg.ofType(rule.type).filter((e) => !e.compendiumHidden || chosen.includes(e.id)) : slot.options;
  const chosenNames = slot.listItems ? chosen.map((id) => slot.listItems!.find((i) => i.id === id)?.text ?? id) : chosen.map((id) => r.reg.get(id)?.name ?? id);
  const need = rule.number;
  const type = rule.type;
  const reason = (el: AElement): string | undefined => (slot.blocked.has(el.id) ? slot.whyBlocked?.(el.id) ?? "requirements not met" : undefined);
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
    <div className={`slot ${full ? "done" : "todo"} ${slot.listItems ? "has-roll" : ""} ${canSkip ? "has-take" : ""} ${declined ? "declined" : ""}`}>
      {canSkip && <input type="checkbox" className="slot-take" checked={!declined} title={declined ? "Not taken (optional): tick to take it" : "Untick to not take it"} aria-label={`Take ${rule.name}`} onChange={(e) => setTaking(e.target.checked)} />}
      {slot.listItems && slot.listItems.length > 1 && <button className="slot-roll" title={`Roll on the table (d${slot.listItems.length})`} aria-label={`Roll ${rule.name}`} onClick={rollTable}><D20 size={16} /></button>}
      <button className="slot-head" onClick={() => !declined && setOpen(!open)}>
        <span className="slot-title">
          <span className="slot-name">{rule.name}</span>
          {!declined && <span className={`slot-count ${full ? "full" : ""}`} title={`${chosen.length} of ${need} chosen`}>{chosen.length}/{need}</span>}
          <span className="slot-need">{declined ? "not taken" : slot.listItems ? "optional" : full ? "done" : need === 1 ? "choose 1" : `choose ${need - chosen.length} more (${need} total)`}</span>
        </span>
        <span className="slot-chosen">
          {chosenNames.join(" · ")}
          {slot.defaulted ? " (default)" : ""}
        </span>
        <span className="chev">{declined ? "" : open ? "▾" : "▸"}</span>
      </button>
      {open && !declined && (
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
          ) : pool.length === 0 ? (
            <p className="muted">Nothing matches this choice in the loaded content.</p>
          ) : (
            <>
              {all && <p className="notice slot-override-note">Showing every {type.toLowerCase()} in the loaded content, without this choice's own filter or your book filters. The rules check flags a pick the rules do not allow here.</p>}
              {!all && nothingLeft && <p className="notice slot-override-note">Nothing here can be chosen right now. If that is wrong (a filter or the content hides what you need), show the whole list.</p>}
              <Browse items={pool} type={type} chosen={chosen} onPick={toggle} onSwap={swap} onHover={onDetail} disabledReason={all ? undefined : reason} ownedBy={owned} defaultView={type === "Spell" ? "cards" : "list"} allowCards={!["Language", "Proficiency", "Ability Score Improvement", "Companion"].includes(type)} perPage={60} showAll={all} need={slot.rule.number} />
            </>
          )}
          {!slot.listItems && (
            <button className={`ghost slot-override ${nothingLeft && !all ? "urgent" : ""}`} title="Show every element of this kind, ignoring this choice's filter and the content filters" onClick={() => setAll(!all)}>
              {all ? "Back to the matching options" : "Show the whole list"}
            </button>
          )}
          <button className="ghost slot-done" onClick={() => setOpen(false)}>Done</button>
        </div>
      )}
    </div>
  );
}

/** A list of choices, in the content's order: a finished one folds where it is, nothing moves. */
/**
 * A choice with nothing to choose (Chris 2026-10-28): required, a single option it may take, and that option taken (by
 * default or by hand). It is no selector: what it gives is listed under "What you get" (PassiveFeatures).
 */
export function fixedChoice(s: SelectSlot): boolean {
  if (s.rule.optional || s.rule.type === "List" || s.listItems || s.rule.number !== 1) return false;
  const takeable = s.options.filter((o) => !s.blocked.has(o.id));
  return takeable.length === 1 && s.chosen.length === 1 && s.chosen[0] === takeable[0].id;
}

export function SlotList({ slots: given, r, set, onDetail, empty, merge = true }: { slots: SelectSlot[]; r: Resolved; set: SetCharacter; onDetail: (e: AElement) => void; empty?: string; merge?: boolean }) {
  const merged: MergedSlot[] = merge ? mergeSlots(given) : given;
  // Ability score increases are drawn as one check-box grid each (improvements.ts); the choices a grid fills are not
  // listed again.
  const grids = findGrids(r, given);
  const inGrid = new Set(grids.flatMap((g) => [...g.keys]));
  const gridAt = new Map(grids.map((g) => [g.anchor.key, g]));
  const slots = merged.filter((s) => (gridAt.has(s.key) || !inGrid.has(s.key)) && !fixedChoice(s));
  if (!slots.length) return empty ? <p className="muted">{empty}</p> : null;
  return (
    <div className="slot-list">
      {slots.map((s) => (
        <div key={s.key} data-slot={s.key}>
          {gridAt.has(s.key) ? <ImprovementGrid grid={gridAt.get(s.key)!} r={r} set={set} /> : <Slot slot={s} r={r} set={set} onDetail={onDetail} />}
        </div>
      ))}
    </div>
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

/**
 * One switch for a 2014 background's personality traits, ideals, bonds and flaws (its tables): off, all four are left
 * out and never count as missing, as in the 2024 rules, which have none. Shown only when the background has them.
 */
export function PersonalitySwitch({ r, set }: { r: Resolved; set: SetCharacter }) {
  const lists = r.slots.filter((s) => s.root === "background" && s.listItems);
  if (!lists.length) return null;
  const keys = lists.map((s) => s.key);
  const on = lists.some((s) => !s.declined);
  return (
    <label className="personality-switch">
      <input type="checkbox" checked={on} onChange={(e) => set((c) => ({ ...c, declined: e.target.checked ? (c.declined ?? []).filter((k) => !keys.includes(k)) : [...new Set([...(c.declined ?? []), ...keys])] }))} />
      <span><b>Personality traits, ideals, bonds and flaws</b> <small className="muted">2014 rules; the 2024 rules have none. Untick to leave all four out.</small></span>
    </label>
  );
}
