import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { BookInfo } from "../aurora/books";
import { TABLE_SWITCHES, switchCounts, type TableSwitch } from "../aurora/tableUses";
import { updateSettings, useSettings } from "./Settings";

/**
 * The content switches (2014 rules, playtest, other worlds, sci-fi, modern), one row each. Settings shows them
 * bare; a list's "What this table uses" panel shows them with the number of that list's options behind each.
 */
export function TableSwitches({ counts }: { counts?: Record<TableSwitch, number> }) {
  const s = useSettings();
  return (
    <>
      {TABLE_SWITCHES.map((sw) => {
        const on = !!s[sw.setting];
        const n = counts?.[sw.key];
        return (
          <label className="set-row" key={sw.key}>
            <span>
              <b>{sw.label}</b>
              <small className="muted"> {sw.hint}</small>
              {n !== undefined && (
                <small className={`table-count ${!on && n ? "hides" : ""}`}>
                  {" "}
                  {n === 0 ? "none in this list" : on ? `${n} in this list` : `hides ${n} in this list`}
                </small>
              )}
            </span>
            <input type="checkbox" checked={on} onChange={(e) => updateSettings({ [sw.setting]: e.target.checked })} />
          </label>
        );
      })}
    </>
  );
}

type Listed = { source: string; type: string; supports?: string[] };

/**
 * "What this table uses" (Chris 2026-11-23): the button on a list's count line, and the panel it opens. The same
 * switches as in Settings, here beside the list they change, with what each means for this list.
 */
export function TableUses({ items, info, hidden }: { items: readonly Listed[]; info: (source: string) => BookInfo; hidden: number }) {
  const [open, setOpen] = useState(false);
  const counts = useMemo(() => (open ? switchCounts(items, info) : undefined), [open, items, info]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [open]);
  return (
    <>
      <button className="linkish table-uses-btn" onClick={() => setOpen(true)}>
        What this table uses
      </button>
      {open &&
        createPortal(
          <div className="modal-back" onClick={() => setOpen(false)}>
            <div
              className="modal-page themed table-uses"
              role="dialog"
              aria-label="What this table uses"
              onClick={(e) => e.stopPropagation()}
            >
              <button className="modal-close" aria-label="Close" onClick={() => setOpen(false)}>
                ×
              </button>
              <h2>What this table uses</h2>
              <p className="muted">
                These decide what every list shows: species, classes, backgrounds, every choice, spells, items and the shop. They only hide;
                the content stays loaded and characters that use it keep working. What you already picked stays visible, and a choice is
                never left unable to be completed: when too few options would remain, it shows all of them.
              </p>
              <TableSwitches counts={counts} />
              <p className="muted small-text" role="status">
                {hidden > 0
                  ? `${hidden} of this list's ${items.length} options are hidden now.`
                  : `All ${items.length} options of this list show.`}{" "}
                The same switches are in Menu, Settings.
              </p>
              <div className="row">
                <button className="primary" onClick={() => setOpen(false)}>
                  Done
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
