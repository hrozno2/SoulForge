/**
 * The resolver keeps settled levels between calls (timeline.ts). A kept level must never differ from a fresh one
 * (docs/AUDIT-2026-11-10.md, R6): random characters on the bundled SRD content are edited step by step, and after
 * every step the resolve that reused kept levels is compared with one that kept nothing.
 */
import { describe, expect, it } from "vitest";
import { loadContentSet } from "./testContent";
import { clearTimelineCache } from "./timeline";
import { resolve, type Resolved } from "../aurora/engine";
import { randomCharacter } from "../aurora/randomCharacter";
import type { Character } from "../aurora/character";

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const picture = (r: Resolved) => JSON.stringify({
  ids: [...r.ids].sort(),
  stats: r.stats.names().sort().map((n) => [n, r.stats.get(n)]),
  slots: r.slots.map((s) => [s.key, s.chosen, s.options.length, [...s.blocked].sort(), !!s.declined]),
  spells: r.spellPicks.map((p) => [p.id, p.casting, p.granted]),
  warnings: r.warnings,
});

/** One edit a player could make. */
function edit(ch: Character, r: Resolved, rng: () => number): Character {
  const pick = <T,>(list: T[]): T | undefined => list[Math.floor(rng() * list.length)];
  const kind = Math.floor(rng() * 7);
  const slots = r.slots.filter((s) => s.rule.type !== "List" && s.options.length > 1);
  const s = pick(slots);
  if (kind <= 1 && s) {
    // Another option in a choice (allowed or not: the resolver must agree with itself either way).
    const other = pick(s.options.filter((o) => !s.chosen.includes(o.id)));
    if (other) return { ...ch, selections: { ...ch.selections, [s.key]: [other.id, ...s.chosen.slice(1)].slice(0, s.rule.number) } };
  }
  if (kind === 2 && s) { const { [s.key]: _gone, ...rest } = ch.selections; void _gone; return { ...ch, selections: rest }; }
  if (kind === 3 && ch.classes.length) {
    const i = Math.floor(rng() * ch.classes.length);
    const total = ch.classes.reduce((n, c) => n + c.level, 0);
    const up = rng() < 0.6 && total < 20;
    const level = Math.max(1, ch.classes[i].level + (up ? 1 : -1));
    return { ...ch, classes: ch.classes.map((c, j) => (j === i ? { ...c, level } : c)) };
  }
  if (kind === 4 && ch.inventory.length) {
    const i = Math.floor(rng() * ch.inventory.length);
    return { ...ch, inventory: ch.inventory.map((it, j) => (j === i ? { ...it, equipped: !it.equipped } : it)) };
  }
  if (kind === 5) {
    const a = pick(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const)!;
    return { ...ch, abilityBase: { ...ch.abilityBase, [a]: 8 + Math.floor(rng() * 8) } };
  }
  if (s && (s.rule.optional || s.declined)) {
    const declined = new Set(ch.declined ?? []);
    if (declined.has(s.key)) declined.delete(s.key); else declined.add(s.key);
    return { ...ch, declined: [...declined] };
  }
  return { ...ch, xp: ch.xp + 1 };
}

describe("kept levels", () => {
  it("a resolve that reuses kept levels equals a fresh one, after every edit", () => {
    const warm = loadContentSet("", "srd");
    const cold = loadContentSet("", "srd");
    const rng = seeded(4711);
    const filters = { legacy: true, playtest: false, unusual: true, scifi: false, modern: false };
    let compared = 0;
    for (let i = 0; i < 120; i++) {
      let ch = randomCharacter(warm, 1 + Math.floor(rng() * 20), filters, rng);
      let r = resolve(ch, warm);
      for (let step = 0; step < 15; step++) {
        ch = edit(ch, r, rng);
        r = resolve(ch, warm);
        clearTimelineCache(cold);
        const fresh = resolve(ch, cold);
        if (picture(r) !== picture(fresh)) throw new Error(`character ${i}, edit ${step}: the kept resolve differs from a fresh one\n${JSON.stringify({ classes: ch.classes, race: ch.race, background: ch.background })}`);
        compared++;
      }
    }
    expect(compared).toBe(1800);
  }, 300_000);
});
