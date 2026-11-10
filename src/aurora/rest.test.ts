import { describe, expect, it } from "vitest";
import { newCharacter, type Character, type PlayState } from "./character";
import { hitDiceLeft, hitDicePools, hitDiceSpent, longRest, restoreSlots, shortRest, spendHitDie, withSlotUsed } from "./rest";
import type { CastingLine, SheetData } from "./sheet";

const line = (name: string, levels: number[], pactLevel?: number): CastingLine => ({
  name, ability: "charisma", dc: 13, attack: 5, prepare: false, prepareMax: 0, pactLevel,
  slots: levels.map((level) => ({ level, total: 2, used: 0, pact: !!pactLevel })),
  cantripsKnown: [], spells: [], granted: [], maxSpellLevel: Math.max(...levels),
});
const sheetOf = (o: Partial<SheetData>): SheetData => ({ hp: 30, level: 5, hitDice: [], casting: [], features: [], ...o }) as SheetData;
const withPlay = (play: Partial<PlayState>): Character => { const c = newCharacter(); return { ...c, play: { ...c.play, ...play } }; };

// Fighter 3 / Wizard 2.
const mixed = sheetOf({ hitDice: [{ die: 10, count: 3, classId: "F", name: "Fighter" }, { die: 6, count: 2, classId: "W", name: "Wizard" }] });
// Warlock 3 / Wizard 3: Pact Magic slots of 2nd level beside the Wizard's 1st and 2nd.
const pactAndBook = sheetOf({ casting: [line("Warlock", [2], 2), line("Wizard", [1, 2])] });

describe("hit dice by size (the audit's R3)", () => {
  const pools = hitDicePools(mixed);

  it("a multiclass character has a pool per die, largest first", () => {
    expect(pools).toEqual([{ die: 10, total: 3 }, { die: 6, total: 2 }]);
  });

  it("spends the die that was chosen, not always the largest", () => {
    let play = withPlay({}).play;
    play = spendHitDie(play, pools, 6);
    expect(hitDiceSpent(play, pools)).toEqual({ "10": 0, "6": 1 });
    expect(play.hitDiceUsed).toBe(1);
    play = spendHitDie(spendHitDie(play, pools, 6), pools, 6);
    // Only two d6: the third is not spent.
    expect(hitDiceLeft(play, pools)).toEqual([{ die: 10, total: 3, left: 3 }, { die: 6, total: 2, left: 0 }]);
    expect(play.hitDiceUsed).toBe(2);
  });

  it("reads an older save's single number as the largest dice first", () => {
    expect(hitDiceSpent({ hitDiceUsed: 4 }, pools)).toEqual({ "10": 3, "6": 1 });
  });
});

describe("long rest (the audit's R2)", () => {
  const spentAll = withPlay({ hitDiceUsed: 5, hp: 3, tempHp: 4, slotsUsed: { "1": 2 }, pactUsed: 2, featureUses: { x: 1 }, exhaustion: 2, concentration: "Bless", deathSaves: { success: 1, fail: 2 } });

  it("2014 rules: half the hit dice return (at least one), largest first", () => {
    const after = longRest(spentAll, mixed, "2014").play;
    expect(hitDiceSpent(after, hitDicePools(mixed))).toEqual({ "10": 1, "6": 2 });
    expect(after.hitDiceUsed).toBe(3);
    const one = sheetOf({ hitDice: [{ die: 8, count: 1, classId: "C", name: "Cleric" }] });
    expect(longRest(withPlay({ hitDiceUsed: 1 }), one, "2014").play.hitDiceUsed).toBe(0);
  });

  it("2024 rules: every hit die returns", () => {
    expect(longRest(spentAll, mixed, "2024").play.hitDiceUsed).toBe(0);
  });

  it("returns hit points, slots, uses and counters, ends forms and concentration, and eases exhaustion by one", () => {
    const ch = { ...spentAll, resources: [{ id: "a", name: "Ki", current: 0, max: 4, refresh: "short" as const }, { id: "b", name: "Charges", current: 1, max: 7, refresh: "none" as const }] };
    const after = longRest(ch, mixed, "2024");
    expect(after.play).toMatchObject({ hp: 30, tempHp: 0, slotsUsed: {}, pactUsed: 0, featureUses: {}, exhaustion: 1, deathSaves: { success: 0, fail: 0 } });
    expect(after.play.concentration).toBeUndefined();
    expect(after.resources.map((r) => r.current)).toEqual([4, 1]);
  });
});

describe("Pact Magic slots are counted apart (the audit's R1)", () => {
  it("spending a pact slot leaves the Wizard's slots of the same level alone, and the other way round", () => {
    let play = withPlay({}).play;
    play = withSlotUsed(play, { level: 2, pact: true }, 1);
    expect(play.slotsUsed).toEqual({});
    expect(play.pactUsed).toBe(1);
    play = withSlotUsed(play, { level: 2 }, 2);
    expect(play.pactUsed).toBe(1);
    expect(play.slotsUsed).toEqual({ "2": 2 });
  });

  it("a short rest returns the pact slots and nothing else's", () => {
    const after = shortRest(withPlay({ pactUsed: 2, slotsUsed: { "1": 1, "2": 2 } }), pactAndBook).play;
    expect(after.pactUsed).toBe(0);
    expect(after.slotsUsed).toEqual({ "1": 1, "2": 2 });
  });

  it("an older save of a single-class Warlock: its count under the spell level is cleared by a short rest", () => {
    const warlock = sheetOf({ casting: [line("Warlock", [2], 2)] });
    const after = shortRest(withPlay({ slotsUsed: { "2": 2 } }), warlock).play;
    expect(after.slotsUsed).toEqual({});
    expect(after.pactUsed).toBe(0);
  });

  it("a short rest returns features and counters that say so, no others", () => {
    const sheet = sheetOf({ features: [{ id: "sw", name: "Second Wind", usage: "1/Short Rest" }, { id: "rage", name: "Rage", usage: "3/Long Rest" }] as SheetData["features"] });
    const ch = { ...withPlay({ featureUses: { sw: 1, rage: 2 } }), resources: [{ id: "a", name: "Ki", current: 0, max: 4, refresh: "short" as const }, { id: "b", name: "Luck", current: 0, max: 3, refresh: "long" as const }] };
    const after = shortRest(ch, sheet);
    expect(after.play.featureUses).toEqual({ rage: 2 });
    expect(after.resources.map((r) => r.current)).toEqual([4, 0]);
    // No pact line: nothing about pact slots is written.
    expect(after.play.pactUsed).toBeUndefined();
  });

  it("restoring slots returns both kinds", () => {
    expect(restoreSlots(withPlay({ pactUsed: 1, slotsUsed: { "3": 1 } }).play)).toMatchObject({ pactUsed: 0, slotsUsed: {} });
  });
});
