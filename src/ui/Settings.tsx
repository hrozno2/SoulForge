import { CLASS_ICON_CREDIT } from "./classIcons";
import { gpuStatus, setGpuFast } from "../system";
import { useEffect, useState, useSyncExternalStore } from "react";
import { exportLibrary, importLibrary } from "./library";
import { backupStore } from "../aurora/storage";
import { pickFiles } from "../store";
import { SCHOOL_CREDIT } from "./schoolIcons";
import { CONDITION_CREDIT } from "./conditionIcons";
import { LANGUAGES, setLanguage, t, type Lang } from "../i18n";

export interface AppSettings {
  /** Interface size in percent. */
  scale: number;
  compact: boolean;
  reduceMotion: boolean;
  paper: "a4" | "letter";
  autoBackup: boolean;
  language: Lang;
  /** Which kinds of content lists show. Anything you already picked always stays visible. */
  showLegacy: boolean;
  showPlaytest: boolean;
  showUnusual: boolean;
  /** Modern and futuristic technology (laser rifles, grenades, powered armor). */
  showSciFi: boolean;
  showModern: boolean;
  /** Printed sheets list every spell the character can prepare, with blank boxes to mark each day. */
  allSpells: boolean;
  /** The Build tab's layout: the build board (lists, board and scores side by side), or the older tabs along the top. */
  buildLayout: "board" | "tabs";
  /** The test build only: hide the test bar so the app looks like the released one. */
  hideTestTools: boolean;
}

