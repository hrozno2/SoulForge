/**
 * D6: the saved characters whose sheets still changed when moved to 5e.tools ids, each compared choice by choice on
 * 2026-11-28 (fixtures/move, copies of test-cache characters). Each names what the move may change and why; anything
 * else is a fault of the move. Needs the content cache (SOULFORGE_RULES).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeCharacter } from "../aurora/character";
import type { ARegistry } from "../aurora/registry";
import type { RefClass } from "../aurora/rulesCheck";
import { moveAndCompare, type MoveResult } from "./migrateReport";
import { loadContentSet, loadTestContent } from "./testContent";

const CACHE = process.env.SOULFORGE_RULES;

// What the move changes on each sheet. Empty: the sheet is the same after the move.
const CASES: Record<string, string[]> = {
  // A 2014 background under the 2024 rules: "+1 to three scores" is those three, not the first three with a gap.
  "creation-bard": [],
  "shadow-sorcerer": [],
  "fathomless-warlock": [],
  "fiend-warlock": [],
  "great-old-one-warlock": [],
  // The Half-Elf's two increases are its own: Ritual Caster's Intelligence took the place of Constitution.
  "cavalier-fighter": [],
  // The Orc's two languages are the two it had: Vedalken was pushed out by Celestial.
  "warlock-20-2024": [],
  // The Armorer's armor model (Infiltrator: +5 feet) has a choice to go to.
  "armorer-artificer-20": [],
  // Circle Forms' Armor Class counts in Wild Shape only.
  "moon-druid-20": [],
  // 5e.tools is right: the Mark of Healing lets its bearer cast these; Aurora's copy gave nothing.
  "four-elements-monk": ["spells: lost [] gained [cure wounds, lesser restoration]"],
  "folk-hero-warlock": ["spells: lost [] gained [cure wounds, lesser restoration]"],
};

describe.skipIf(!CACHE)("the characters the move changed", () => {
  let both: ARegistry, five: ARegistry, ref: RefClass[];
  const moved = (name: string): MoveResult => {
    both ??= loadTestContent(CACHE!);
    five ??= loadContentSet(CACHE!, "5etools");
    ref ??= existsSync(join(CACHE!, "rules-ref.json"))
      ? (JSON.parse(readFileSync(join(CACHE!, "rules-ref.json"), "utf8")) as RefClass[])
      : [];
    const ch = normalizeCharacter(JSON.parse(readFileSync(join("fixtures/move", `${name}.json`), "utf8")) as never);
    return moveAndCompare(ch, both, five, ref);
  };
  it.each(Object.keys(CASES))(
    "%s",
    (name) => {
      expect(moved(name).changed).toEqual(CASES[name]);
    },
    600_000,
  );
});
