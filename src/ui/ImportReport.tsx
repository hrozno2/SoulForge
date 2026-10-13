import { useEffect } from "react";
import type { ForeignImport } from "../aurora/foreign";

/** What an import brought in, what it had to guess and what it could not find. Shown once, right after importing. */
export function ImportReport({ name, res, onClose, onBuild }: { name: string; res: ForeignImport; onClose: () => void; onBuild: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const items = res.missing.filter((m) => /\(item/.test(m));
  const other = res.missing.filter((m) => !/\(item/.test(m));
  const notes = res.notes.filter((n) => !/^\d+ (matched|things were not found|choices the file did not say)/.test(n));
  return (
    <div className="modal-back" role="dialog" aria-label="Import report" onClick={onClose}>
      <div className="modal-page themed import-report" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" aria-label="Close" onClick={onClose}>×</button>
        <h2>Imported {name || "the character"}</h2>
        <p className="muted">{res.matched.length} things matched your loaded content. Check these before you play:</p>
        {other.length > 0 && (
          <section className="ir-group bad">
            <h3>Not imported ({other.length})</h3>
            <p className="muted small-text">Not in your loaded content. Add the book on the Content tab, or add it by hand on Manage, Manual additions.</p>
            <ul>{other.map((m, i) => <li key={i}>{m}</li>)}</ul>
          </section>
        )}
        {res.guessed.length > 0 && (
          <section className="ir-group warn">
            <h3>Guessed ({res.guessed.length})</h3>
            <p className="muted small-text">The file did not say; Soul Forge filled these so the character follows the rules. Change them on the Build tab.</p>
            <ul>{res.guessed.map((g, i) => <li key={i}>{g}</li>)}</ul>
          </section>
        )}
        {notes.length > 0 && (
          <section className="ir-group">
            <h3>Notes</h3>
            <ul>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </section>
        )}
        {items.length > 0 && (
          <section className="ir-group">
            <h3>Kept as custom items ({items.length})</h3>
            <p className="muted small-text">Not in the loaded content, so they are in the inventory by name only, without weight or rules.</p>
            <ul className="ir-items">{items.map((m, i) => <li key={i}>{m.replace(/\s*\(item, kept as a custom item\)$/, "")}</li>)}</ul>
          </section>
        )}
        {other.length + res.guessed.length + notes.length + items.length === 0 && <p>Everything came through. Nothing to check.</p>}
        <div className="levelup-foot">
          <button onClick={onClose}>Close</button>
          <button className="primary" onClick={() => { onBuild(); onClose(); }}>Review on Build</button>
        </div>
      </div>
    </div>
  );
}
