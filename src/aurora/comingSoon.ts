import type { AElement } from "./types";

/**
 * Playtest (Unearthed Arcana) features Soul Forge does not support yet (docs/UA-UNSUPPORTED.md). They and whatever
 * grants them (the class or subclass that brings them) are marked "coming soon": shown in the lists, never picked.
 * Remove an id here when its item in UA-UNSUPPORTED.md is done.
 */
export const UNSUPPORTED_UA: Record<string, string> = {
  // Empty since 2026-10-27: UA1 and UA3 are supported, UA2 (an unused display value) does not stop play.
};

/** Marks the unsupported elements and, through grants, every element that brings one. */
export function markComingSoon(byId: Map<string, AElement>, unsupported: Iterable<string> = Object.keys(UNSUPPORTED_UA)): void {
  const grantedBy = new Map<string, AElement[]>();
  for (const el of byId.values()) for (const r of el.rules) if (r.kind === "grant") (grantedBy.get(r.id) ?? grantedBy.set(r.id, []).get(r.id)!).push(el);
  const todo = [...unsupported].filter((id) => byId.has(id));
  const seen = new Set<string>();
  while (todo.length) {
    const id = todo.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const el = byId.get(id);
    if (el) el.comingSoon = true;
    for (const by of grantedBy.get(id) ?? []) todo.push(by.id);
  }
}
