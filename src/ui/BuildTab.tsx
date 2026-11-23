import { useEffect, useState } from "react";
import type { AElement } from "../aurora/types";
import type { Resolved } from "../aurora/engine";
import { totalLevel, type Character } from "../aurora/character";
import { SlotList, tabOfSlot, type SetCharacter } from "./Slots";
import { ChosenBanner, PickCards } from "./PickCards";
import { multiclassLock } from "./multiclass";

/**
 * The chosen classes with their levels and choices. `picker` off leaves picking a class to the caller (the build
 * board lists them beside); `compact` shows each class as a plain row, for when its card is already on show.
 */
/** `only`: one class's choices (the class card's tab for it, C4); the class rows stay, for levels and removing. */
export function ClassPanel({
  r,
  ch,
  set,
  onDetail,
  picker = true,
  compact = false,
  only,
}: {
  r: Resolved;
  ch: Character;
  set: SetCharacter;
  onDetail: (e: AElement) => void;
  picker?: boolean;
  compact?: boolean;
  only?: string;
}) {
  const classes = r.reg.ofType("Class").filter((c) => !c.compendiumHidden);
  const [adding, setAdding] = useState(false);
  const level = totalLevel(ch);
  const setLevel = (i: number, delta: number) =>
    set((c) => {
      const next = c.classes.map((x, j) => (j === i ? { ...x, level: Math.max(1, Math.min(20, x.level + delta)) } : x));
      return { ...c, classes: next };
    });
  const remove = (i: number) => set((c) => ({ ...c, classes: c.classes.filter((_, j) => j !== i) }));
  const add = (id: string) => set((c) => ({ ...c, classes: [...c.classes, { classId: id, level: 1 }] }));
  const have = new Set(ch.classes.map((c) => c.classId));
  return (
    <>
      <div className="class-list">
        {ch.classes.map((c, i) => {
          const el = r.reg.get(c.classId);
          if (el && compact) {
            return (
              <div className="class-row compact" key={c.classId}>
                <b>{el.name}</b>
                <small className="muted">{i === 0 ? "starting class" : "multiclass"}</small>
                <span className="stepper">
                  <button onClick={() => setLevel(i, -1)} disabled={c.level <= 1} aria-label="Level down">
                    −
                  </button>
                  <span>Level {c.level}</span>
                  <button onClick={() => setLevel(i, 1)} disabled={c.level >= 20 || level >= 20} aria-label="Level up">
                    +
                  </button>
                </span>
                <ConfirmRemove onRemove={() => remove(i)} />
              </div>
            );
          }
          return el ? (
            <ChosenBanner key={c.classId} el={el} label={i === 0 ? "Starting class" : "Multiclass"} onHover={onDetail}>
              <span className="stepper">
                <button onClick={() => setLevel(i, -1)} disabled={c.level <= 1} aria-label="Level down">
                  −
                </button>
                <span>Level {c.level}</span>
                <button onClick={() => setLevel(i, 1)} disabled={c.level >= 20 || level >= 20} aria-label="Level up">
                  +
                </button>
              </span>
              <ConfirmRemove onRemove={() => remove(i)} />
            </ChosenBanner>
          ) : (
            <div className="class-row" key={c.classId}>
              <b>{c.classId}</b>
              <button onClick={() => remove(i)}>Remove</button>
            </div>
          );
        })}
        {!ch.classes.length && <p className="muted">Pick a class to start.</p>}
      </div>
      {picker && (
        <div className="row">
          <button className="primary" onClick={() => setAdding(!adding)}>
            {adding ? "Close" : ch.classes.length ? "Add class (multiclass)" : "Choose class"}
          </button>
          {level >= 20 && <span className="muted">Level 20 is the maximum.</span>}
        </div>
      )}
      {picker && adding && (
        <PickCards
          kicker={ch.classes.length ? "Add a class" : "Choose a class"}
          title={ch.classes.length ? "Branch out." : "Claim your role."}
          items={classes.filter((c) => !have.has(c.id))}
          onPick={(id) => {
            add(id);
            setAdding(false);
          }}
          onDetail={onDetail}
          disabledReason={ch.classes.length ? (c) => multiclassLock(r, c) : undefined}
        />
      )}
      {ch.classes
        .filter((c) => !only || c.classId === only)
        .map((c) => {
          const slots = r.slots.filter((s) => tabOfSlot(s) === "class" && s.root === `class:${c.classId}`);
          const el = r.reg.get(c.classId);
          return (
            <section key={c.classId}>
              <h3>{el?.name} choices</h3>
              <SlotList slots={slots} r={r} set={set} onDetail={onDetail} empty="No choices yet at this level." />
            </section>
          );
        })}
    </>
  );
}

/**
 * Removing a class asks twice: the first click arms the button for a few seconds, the second removes. One stray click
 * (a scrollbar appeared and moved the level "+" under the pointer, Chris 2026-11-17) took a whole class away.
 */
function ConfirmRemove({ onRemove }: { onRemove: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={armed ? "danger" : "ghost"}
      onClick={() => (armed ? onRemove() : setArmed(true))}
      aria-label={armed ? "Click again to remove the class" : "Remove the class"}
    >
      {armed ? "Click again to remove" : "Remove"}
    </button>
  );
}
