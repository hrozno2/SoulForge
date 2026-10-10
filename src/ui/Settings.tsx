import { useEffect, useSyncExternalStore } from "react";

export interface AppSettings {
  /** Interface size in percent. */
  scale: number;
  compact: boolean;
  reduceMotion: boolean;
  paper: "a4" | "letter";
}

const KEY = "charforge.settings";
const DEFAULTS: AppSettings = { scale: 100, compact: false, reduceMotion: false, paper: "a4" };

function read(): AppSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

let current = read();
const listeners = new Set<() => void>();

export function applySettings(s: AppSettings = current): void {
  const root = document.documentElement;
  (root.style as CSSStyleDeclaration & { zoom: string }).zoom = String(s.scale / 100);
  root.classList.toggle("compact", s.compact);
  root.classList.toggle("reduce-motion", s.reduceMotion);
}

export const getSettings = (): AppSettings => current;

export function updateSettings(p: Partial<AppSettings>): void {
  current = { ...current, ...p, scale: Math.min(150, Math.max(70, Math.round((p.scale ?? current.scale) / 5) * 5)) };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage can be unavailable */
  }
  applySettings();
  listeners.forEach((f) => f());
}

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};
export const useSettings = (): AppSettings => useSyncExternalStore(subscribe, () => current);

// Apply the saved look before the first paint.
if (typeof document !== "undefined") applySettings();

/** Ctrl or Cmd with + - 0 changes the interface size, like a browser. */
export function useScaleShortcuts(): void {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key === "=" || e.key === "+") updateSettings({ scale: current.scale + 5 });
      else if (e.key === "-" || e.key === "_") updateSettings({ scale: current.scale - 5 });
      else if (e.key === "0") updateSettings({ scale: 100 });
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const resetHints = () => {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith("charforge.hint.")) localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="modal-back" role="dialog" aria-label="Settings" onClick={onClose}>
      <div className="modal-page settings" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" aria-label="Close" onClick={onClose}>×</button>
        <h2>Settings</h2>
        <label className="set-row">
          <span><b>Interface size</b><small className="muted"> Ctrl or Cmd with + and − works too</small></span>
          <span className="set-ctl">
            <input type="range" min={70} max={150} step={5} value={s.scale} onChange={(e) => updateSettings({ scale: Number(e.target.value) })} aria-label="Interface size" />
            <output>{s.scale}%</output>
            <button onClick={() => updateSettings({ scale: 100 })} disabled={s.scale === 100}>Reset</button>
          </span>
        </label>
        <label className="set-row">
          <span><b>Compact layout</b><small className="muted"> Tighter spacing, more on screen</small></span>
          <input type="checkbox" checked={s.compact} onChange={(e) => updateSettings({ compact: e.target.checked })} />
        </label>
        <label className="set-row">
          <span><b>Reduce motion</b><small className="muted"> Turns off animations and transitions</small></span>
          <input type="checkbox" checked={s.reduceMotion} onChange={(e) => updateSettings({ reduceMotion: e.target.checked })} />
        </label>
        <div className="set-row">
          <span><b>Paper size for PDFs</b></span>
          <span className="set-ctl">
            {(["a4", "letter"] as const).map((p) => <button key={p} className={s.paper === p ? "pill active" : "pill"} onClick={() => updateSettings({ paper: p })}>{p === "a4" ? "A4" : "Letter"}</button>)}
          </span>
        </div>
        <div className="set-row">
          <span><b>Tips</b><small className="muted"> Bring back hints you dismissed</small></span>
          <button onClick={resetHints}>Show tips again</button>
        </div>
      </div>
    </div>
  );
}
