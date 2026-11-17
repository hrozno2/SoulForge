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
});
