/**
 * Multiclass spellcasting audit (C7.19, Chris 2026-10-29): every pair of caster classes, 2014 and 2024 rules, at
 * several level splits (the Eldritch Knight and Arcane Trickster included), checked against the class tables: the
 * shared slots of the multiclass table, pact slots, cantrips, and each class's own spells known or prepared.
 * SOULFORGE_RULES=<folder>.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { newCharacter, type Character } from "./character";
import { resolve } from "./engine";
import { autoFill } from "./autofill";
import { buildSheet } from "./sheet";
import { checkCharacter, type RefClass } from "./rulesCheck";
import { loadTestContent } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;
const SPELL_RULES = /spell slots|pact magic|cantrips known|spells known|prepared spells|too few spells/i;

describe.skipIf(!C)("multiclass spellcasting", () => {
  const reg = C ? loadTestContent(C) : undefined!;
  const ref: RefClass[] = C ? JSON.parse(readFileSync(join(C, "rules-ref.json"), "utf8")) : [];
  const CASTERS: [string, string?][] = [
    ["Bard"], ["Cleric"], ["Druid"], ["Sorcerer"], ["Wizard"], ["Warlock"], ["Paladin"], ["Ranger"],
    ["Fighter", "Eldritch Knight"], ["Rogue", "Arcane Trickster"],
  ];
  const ids = (prefix: string) => CASTERS.map(([cls, sub]) => ({ cls: reg.ofType("Class").find((c) => c.name === cls && c.id.startsWith(prefix)), sub }))
    .filter((x) => x.cls).concat(prefix === "ID_WOTC_PHB_" ? [{ cls: reg.get("ID_WOTC_TCOE_CLASS_ARTIFICER"), sub: undefined }] : []);
  const withSub = (ch: Character, subName?: string) => {
    if (!subName) return ch;
    for (let i = 0; i < 2; i++) {
      const r = resolve(ch, reg);
      const s = r.slots.find((x) => x.rule.type === "Archetype" && x.chosen.length < x.rule.number && x.options.some((o) => o.name === subName));
      if (!s) break;
      ch = { ...ch, selections: { ...ch.selections, [s.key]: [s.options.find((o) => o.name === subName)!.id] } };
    }
    return ch;
  };

  for (const edition of ["ID_WOTC_PHB_", "ID_WOTC_PHB24_"]) {
    it(`agrees with the class tables (${edition === "ID_WOTC_PHB_" ? "2014" : "2024"})`, () => {
      const list = ids(edition);
      const bad: string[] = [];
      let n = 0;
      let multi = 0;
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) for (const [a, b] of [[3, 2], [5, 4], [9, 7]]) {
        let ch = newCharacter();
        ch.classes = [{ classId: list[i].cls!.id, level: a }, { classId: list[j].cls!.id, level: b }];
        for (const k of ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const) ch.abilityBase[k] = 14;
        ch = withSub(withSub(ch, list[i].sub), list[j].sub);
        ch = autoFill(ch, reg, () => 0.5);
        ch = withSub(withSub(ch, list[i].sub), list[j].sub);
        const r = resolve(ch, reg);
        const sh = buildSheet(r);
        if (sh.casting.length >= 2) multi++;
        const found = checkCharacter(r, sh, ref).filter((f) => SPELL_RULES.test(f.rule));
        n++;
        for (const f of found) bad.push(`${list[i].cls!.name}${list[i].sub ? ` (${list[i].sub})` : ""} ${a} / ${list[j].cls!.name}${list[j].sub ? ` (${list[j].sub})` : ""} ${b}: ${f.rule}: ${f.detail}`);
      }
      expect(n).toBeGreaterThan(80);
      // Not a pass by default: most pairs really are two casters at once.
      expect(multi).toBeGreaterThan(n * 0.6);
      expect(bad).toEqual([]);
    }, 1800000);
  }
});
