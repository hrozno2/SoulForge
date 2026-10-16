/**
 * Translation of exported PDF text. Soul Forge does not ship a translator: the player picks a service and supplies
 * their own key. Only the strings that will be printed are sent, and answers are cached on this computer.
 */
export interface Language {
  code: string;
  name: string;
}

/** Languages the bundled PDF font can draw (Latin, Cyrillic and Greek scripts). */
export const LANGUAGES: Language[] = [
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "nl", name: "Dutch" },
  { code: "pl", name: "Polish" },
  { code: "cs", name: "Czech" },
  { code: "sk", name: "Slovak" },
  { code: "hu", name: "Hungarian" },
  { code: "ro", name: "Romanian" },
  { code: "sv", name: "Swedish" },
  { code: "da", name: "Danish" },
  { code: "fi", name: "Finnish" },
  { code: "tr", name: "Turkish" },
  { code: "ru", name: "Russian" },
  { code: "uk", name: "Ukrainian" },
  { code: "el", name: "Greek" },
];

export type Provider = "gfree" | "google" | "libre" | "deepl";

export interface TranslatorConfig {
  provider: Provider;
  key: string;
  /** Base address for LibreTranslate, for example https://libretranslate.com or your own server. */
  url: string;
}

import { lookup, type Glossary } from "./glossary";
import { desktopFetch } from "../net";

export const DEFAULT_TRANSLATOR: TranslatorConfig = { provider: "gfree", key: "", url: "https://libretranslate.com" };

/** Sends a batch of strings and returns the translations in the same order. */
export type BatchTranslator = (texts: string[], target: string) => Promise<string[]>;

/** DeepL wants its own language codes; Portuguese must say which. */
const DEEPL_LANG: Record<string, string> = { pt: "PT-BR", nb: "NB", el: "EL", uk: "UK" };

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

export function makeTranslator(cfg: TranslatorConfig, fetcher: typeof fetch = fetch, glossary?: Glossary): BatchTranslator {
  if (cfg.provider === "deepl") {
    const key = cfg.key.trim();
    const base = key.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
    const headers = { Authorization: `DeepL-Auth-Key ${key}`, "Content-Type": "application/json" };
    const glossaryIds = new Map<string, string | null>();
    const call = async (f: typeof fetch, path: string, body: unknown): Promise<Response> => {
      for (let attempt = 0; ; attempt++) {
        const res = await f(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
        if ((res.status === 429 || res.status >= 500) && attempt < 3) {
          await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
          continue;
        }
        return res;
      }
    };
    /** One DeepL glossary per language, made from the player's terms. Without one the text is still translated. */
    const glossaryFor = async (f: typeof fetch, target: string): Promise<string | undefined> => {
      const entries = Object.entries(glossary ?? {}).filter(([a, b]) => a && b && !/[\t\n]/.test(a + b));
      if (!entries.length) return undefined;
      const tsv = entries.map(([a, b]) => `${a}\t${b}`).join("\n");
      const id = `${target}:${hash(tsv)}`;
      if (glossaryIds.has(id)) return glossaryIds.get(id) ?? undefined;
      const saved = (() => { try { return localStorage.getItem(`charforge.deepl.glossary.${id}`); } catch { return null; } })();
      if (saved) { glossaryIds.set(id, saved); return saved; }
      try {
        const res = await call(f, "/v2/glossaries", { name: `soulforge-${id}`, source_lang: "EN", target_lang: target.split("-")[0], entries: tsv, entries_format: "tsv" });
        const gid = res.ok ? ((await res.json()) as { glossary_id?: string }).glossary_id : undefined;
        glossaryIds.set(id, gid ?? null);
        if (gid) { try { localStorage.setItem(`charforge.deepl.glossary.${id}`, gid); } catch { /* not remembered */ } }
        return gid;
      } catch {
        glossaryIds.set(id, null);
        return undefined;
      }
    };
    return async (texts, code) => {
      if (!key) throw new Error("Add your DeepL API key first.");
      const f = fetcher === fetch ? await desktopFetch() : fetcher;
      const target = DEEPL_LANG[code] ?? code.toUpperCase();
      const gid = await glossaryFor(f, target);
      const res = await call(f, "/v2/translate", { text: texts, source_lang: "EN", target_lang: target, preserve_formatting: true, ...(gid ? { glossary_id: gid } : {}) });
      if (res.status === 456) throw new Error("Your DeepL character allowance for this month is used up.");
      if (res.status === 403) throw new Error("DeepL did not accept the key. Check it, and that it belongs to the right plan (free keys end in :fx).");
      if (!res.ok) throw new Error(`DeepL answered ${res.status}.`);
      const json = (await res.json()) as { translations: { text: string }[] };
      return json.translations.map((t) => t.text);
    };
  }
  if (cfg.provider === "gfree") {
    // The public endpoint behind translate.google.com. It needs no key but has no promises: it can slow down or refuse.
    const one = async (text: string, target: string): Promise<string> => {
      const res = await fetcher(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(target)}&dt=t`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: `q=${encodeURIComponent(text)}`,
      });
      if (!res.ok) throw new Error(res.status === 429 ? "Google is limiting free requests right now. Wait a few minutes, or add an API key." : `Google Translate answered ${res.status}.`);
      const json = (await res.json()) as [string[][]];
      return (json[0] ?? []).map((seg) => seg[0] ?? "").join("");
    };
    return async (texts, target) => {
      const out: string[] = new Array(texts.length).fill("");
      let next = 0;
      await Promise.all(Array.from({ length: 3 }, async () => {
        while (next < texts.length) {
          const i = next++;
          out[i] = await one(texts[i], target);
        }
      }));
      return out;
    };
  }
  if (cfg.provider === "google") {
    return async (texts, target) => {
      const res = await fetcher(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(cfg.key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: texts, source: "en", target, format: "text" }),
      });
      if (!res.ok) throw new Error(`Google Translate answered ${res.status}. Check the key and that the Cloud Translation API is enabled.`);
      const json = (await res.json()) as { data: { translations: { translatedText: string }[] } };
      return json.data.translations.map((t) => t.translatedText);
    };
  }
  const base = cfg.url.replace(/\/+$/, "");
  return async (texts, target) => {
    const res = await fetcher(`${base}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: texts, source: "en", target, format: "text", api_key: cfg.key || undefined }),
    });
    if (!res.ok) throw new Error(`The translation server answered ${res.status}. Check the address and key.`);
    const json = (await res.json()) as { translatedText: string | string[] };
    return Array.isArray(json.translatedText) ? json.translatedText : [json.translatedText];
  };
}

