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

export type Provider = "google" | "libre";

export interface TranslatorConfig {
  provider: Provider;
  key: string;
  /** Base address for LibreTranslate, for example https://libretranslate.com or your own server. */
  url: string;
}

export const DEFAULT_TRANSLATOR: TranslatorConfig = { provider: "libre", key: "", url: "https://libretranslate.com" };

/** Sends a batch of strings and returns the translations in the same order. */
export type BatchTranslator = (texts: string[], target: string) => Promise<string[]>;

export function makeTranslator(cfg: TranslatorConfig, fetcher: typeof fetch = fetch): BatchTranslator {
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
): Promise<{ map: Map<string, string>; failed: number }> {
  const map = new Map<string, string>();
  const todo: string[] = [];
  for (const s of new Set(strings)) {
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
      failed += b.length;
    }
    done += b.length;
    onProgress?.(done, total);
  }
  return { map, failed };
}
