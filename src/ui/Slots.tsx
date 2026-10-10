import { useState } from "react";
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

export function setSelection(set: SetCharacter, key: string, ids: string[]): void {
  set((c) => ({ ...c, selections: { ...c.selections, [key]: ids } }));
}

export function Slot({ slot, r, set, onDetail }: { slot: SelectSlot; r: Resolved; set: SetCharacter; onDetail: (e: AElement) => void }) {
  const { rule, chosen } = slot;
  const [open, setOpen] = useState(chosen.length < rule.number);
  const full = chosen.length >= rule.number;

  const toggle = (el: AElement) => {
    let next: string[];
    if (chosen.includes(el.id) && !slot.defaulted) next = chosen.filter((c) => c !== el.id);
    else if (rule.number === 1) next = [el.id];
    else if (chosen.length < rule.number) next = [...(slot.defaulted ? [] : chosen), el.id];
    else return;
    setSelection(set, slot.key, next);
    if (rule.number === 1) setOpen(false);
  };
  const toggleItem = (id: string) => {
    const next = chosen.includes(id) ? chosen.filter((c) => c !== id) : rule.number === 1 ? [id] : chosen.length < rule.number ? [...chosen, id] : chosen;
    setSelection(set, slot.key, next);
  };
  const chosenNames = slot.listItems ? chosen.map((id) => slot.listItems!.find((i) => i.id === id)?.text ?? id) : chosen.map((id) => r.reg.get(id)?.name ?? id);
  const need = rule.number;
  const type = rule.type;
  const reason = (el: AElement): string | undefined => (slot.blocked.has(el.id) ? "requirements not met" : !chosen.includes(el.id) && r.ids.has(el.id) ? "already have" : undefined);

  return (
    <div className={`slot ${full ? "done" : "todo"}`}>
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
            <Browse items={slot.options} type={type} chosen={chosen} onPick={toggle} onHover={onDetail} disabledReason={reason} defaultView="list" allowCards={!["Spell", "Language", "Proficiency", "Ability Score Improvement", "Companion"].includes(type)} perPage={60} />
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
