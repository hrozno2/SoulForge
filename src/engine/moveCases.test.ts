/**
 * D6: the saved characters whose sheets still changed when moved to 5e.tools ids, each compared choice by choice on
 * 2026-11-28 (fixtures/move, copies of test-cache characters). Each names what the move may change and why; anything
 * else is a fault of the move. Needs the content cache (SOULFORGE_RULES).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyMoveDecision, normalizeCharacter } from "../aurora/character";
import { resolve } from "../aurora/engine";
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
  const languages = (r: ReturnType<typeof resolve>) =>
    [...new Set(r.active.filter((a) => a.el.type === "Language").map((a) => a.el.name))].sort();

  // Chris 2026-11-28: where the moved character is not rules legal, the move asks and never decides. A 2024 Orc built
  // with Aurora's customized languages had three and no Common; 5e.tools gives Common and two picks, and the third
  // was kept as a manual addition: four, one more than the rules give. The player says which one goes.
  it.each(["orc-companion-2", "orc-companion-4", "orc-companion-5"])(
    "%s: one language too many is the player's to drop",
    (name) => {
      const m = moved(name);
      expect(m.changed).toEqual(["languages: lost [] gained [common]"]);
      const drop = m.migration.decisions.filter((d) => d.kind === "drop");
      expect(drop).toHaveLength(1);
      const before = languages(resolve(m.migration.ch, five));
      expect(before).toContain("Common");
      const options = drop[0].options!.map((id) => five.get(id)!.name);
      // Common is the 2024 species' own and stays; what the player picked is what can go.
      expect(options).not.toContain("Common");
      expect(options.length).toBeGreaterThanOrEqual(3);
      for (const o of options) expect(before).toContain(o);
      const after = applyMoveDecision(m.migration.ch, drop[0], drop[0].options![0]);
      expect(languages(resolve(after, five))).toEqual(before.filter((n) => n !== options[0]));
      expect(after.moveDecisions ?? []).toEqual((m.migration.ch.moveDecisions ?? []).filter((d) => d !== drop[0] && d.kind !== "drop"));
    },
    600_000,
  );

  // A feat with no 5e.tools version (Medic, from a playtest): its place is left open with the list of what can take
  // it, not filled for the player (it was filled with +2 Dexterity).
  it("cleric-sorcerer-medic: a pick with no 5e.tools version leaves its place open for the player", () => {
    const m = moved("cleric-sorcerer-medic");
    const open = m.migration.decisions.filter((d) => d.kind === "open");
    expect(open.map((d) => d.what)).toEqual(["Medic"]);
    const r = resolve(m.migration.ch, five);
    const slot = r.slots.find((x) => x.key === open[0].key)!;
    expect(slot.rule.type).toBe("Feat");
    expect(slot.chosen).toEqual([]);
    expect(slot.options.length).toBeGreaterThan(20);
    // Nothing the player did not choose: Dexterity stays, and what Medic gave is what is missing until they pick.
    expect(m.changed).toEqual(["scores: [12,12,14,8,17,14] -> [12,12,14,8,16,14]", expect.stringMatching(/^skills: /)]);
    const pick = slot.options.find((o) => !slot.blocked.has(o.id))!;
    const after = applyMoveDecision(m.migration.ch, open[0], pick.id);
    expect(resolve(after, five).slots.find((x) => x.key === open[0].key)!.chosen).toEqual([pick.id]);
    expect((after.moveDecisions ?? []).some((d) => d.kind === "open")).toBe(false);
  }, 600_000);

  it.each(Object.keys(CASES))(
    "%s",
    (name) => {
      expect(moved(name).changed).toEqual(CASES[name]);
    },
    600_000,
  );
});
