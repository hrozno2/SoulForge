import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Floating windows and the Bag of Holding (C4, docs/C4-DESIGN.md). Cards (the board's species, class, background,
 * spellbook and backpack backs) and compendium entries open as windows that can be dragged, resized and stacked; a
 * window put in the bag waits there, small and greyed, until it is taken out. At most 10 windows, open and bagged
 * together; at the cap a message says so and nothing is dropped. "Tidy up" lines the open ones up, "Put everything in
 * the bag" bags them all, "Empty the bag" closes the bagged ones (a wormhole takes the bag, a fresh one drops in).
 *
 * Window state is not character data: it is kept per character on this computer (localStorage), never in the
 * character file, and travels in the library file (src/ui/library.ts) next to the characters.
 */
export type WindowKind = "entry" | "card";
export interface FloatWindow {
  id: string;
  kind: WindowKind;
  /** The element id for an entry, the card's kind for a card ("race", "class:<id>"...). */
  ref: string;
  title: string;
  x: number; y: number; w: number; h: number;
  z: number;
  bagged: boolean;
  /** Shrunk to its title bar (double-click the bar, as on 5e.tools). */
  shrunk?: boolean;
}
export const MAX_WINDOWS = 10;

/*
 * Window flights (C6.4, Chris 2026-10-28): a card flips up out of its slot when opened and flies back into it when
 * closed, every time; a window shoots into the Bag of Holding and out of it again. One mechanism for every window:
 * where a window lives when it is not open (its slot, the bag, or nowhere: a fade) and one flight to or from it,
 * transform and opacity only, so it stays smooth on Linux. Off with reduce motion (Settings).
 */
const reducedMotion = () => document.documentElement.classList.contains("reduce-motion");
/** The board slot a card window belongs to, when it has one. */
const homeOf = (w: FloatWindow) => (w.kind === "card" ? document.querySelector(`[data-tile="${w.ref}"]`) : null);
const bagEl = () => document.querySelector(".bag-of-holding");
/** Windows just taken out of the bag: their flight starts at the bag, not the slot. */
const fromBag = new Set<string>();
function fly(el: HTMLElement | null, target: Element | null, dir: "out" | "in", flip: boolean): Promise<void> {
  if (!el || reducedMotion() || typeof el.animate !== "function") return Promise.resolve();
  const a = el.getBoundingClientRect();
  const b = target?.getBoundingClientRect();
  const away = b
    ? `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(${Math.max(0.05, b.width / a.width)}, ${Math.max(0.05, b.height / a.height)})${flip ? " rotateY(75deg)" : ""}`
    : "scale(.92)";
  const frames = [{ transform: `perspective(1200px) ${away}`, opacity: b ? 0.35 : 0 }, { transform: "perspective(1200px) none", opacity: 1 }];
  return el.animate(dir === "out" ? frames : [...frames].reverse(), { duration: 230, easing: "cubic-bezier(.2,.8,.2,1)", fill: dir === "in" ? "forwards" : "none" }).finished.then(() => undefined, () => undefined);
}

export interface FloatingApi {
  windows: FloatWindow[];
  /** Opens a window, or brings the one already open for the same thing to the front. False at the cap. */
  open: (w: { kind: WindowKind; ref: string; title: string }) => boolean;
  close: (id: string) => void;
  focus: (id: string) => void;
  move: (id: string, x: number, y: number, w?: number, h?: number) => void;
  bag: (id: string) => void;
  unbag: (id: string) => void;
  bagAll: () => void;
  emptyBag: () => void;
  tidy: () => void;
  /** Shrinks a window to its bar or opens it again. */
  shrink: (id: string) => void;
  /** The window shown large over a blurred page (null: none). */
  full: string | null;
  setFull: (id: string | null) => void;
  notice: string;
}

const Ctx = createContext<FloatingApi | null>(null);
/** The floating windows, or null outside the provider (tests, the launch screen). */
export const useFloating = () => useContext(Ctx);

