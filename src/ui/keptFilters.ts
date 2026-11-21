/**
 * A list's filters (its search text, the filter values ticked, whether the filter panel is open) outlive the list on
 * screen. A list is drawn anew whenever a card is slotted, replaced or removed, or its panel is folded and opened
 * again, and it used to start empty each time (Chris 2026-11-21). They are kept here by the list's name for as long
 * as the app runs, and change only when the player changes them: "Clear filters", a pill, the search box.
 */
import { useCallback, useState } from "react";

const kept = new Map<string, unknown>();

/** For tests: forget everything. */
export function forgetFilters(): void {
  kept.clear();
}

/** What a list last had under a name, or the given start. */
export function readKept<T>(list: string, name: string, initial: T): T {
  const key = `${list}\u0000${name}`;
  return kept.has(key) ? (kept.get(key) as T) : initial;
}

export function writeKept<T>(list: string, name: string, value: T): void {
  kept.set(`${list}\u0000${name}`, value);
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
