import { useEffect, useMemo, useRef, useState } from "react";
import { useUi } from "./Learn";

/** Search everything that is loaded from anywhere in the app. Ctrl or Cmd with K, or Alt with Q, jumps here. */
export function CompendiumSearch() {
  const { reg, learn } = useUi();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const hits = useMemo(() => (q.trim().length >= 2 ? reg.search(q.trim(), undefined, 12) : []), [q, reg]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") || (e.altKey && e.key.toLowerCase() === "q")) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", key);
    document.addEventListener("mousedown", away);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("mousedown", away);
    };
  }, []);

  const pick = (i: number) => {
    const el = hits[i];
    if (!el) return;
    learn(el);
    setOpen(false);
  };
  return (
    <div className="csearch" ref={box} role="search">
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
          else if (e.key === "Enter") pick(at);
          else if (e.key === "Escape") { setOpen(false); input.current?.blur(); }
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