const KEY = (characterId: string) => `charforge.windows.${characterId}`;
const load = (characterId: string): FloatWindow[] => {
  try { const v = JSON.parse(localStorage.getItem(KEY(characterId)) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
};
/** Every character's window layout, for the library file. */
export function allLayouts(): Record<string, FloatWindow[]> {
  const out: Record<string, FloatWindow[]> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? "";
      if (k.startsWith("charforge.windows.")) out[k.slice("charforge.windows.".length)] = JSON.parse(localStorage.getItem(k) ?? "[]");
    }
  } catch { /* storage unavailable */ }
  return out;
}
/** Puts layouts back from a library file (a layout already here for a character is kept). */
export function restoreLayouts(layouts: Record<string, FloatWindow[]> | undefined): void {
  try { for (const [id, ws] of Object.entries(layouts ?? {})) if (!localStorage.getItem(KEY(id)) && Array.isArray(ws)) localStorage.setItem(KEY(id), JSON.stringify(ws)); } catch { /* storage unavailable */ }
}

/** The title bar's height: the part of a window that always stays inside the app window, to drag it back by. */
const BAR = 38;
/**
 * A window may go partly out of the app window (C6.3), but never so far that its title bar cannot be grabbed: 120
 * pixels of the bar stay in sight sideways, the whole bar in sight up and down.
 */
/** Wholly inside the app window, as a window taken out of the bag is. */
const inSight = (w: FloatWindow): FloatWindow => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const ww = Math.min(Math.max(280, w.w), vw - 16), hh = Math.min(Math.max(160, w.h), vh - 16);
  return { ...w, w: ww, h: hh, x: Math.min(Math.max(8, w.x), vw - ww - 8), y: Math.min(Math.max(8, w.y), vh - hh - 8) };
};
const clampTo = (w: FloatWindow): FloatWindow => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const ww = Math.min(Math.max(280, w.w), vw - 16), hh = Math.min(Math.max(160, w.h), vh - 16);
  return { ...w, w: ww, h: hh, x: Math.min(Math.max(120 - ww, w.x), vw - 120), y: Math.min(Math.max(0, w.y), vh - BAR) };
};

export function FloatingProvider({ characterId, children, render }: { characterId: string; children: ReactNode; render: (w: FloatWindow) => ReactNode }) {
  const [windows, setWindows] = useState<FloatWindow[]>(() => load(characterId));
  const [notice, setNotice] = useState("");
  const loadedFor = useRef(characterId);
  // Another character: its own layout.
  useEffect(() => {
    if (loadedFor.current === characterId) return;
    loadedFor.current = characterId;
    setWindows(load(characterId));
  }, [characterId]);
  useEffect(() => { try { localStorage.setItem(KEY(characterId), JSON.stringify(windows)); } catch { /* storage unavailable */ } }, [windows, characterId]);
  useEffect(() => { if (!notice) return; const t = window.setTimeout(() => setNotice(""), 5000); return () => window.clearTimeout(t); }, [notice]);

  const top = (ws: FloatWindow[]) => ws.reduce((m, w) => Math.max(m, w.z), 0) + 1;
  const open = useCallback((spec: { kind: WindowKind; ref: string; title: string }) => {
    let ok = true;
    setWindows((ws) => {
      const have = ws.find((w) => w.kind === spec.kind && w.ref === spec.ref);
      if (have) return ws.map((w) => (w === have ? { ...w, bagged: false, z: top(ws) } : w));
      if (ws.length >= MAX_WINDOWS) {
        ok = false;
        setNotice(`${MAX_WINDOWS} windows are out (open and in the bag): close one or empty the bag to open another.`);
        return ws;
      }
      const n = ws.filter((w) => !w.bagged).length;
      const fresh = clampTo({ id: `${spec.kind}-${spec.ref}-${Date.now().toString(36)}`, ...spec, x: 120 + n * 32, y: 90 + n * 28, w: 560, h: 520, z: top(ws), bagged: false });
      return [...ws, fresh];
    });
    return ok;
  }, []);
  const [full, setFull] = useState<string | null>(null);
  const api: FloatingApi = useMemo(() => ({
    windows, notice, open, full, setFull,
    shrink: (id) => setWindows((ws) => ws.map((w) => (w.id === id ? { ...w, shrunk: !w.shrunk } : w))),
    close: (id) => setWindows((ws) => ws.filter((w) => w.id !== id)),
    focus: (id) => setWindows((ws) => (ws.find((w) => w.id === id)?.z === top(ws) - 1 ? ws : ws.map((w) => (w.id === id ? { ...w, z: top(ws) } : w)))),
    move: (id, x, y, w, h) => setWindows((ws) => ws.map((o) => (o.id === id ? clampTo({ ...o, x, y, w: w ?? o.w, h: h ?? o.h }) : o))),
    bag: (id) => setWindows((ws) => ws.map((w) => (w.id === id ? { ...w, bagged: true } : w))),
    // Out of the bag it comes back wholly in sight, wherever it was dragged before (C7.2).
    unbag: (id) => { fromBag.add(id); setWindows((ws) => ws.map((w) => (w.id === id ? { ...inSight(w), bagged: false, z: top(ws) } : w))); },
    bagAll: () => setWindows((ws) => ws.map((w) => ({ ...w, bagged: true }))),
    emptyBag: () => setWindows((ws) => ws.filter((w) => !w.bagged)),
    // Lines the open windows up in rows from the top left, each its own size, wrapping at the window's edge.
    tidy: () => setWindows((ws) => {
      let x = 16, y = 80, row = 0;
      const vw = window.innerWidth;
      return [...ws].sort((a, b) => a.z - b.z).map((w) => {
        if (w.bagged) return w;
        if (x + w.w > vw - 16 && x > 16) { x = 16; y += row + 12; row = 0; }
        const placed = clampTo({ ...w, x, y });
        x += placed.w + 12; row = Math.max(row, placed.h);
        return placed;
      });
    }),
  }), [windows, notice, open, full]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {createPortal(<FloatingLayer api={api} render={render} />, document.body)}
    </Ctx.Provider>
  );
}

