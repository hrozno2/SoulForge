/**
 * The move keeps each spell in a choice that offers it (docs/ENGINE-LEGAL-PLAN.md, section 4, rule 4). Found
 * 2026-11-17 on a player's library: a 2024 Evoker's Evocation Savant held Chromatic Orb and Thunderwave; moved, its
 * places took Enlarge/Reduce and Arcane Vigor (a transmutation and an abjuration spell, from the spellbook), because a
 * spell the casting could cast was let into any of the casting's choices whose level did not offer it yet, whatever
 * else the choice asked. Needs the test cache (SOULFORGE_RULES).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeCharacter } from "../aurora/character";
import type { RefClass } from "../aurora/rulesCheck";
import { moveAndCompare } from "./migrateReport";
import { loadContentSet, loadTestContent } from "./testContent";

const CACHE = process.env.SOULFORGE_RULES;

describe.skipIf(!CACHE)("spells moved to 5e.tools stay in a choice that offers them", () => {
  it("a 2024 Evoker keeps its Evocation Savant spells", () => {
    const both = loadTestContent(CACHE!);
    const five = loadContentSet(CACHE!, "5etools");
    const ref: RefClass[] = existsSync(join(CACHE!, "rules-ref.json"))
      ? JSON.parse(readFileSync(join(CACHE!, "rules-ref.json"), "utf8"))
      : [];
    const ch = normalizeCharacter(JSON.parse(readFileSync(join(__dirname, "fixtures/evoker-2024.json"), "utf8")));
    const r = moveAndCompare(ch, both, five, ref);
    expect(r.rules).toEqual([]);
    expect(r.changed).toEqual([]);
  }, 600000);

  // A 2014 Fiend warlock 20 (saved run, 2026-10-16): moved, its Mystic Arcanum's Circle of Death became Spirit of
  // Death, because "circle" is a word the near-name match ignores (for Circle Spells) and Spirit of Death was the one
  // option with "death"; and Ray of Enfeeblement took the 6th-level arcanum choice, a level the spell is below.
  // And a saved Warlock 20 (2026-10-13) whose Suggestion became Mass Suggestion: "suggestion" is inside the other
  // spell's name. A spell's near name never makes another spell.
  it.each(["fiend-warlock-2014", "warlock-suggestion-2014", "war-cleric-2024", "bard-sorcerer"])(
    "%s keeps its spells",
    (file) => {
      const both = loadTestContent(CACHE!);
      const five = loadContentSet(CACHE!, "5etools");
      const ref: RefClass[] = existsSync(join(CACHE!, "rules-ref.json"))
        ? JSON.parse(readFileSync(join(CACHE!, "rules-ref.json"), "utf8"))
        : [];
      const ch = normalizeCharacter(JSON.parse(readFileSync(join(__dirname, `fixtures/${file}.json`), "utf8")));
      const r = moveAndCompare(ch, both, five, ref);
      // Content 5e.tools has no version of (a playtest spell) is unavailable, not dropped; the player's own decisions
      // ("kept as built") are not the move's findings.
      expect(r.dropped.filter((x) => !/no 5e\.tools version/.test(x))).toEqual([]);
      expect(r.changed).toEqual([]);
      expect(r.rules.filter((x) => /\(new\)$/.test(x))).toEqual([]);
    },
    600000,
  );
});
