import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface TabDef<T extends string> {
  key: T;
  label: string;
  badge?: number;
  icon?: ReactNode;
}

/** Closes a popup when the user clicks outside it or presses Escape. */
function usePopup() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  return { open, setOpen, ref };
}

/**
 * Tabs that stay on one line. Whatever does not fit goes under a "More" menu at the end of the row.
 */
export function Tabs<T extends string>({ tabs, current, onPick }: { tabs: TabDef<T>[]; current: T; onPick: (k: T) => void }) {
  const nav = useRef<HTMLElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(tabs.length);
  const more = usePopup();

  useLayoutEffect(() => {
    const compute = () => {
      const avail = nav.current?.clientWidth ?? 0;
      const widths = [...(measure.current?.children ?? [])].map((c) => (c as HTMLElement).offsetWidth);
      if (!avail || !widths.length) return;
      const total = widths.reduce((a, b) => a + b, 0);
      if (total <= avail) return setFit(tabs.length);
      const room = avail - 84; // space for the More button
      let used = 0;
      let n = 0;
      for (const w of widths) {
        if (used + w > room) break;
        used += w;
        n++;
      }
      setFit(Math.max(1, n));
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (nav.current) ro.observe(nav.current);
    return () => ro.disconnect();
  }, [tabs.length, tabs.map((t) => `${t.label}${t.badge ?? ""}`).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the open tab visible even when it would overflow.
  const idx = tabs.findIndex((t) => t.key === current);
  const shown = tabs.slice(0, fit);
  const hidden = tabs.slice(fit);
  const visible = idx >= fit && fit > 0 ? [...shown.slice(0, fit - 1), tabs[idx]] : shown;
  const rest = tabs.filter((t) => !visible.includes(t));

  const btn = (t: TabDef<T>, cls = "tab") => (
    <button key={t.key} className={current === t.key ? `${cls} active` : cls} onClick={() => { onPick(t.key); more.setOpen(false); }}>
      {t.icon}{t.label}
      {!!t.badge && <span className="badge">{t.badge}</span>}
    </button>
  );

  return (
    <nav ref={nav} className="tabs-nav">
      {visible.map((t) => btn(t))}
      {hidden.length > 0 && (
        <div className="popup-wrap" ref={more.ref}>
          <button className="tab" aria-haspopup="menu" aria-expanded={more.open} onClick={() => more.setOpen(!more.open)}>More ▾</button>
          {more.open && <div className="popup" role="menu">{rest.map((t) => btn(t, "menu-item"))}</div>}
        </div>
      )}
      <div className="tabs-measure" ref={measure} aria-hidden="true">
        {tabs.map((t) => <button key={t.key} className="tab" tabIndex={-1}>{t.icon}{t.label}{!!t.badge && <span className="badge">{t.badge}</span>}</button>)}
      </div>
    </nav>
  );
}

/** The right-hand menu: theme, updates and anything else that is not a tab. */
export function AppMenu({ children }: { children: ReactNode }) {
  const m = usePopup();
  return (
    <div className="popup-wrap right noprint" ref={m.ref}>
      <button className="tab" aria-haspopup="menu" aria-expanded={m.open} onClick={() => m.setOpen(!m.open)}>Menu ▾</button>
      {m.open && <div className="popup right" role="menu" onClick={(e) => (e.target as HTMLElement).closest("button.menu-item") && m.setOpen(false)}>{children}</div>}
    </div>
  );
}