function FloatingLayer({ api, render }: { api: FloatingApi; render: (w: FloatWindow) => ReactNode }) {
  const open = api.windows.filter((w) => !w.bagged);
  const bagged = api.windows.filter((w) => w.bagged);
  return (
    <>
      {/* Cards are drawn by the build board itself (their content is the board's); entries here. */}
      {open.filter((w) => w.kind !== "card").map((w) => <WindowFrame key={w.id} w={w} api={api}>{render(w)}</WindowFrame>)}
      {api.windows.length > 0 && <BagOfHolding bagged={bagged} api={api} openCount={open.length} />}
      {api.notice && <div className="float-notice" role="status">{api.notice}</div>}
    </>
  );
}

/** A window: a title bar to drag it by, the bag and close buttons, the content, a corner to resize it. */
export function WindowFrame({ w, api, children, className = "", done, kicker, hue, onCancel }: { w: FloatWindow; api: FloatingApi; children: ReactNode; className?: string; done?: boolean; kicker?: string; hue?: number; onCancel?: () => void }) {
  const drag = useRef<{ dx: number; dy: number; mode: "move" | "size"; w0: number; h0: number; x0: number; y0: number } | null>(null);
  const isFull = api.full === w.id;
  const frame = useRef<HTMLElement>(null);
  // Out of its slot (or the bag) when it appears; back into it when it goes.
  useLayoutEffect(() => {
    const start = fromBag.delete(w.id) ? bagEl() : homeOf(w);
    void fly(frame.current, start, "out", w.kind === "card" && start !== bagEl());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const leaving = useRef(false);
  const leave = (to: "close" | "bag") => {
    if (leaving.current) return;
    leaving.current = true;
    if (isFull) api.setFull(null);
    const target = to === "bag" ? bagEl() : homeOf(w);
    void fly(frame.current, target, "in", to === "close" && w.kind === "card").then(() => (to === "bag" ? api.bag(w.id) : api.close(w.id)));
  };
  const down = (mode: "move" | "size") => (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button") && mode === "move") return;
    if (isFull) return;
    api.focus(w.id);
    // No text selection while dragging or resizing (it painted the page blue, C6.1).
    e.preventDefault();
    document.body.classList.add("float-dragging");
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { dx: e.clientX - w.x, dy: e.clientY - w.y, mode, w0: w.w, h0: w.h, x0: e.clientX, y0: e.clientY };
  };
  const moveTo = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === "move") api.move(w.id, e.clientX - d.dx, e.clientY - d.dy);
    else api.move(w.id, w.x, w.y, d.w0 + e.clientX - d.x0, d.h0 + e.clientY - d.y0);
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    document.body.classList.remove("float-dragging");
    // Let go over the Bag of Holding: into the bag (C6.3).
    const bag = document.querySelector(".bag-of-holding")?.getBoundingClientRect();
    if (d?.mode === "move" && bag && e.clientX >= bag.left && e.clientX <= bag.right && e.clientY >= bag.top && e.clientY <= bag.bottom) leave("bag");
  };
  const style = { ...(isFull ? { zIndex: 1500 } : { left: w.x, top: w.y, width: w.w, height: w.shrunk ? undefined : w.h, zIndex: 400 + w.z }), ...(hue !== undefined ? { ["--hue" as string]: hue } : {}) };
  return (
    <>
      {isFull && createPortal(<div className="float-backdrop" onClick={() => api.setFull(null)} />, document.body)}
      <section ref={frame} className={`float-window float-${w.kind} ${w.shrunk && !isFull ? "shrunk" : ""} ${isFull ? "full" : ""} ${className}`} role="dialog" aria-label={w.title} style={style} onPointerDown={() => api.focus(w.id)}>
        <header className="float-bar" onPointerDown={down("move")} onPointerMove={moveTo} onPointerUp={up} onPointerCancel={up} onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest("button")) api.shrink(w.id); }} title="Drag to move; double-click to shrink to this bar">
          {kicker ? <span className="float-title"><small>{kicker}</small><b>{w.title}</b></span> : <b>{w.title}</b>}
          <span className="float-tools">
            <button title={isFull ? "Back to its place" : "Focus: large, everything else blurred"} aria-label={isFull ? `Back to its place: ${w.title}` : `Focus on ${w.title}`} onClick={() => api.setFull(isFull ? null : w.id)}>{isFull ? "⤡" : "⤢"}</button>
            <button title="Put it in the Bag of Holding (or drag it onto the bag)" aria-label={`Put ${w.title} in the bag`} onClick={() => leave("bag")}>▾</button>
            {/* A new pick (onCancel): Apply keeps it, × takes it back (Chris 2026-10-29). Otherwise Done, or × to close. */}
            {onCancel ? (
              <>
                <button className="float-done" title="Apply: keep this pick" aria-label={`Apply ${w.title}`} onClick={() => leave("close")}>Apply</button>
                <button title="Take this pick back" aria-label={`Take back ${w.title}`} onClick={() => { if (isFull) api.setFull(null); onCancel(); }}>×</button>
              </>
            ) : done
              ? <button className="float-done" title="Done: put the card back" aria-label={`Done with ${w.title}`} onClick={() => leave("close")}>Done</button>
              : <button title="Close" aria-label={`Close ${w.title}`} onClick={() => leave("close")}>×</button>}
          </span>
        </header>
        {(!w.shrunk || isFull) && <div className="float-body">{children}</div>}
        {!w.shrunk && !isFull && <span className="float-resize" aria-hidden="true" onPointerDown={down("size")} onPointerMove={moveTo} onPointerUp={up} onPointerCancel={up} />}
      </section>
    </>
  );
}

