import { useEffect, useRef, useState, type ReactNode } from "react";

export interface TabDef<T extends string> {
  key: T;
  label: string;
  badge?: number;
  /** What the badge counts, shown on hover. */
  badgeTitle?: string;
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

export interface NavGroup<T extends string> {
  key: string;
  label: string;
  icon?: ReactNode;
  items: TabDef<T>[];
}

/** One group: a plain tab when it holds one page, otherwise a button that rolls out a menu of its pages. */
function GroupMenu<T extends string>({ g, current, onPick }: { g: NavGroup<T>; current: T; onPick: (k: T) => void }) {
  const m = usePopup();
  const active = g.items.some((i) => i.key === current);
  const badge = g.items.reduce((n, i) => n + (i.badge ?? 0), 0);
  const titles = g.items.map((i) => i.badgeTitle).filter(Boolean).join("\n\n");
  if (g.items.length === 1) {
    const t = g.items[0];
    return (
      <button className={active ? "tab active" : "tab"} title={t.badgeTitle} onClick={() => onPick(t.key)}>
        {t.icon}{t.label}
        {!!t.badge && <span className="badge" title={t.badgeTitle}>{t.badge}</span>}
      </button>
    );
  }
  return (
    <div className="popup-wrap nav-group" ref={m.ref}>
      <button className={active ? "tab active" : "tab"} aria-haspopup="menu" aria-expanded={m.open} title={titles || undefined} onClick={() => m.setOpen(!m.open)}>
        {g.icon}{g.label}
        {badge > 0 && <span className="badge" aria-label={`${badge} choices left`}>{badge}</span>}
        <span className="caret" aria-hidden="true">▾</span>
      </button>
      {m.open && (
        <div className="popup nav-menu" role="menu" aria-label={g.label}>
          {g.items.map((t) => (
            <button key={t.key} role="menuitem" className={current === t.key ? "menu-item active" : "menu-item"} title={t.badgeTitle} onClick={() => { onPick(t.key); m.setOpen(false); }}>
              <span className="nav-item-icon">{t.icon}</span>
              <span className="nav-item-label">{t.label}</span>
              {!!t.badge && <span className="badge">{t.badge}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The main navigation: a few groups, each rolling out its pages. */
export function GroupNav<T extends string>({ groups, current, onPick }: { groups: NavGroup<T>[]; current: T; onPick: (k: T) => void }) {
  return (
    <nav className="tabs-nav group-nav" aria-label="Main">
      {groups.map((g) => <GroupMenu key={g.key} g={g} current={current} onPick={onPick} />)}
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
