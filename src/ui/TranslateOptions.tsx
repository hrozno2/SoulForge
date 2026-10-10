import { useState } from "react";
import { translationCache } from "../aurora/storage";
import { DEFAULT_TRANSLATOR, LANGUAGES, makeTranslator, type TranslatorConfig } from "../pdf/translate";
import type { PdfOptions } from "../pdf/exportPdf";

const KEY = "charforge.translate";

function load(): { lang: string; cfg: TranslatorConfig } {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { lang: raw.lang ?? "", cfg: { ...DEFAULT_TRANSLATOR, ...(raw.cfg ?? {}) } };
  } catch {
    return { lang: "", cfg: DEFAULT_TRANSLATOR };
  }
}

/** Language choice and translation service settings, remembered between launches. */
export function useTranslation() {
  const [state, setState] = useState(load);
  const save = (next: { lang: string; cfg: TranslatorConfig }) => {
    setState(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage can be unavailable */
    }
  };
  const ready = !state.lang || state.cfg.provider === "gfree" || (state.cfg.provider === "libre" ? !!state.cfg.url.trim() : !!state.cfg.key.trim());
  /** The option to hand to buildPdf, or undefined when no translation is wanted. */
  const option = (onProgress?: (d: number, t: number) => void, onResult?: (failed: number) => void): PdfOptions["translate"] =>
    state.lang ? { target: state.lang, translator: makeTranslator(state.cfg), cache: translationCache, onProgress, onResult } : undefined;
  return { ...state, ready, option, set: save };
}

export type Translation = ReturnType<typeof useTranslation>;

export function TranslateOptions({ tr }: { tr: Translation }) {
  const { lang, cfg, set } = tr;
  return (
    <div className="translate-opts">
      <div className="row">
        <label>
          Translate to{" "}
          <select value={lang} onChange={(e) => set({ lang: e.target.value, cfg })}>
            <option value="">English (no translation)</option>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
        </label>
      </div>
      {lang && (
        <details className="tip" open={!tr.ready}>
          <summary>Translation service{tr.ready ? "" : " (needs setup)"}</summary>
          <div className="row">
            <select value={cfg.provider} onChange={(e) => set({ lang, cfg: { ...cfg, provider: e.target.value as TranslatorConfig["provider"] } })} aria-label="Service">
              <option value="gfree">Google Translate, free (no key)</option>
              <option value="libre">LibreTranslate (open source, free if you host it)</option>
              <option value="google">Google Cloud Translation (your API key)</option>
            </select>
          </div>
          {cfg.provider === "gfree" && <p className="muted">Uses the same public service as translate.google.com. No account or key. It is unofficial: Google can slow it down or block it, and long sheets take a minute. If that happens, switch to an API key or LibreTranslate.</p>}
          {cfg.provider === "libre" && (
            <div className="row"><input style={{ flex: 1 }} value={cfg.url} onChange={(e) => set({ lang, cfg: { ...cfg, url: e.target.value } })} placeholder="https://libretranslate.com or your own server" aria-label="Server address" /></div>
          )}
          {cfg.provider !== "gfree" && <div className="row"><input style={{ flex: 1 }} type="password" value={cfg.key} onChange={(e) => set({ lang, cfg: { ...cfg, key: e.target.value } })} placeholder={cfg.provider === "google" ? "API key (required)" : "API key (if the server needs one)"} aria-label="API key" autoComplete="off" /></div>}
          <p className="muted">
            Only the text that will be printed is sent to the service you choose, never your character file. Results are cached on this computer, so a second export of the same text costs nothing.
            The key is stored on this computer in plain text. It translates the Soul Forge style PDF, the cards, the play tips and the values written into your own sheet PDFs. The printed labels of a sheet you loaded stay as that PDF has them.
          </p>
        </details>
      )}
    </div>
  );
}
