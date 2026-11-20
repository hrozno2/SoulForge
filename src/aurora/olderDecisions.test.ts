/**
 * W7: tests named for rules decisions that had none of their own (docs/RULES-DECISIONS.md). On the bundled SRD, so they
 * run everywhere.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "./engine";
import { buildSheet } from "./sheet";
import { autoFill } from "./autofill";
import { newCharacter, uid } from "./character";
import { replaceable } from "../engine/replace";
import { loadContentSet } from "../engine/testContent";

const cls = (reg: ReturnType<typeof loadContentSet>, name: string) =>
  reg.ofType("Class").find((c) => c.name === name && !c.compendiumHidden)!;

describe("the 2024 level-19 feature", () => {
  // PHB 2024, every class, level 19: "an Epic Boon feat or another feat of your choice for which you qualify".
  it("offers an Epic Boon feat or another feat", () => {
    const reg = loadContentSet("", "srd-5.2");
    const r = resolve({ ...newCharacter(), classes: [{ classId: cls(reg, "Fighter").id, level: 19 }] }, reg);
    const slot = r.slots.find((s) => s.rule.type === "Feat" && s.rule.level === 19)!;
    const names = slot.options.map((o) => o.name);
    expect(names.some((n) => /^Boon of /.test(n))).toBe(true);
    expect(names).toContain("Grappler");
  });
});

describe("heavy armor without the Strength it asks", () => {
  // PHB 2014, chapter 5, Heavy Armor: "the wearer's speed is reduced by 10 feet unless the wearer has a Strength score
  // equal to or higher than the listed score".
  const reg = loadContentSet("", "srd-5.1");
  const plate =
    reg.all().find((e) => e.type === "Armor" && e.name === "Plate Armor") ??
    reg.all().find((e) => e.type === "Armor" && /^Plate/.test(e.name))!;
  const human = reg.ofType("Race").find((r) => r.name === "Human")!;
  const speedWith = (strength: number) => {
    const ch = {
      ...newCharacter(),
      race: human.id,
      classes: [{ classId: cls(reg, "Fighter").id, level: 1 }],
      inventory: [{ uid: uid(), id: plate.id, qty: 1, equipped: true, attuned: false }],
    };
    ch.abilityBase = { ...ch.abilityBase, strength };
    return buildSheet(resolve(ch, reg)).speed;
  };
  it("costs 10 feet of speed, and nothing with the Strength", () => {
    expect(plate.setters.strength?.value).toBe("15");
    expect(speedWith(8)).toBe(20);
    expect(speedWith(15)).toBe(30);
  });
});

describe("a multiclass caster's spells", () => {
  // PHB 2014 and 2024, Multiclassing, Spellcasting: "You determine what spells you know and can prepare for each class
  // individually, as if you were a single-classed member of that class." The shared table gives slots only.
  it("are each class's own level's, though the shared slots go higher", () => {
    const reg = loadContentSet("", "srd-5.2");
    const ch = autoFill(
      {
        ...newCharacter(),
        classes: [
          { classId: cls(reg, "Wizard").id, level: 3 },
          { classId: cls(reg, "Cleric").id, level: 3 },
        ],
      },
      reg,
    );
    const r = resolve(ch, reg);
    const sh = buildSheet(r);
    // Caster level 6: a 3rd-level slot.
    expect(Math.max(...sh.casting.map((c) => c.slots.filter((s) => s.total > 0).length))).toBe(3);
    const levelOf = (id: string) => Number(reg.get(id)?.setters.level?.value ?? 0);
    const picked = r.spellPicks.filter((p) => !p.granted).map((p) => levelOf(p.id));
    expect(picked.length).toBeGreaterThan(0);
    // A Wizard 3 and a Cleric 3 each reach 2nd-level spells.
    expect(Math.max(...picked)).toBe(2);
    for (const line of sh.casting) for (const id of ch.prepared[line.name] ?? []) expect(levelOf(id), line.name).toBeLessThanOrEqual(2);
  });
});

describe("what a character may replace on gaining a level", () => {
  // PHB 2014 and 2024: a known caster's Spellcasting ("replace one ... spell you know"), Eldritch Invocations,
  // Maneuvers, Metamagic; a wizard's spellbook, feats and subclasses stay as chosen.
  const slot = (type: string, name: string, supports = "") => ({ rule: { kind: "select", type, name, supports, number: 1 } }) as never;
  it("is a known spell or cantrip, an invocation, maneuver or metamagic; never a spellbook spell or a feat", () => {
    expect(replaceable(slot("Spell", "Spells Known (Sorcerer)"))).toBe(true);
    expect(replaceable(slot("Spell", "Cantrips (Bard)"))).toBe(true);
    expect(replaceable(slot("Class Feature", "Eldritch Invocation (Warlock 2)"))).toBe(true);
    expect(replaceable(slot("Class Feature", "Maneuver"))).toBe(true);
    expect(replaceable(slot("Class Feature", "Metamagic"))).toBe(true);
    expect(replaceable(slot("Spell", "Spellbook (Wizard 1)"))).toBe(false);
    expect(replaceable(slot("Feat", "Feat (Fighter 4)"))).toBe(false);
    expect(replaceable(slot("Archetype", "Martial Archetype"))).toBe(false);
  });
});
