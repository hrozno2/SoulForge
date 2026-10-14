/**
 * The rules reference in the app: downloaded from 5e.tools on GitHub (never bundled), condensed to numbers, kept in
 * the local database and refreshed after a month. Without it the Rules check still runs on the content alone and
 * says what it could not check.
 */
import { downloadRulesRef } from "./rulesRef";
import { metaStore } from "./storage";
import type { RefClass } from "./rulesCheck";

const KEY = "rulesRef";
const MAX_AGE = 30 * 24 * 3600 * 1000;
let current: RefClass[] | null = null;
let fetched = 0;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function rulesRef(): RefClass[] | null {
  return current;
}

export function rulesRefDate(): number {
  return fetched;
}

export function onRulesRef(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Loads the saved reference, and downloads it when missing or a month old. Failures leave the saved copy in use. */
export function ensureRulesRef(force = false): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    const saved = await metaStore.get<{ data: RefClass[]; fetched: number }>(KEY);
    if (saved?.data?.length) {
      current = saved.data;
      fetched = saved.fetched;
      listeners.forEach((f) => f());
    }
    if (!force && saved && Date.now() - saved.fetched < MAX_AGE) return;
    try {
      const data = (await downloadRulesRef(async (url) => {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`${url}: ${r.status}`);
        return r.json();
      })) as RefClass[];
      if (data.length) {
        current = data;
        fetched = Date.now();
        await metaStore.put(KEY, { data, fetched });
        listeners.forEach((f) => f());
      }
    } catch {
      /* offline: the saved copy, or none */
    }
  })().finally(() => {
    loading = null;
  });
  return loading;
}
