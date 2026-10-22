import { createPortal } from "react-dom";
import type { Resolved } from "../aurora/engine";
import type { Character } from "../aurora/character";
import { hpBreakdown, rollAudit, withHpRoll } from "../aurora/hpRolls";
import { requestRoll } from "./Dice";
import type { SetCharacter } from "./Slots";

const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));

/**
 * The hit points window, opened from the HP bar: every level's hit die and what it gave (the maximum at level 1, a
 * roll, or the average), each roll editable or rolled again, how the maximum adds up, and a check of the rolls Soul
 * Forge made for this character (in range, and their average against what the dice should give).
 */
export function HpRollsDialog({ r, ch, set, onClose }: { r: Resolved; ch: Character; set: SetCharacter; onClose: () => void }) {
  const con = r.stats.get("constitution:modifier");
  const lines = hpBreakdown(ch, r.reg, con);
  const fromDice = lines.reduce((n, l) => n + l.value + l.con, 0);
  const total = r.stats.get("hp");
  const other = total - fromDice;
  const audit = rollAudit([ch]);
  const roll = (level: number, die: number) => requestRoll(`Hit points, level ${level}`, `1d${die}`, (res) => set((c) => withHpRoll(c, level, res.total, "app", die)));
  return createPortal(
    <div className="modal-back" role="dialog" aria-label="Hit points" onClick={onClose}>
      <div className="modal-page themed hp-rolls" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <h2>Hit points <small className="muted">maximum {total}</small></h2>
        <div className="row">
          {(["average", "roll"] as const).map((m) => (
            <button key={m} className={ch.hpMode === m ? "pill active" : "pill"} onClick={() => set((c) => ({ ...c, hpMode: m }))}>{m === "average" ? "Fixed (average)" : "Rolled"}</button>
          ))}
          {ch.hpMode === "roll" && lines.some((l) => l.level > 1 && l.how === "average") && (
            <button className="primary" onClick={() => lines.filter((l) => l.level > 1 && l.how === "average").forEach((l) => roll(l.level, l.die))}>Roll the rest</button>
          )}
        </div>
        <table className="hp-table">
          <thead><tr><th>Level</th><th>Class</th><th>Die</th><th>Gives</th><th>Con</th><th>How</th><th /></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.level}>
                <td>{l.level}</td>
                <td>{l.className}</td>
                <td>d{l.die}</td>
                <td>
                  {l.level === 1 || ch.hpMode !== "roll" ? <b>{l.value}</b> : (
                    <input type="number" min={1} max={l.die} value={ch.hpRolls[String(l.level)] ?? ""} placeholder={String(l.value)} aria-label={`Roll for level ${l.level}`}
                      onChange={(e) => set((c) => withHpRoll(c, l.level, Number(e.target.value) || undefined, "player", l.die))} />
                  )}
                </td>
                <td>{signed(l.con)}</td>
                <td className="muted">{l.how}</td>
                <td>{l.level > 1 && ch.hpMode === "roll" && <button className="ghost" onClick={() => roll(l.level, l.die)}>Roll</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">
          Dice and Constitution give {fromDice}{other ? `; features and items add ${signed(other)} (Tough, Dwarven Toughness, a Draconic Sorcerer's resilience...)` : ""}: maximum {total}.
        </p>
        <h3>Check of Soul Forge's rolls</h3>
        {audit.count === 0 ? <p className="muted">Soul Forge has made no rolls for this character yet; rolls you type in are not part of the check.</p> : (
          <>
            <p>
              {audit.count} {audit.count === 1 ? "roll" : "rolls"}, averaging <b>{audit.mean.toFixed(2)}</b> where the same dice average {audit.expected.toFixed(2)}.
              {audit.outOfRange ? <b className="warn"> {audit.outOfRange} outside the die's range.</b> : " All within the die's range."}
            </p>
            <div className="hp-faces">
              {Object.entries(audit.faces).map(([die, counts]) => (
                <div key={die}><small>d{die}</small>{counts.map((n, i) => <span key={i} title={`${i + 1}: ${n}`} style={{ height: `${4 + n * 10}px` }}>{i + 1}</span>)}</div>
              ))}
            </div>
            <p className="muted">One character's rolls are few; the average evens out over many. Each face of a fair die comes up about as often as the others.</p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