/** The bag, bottom left: what is in it (small, greyed; click to take out, × to remove), and the layout buttons. */
function BagOfHolding({ bagged, api, openCount }: { bagged: FloatWindow[]; api: FloatingApi; openCount: number }) {
  const [swallow, setSwallow] = useState(false);
  const reduced = () => document.documentElement.classList.contains("reduce-motion");
  const empty = () => {
    if (reduced()) { api.emptyBag(); return; }
    setSwallow(true);
    window.setTimeout(() => { api.emptyBag(); setSwallow(false); }, 650);
  };
  return (
    <aside className={`bag-of-holding ${swallow ? "swallow" : ""}`} aria-label="Bag of Holding">
      <div className="bag-head">
        <svg viewBox="0 0 40 40" width="26" height="26" aria-hidden="true"><path d="M12 12c-2-5 3-8 8-8s10 3 8 8" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M9 14h22l-2 4c6 3 8 9 6 14-2 4-8 5-15 5s-13-1-15-5c-2-5 0-11 6-14z" fill="currentColor" opacity=".85" /></svg>
        <b>Bag of Holding</b>
        <small className="muted">{bagged.length} in the bag</small>
      </div>
      {bagged.length > 0 && (
        <ul className="bag-items">
          {bagged.map((w) => (
            <li key={w.id} className="bag-item">
              <button className="bag-take" title="Take it out" onClick={() => api.unbag(w.id)}>{w.title}</button>
              <button className="bag-remove" aria-label={`Remove ${w.title}`} title="Remove it" onClick={() => api.close(w.id)}>×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="bag-actions">
        {openCount > 1 && <button onClick={api.tidy} title="Line the open windows up">Tidy up</button>}
        {openCount > 0 && <button onClick={api.bagAll} title="Put every open window in the bag">Put everything in the bag</button>}
        {bagged.length > 0 && <button onClick={empty} title="Close everything in the bag">Empty the bag</button>}
      </div>
    </aside>
  );
}
