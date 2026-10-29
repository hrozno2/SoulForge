import type { Resolved } from "../aurora/engine";
import { ABILITY_ORDER, boxesSelections, gridPicks, setBoxesSelections, tickBox, tickUnified, unifiedBoxes, unifiedOf, unifiedOfSet, type Ability, type Grid } from "../aurora/improvements";
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
  // Sets of abilities (a 2024 background's three): no list of combinations first (C7.11). The boxes show every ability
  // any set allows; the ticks settle the set, and a mix no set allows is refused.
  const each = grid.sets?.each;
  const setNow = each?.find((w) => w.id === grid.sets?.chosen);
  const setU = each ? (setNow ? unifiedOfSet(setNow) : each.map(unifiedOfSet).find(Boolean)) : undefined;
  const [refused, setRefused] = useState("");
  // The usual pair of ways in one grid (C6.2): the ticks choose the way; no way buttons.
  const uBase = setU ?? unifiedOf(grid);
  const u = showFeats ? undefined : uBase;
  // The boxes (C6.2): only +1 columns; the same ability in two of them is its +2. Ticks that are not yet a whole way
  // (one of a fixed set's three +1s) stay as a draft until they are.
  const [draft, setDraft] = useState<(Ability | undefined)[] | null>(null);
  const saved = u ? (each && !setNow ? Array.from({ length: u.ones }, () => undefined) : unifiedBoxes(ch, u, grid.chosenMode)) : [];
  const boxes = u ? (draft && !grid.chosenMode ? draft : saved) : [];
  const uRows = u
    ? ABILITY_ORDER.filter((a) => (each ? each.some((w) => w.abilities.has(a)) : [...u.two.columns, ...u.one.columns].some((c) => c.options.has(a)) || u.one.fixed.some((f) => f.ability === a)))
    : [];
  const ticked = boxes.filter(Boolean) as Ability[];
  const twice = ticked.find((a, i) => ticked.indexOf(a) !== i);
  const uDone = !!u && (twice ? ticked.length === 2 + u.onesWithTwo : ticked.length === u.ones) && !!grid.chosenMode;
  const uTick = (i: number, a: Ability, on: boolean) => {
    const next = tickUnified(boxes, i, on ? a : undefined, u!);
    if (each) {
      const sel = setBoxesSelections(grid, next);
      if (!sel) { setRefused(`No allowed set of abilities has ${[...new Set(next.filter(Boolean))].map((x) => cap(x!)).join(", ")} together.`); return; }
      setRefused("");
      setDraft(next);
      set((c) => ({ ...c, selections: { ...c.selections, ...sel } }));
      return;
    }
    setDraft(next);
    set((c) => ({ ...c, selections: { ...c.selections, ...boxesSelections(u!, next) } }));
  };
  const done = u ? uDone : !!mode && cols.every(({ ci, n }) => !!picks[ci][n]);
  // Folds like every choice: open while something is left to pick.
  const [folded, setFolded] = useState<boolean | null>(null);
  const isOpen = folded === null ? !done : !folded;
  // Picking a set or a package clears what the old one held.
  const choose = (key: string, id: string, clear: string[]) => set((c) => ({ ...c, selections: { ...c.selections, ...Object.fromEntries(clear.map((k) => [k, []])), [key]: [id] } }));
  const allColumnKeys = grid.modes.flatMap((m) => m.columns.map((c) => c.key));
  const tick = (ci: number, n: number, a: Ability, on: boolean) => set((c) => ({ ...c, selections: { ...c.selections, ...(grid.modeKey && !chosen ? { [grid.modeKey]: [mode!.optionId!] } : {}), ...tickBox(c, mode!, ci, n, on ? a : undefined) } }));
  return (
    <div className={`slot improvement-grid ${done ? "done" : "todo"}`}>
      <button className="slot-head" aria-expanded={isOpen} onClick={() => setFolded(isOpen)}>
        <span className="slot-title">
          <span className="slot-name">{grid.anchor.rule.name}</span>
          <span className={`slot-count ${done ? "full" : ""}`}>{done ? "done" : "choose"}</span>
        </span>
        <span className="slot-chosen">{u ? [...new Set(ticked)].map((a) => `${cap(a)} +${ticked.filter((x) => x === a).length}`).join(" · ") : ""}</span>
        <span className="chev">{isOpen ? "▾" : "▸"}</span>
      </button>
      {isOpen && <div className="slot-body">
        {grid.sets && !each && (
          <select className="grid-set" value={grid.sets.chosen ?? ""} aria-label="Abilities to raise" onChange={(e) => choose(grid.sets!.key, e.target.value, [grid.modeKey ?? "", ...allColumnKeys].filter(Boolean))}>
            <option value="" disabled>Choose the abilities...</option>
            {grid.sets.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        )}
        {u && (
          <>
            <p className="muted grid-rule">Tick {u.ones} different abilities for +1 each{u.onesWithTwo ? `, or one ability twice for +2 and ${u.onesWithTwo === 1 ? "another" : `${u.onesWithTwo} others`} for +1` : ", or the same ability twice for +2"}.</p>
            <table className="asi-grid">
              <thead><tr><th />{boxes.map((_, i) => <th key={i}>+1</th>)}</tr></thead>
              <tbody>
                {uRows.map((a) => (
                  <tr key={a}>
                    <th scope="row">{cap(a)}</th>
                    {boxes.map((p, i) => (
                      <td key={i}><input type="checkbox" aria-label={`${cap(a)} +1, column ${i + 1}`} checked={p === a} onChange={(e) => uTick(i, a, e.target.checked)} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {refused && <p className="notice" role="status">{refused}</p>}
          </>
        )}
        {!uBase && grid.modeKey && (grid.modes.length > 1 || grid.others.length > 0) && (
          <div className="row grid-modes">
            {grid.modes.map((m) => <button key={m.optionId} className={m === mode ? "pill active" : "pill"} onClick={() => { setFeatList(false); choose(grid.modeKey!, m.optionId!, allColumnKeys); }}>{m.label}</button>)}
            {feats.length > 0 && <button className={showFeats ? "pill active" : "pill"} onClick={() => setFeatList(true)}>{otherChosen ? `Feat: ${r.reg.get(grid.chosenMode!)?.name ?? "chosen"}` : "A feat instead"}</button>}
          </div>
        )}
        {showFeats && feats.length > 0 && (
          <Browse items={feats} type="Feat" chosen={otherChosen && grid.chosenMode ? [grid.chosenMode] : []} onPick={(el) => choose(grid.modeKey!, el.id, allColumnKeys)}
            disabledReason={locked} defaultView="list" perPage={60} need={1} />
        )}
        {uBase && feats.length > 0 && (
          <div className="row grid-modes">
            <button className={showFeats ? "pill active" : "pill"} onClick={() => {
              // Back to the boxes: a feat taken instead is given up.
              if (showFeats) { setFeatList(false); if (otherChosen) set((c) => ({ ...c, selections: { ...c.selections, [grid.modeKey!]: [] } })); }
              else setFeatList(true);
            }}>{showFeats ? (otherChosen ? `Feat: ${r.reg.get(grid.chosenMode!)?.name ?? "chosen"} (back to the increase)` : "Back to the increase") : "A feat instead"}</button>
          </div>
        )}
        {!u && mode && (
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
        {!u && mode && cols.length > 1 && <p className="muted">One box per column, a different ability in each. Scores can't go above 20 this way.</p>}
      </div>}
    </div>
  );
}
