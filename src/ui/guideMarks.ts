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
