/**
 * Typed effects for mechanics that no content states as rules (docs/ENGINE-PLAN.md 3.2, the curated part of the
 * mechanics table). Aurora writes most mechanics as stats; these few it leaves to the app, and 5e.tools has only
 * prose. Each entry is keyed by the feature's canonical name and kind, never by an id, so it holds for every book
 * and both providers. The sheet and the checker read effects, never feature names.
 */
import type { Resolved } from "../aurora/engine";
import type { AElement } from "../aurora/types";

export type Effect =
  /** +N damage with a melee weapon held in one hand and no other weapon (Dueling). */
  | { kind: "one-hand-melee-damage"; value: number }
  /** Weapons whose name matches lose a property (Crossbow Expert: crossbows lose Loading). */
  | { kind: "drop-property"; property: string; weapons: RegExp }
  /** The unarmed strike's damage die is at least this (Tavern Brawler: d4). */
  | { kind: "unarmed-die"; die: number; note: string }
  /** A note on the unarmed strike (Ki-Empowered Strikes: counts as magical). */
  | { kind: "unarmed-note"; text: string }
  /**
   * An attack the feature gives: a natural weapon (it uses the unarmed strike's ability and bonuses) or a weapon of
   * its own (Psychic Blades: finesse, so Strength or Dexterity).
   */
  | { kind: "attack"; name: string; die: string; damageType: string; ability: "unarmed" | "finesse"; properties?: string; notes?: string };

interface Entry {
  /** Canonical names: lower case, without "Level N:" and without brackets. */
  names: string[];
  /** Element kinds the name counts for. */
  types: RegExp;
  /** Only for these books (by name), when the die differs between printings. */
  books?: RegExp;
  effects: Effect[];
}

const FEAT_OR_FEATURE = /feat|feature/i;
const SPECIES = /racial trait|race|sub race/i;

export const EFFECT_TABLE: Entry[] = [
  { names: ["dueling"], types: FEAT_OR_FEATURE, effects: [{ kind: "one-hand-melee-damage", value: 2 }] },
  { names: ["crossbow expert"], types: /^feat$/i, effects: [{ kind: "drop-property", property: "loading", weapons: /crossbow/i }] },
  { names: ["tavern brawler"], types: /^feat$/i, effects: [{ kind: "unarmed-die", die: 4, note: "Tavern Brawler" }] },
  { names: ["ki-empowered strikes"], types: FEAT_OR_FEATURE, effects: [{ kind: "unarmed-note", text: "counts as magical" }] },
  { names: ["empowered strikes"], types: FEAT_OR_FEATURE, effects: [{ kind: "unarmed-note", text: "can deal force damage" }] },
  // Soul Knife (TCE p.62, PHB 2024 p.134): a psychic blade, finesse and thrown (60 ft.), 1d6 psychic.
  { names: ["psychic blades"], types: FEAT_OR_FEATURE, effects: [{ kind: "attack", name: "Psychic Blades", die: "1d6", damageType: "psychic", ability: "finesse", properties: "finesse, thrown (60 ft.)", notes: "second blade as a bonus action: 1d4" }] },
  // Natural weapons count as unarmed strikes with their own damage.
  { names: ["cat's claws"], types: SPECIES, books: /monsters of the multiverse|mordenkainen presents/i, effects: [{ kind: "attack", name: "Claws", die: "1d6", damageType: "slashing", ability: "unarmed" }] },
  { names: ["cat's claws"], types: SPECIES, books: /volo/i, effects: [{ kind: "attack", name: "Claws", die: "1d4", damageType: "slashing", ability: "unarmed" }] },
  { names: ["horns"], types: SPECIES, effects: [{ kind: "attack", name: "Horns", die: "1d6", damageType: "piercing", ability: "unarmed" }] },
  { names: ["hooves"], types: SPECIES, books: /monsters of the multiverse|mordenkainen presents/i, effects: [{ kind: "attack", name: "Hooves", die: "1d6", damageType: "bludgeoning", ability: "unarmed" }] },
  { names: ["hooves"], types: SPECIES, books: /ravnica|theros/i, effects: [{ kind: "attack", name: "Hooves", die: "1d4", damageType: "bludgeoning", ability: "unarmed" }] },
  { names: ["bite"], types: SPECIES, books: /monsters of the multiverse|mordenkainen presents|volo/i, effects: [{ kind: "attack", name: "Bite", die: "1d6", damageType: "piercing", ability: "unarmed" }] },
  { names: ["talons"], types: SPECIES, books: /monsters of the multiverse|mordenkainen presents/i, effects: [{ kind: "attack", name: "Talons", die: "1d6", damageType: "slashing", ability: "unarmed" }] },
  { names: ["talons"], types: SPECIES, books: /elemental evil|princes/i, effects: [{ kind: "attack", name: "Talons", die: "1d4", damageType: "slashing", ability: "unarmed" }] },
  { names: ["claws"], types: SPECIES, books: /tortle|monsters of the multiverse|mordenkainen presents/i, effects: [{ kind: "attack", name: "Claws", die: "1d6", damageType: "slashing", ability: "unarmed" }] },
  { names: ["claws"], types: SPECIES, books: /theros/i, effects: [{ kind: "attack", name: "Claws", die: "1d4", damageType: "slashing", ability: "unarmed" }] },
];

/** A feature's canonical name: lower case, straight quotes, no "Level N:" and no brackets. */
export const canonicalName = (name: string) =>
  name.toLowerCase().replace(/^level \d+:\s*/, "").replace(/[’‘`]/g, "'").replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();

function entriesFor(el: AElement): Entry[] {
  const n = canonicalName(el.name);
  return EFFECT_TABLE.filter((e) => e.names.includes(n) && e.types.test(el.type) && (!e.books || e.books.test(el.source)));
}

const CACHE = new WeakMap<object, { effect: Effect; from: AElement }[]>();

/** Every typed effect the character has, with the element it comes from. One element gives each effect once. */
export function effectsOf(r: Pick<Resolved, "active">): { effect: Effect; from: AElement }[] {
  const hit = CACHE.get(r);
  if (hit) return hit;
  const out: { effect: Effect; from: AElement }[] = [];
  const seen = new Set<string>();
  for (const a of r.active) {
    for (const e of entriesFor(a.el)) for (const effect of e.effects) {
      // The same effect from a feature and its twin in the other provider counts once.
      const k = JSON.stringify(effect, (_, v) => (v instanceof RegExp ? v.source : v));
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ effect, from: a.el });
    }
  }
  CACHE.set(r, out);
  return out;
}

export function effectsOfKind<K extends Effect["kind"]>(r: Pick<Resolved, "active">, kind: K): { effect: Extract<Effect, { kind: K }>; from: AElement }[] {
  return effectsOf(r).filter((x) => x.effect.kind === kind) as { effect: Extract<Effect, { kind: K }>; from: AElement }[];
}
