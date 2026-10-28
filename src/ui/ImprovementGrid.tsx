import type { Resolved } from "../aurora/engine";
import { ABILITY_ORDER, gridPicks, tickBox, type Ability, type Grid } from "../aurora/improvements";
import { useState } from "react";
import type { AElement } from "../aurora/types";
import type { SetCharacter } from "./Slots";
import { Browse } from "./Browse";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * An ability score increase as Foundry shows it (A1.9): abilities as rows, the increases (+2, +1...) as columns, one
 * box per column, a different ability in each. A set of abilities (Aurora's 2024 backgrounds) is picked from a list
 * first; a choice between "+2 to one" and "+1 to two" (or a feat instead) is a switch above the grid.
 */
export function ImprovementGrid({ grid, r, set }: { grid: Grid; r: Resolved; set: SetCharacter }) {
  const ch = r.character;
  // The way taken, or (nothing taken yet, and no other kind of option such as a feat chosen) the first way, as Foundry
  // shows it; ticking a box then takes that way.
  const chosen = grid.modes.find((m) => !grid.modeKey || m.optionId === grid.chosenMode);
  const otherChosen = grid.others.some((o) => o.id === grid.chosenMode);
  // A feat instead of the increase: the plain feat list (search, filters, versions, locks) behind one switch, not every
  // feat as a button.
  const [featList, setFeatList] = useState(otherChosen);
  const showFeats = featList || otherChosen;
  const mode = showFeats ? undefined : chosen ?? (otherChosen ? undefined : grid.modes[0]);
  const feats = grid.others.map((o) => r.reg.get(o.id)).filter((e): e is AElement => !!e);
  const anchor = grid.anchor;
  const locked = (el: AElement) => (anchor.blocked.has(el.id) ? anchor.whyBlocked?.(el.id) ?? "requirements not met" : undefined);
  const picks = mode ? gridPicks(ch, mode) : [];
  const cols = mode ? mode.columns.flatMap((c, ci) => Array.from({ length: c.count }, (_, n) => ({ c, ci, n }))) : [];
  const rows = ABILITY_ORDER.filter((a) => mode && (mode.columns.some((c) => c.options.has(a)) || mode.fixed.some((f) => f.ability === a)));
  const done = !!mode && cols.every(({ ci, n }) => !!picks[ci][n]);
  // Picking a set or a package clears what the old one held.
  const choose = (key: string, id: string, clear: string[]) => set((c) => ({ ...c, selections: { ...c.selections, ...Object.fromEntries(clear.map((k) => [k, []])), [key]: [id] } }));
  const allColumnKeys = grid.modes.flatMap((m) => m.columns.map((c) => c.key));
  const tick = (ci: number, n: number, a: Ability, on: boolean) => set((c) => ({ ...c, selections: { ...c.selections, ...(grid.modeKey && !chosen ? { [grid.modeKey]: [mode!.optionId!] } : {}), ...tickBox(c, mode!, ci, n, on ? a : undefined) } }));
  return (
    <div className={`slot improvement-grid ${done ? "done" : "todo"}`}>
      <div className="slot-head static">
        <span className="slot-title">
          <span className="slot-name">{grid.anchor.rule.name}</span>
          <span className={`slot-count ${done ? "full" : ""}`}>{done ? "done" : "choose"}</span>
        </span>
      </div>
      <div className="slot-body">
        {grid.sets && (
          <select className="grid-set" value={grid.sets.chosen ?? ""} aria-label="Abilities to raise" onChange={(e) => choose(grid.sets!.key, e.target.value, [grid.modeKey ?? "", ...allColumnKeys].filter(Boolean))}>
            <option value="" disabled>Choose the abilities...</option>
            {grid.sets.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        )}
        {grid.modeKey && (grid.modes.length > 1 || grid.others.length > 0) && (
          <div className="row grid-modes">
            {grid.modes.map((m) => <button key={m.optionId} className={m === mode ? "pill active" : "pill"} onClick={() => { setFeatList(false); choose(grid.modeKey!, m.optionId!, allColumnKeys); }}>{m.label}</button>)}
            {feats.length > 0 && <button className={showFeats ? "pill active" : "pill"} onClick={() => setFeatList(true)}>{otherChosen ? `Feat: ${r.reg.get(grid.chosenMode!)?.name ?? "chosen"}` : "A feat instead"}</button>}
          </div>
        )}
        {showFeats && feats.length > 0 && (
          <Browse items={feats} type="Feat" chosen={otherChosen && grid.chosenMode ? [grid.chosenMode] : []} onPick={(el) => choose(grid.modeKey!, el.id, allColumnKeys)}
            disabledReason={locked} defaultView="list" perPage={60} need={1} />
        )}
        {mode && (
          <table className="asi-grid">
            <thead><tr><th />{cols.map(({ c, ci, n }) => <th key={`${ci}.${n}`}>+{c.amount}</th>)}{mode.fixed.length > 0 && <th>Fixed</th>}</tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a}>
                  <th scope="row">{cap(a)}</th>
                  {cols.map(({ c, ci, n }) => (
                    <td key={`${ci}.${n}`}>
                      {c.options.has(a) && <input type="checkbox" aria-label={`${cap(a)} +${c.amount}`} checked={picks[ci][n] === a} onChange={(e) => tick(ci, n, a, e.target.checked)} />}
                    </td>
                  ))}
                  {mode.fixed.length > 0 && <td>{mode.fixed.filter((f) => f.ability === a).map((f) => `+${f.amount}`).join(" ")}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {mode && cols.length > 1 && <p className="muted">One box per column, a different ability in each. Scores can't go above 20 this way.</p>}
      </div>
    </div>
  );
}
