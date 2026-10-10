import { useMemo, useState } from "react";
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

export function setSelection(set: SetCharacter, key: string, ids: string[]): void {
  set((c) => ({ ...c, selections: { ...c.selections, [key]: ids } }));
}

const PAGE = 120;

export function Slot({ slot, r, set, onDetail }: { slot: SelectSlot; r: Resolved; set: SetCharacter; onDetail: (e: AElement) => void }) {
  const { rule, chosen } = slot;
  const [open, setOpen] = useState(chosen.length < rule.number);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [allSources, setAllSources] = useState(false);
  const full = chosen.length >= rule.number;

  // Several books can offer the same thing. Prefer the book of the rule that asks, unless that leaves nothing.
  const sameBook = useMemo(() => slot.options.filter((o) => o.source === slot.owner.source || chosen.includes(o.id)), [slot.options, slot.owner.source, chosen]);
  const narrowed = !allSources && slot.options.length > 12 && sameBook.length > 0 && sameBook.length < slot.options.length;
  const pool = narrowed ? sameBook : slot.options;

  const options = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pool.filter((o) => !needle || o.name.toLowerCase().includes(needle) || o.source.toLowerCase().includes(needle));
  }, [pool, q]);

  const toggle = (el: AElement) => {
    let next: string[];
    if (chosen.includes(el.id) && !slot.defaulted) next = chosen.filter((c) => c !== el.id);
    else if (rule.number === 1) next = [el.id];
    else if (chosen.length < rule.number) next = [...(slot.defaulted ? [] : chosen), el.id];
    else return;
    setSelection(set, slot.key, next);
    if (rule.number === 1) setOpen(false);
  };

  const label = rule.number > 1 ? `${chosen.length}/${rule.number}` : chosen.length ? "" : slot.listItems ? "optional" : "choose";
  const chosenNames = slot.listItems ? chosen.map((id) => slot.listItems!.find((i) => i.id === id)?.text ?? id) : chosen.map((id) => r.reg.get(id)?.name ?? id);
  const toggleItem = (id: string) => {
    const next = chosen.includes(id) ? chosen.filter((c) => c !== id) : rule.number === 1 ? [id] : chosen.length < rule.number ? [...chosen, id] : chosen;
    setSelection(set, slot.key, next);
  };
  return (
    <div className={`slot ${full ? "done" : "todo"}`}>
      <button className="slot-head" onClick={() => setOpen(!open)}>
        <span className="slot-name">{rule.name}</span>
        <span className="slot-chosen">
          {chosenNames.join(" · ")}
          {slot.defaulted ? " (default)" : ""}
        </span>
        <span className="slot-count">{label}</span>
        <span className="chev">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="slot-body">
          {!slot.listItems && slot.options.length > 12 && <input className="slot-search" placeholder={`Search ${slot.options.length} options`} value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} />}
          {slot.listItems && (
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
          )}
          {!slot.listItems && slot.options.length === 0 && <p className="muted">Nothing matches this choice in the loaded content.</p>}
          <ul className="options" hidden={!!slot.listItems}>
            {options.slice(0, shown).map((o) => {
              const picked = chosen.includes(o.id);
              const used = !picked && r.ids.has(o.id);
              const blocked = slot.blocked.has(o.id);
              return (
                <li key={o.id} className={`${picked ? "picked" : ""} ${used || blocked ? "dim" : ""}`}>
                  <button onClick={() => toggle(o)} onMouseEnter={() => onDetail(o)} onFocus={() => onDetail(o)}>
                    <span className="tick">{picked ? "✓" : ""}</span>
                    <span className="opt-name">{o.name}</span>
                    <span className="opt-meta">{metaLine(o)}{blocked ? " · requirements not met" : used ? " · already have" : ""}</span>
                    <span className="opt-src">{o.source}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {narrowed && (
            <button className="more" onClick={() => setAllSources(true)}>
              Showing {sameBook.length} from {slot.owner.source}. Show all {slot.options.length} from every book
            </button>
          )}
          {options.length > shown && (
            <button className="more" onClick={() => setShown(shown + PAGE)}>
              Show more ({options.length - shown})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function SlotList({ slots, r, set, onDetail, empty }: { slots: SelectSlot[]; r: Resolved; set: SetCharacter; onDetail: (e: AElement) => void; empty?: string }) {
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
