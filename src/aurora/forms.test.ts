/** Beast forms worked out for the character (A2.6), on the real content: SOULFORGE_RULES=<test content folder>. */
import { describe, expect, it } from "vitest";
import { newCharacter, type Character } from "./character";
import { resolve } from "./engine";
import { buildSheet } from "./sheet";
import { formStats } from "./forms";
import { loadTestContent } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;

describe.skipIf(!C)("beast forms", () => {
  const reg = C ? loadTestContent(C) : undefined!;
  const bear = reg?.ofType("Companion").find((e) => e.name === "Black Bear")!;
  const druid = (cls: string, level: number, moon?: string) => {
    let ch: Character = { ...newCharacter(), abilityMethod: "manual", abilityBase: { strength: 8, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 16, charisma: 10 } };
    ch.classes = [{ classId: cls, level }];
    if (moon) {
      const r = resolve(ch, reg);
      const slot = r.slots.find((s) => s.rule.type === "Archetype")!;
      ch = { ...ch, selections: { ...ch.selections, [slot.key]: [slot.options.find((o) => o.id === moon)!.id] } };
    }
    return resolve(ch, reg);
  };

  it("2024 Moon druid: own hit points, three times the level in temporary hit points, AC 13 + Wisdom", () => {
    const r = druid("ID_WOTC_PHB24_CLASS_DRUID", 6, reg.ofType("Archetype").find((a) => /moon/i.test(a.name) && a.source.includes("2024"))!.id);
    const f = formStats(r, bear, "wild shape");
    const wis = buildSheet(r).abilities.find((a) => a.id === "wisdom")!.mod;
    expect(f.rules).toBe("2024");
    expect(f.hp).toBe(buildSheet(r).hp);
    expect(f.tempHp).toBe(18);
    expect(f.ac).toBe(Math.max(11, 13 + wis));
    expect(f.abilities.wisdom).toBe(buildSheet(r).abilities.find((a) => a.id === "wisdom")!.score);
    expect(f.abilities.strength).toBe(15);
  }, 600000);

  it("2014 druid: the beast's hit points, own Wisdom, the better save where proficient", () => {
    const r = druid("ID_WOTC_PHB_CLASS_DRUID", 4);
    const f = formStats(r, bear, "wild shape");
    const sh = buildSheet(r);
    expect(f.rules).toBe("2014");
    expect(f.hp).toBe(19);
    expect(f.tempHp).toBe(0);
    expect(f.saves.wisdom).toBe(Math.max(sh.abilities.find((a) => a.id === "wisdom")!.save, Math.floor((f.abilities.wisdom - 10) / 2)));
  }, 600000);

  it("Polymorph: the beast's statistics, mental ones too", () => {
    const f = formStats(druid("ID_WOTC_PHB24_CLASS_DRUID", 7), bear, "polymorph");
    expect(f.abilities.intelligence).toBe(2);
    expect(f.hp).toBe(19);
  }, 600000);
});
