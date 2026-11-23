/**
 * "Make it legal" (Chris 2026-11-23, src/aurora/makeLegal.ts): the rules check's findings worked through in one
 * place. What has one safe answer is listed as done for the player; every other finding is theirs to decide, with its
 * options as buttons and none chosen. Apply makes the changes; the list of what changed can go into the character's
 * journal, so it stays with the character.
 */
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Character } from "../aurora/character";
import type { Resolved } from "../aurora/engine";
import type { Finding } from "../aurora/rulesCheck";
import { applyLegal, legalNote, planLegal } from "../aurora/makeLegal";

export function MakeLegal({
  r,
  findings,
  set,
  onClose,
}: {
  r: Resolved;
  findings: Finding[];
  set: (fn: (c: Character) => Character) => void;
  onClose: () => void;
}) {
  // The plan is made once, from the character as it was when the screen opened: Apply works on that.
  const plan = useMemo(() => planLegal(r, findings), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [toJournal, setToJournal] = useState(true);
  const [done, setDone] = useState<string[] | null>(null);
  const decided = plan.calls.filter((c) => picks[c.key] !== undefined).length;
  const apply = () => {
    const res = applyLegal(r.character, plan, picks);
    if (!res.changes.length) return onClose();
    const note = toJournal ? legalNote(res.changes, new Date().toISOString().slice(0, 10)) : undefined;
    set((c) => {
      const next = applyLegal(c, plan, picks).character;
      return note ? { ...next, journal: [...(next.journal ?? []), note] } : next;
    });
    setDone(res.changes);
  };
  return createPortal(
    <div className="modal-back" onClick={onClose}>
      <div className="modal-page themed make-legal" role="dialog" aria-label="Make it legal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>Make {r.character.name || "this character"} rules legal</h2>
        {done ? (
          <>
            <p>Done. This is what changed:</p>
            <ul>
              {done.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
            <p className="muted">
              {toJournal
                ? "It is written in the character's journal (Manage, Journal), under today's date."
                : "It was not added to the journal."}{" "}
              Choices that opened again are waiting on Build.
            </p>
            <div className="levelup-foot">
              <button className="primary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">
              Nothing changes until you press Apply. What has one safe answer is done for you; the rest is your call, and anything you leave
              undecided stays as it is.
            </p>
            {plan.auto.length > 0 && (
              <section>
                <h3>Done for you ({plan.auto.length})</h3>
                <ul>
                  {plan.auto.map((a, i) => (
                    <li key={i}>{a.says}</li>
                  ))}
                </ul>
              </section>
            )}
            {plan.calls.length > 0 && (
              <section>
                <h3>
                  Your call ({decided} of {plan.calls.length} decided)
                </h3>
                {plan.calls.map((c) => (
                  <fieldset key={c.key} className="legal-call">
                    <legend>
                      <b>{c.finding.rule}:</b> {c.finding.detail}
                    </legend>
                    <div className="row">
                      {c.options.map((o, i) => (
                        <button
                          key={i}
                          className={picks[c.key] === i ? "pill active" : "pill"}
                          aria-pressed={picks[c.key] === i}
                          onClick={() =>
                            setPicks((p) => {
                              const next = { ...p };
                              if (next[c.key] === i) delete next[c.key];
                              else next[c.key] = i;
                              return next;
                            })
                          }
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </section>
            )}
            {!plan.auto.length && !plan.calls.length && <p>Nothing to do: the character follows the rules.</p>}
            <label className="check">
              <input type="checkbox" checked={toJournal} onChange={(e) => setToJournal(e.target.checked)} /> Add what changes to this
              character's journal
            </label>
            <div className="levelup-foot">
              <button onClick={onClose}>Cancel</button>
              <button className="primary" onClick={apply} disabled={!plan.auto.length && !decided}>
                Apply
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
