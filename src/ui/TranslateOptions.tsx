import { useState } from "react";
import { translationCache } from "../aurora/storage";
import { SEEDED, glossaryFor, parseGlossary } from "../pdf/glossary";
import { DEFAULT_TRANSLATOR, LANGUAGES, makeTranslator, type TranslatorConfig } from "../pdf/translate";
import type { PdfOptions } from "../pdf/exportPdf";

const KEY = "charforge.translate";
const TERMS = (lang: string) => `charforge.terms.${lang}`;
const loadTerms = (lang: string): string => {
  try {
    return localStorage.getItem(TERMS(lang)) ?? "";
  } catch {
    return "";
  }
};

function load(): { lang: string; cfg: TranslatorConfig; keepNames: boolean } {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { lang: raw.lang ?? "", cfg: { ...DEFAULT_TRANSLATOR, ...(raw.cfg ?? {}) }, keepNames: raw.keepNames !== false };
  } catch {
    return { lang: "", cfg: DEFAULT_TRANSLATOR, keepNames: true };
  }
}

/** Language choice and translation service settings, remembered between launches. */
export function useTranslation() {
  const [state, setState] = useState(load);
  const save = (next: { lang: string; cfg: TranslatorConfig; keepNames?: boolean }) => {
    next = { keepNames: state.keepNames, ...next } as typeof next & { keepNames: boolean };
    setState(next as ReturnType<typeof load>);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage can be unavailable */
    }
  };
  const ready = !state.lang || state.cfg.provider === "gfree" || (state.cfg.provider === "libre" ? !!state.cfg.url.trim() : !!state.cfg.key.trim());
  /** The option to hand to buildPdf, or undefined when no translation is wanted. */
  const option = (onProgress?: (d: number, t: number) => void, onResult?: (failed: number) => void): PdfOptions["translate"] =>
    state.lang ? { target: state.lang, translator: makeTranslator(state.cfg, fetch, glossaryFor(state.lang, loadTerms(state.lang))), cache: translationCache, onProgress, onResult, keepNames: state.keepNames, glossary: glossaryFor(state.lang, loadTerms(state.lang)) } : undefined;
  return { ...state, ready, option, set: save };
}

export type Translation = ReturnType<typeof useTranslation>;

export function TranslateOptions({ tr }: { tr: Translation }) {
  const { lang, cfg, set, keepNames } = tr;
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
        <label className="check small"><input type="checkbox" checked={keepNames} onChange={() => set({ lang, cfg, keepNames: !keepNames })} /> Keep names of spells, items and features in English (machine translation often turns names into odd phrases)</label>
      )}
      {lang && <TermsEditor lang={lang} />}
      {lang && (
        <details className="tip" open={!tr.ready}>
          <summary>Translation service{tr.ready ? "" : " (needs setup)"}</summary>
          <div className="row">
            <select value={cfg.provider} onChange={(e) => set({ lang, cfg: { ...cfg, provider: e.target.value as TranslatorConfig["provider"] } })} aria-label="Service">
              <option value="gfree">Google Translate, free (no key)</option>
              <option value="libre">LibreTranslate (open source, free if you host it)</option>
              <option value="deepl">DeepL (your API key, desktop app)</option>
              <option value="google">Google Cloud Translation (your API key)</option>
            </select>
          </div>
          {cfg.provider === "deepl" && <p className="muted">Usually the best quality for European languages. Get a free key at deepl.com/pro-api (a key ending in :fx is the free plan, with a monthly character allowance). DeepL does not accept requests from web pages, so this works in the desktop app. Your terms below are sent along as a DeepL glossary.</p>}
          {cfg.provider === "gfree" && <p className="muted">Uses the same public service as translate.google.com. No account or key. It is unofficial: Google can slow it down or block it, and long sheets take a minute. If that happens, switch to an API key or LibreTranslate.</p>}
          {cfg.provider === "libre" && (
            <div className="row"><input style={{ flex: 1 }} value={cfg.url} onChange={(e) => set({ lang, cfg: { ...cfg, url: e.target.value } })} placeholder="https://libretranslate.com or your own server" aria-label="Server address" /></div>
          )}
          {cfg.provider !== "gfree" && <div className="row"><input style={{ flex: 1 }} type="password" value={cfg.key} onChange={(e) => set({ lang, cfg: { ...cfg, key: e.target.value } })} placeholder={cfg.provider === "google" || cfg.provider === "deepl" ? "API key (required)" : "API key (if the server needs one)"} aria-label="API key" autoComplete="off" /></div>}
          <p className="muted">
            Only the text that will be printed is sent to the service you choose, never your character file. Results are cached on this computer, so a second export of the same text costs nothing.
            The key is stored on this computer in plain text. It translates the Soul Forge style PDF, the cards, the play tips and the values written into your own sheet PDFs. The printed labels of a sheet you loaded stay as that PDF has them.
          </p>
        </details>
      )}
    </div>
  );
}


/** The player's own terms for a language, one `English = translation` per line. They win over the built-in starter terms. */
function TermsEditor({ lang }: { lang: string }) {
  const [text, setText] = useState(() => loadTerms(lang));
  const [seen, setSeen] = useState(lang);
  if (seen !== lang) {
    setSeen(lang);
    setText(loadTerms(lang));
  }
  const save = (v: string) => {
    setText(v);
    try {
      localStorage.setItem(TERMS(lang), v);
    } catch {
      /* not remembered */
    }
  };
  const builtIn = Object.keys(glossaryFor(lang, "")).length;
  const own = Object.keys(parseGlossary(text)).length;
  return (
    <details className="tip">
      <summary>Terms with fixed translations ({builtIn + own})</summary>
      <p className="muted">
        Names of weapons, skills, spells and rules words that machine translation gets wrong. A term here is used as written and is never sent to the service.
        {SEEDED.includes(lang) ? ` ${builtIn} starter terms are built in for this language (review them; yours win).` : " There are no built-in terms for this language yet, so add your own."}
        {" "}One per line, for example <code>Quarterstaff = Palica</code>. Lines starting with # are notes.
      </p>
      <textarea rows={6} value={text} onChange={(e) => save(e.target.value)} aria-label="Your terms" placeholder={"Quarterstaff = Palica\nLight Crossbow = Ľahká kuša"} style={{ width: "100%" }} />
      <p className="muted">{own} of your own terms.</p>
    </details>
  );
}
