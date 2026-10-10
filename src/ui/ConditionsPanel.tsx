import type { Character } from "../aurora/character";
import type { SetCharacter } from "./Slots";
import { CONDITIONS, CONDITION_TEXT, MAX_EXHAUSTION } from "./conditions";

/** Conditions with what each does, and the exhaustion level. Rolls read these automatically. */
export function ConditionsPanel({ ch, set }: { ch: Character; set: SetCharacter }) {
  const ex = ch.play.exhaustion ?? 0;
  const toggle = (c: string) => set((x) => ({ ...x, play: { ...x.play, conditions: x.play.conditions.includes(c) ? x.play.conditions.filter((y) => y !== c) : [...x.play.conditions, c] } }));
  const setEx = (n: number) => set((x) => ({ ...x, play: { ...x.play, exhaustion: Math.max(0, Math.min(MAX_EXHAUSTION, n)) } }));
  return (
    <>
      <p className="muted">Rolls on the Play tab apply these: advantage and disadvantage, automatic failures and the exhaustion penalty. The roll card says why.</p>
      <div className="chips">
        {CONDITIONS.map((c) => (
          <button key={c} className={ch.play.conditions.includes(c) ? "pill active" : "pill"} title={CONDITION_TEXT[c]} aria-pressed={ch.play.conditions.includes(c)} onClick={() => toggle(c)}>{c}</button>
        ))}
      </div>
      <div className="row exhaustion-row">
        <b>Exhaustion</b>
        <span className="stepper">
          <button aria-label="Lower exhaustion" onClick={() => setEx(ex - 1)} disabled={ex === 0}>−</button>
          <output aria-live="polite">{ex}</output>
          <button aria-label="Raise exhaustion" onClick={() => setEx(ex + 1)} disabled={ex === MAX_EXHAUSTION}>+</button>
        </span>
        <small className="muted">{ex === 0 ? "None. Each level takes 2 off d20 tests and 5 feet off speed." : ex >= MAX_EXHAUSTION ? "Level 6 is death." : `−${2 * ex} on d20 tests, −${5 * ex} feet of speed.`}</small>
      </div>
      {ch.play.conditions.length > 0 && (
        <ul className="condition-notes">
          {ch.play.conditions.map((c) => <li key={c}><b>{c}.</b> {CONDITION_TEXT[c]}</li>)}
        </ul>
      )}
    </>
  );
}
