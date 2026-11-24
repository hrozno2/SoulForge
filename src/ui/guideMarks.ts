/**
 * The guide's marks in the lists (plan 2026-11-23, 5b): while the guided first character recommends a few classes,
 * species or backgrounds, those cards carry a mark in the list itself, so the player finds what the guide named.
 * A mark is a pointer, never a pick; every other option stays as it is.
 */
import { useSyncExternalStore } from "react";

export interface GuideMarks {
  /** The element type the marks are for ("Class", "Race", "Background"). */
  type: string;
  names: string[];
}

let marks: GuideMarks | null = null;
const listeners = new Set<() => void>();

/** What the guide recommends now, or null when it recommends nothing (or is closed). */
export function setGuideMarks(next: GuideMarks | null): void {
  const same = marks?.type === next?.type && (marks?.names ?? []).join("|") === (next?.names ?? []).join("|");
  if (same) return;
  marks = next;
  for (const l of listeners) l();
}

export const guideMarks = () => marks;

/** True when the guide recommends this option. */
export const isGuideMarked = (m: GuideMarks | null, el: { type: string; name: string }) =>
  !!m && m.type === el.type && m.names.includes(el.name);

export function useGuideMarks(): GuideMarks | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => marks,
  );
}

/**
 * While the guide runs, the lists of classes, species and backgrounds show the free 2024 rules only, so a new player
 * reads twelve classes, not every version of every book (plan 2026-11-23, 5b). What is already picked stays, and a
 * list with nothing from those rules (other content only) is left whole. Closing the guide shows everything again.
 */
const GUIDE_TYPES = /^(Class|Race|Background)$/;
const FREE_2024 = /^SRD 5\.2/;
export function guideScoped<T extends { id: string; type: string; source: string }>(items: T[], picked: ReadonlySet<string>): T[] {
  if (!items.length || !items.every((e) => GUIDE_TYPES.test(e.type))) return items;
  const kept = items.filter((e) => FREE_2024.test(e.source) || picked.has(e.id));
  return kept.some((e) => FREE_2024.test(e.source)) ? kept : items;
}

let running = false;
/** The guide is open (GuideCoach mounts and unmounts it). */
export function setGuideRunning(on: boolean): void {
  if (running === on) return;
  running = on;
  for (const l of listeners) l();
}
export function useGuideRunning(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => running,
  );
}
