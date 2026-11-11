/**
 * Skills and saving throws on the bundled SRD content. Until 2026-11-11 the rules check judged neither, and on
 * 5e.tools content expertise could be taken in a skill the character was not proficient in (130 of 500 random
 * characters had it; the skill then counted as plain proficiency).
 */
import { describe, expect, it } from "vitest";
import { loadContentSet } from "../engine/testContent";
import { newCharacter, type Character } from "./character";
import { resolve } from "./engine";
import { checkCharacter } from "./rulesCheck";
import { buildSheet } from "./sheet";

const reg = loadContentSet("", "srd");
const cls = (name: string, year: string) => reg.ofType("Class").find((x) => x.name === name && x.source.includes(year))!;

describe("expertise needs the proficiency", () => {
  for (const year of ["2014", "2024"]) {
    it(`a ${year} Rogue is offered expertise only in skills it is proficient in`, () => {
      const rogue = cls("Rogue", year);
      let ch: Character = { ...newCharacter(), classes: [{ classId: rogue.id, level: 1 }] };
      let r = resolve(ch, reg);
      const skills = r.slots.find((s) => s.owner.id === rogue.id && /skill/i.test(s.rule.name) && s.rule.number >= 4)!;
      const picked = skills.options.filter((o) => !skills.blocked.has(o.id)).slice(0, skills.rule.number).map((o) => o.id);
      ch = { ...ch, selections: { ...ch.selections, [skills.key]: picked } };
      r = resolve(ch, reg);
      // The 2014 Rogue first chooses between two skills, or one skill and thieves' tools.
      const sets = r.slots.find((s) => s.rule.type === "Training Option" && /expertise/i.test(s.rule.name));
      if (sets) { ch = { ...ch, selections: { ...ch.selections, [sets.key]: [sets.options[0].id] } }; r = resolve(ch, reg); }
      const expertise = r.slots.find((s) => s.rule.supports.includes("5et expertise"))!;
      expect(expertise, "the Rogue's expertise choice").toBeTruthy();
      const open = expertise.options.filter((o) => !expertise.blocked.has(o.id)).map((o) => o.name.replace(/ \(expertise\)$/i, "").toLowerCase()).sort();
      const have = picked.map((id) => reg.get(id)!.name.toLowerCase()).sort();
      // Exactly the skills picked (a Rogue has no other skill here: no species or background).
      expect(open).toEqual(have);
      expect(expertise.whyBlocked?.(expertise.options.find((o) => expertise.blocked.has(o.id))!.id)).toMatch(/Needs/);
    });
  }
});

// The bundle dropped every side-data entry (5e.tools' "foundry" files carry no SRD mark of their own), and with them
// the Expertise choice of every class that has one.
describe("the bundled rules keep what 5e.tools states as side data", () => {
  it("every Expertise feature offers its choice", () => {
    const features = reg.all().filter((e) => e.type === "Class Feature" && e.name === "Expertise");
    expect(features.length).toBeGreaterThanOrEqual(8);
    const without = features.filter((e) => !e.rules.some((r) => r.kind === "select")).map((e) => e.id);
    expect(without).toEqual([]);
  });
});

describe("the rules check judges skill and save bonuses itself", () => {
  const fighter = cls("Fighter", "2014");
  const r = resolve({ ...newCharacter(), classes: [{ classId: fighter.id, level: 5 }], abilityMethod: "manual", abilityBase: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 8, charisma: 10 } }, reg);
  const sheet = buildSheet(r);
  const rules = (sh: typeof sheet) => checkCharacter(r, sh, []).map((f) => f.rule);

  it("a sound sheet has no such finding", () => {
    expect(rules(sheet).filter((x) => /Skill bonus|Saving throw|Expertise/.test(x))).toEqual([]);
    // Strength and Constitution saves are the Fighter's: modifier plus 3.
    expect(sheet.abilities.find((a) => a.id === "strength")!.save).toBe(6);
    expect(sheet.abilities.find((a) => a.id === "wisdom")!.save).toBe(-1);
  });

  it("a skill or a save that is off by one is named", () => {
    const skills = sheet.skills.map((k) => (k.name === "athletics" ? { ...k, bonus: k.bonus + 1 } : k));
    expect(rules({ ...sheet, skills })).toContain("Skill bonus");
    const abilities = sheet.abilities.map((a) => (a.id === "wisdom" ? { ...a, save: a.save + 3 } : a));
    expect(rules({ ...sheet, abilities })).toContain("Saving throw bonus");
  });
});
