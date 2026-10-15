import { useEffect, useMemo, useRef, useState } from "react";
import type { Resolved } from "../aurora/engine";
import { hitDieOf, resolve, stillToChoose } from "../aurora/engine";
import { buildSheet } from "../aurora/sheet";
import { totalLevel, type Character } from "../aurora/character";
import type { AElement } from "../aurora/types";
import { SlotList, type SetCharacter } from "./Slots";
import { Html } from "./Html";
import { ChosenBanner, PickCards } from "./PickCards";
import { multiclassLock } from "./multiclass";

/** Spell slots at each level, from a caster's casting lines, as a short text. */
const slotText = (sh: ReturnType<typeof buildSheet>) =>
  sh.casting.map((c) => `${c.name}: ${c.slots.map((s) => `L${s.level} ×${s.total}`).join(", ") || "no slots"}`).join(" · ");

/**
 * A guided level up. It applies the new level straight away so the usual choice lists work, shows what the level
 * brings, and Cancel puts the character back exactly as it was.
 */
export function LevelUp({ r, ch, set, onDetail, onClose }: { r: Resolved; ch: Character; set: SetCharacter; onDetail: (e: AElement) => void; onClose: () => void }) {
  const before = useRef(ch);
  const [applied, setApplied] = useState<string | null>(null);
  const level = totalLevel(ch);
  const oldResolved = useMemo(() => resolve(before.current, r.reg), [r.reg]);
  const oldSheet = useMemo(() => buildSheet(oldResolved), [oldResolved]);
  const sheet = useMemo(() => buildSheet(r), [r]);

  const multiOptions = r.reg.ofType("Class").filter((c) => !c.compendiumHidden && !ch.classes.some((x) => x.classId === c.id));
  const [showMulti, setShowMulti] = useState(false);
  // Escape: before a level is chosen it closes; afterwards it keeps the level (like Done).
  const applyRef = useRef(applied);
  applyRef.current = applied;
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") (applyRef.current ? onClose : cancelRef.current)(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const advance = (classId: string, isNew: boolean) => {
    set((c) => ({
      ...c,
      classes: isNew ? [...c.classes, { classId, level: 1 }] : c.classes.map((x) => (x.classId === classId ? { ...x, level: x.level + 1 } : x)),
    }));
    setApplied(classId);
  };
  const cancel = () => {
    if (applied) set(() => before.current);
    onClose();
  };
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;

  const newFeatures = applied ? sheet.features.filter((f) => !oldSheet.features.some((o) => o.id === f.id)) : [];
  const hpGain = applied ? r.stats.get("hp") - oldResolved.stats.get("hp") : 0;
  const open = applied ? r.slots.filter((s) => !s.defaulted && stillToChoose(s, r)) : [];
  const leveled = applied ? r.reg.get(applied) : undefined;
  const swappable = applied ? r.slots.filter((s) => s.rule.type === "Spell" && s.chosen.length > 0 && s.root === `class:${applied}` && !/cantrip/i.test(s.rule.name)) : [];
  const die = applied ? hitDieOf(r.reg.get(applied)) : 0;
  const newLevel = level; // the character level after applying
  const rolled = ch.hpRolls[String(newLevel)];

  return (
    <div className="modal-back" role="dialog" aria-label="Level up" onClick={cancel}>
      <div className="modal-page themed levelup" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" aria-label="Close" onClick={cancel}>×</button>
        <h2>Level up</h2>

        {!applied && (
          <>
            <p className="levelup-sub">Level {level} <span aria-hidden="true">→</span> {Math.min(20, level + 1)}. Choose which class gains the level.</p>
            {level >= 20 && <p className="notice">Level 20 is the maximum.</p>}
            {ch.classes.map((c) => {
              const el = r.reg.get(c.classId);
              if (!el) return null;
              return (
                <ChosenBanner key={c.classId} el={el} label={`${el.name} ${c.level} → ${c.level + 1} · d${hitDieOf(el)} hit die`} onHover={onDetail}>
                  <button className="pick-select" disabled={level >= 20 || c.level >= 20} onClick={() => advance(c.classId, false)}>Level up</button>
                </ChosenBanner>
              );
            })}
            {multiOptions.length > 0 && level < 20 && ch.classes.length > 0 && (
              <div className="levelup-multi">
                <button className="ghost" aria-expanded={showMulti} onClick={() => setShowMulti(!showMulti)}>{showMulti ? "Hide other classes" : "Or take a level in a new class (multiclass)..."}</button>
                {showMulti && (
                  <PickCards kicker="Multiclass" title="Branch out." items={multiOptions} onPick={(id) => advance(id, true)} onDetail={onDetail} disabledReason={(c) => multiclassLock(r, c)} />
                )}
              </div>
            )}
            <div className="levelup-foot"><button onClick={cancel}>Cancel</button></div>
          </>
        )}

        {applied && (
          <>
            <div className="levelup-summary">
              <div className="lu-tile"><span>{leveled?.name}</span><b>{ch.classes.find((c) => c.classId === applied)?.level}</b><small>class level</small></div>
              <div className="lu-tile"><span>Character</span><b>{newLevel}</b><small>total level</small></div>
              <div className="lu-tile hp"><span>Hit points</span><b>{hpGain >= 0 ? `+${hpGain}` : hpGain}</b><small>{ch.hpMode === "roll" && rolled !== undefined ? `rolled ${rolled} on the d${die}` : `average of the d${die}`}</small></div>
            </div>
            <div className="row lu-hp-actions">
              <button onClick={() => { const v = 1 + Math.floor(Math.random() * die); set((c) => ({ ...c, hpMode: "roll", hpRolls: { ...c.hpRolls, [String(newLevel)]: v } })); }}>Roll the d{die} instead</button>
              {ch.hpMode === "roll" && rolled !== undefined && <button onClick={() => set((c) => { const next = { ...c.hpRolls }; delete next[String(newLevel)]; return { ...c, hpRolls: next }; })}>Use the average</button>}
            </div>

            {newFeatures.length > 0 && (
              <>
                <h3>New features</h3>
                <ul className="levelup-features">
                  {newFeatures.map((f) => (
                    <li key={f.id}><b>{f.name}</b> <small className="muted">{f.type}{f.usage ? ` · ${f.usage}` : ""}</small><Html html={f.text.length > 260 ? `${f.text.slice(0, 260)}...` : f.text} /></li>
                  ))}
                </ul>
              </>
            )}

            {sheet.casting.length > 0 && slotText(sheet) !== slotText(oldSheet) && (
              <>
                <h3>Spellcasting</h3>
                <p>{slotText(sheet)}</p>
              </>
            )}

            <h3>Choices</h3>
            {open.length === 0 ? <p className="muted">Nothing to choose at this level.</p> : <p className="notice">{open.length} {open.length === 1 ? "choice" : "choices"} to make:</p>}
            <SlotList slots={open} r={r} set={set} onDetail={onDetail} />

            {swappable.length > 0 && (
              <details className="tip">
                <summary>Swap a spell you know (optional)</summary>
                <p className="muted">When you gain a level you can replace one spell you know with another from your class list.</p>
                <SlotList merge={false} slots={swappable} r={r} set={set} onDetail={onDetail} />
              </details>
            )}

            {open.length > 0 && <p className="muted">You can leave choices open and finish them on the Build tab.</p>}
            <div className="levelup-foot">
              <button onClick={cancel}>Undo this level</button>
              <button className="primary" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
