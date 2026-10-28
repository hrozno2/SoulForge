import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
}
export const MAX_WINDOWS = 10;

interface FloatingApi {
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

const clampTo = (w: FloatWindow): FloatWindow => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const ww = Math.min(Math.max(280, w.w), vw - 16), hh = Math.min(Math.max(160, w.h), vh - 16);
  return { ...w, w: ww, h: hh, x: Math.min(Math.max(8, w.x), vw - ww - 8), y: Math.min(Math.max(8, w.y), vh - hh - 8) };
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
  const api: FloatingApi = useMemo(() => ({
    windows, notice, open,
    close: (id) => setWindows((ws) => ws.filter((w) => w.id !== id)),
    focus: (id) => setWindows((ws) => (ws.find((w) => w.id === id)?.z === top(ws) - 1 ? ws : ws.map((w) => (w.id === id ? { ...w, z: top(ws) } : w)))),
    move: (id, x, y, w, h) => setWindows((ws) => ws.map((o) => (o.id === id ? clampTo({ ...o, x, y, w: w ?? o.w, h: h ?? o.h }) : o))),
    bag: (id) => setWindows((ws) => ws.map((w) => (w.id === id ? { ...w, bagged: true } : w))),
    unbag: (id) => setWindows((ws) => ws.map((w) => (w.id === id ? { ...w, bagged: false, z: top(ws) } : w))),
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
  }), [windows, notice, open]);

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
      {open.map((w) => <WindowFrame key={w.id} w={w} api={api}>{render(w)}</WindowFrame>)}
      {api.windows.length > 0 && <BagOfHolding bagged={bagged} api={api} openCount={open.length} />}
      {api.notice && <div className="float-notice" role="status">{api.notice}</div>}
    </>
  );
}

/** A window: a title bar to drag it by, the bag and close buttons, the content, a corner to resize it. */
function WindowFrame({ w, api, children }: { w: FloatWindow; api: FloatingApi; children: ReactNode }) {
  const drag = useRef<{ dx: number; dy: number; mode: "move" | "size"; w0: number; h0: number; x0: number; y0: number } | null>(null);
  const down = (mode: "move" | "size") => (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button") && mode === "move") return;
    api.focus(w.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { dx: e.clientX - w.x, dy: e.clientY - w.y, mode, w0: w.w, h0: w.h, x0: e.clientX, y0: e.clientY };
  };
  const moveTo = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === "move") api.move(w.id, e.clientX - d.dx, e.clientY - d.dy);
    else api.move(w.id, w.x, w.y, d.w0 + e.clientX - d.x0, d.h0 + e.clientY - d.y0);
  };
  const up = () => { drag.current = null; };
  return (
    <section className={`float-window float-${w.kind}`} role="dialog" aria-label={w.title} style={{ left: w.x, top: w.y, width: w.w, height: w.h, zIndex: 400 + w.z }} onPointerDown={() => api.focus(w.id)}>
      <header className="float-bar" onPointerDown={down("move")} onPointerMove={moveTo} onPointerUp={up} onPointerCancel={up}>
        <b>{w.title}</b>
        <span className="float-tools">
          <button title="Put it in the Bag of Holding" aria-label={`Put ${w.title} in the bag`} onClick={() => api.bag(w.id)}>▾</button>
          <button title="Close" aria-label={`Close ${w.title}`} onClick={() => api.close(w.id)}>×</button>
        </span>
      </header>
      <div className="float-body">{children}</div>
      <span className="float-resize" aria-hidden="true" onPointerDown={down("size")} onPointerMove={moveTo} onPointerUp={up} onPointerCancel={up} />
    </section>
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
