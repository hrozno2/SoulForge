import { useEffect, useMemo, useRef, useState } from "react";
import { useFloating } from "./Floating";
import { useUi } from "./Learn";

/** Search everything that is loaded from anywhere in the app. Ctrl or Cmd with K, or Alt with Q, jumps here. */
export function CompendiumSearch() {
  const { reg, learn } = useUi();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  // Only an icon until it is wanted; it opens wide when clicked or with Ctrl+K and folds back when you leave it.
  const [wide, setWide] = useState(false);
  const expand = () => setWide(true);
  useEffect(() => {
    if (wide) { input.current?.focus(); input.current?.select(); }
  }, [wide]);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const hits = useMemo(() => (q.trim().length >= 2 ? reg.search(q.trim(), undefined, 12) : []), [q, reg]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") || (e.altKey && e.key.toLowerCase() === "q")) {
        e.preventDefault();
        setWide(true);
        input.current?.focus();
      }
    };
    const away = (e: MouseEvent) => {
      if (box.current?.contains(e.target as Node)) return;
      setOpen(false);
      setWide(false);
    };
    window.addEventListener("keydown", key);
    document.addEventListener("mousedown", away);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("mousedown", away);
    };
  }, []);

  const floating = useFloating();
  // Enter or a click reads it in the popup; Shift+Enter or "⧉" opens it in a window of its own (C4, as 5e.tools does).
  const pick = (i: number, float = false) => {
    const el = hits[i];
    if (!el) return;
    if (float && floating) floating.open({ kind: "entry", ref: el.id, title: el.name });
    else learn(el);
    setOpen(false);
    setWide(false);
  };
  if (!wide) {
    return (
      <div className="csearch collapsed" ref={box} role="search">
        <button className="icon-btn csearch-icon" aria-label="Search rules" title="Search rules (Ctrl+K)" onClick={expand}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="M15.5 15.5 21 21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
        </button>
      </div>
    );
  }
  return (
    <div className="csearch" ref={box} role="search" onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node)) { setOpen(false); setWide(false); } }}>
      <input
        ref={input}
        type="search"
        aria-label="Compendium search"
        placeholder="Search rules (Ctrl+K)"
        title="Search the compendium (Ctrl+K)"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setAt(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setAt((a) => Math.min(hits.length - 1, a + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setAt((a) => Math.max(0, a - 1)); }
          else if (e.key === "Enter") pick(at, e.shiftKey);
          else if (e.key === "Escape") { setOpen(false); setWide(false); }
        }}
      />
      {open && q.trim().length >= 2 && (
        <ul className="csearch-list" role="listbox">
          {hits.length === 0 && <li className="muted">Nothing matches.</li>}
          {hits.map((h, i) => (
            <li key={h.id} role="option" aria-selected={i === at}>
              <button className={i === at ? "on" : ""} onMouseEnter={() => setAt(i)} onClick={() => pick(i)}>
                <b>{h.name}</b>
                <small>{h.type}</small>
                <small className="muted">{h.source}</small>
              </button>
              {floating && <button className="csearch-float" title="Open in a window of its own (Shift+Enter)" aria-label={`Open ${h.name} in a window`} onClick={() => pick(i, true)}>⧉</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
