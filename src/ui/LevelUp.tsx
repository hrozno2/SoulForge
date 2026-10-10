import { useMemo, useRef, useState } from "react";
import type { Resolved } from "../aurora/engine";
import { hitDieOf, reqCtx, resolve } from "../aurora/engine";
import { meets } from "../aurora/requirements";
import { buildSheet } from "../aurora/sheet";
import { totalLevel, type Character } from "../aurora/character";
import type { AElement } from "../aurora/types";
import { SlotList, type SetCharacter } from "./Slots";
import { Html } from "./Html";

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
  const [pickMulti, setPickMulti] = useState("");
  const level = totalLevel(ch);
  const oldResolved = useMemo(() => resolve(before.current, r.reg), [r.reg]);
  const oldSheet = useMemo(() => buildSheet(oldResolved), [oldResolved]);
  const sheet = useMemo(() => buildSheet(r), [r]);

  const ctx = reqCtx(r);
  const multiOptions = r.reg.ofType("Class").filter((c) => !c.compendiumHidden && !ch.classes.some((x) => x.classId === c.id) && (!c.multiclass || meets(c.multiclass.requirements, ctx)));

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

  const newFeatures = applied ? sheet.features.filter((f) => !oldSheet.features.some((o) => o.id === f.id)) : [];
  const hpGain = applied ? r.stats.get("hp") - oldResolved.stats.get("hp") : 0;
  const open = applied ? r.slots.filter((s) => !s.rule.optional && !s.defaulted && s.chosen.length < s.rule.number && s.options.length) : [];
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
            <p className="muted">You are level {level}. Choose which class gains a level.</p>
            {level >= 20 && <p className="notice">Level 20 is the maximum.</p>}
            <ul className="added">
              {ch.classes.map((c) => {
                const el = r.reg.get(c.classId);
                return (
                  <li key={c.classId}>
                    <span><b>{el?.name ?? c.classId}</b> <small className="muted">level {c.level} to {c.level + 1}</small></span>
                    <button className="primary" disabled={level >= 20 || c.level >= 20} onClick={() => advance(c.classId, false)}>Level up</button>
                  </li>
                );
              })}
            </ul>
            {multiOptions.length > 0 && level < 20 && ch.classes.length > 0 && (
              <div className="row">
                <label>Or multiclass into{" "}
                  <select value={pickMulti} onChange={(e) => setPickMulti(e.target.value)}>
                    <option value="">Choose a class...</option>
                    {multiOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <button disabled={!pickMulti} onClick={() => advance(pickMulti, true)}>Take a level</button>
              </div>
            )}
            <div className="row"><button onClick={cancel}>Cancel</button></div>
          </>
        )}

        {applied && (
          <>
            <p><b>{leveled?.name}</b> level {ch.classes.find((c) => c.classId === applied)?.level}. Character level {newLevel}.</p>

            <h3>Hit points</h3>
            <p>
              Maximum hit points went up by <b>{hpGain >= 0 ? `+${hpGain}` : hpGain}</b> ({ch.hpMode === "roll" && rolled !== undefined ? `rolled ${rolled}` : `average of the d${die}`}).{" "}
              <button onClick={() => { const v = 1 + Math.floor(Math.random() * die); set((c) => ({ ...c, hpMode: "roll", hpRolls: { ...c.hpRolls, [String(newLevel)]: v } })); }}>Roll the d{die} instead</button>
              {ch.hpMode === "roll" && rolled !== undefined && <button onClick={() => set((c) => { const next = { ...c.hpRolls }; delete next[String(newLevel)]; return { ...c, hpRolls: next }; })}> Use the average</button>}
            </p>

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
            <div className="row">
              <button className="primary" onClick={onClose}>Done</button>
              <button onClick={cancel}>Undo this level</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
