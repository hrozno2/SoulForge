/**
 * A list's filters (its search text, the filter values ticked, whether the filter panel is open) outlive the list on
 * screen. A list is drawn anew whenever a card is slotted, replaced or removed, or its panel is folded and opened
 * again, and it used to start empty each time (Chris 2026-11-21). They are kept here by the list's name, through a
 * restart of the app too (Chris 2026-11-23), and change only when the player changes them: "Clear filters", a pill,
 * the search box.
 */
import { useCallback, useState } from "react";

const STORE = "charforge.filters.v1";
const sep = "\u0000";

/** Sets are written as lists, marked, so they come back as Sets. */
const toText = (m: Map<string, unknown>) =>
  JSON.stringify([...m], (_k, v: unknown) => (v instanceof Set ? { __set: [...(v as Set<unknown>)] } : v));
const fromText = (text: string): Map<string, unknown> =>
  new Map(
    JSON.parse(text, (_k, v: unknown) =>
      v && typeof v === "object" && Array.isArray((v as { __set?: unknown }).__set) ? new Set((v as { __set: unknown[] }).__set) : v,
    ) as [string, unknown][],
  );

/** Read once, at the first use: what was kept when the app last ran. A damaged or missing copy is an empty start. */
let kept: Map<string, unknown> | undefined;
function all(): Map<string, unknown> {
  if (kept) return kept;
  try {
    const text = typeof localStorage === "undefined" ? null : localStorage.getItem(STORE);
    kept = text ? fromText(text) : new Map();
  } catch {
    kept = new Map();
  }
  return kept;
}
function save(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORE, toText(all()));
  } catch {
    /* storage can be full or unavailable: the filters still hold while the app runs */
  }
}

/** For tests: forget everything, here and in storage. */
export function forgetFilters(): void {
  kept = new Map();
  save();
}

/** For tests: forget what is in memory only, as a restart does. */
export function restartFilters(): void {
  kept = undefined;
}

/** What a list last had under a name, or the given start. */
export function readKept<T>(list: string, name: string, initial: T): T {
  const key = `${list}${sep}${name}`;
  return all().has(key) ? (all().get(key) as T) : initial;
}

export function writeKept<T>(list: string, name: string, value: T): void {
  all().set(`${list}${sep}${name}`, value);
  save();
}

/** `useState` whose value is kept for the list under a name, so a list drawn anew starts where the player left it. */
export function useKept<T>(list: string, name: string, initial: T): [T, (next: T | ((was: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readKept(list, name, initial));
  const set = useCallback(
    (next: T | ((was: T) => T)) =>
      setValue((was) => {
        const v = typeof next === "function" ? (next as (was: T) => T)(was) : next;
        writeKept(list, name, v);
        return v;
      }),
    [list, name],
  );
  return [value, set];
}