const KEY = "charforge.settings";
const DEFAULTS: AppSettings = { scale: 100, compact: false, reduceMotion: false, paper: "a4", autoBackup: true, language: "en", showLegacy: true, showPlaytest: true, showUnusual: true, showSciFi: false, showModern: false, allSpells: false, buildLayout: "board", hideTestTools: false };

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
  setLanguage(s.language);
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
  const [msg, setMsg] = useState("");
  const [gpu, setGpu] = useState({ applies: false, on: false });
  useEffect(() => { void gpuStatus().then(setGpu); }, []);
  const [dates, setDates] = useState<string[]>([]);
  useEffect(() => { backupStore.dates().then(setDates); }, []);
  const backUp = async () => setMsg(await exportLibrary());
  const restoreFrom = async (text: string) => {
    try {
      setMsg(await importLibrary(JSON.parse(text)));
    } catch (e) {
      setMsg(`Could not restore: ${(e as Error).message}`);
    }
  };
  const restoreFile = async () => {
    const files = await pickFiles(["json"]);
    if (files === null) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.onchange = async () => { const f = input.files?.[0]; if (f) await restoreFrom(await f.text()); };
      input.click();
    } else if (files[0]) await restoreFrom(await files[0].text());
  };
  const resetHints = () => {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith("charforge.hint.")) localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="modal-back" role="dialog" aria-label="Settings" onClick={onClose}>
      <div className="modal-page themed settings" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" aria-label="Close" onClick={onClose}>×</button>
        <h2>{t("Settings")}</h2>
        <div className="set-row bug-row">
          <span><b>Something wrong?</b><small className="muted"> Checks the current character against the rules and gathers what a bug report needs, for you to send to GitHub or save</small></span>
          <button onClick={() => { onClose(); window.dispatchEvent(new Event("cf-report-bug")); }}>Report a bug...</button>
        </div>
        <label className="set-row">
          <span><b>{t("Language")}</b><small className="muted"> Buttons and menus. Rules text keeps its own language.</small></span>
          <select aria-label="Language" value={s.language} onChange={(e) => updateSettings({ language: e.target.value as Lang })}>{LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select>
        </label>
        <label className="set-row">
          <span><b>{t("Interface size")}</b><small className="muted"> Ctrl or Cmd with + and − works too</small></span>
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
          <span><b>Build layout</b><small className="muted"> The board, or the older tabs (with Magic and Equipment as their own tabs)</small></span>
          <span className="set-ctl">
            {(["board", "tabs"] as const).map((l) => <button key={l} className={s.buildLayout === l ? "pill active" : "pill"} onClick={() => updateSettings({ buildLayout: l })}>{l === "board" ? "Board" : "Tabs"}</button>)}
          </span>
        </div>
        <div className="set-row">
          <span><b>Paper size for PDFs</b></span>
          <span className="set-ctl">
            {(["a4", "letter"] as const).map((p) => <button key={p} className={s.paper === p ? "pill active" : "pill"} onClick={() => updateSettings({ paper: p })}>{p === "a4" ? "A4" : "Letter"}</button>)}
          </span>
        </div>
        <fieldset className="set-group">
          <legend>Content shown in lists</legend>
          <p className="muted set-explain">These filters apply everywhere you pick something: species, classes, backgrounds, every choice, spells, items and the shop. They only hide; the content stays loaded and characters that use it keep working. A choice is never left unable to be completed: when the filters would leave too few options, it shows all of them. Each list's own Filters button narrows that list further.</p>
          <label className="set-row">
            <span><b>2014 rules</b><small className="muted"> Species, classes, spells and items from before the 2024 books</small></span>
            <input type="checkbox" checked={s.showLegacy} onChange={(e) => updateSettings({ showLegacy: e.target.checked })} />
          </label>
          <label className="set-row">
            <span><b>Unearthed Arcana and playtest</b><small className="muted"> Draft material that may change</small></span>
            <input type="checkbox" checked={s.showPlaytest} onChange={(e) => updateSettings({ showPlaytest: e.target.checked })} />
          </label>
          <label className="set-row">
            <span><b>Settings and other sources</b><small className="muted"> Eberron, Ravnica, Theros and other worlds, plus third party and homebrew books</small></span>
            <input type="checkbox" checked={s.showUnusual} onChange={(e) => updateSettings({ showUnusual: e.target.checked })} />
          </label>
          <label className="set-row">
            <span><b>Sci-fi technology</b><small className="muted"> Futuristic gear: laser and antimatter guns, powered armor</small></span>
            <input type="checkbox" checked={s.showSciFi} onChange={(e) => updateSettings({ showSciFi: e.target.checked })} />
          </label>
          <label className="set-row">
            <span><b>Modern technology</b><small className="muted"> Renaissance and modern gear: pistols, revolvers, muskets, rifles, shotguns, modern vehicles</small></span>
            <input type="checkbox" checked={s.showModern} onChange={(e) => updateSettings({ showModern: e.target.checked })} />
          </label>
          <p className="muted">What you already picked stays visible even when its book is hidden here.</p>
        </fieldset>
        {import.meta.env.VITE_TEST_TOOLS === "1" && (
          <label className="set-row">
            <span><b>Show the test controls</b><small className="muted"> The test build's bar at the top; off makes it look like the released app</small></span>
            <input type="checkbox" checked={!s.hideTestTools} onChange={(e) => updateSettings({ hideTestTools: !e.target.checked })} />
          </label>
        )}
        {gpu.applies && (
          <label className="set-row">
            <span><b>Fast drawing on NVIDIA</b><small className="muted"> Experimental: keeps WebKit's GPU path, which older NVIDIA drivers crash on. Takes effect at the next start; if that start fails to draw, it turns itself off.</small></span>
            <input type="checkbox" checked={gpu.on} onChange={async (e) => { const on = e.target.checked; await setGpuFast(on); setGpu((g) => ({ ...g, on })); }} />
          </label>
        )}
        <div className="set-row">
          <span><b>Backups</b><small className="muted"> Every character in one file</small></span>
          <span className="set-ctl">
            <button onClick={backUp}>Back up all characters</button>
            <button onClick={restoreFile}>Restore...</button>
          </span>
        </div>
        <label className="set-row">
          <span><b>Automatic daily backup</b><small className="muted"> Keeps the last 7 days on this computer</small></span>
          <input type="checkbox" checked={s.autoBackup} onChange={(e) => updateSettings({ autoBackup: e.target.checked })} />
        </label>
        {dates.length > 0 && (
          <div className="set-row">
            <span><b>Restore from a day</b></span>
            <select aria-label="Automatic backups" defaultValue="" onChange={async (e) => { const d = e.target.value; e.target.value = ""; if (d) { const t = await backupStore.get(d); if (t) await restoreFrom(t); } }}>
              <option value="">Choose a day...</option>
              {dates.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        )}
        {msg && <p className="notice" role="status">{msg}</p>}
        <div className="set-row">
          <span><b>Tips</b><small className="muted"> Bring back hints you dismissed</small></span>
          <button onClick={resetHints}>Show tips again</button>
        </div>
        <p className="muted small-text credits">{SCHOOL_CREDIT}. {CONDITION_CREDIT}. {CLASS_ICON_CREDIT}. Stock portraits are credited in public/portraits/CREDITS.md.</p>
      </div>
    </div>
  );
}
