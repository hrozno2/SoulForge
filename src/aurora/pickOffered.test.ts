/**
 * "A pick its choice does not offer" (docs/ENGINE-LEGAL-PLAN.md, W1). A choice asked again at later levels (a
 * spellbook, spells known, cantrips) is one list to the player: the Magic tab hands picks to its places in order, so a
 * 2nd-level spell learned at 3rd level can sit in the place the 1st-level choice opened. That is within the rules as
 * long as some place of that same choice offers it. The first version judged each place alone and marked a Wizard's
 * Hold Person, Darkness and Arcane Lock (Chris, 2026-11-12, an hour after it was added).
 */
import { describe, expect, it } from "vitest";
import { newCharacter, type Character } from "./character";
import { autoFill } from "./autofill";
import { resolve } from "./engine";
import { checkCharacter } from "./rulesCheck";
import { buildSheet } from "./sheet";
import { loadContentSet } from "../engine/testContent";

describe("a pick its choice does not offer", () => {
  const reg = loadContentSet("", "srd");
  const wizard = reg.ofType("Class").find((c) => c.name === "Wizard" && c.source.includes("2014"))!;
  const base = autoFill({ ...newCharacter(), classes: [{ classId: wizard.id, level: 3 }] }, reg);
  const findings = (ch: Character) => { const r = resolve(ch, reg); return checkCharacter(r, buildSheet(r), []).filter((f) => f.rule === "A pick its choice does not offer").map((f) => f.detail); };
  const book = resolve(base, reg).slots.filter((s) => s.rule.type === "Spell" && /spellbook/i.test(s.rule.name)).sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  const spell = (level: number, not: string[]) => reg.ofType("Spell").find((e) => Number(e.setters.level?.value) === level && e.source.includes("2014") && book[book.length - 1].options.concat(reg.ofType("Spell")).some((o) => o.id === e.id) && !not.includes(e.id) && (level > 2 || book[book.length - 1].options.some((o) => o.id === e.id)))!;

  it("a character built by the app has none", () => {
    expect(findings(base)).toEqual([]);
  });

  it("a 2nd-level spell in the place the 1st-level choice opened is offered by the spellbook", () => {
    const first = book[0], second = spell(2, Object.values(base.selections).flat());
    expect(first.options.some((o) => o.id === second.id)).toBe(false);
    const ch = { ...base, selections: { ...base.selections, [first.key]: [second.id, ...first.chosen.slice(1)] } };
    expect(findings(ch)).toEqual([]);
  });

  it("a 3rd-level spell no place of a 3rd-level Wizard's spellbook offers is named", () => {
    const first = book[0], third = spell(3, []);
    const ch = { ...base, selections: { ...base.selections, [first.key]: [third.id, ...first.chosen.slice(1)] } };
    expect(findings(ch)).toEqual([`${first.rule.name}: ${third.name}`]);
  });
});
