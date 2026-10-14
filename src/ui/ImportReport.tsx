import { useEffect } from "react";
import type { ForeignImport } from "../aurora/foreign";

/** The parts of an import worth checking, sorted for the report and for the character's notes. */
function sorted(res: ForeignImport) {
  const items = res.missing.filter((m) => /\(item/.test(m)).map((m) => m.replace(/\s*\(item, kept as a custom item\)$/, ""));
  const other = res.missing.filter((m) => !/\(item/.test(m));
  const notes = res.notes.filter((n) => !/^\d+ (matched|things were not found|choices the file did not say)/.test(n));
  return { items, other, notes };
}

/**
 * The report as plain text for the character's notes, so it can be read again later: what was not imported, what
 * is left to choose, the notes and the custom items.
 */
export function importReportText(res: ForeignImport, file: string, when = new Date(), rules: string[] = []): string {
  const { items, other, notes } = sorted(res);
  const part = (title: string, list: string[]) => (list.length ? [`${title}:`, ...list.map((x) => `- ${x}`), ""] : []);
  return [
    `Import notes: ${file}, ${when.toLocaleDateString()}`,
    `${res.matched.length} things matched the loaded content.`,
    "",
    ...part("Not imported (not in the loaded content)", other),
    ...part("To do: choices the file does not settle, left open for you", res.todo),
    ...part("Against the rules (as the file has it)", rules),
    ...part("Different from the file's own numbers", res.differences),
    ...part("Notes", notes),
    ...part("Kept as custom items", items),
  ].join("\n").trim();
}

/** What an import brought in, what is left to choose and what it could not find. Shown right after importing. */
export function ImportReport({ name, res, rules = [], onClose, onBuild }: { name: string; res: ForeignImport; rules?: string[]; onClose: () => void; onBuild: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const { items, other, notes } = sorted(res);
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
        {res.todo.length > 0 && (
          <section className="ir-group warn">
            <h3>To do: choose these ({res.todo.length})</h3>
            <p className="muted small-text">The file does not say, so these are left open for you instead of guessed. Make them on the Build or Magic tab; the list is also in the character's notes.</p>
            <ul>{res.todo.map((g, i) => <li key={i}>{g}</li>)}</ul>
          </section>
        )}
        {rules.length > 0 && (
          <section className="ir-group bad">
            <h3>Against the rules ({rules.length})</h3>
            <p className="muted small-text">As the file has it. Fix these on the Build or Magic tab; the Rules check on Build keeps track.</p>
            <ul>{rules.map((g, i) => <li key={i}>{g}</li>)}</ul>
          </section>
        )}
        {res.differences.length > 0 && (
          <section className="ir-group warn">
            <h3>Different from the file ({res.differences.length})</h3>
            <p className="muted small-text">The file states these numbers itself. A difference means the file breaks a rule, uses something not in your content, or a choice above is still open.</p>
            <ul>{res.differences.map((g, i) => <li key={i}>{g}</li>)}</ul>
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
            <ul className="ir-items">{items.map((m, i) => <li key={i}>{m}</li>)}</ul>
          </section>
        )}
        {other.length + res.todo.length + rules.length + res.differences.length + notes.length + items.length === 0 && <p>Everything came through. Nothing to check.</p>}
        <p className="muted small-text">This report is saved in the character's notes.</p>
        <div className="levelup-foot">
          <button onClick={onClose}>Close</button>
          <button className="primary" onClick={() => { onBuild(); onClose(); }}>Review on Build</button>
        </div>
      </div>
    </div>
  );
}