const NEEDS_TRANSLATION = /[A-Za-z]{3}/;

/** Strings worth sending: they hold words, and are not on the keep list (names the player typed). */
export function translatable(s: string, keep: ReadonlySet<string>): boolean {
  return NEEDS_TRANSLATION.test(s) && !keep.has(s.trim());
}

/**
 * Translates every string, in batches, using a cache. Strings that fail stay in English and are counted.
 */
export async function translateAll(
  strings: Iterable<string>,
  target: string,
  translate: BatchTranslator,
  cache: { get(k: string): Promise<string | undefined>; put(k: string, v: string): Promise<void> },
  onProgress?: (done: number, total: number) => void,
  glossary?: Glossary,
): Promise<{ map: Map<string, string>; failed: number }> {
  const map = new Map<string, string>();
  const todo: string[] = [];
  for (const s of new Set(strings)) {
    const term = glossary ? lookup(glossary, s) : undefined;
    if (term) {
      map.set(s, term);
      continue;
    }
    const hit = await cache.get(`${target}\u0000${s}`);
    if (hit !== undefined) map.set(s, hit);
    else todo.push(s);
  }
  let failed = 0;
  const total = todo.length;
  let done = 0;
  // Keep each request modest: about 40 strings or 8000 characters.
  const batches: string[][] = [];
  let cur: string[] = [];
  let size = 0;
  for (const s of todo) {
    if (cur.length >= 40 || size + s.length > 8000) {
      batches.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(s);
    size += s.length;
  }
  if (cur.length) batches.push(cur);
  for (const b of batches) {
    try {
      const out = await translate(b, target);
      b.forEach((s, i) => {
        const t = out[i];
        if (typeof t === "string" && t.trim()) {
          map.set(s, t);
          void cache.put(`${target}\u0000${s}`, t);
        } else failed++;
      });
    } catch (e) {
      if (done === 0 && !map.size) throw e;
      // One bad batch should not lose its neighbours: try each string on its own, once.
      for (const s of b) {
        try {
          const t = (await translate([s], target))[0];
          if (typeof t === "string" && t.trim()) {
            map.set(s, t);
            void cache.put(`${target}\u0000${s}`, t);
          } else failed++;
        } catch {
          failed++;
        }
      }
    }
    done += b.length;
    onProgress?.(done, total);
  }
  return { map, failed };
}
