/**
 * Features that summon a creature give it as a companion, as Plutonium's Foundry data routes them (a "summon"
 * activity): 5e.tools' Battle Smith gets the Steel Defender, from any provider; the 2024 Beast Master chooses among its
 * Primal Companion beasts. SOULFORGE_RULES=<test content folder>.
 */
import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { loadTestContent } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;

describe.skipIf(!C)("summoned companions", () => {
  const reg = C ? loadTestContent(C) : undefined!;
  const withSub = (classId: string, level: number, sub: RegExp) => {
    let ch = newCharacter();
    ch.classes = [{ classId, level }];
    const slot = resolve(ch, reg).slots.find((s) => s.rule.type === "Archetype");
    const pick = slot?.options.find((o) => sub.test(o.name));
    if (!slot || !pick) return undefined;
    ch = { ...ch, selections: { [slot.key]: [pick.id] } };
    return resolve(ch, reg);
  };

  it("gives every Battle Smith a Steel Defender", () => {
    const smiths = reg.ofType("Class").filter((c) => c.name === "Artificer" && !/unearthed|playtest/i.test(c.source));
    expect(smiths.length).toBeGreaterThan(0);
    for (const cls of smiths) {
      const r = withSub(cls.id, 3, /^battle smith$/i);
      if (!r) continue;
      expect(r.active.some((a) => a.el.type === "Companion" && /steel defender/i.test(a.el.name)), cls.id).toBe(true);
    }
  }, 600000);

  it("lets a 5e.tools 2024 Beast Master choose among the Primal Companion beasts", () => {
    const r = withSub("ID_5ET_CLASS_XPHB_RANGER", 3, /beast master/i);
    if (!r) return;
    const slot = r.slots.find((s) => s.rule.type === "Companion" && /primal companion/i.test(s.rule.name));
    expect(slot?.options.map((o) => o.name).sort()).toEqual(["Beast of the Land", "Beast of the Sea", "Beast of the Sky"]);
  }, 600000);

  it("works out the Steel Defender for its artificer: AC 15, hit points 2 + Intelligence + 5 per level", async () => {
    const { formStats } = await import("./forms");
    let ch = newCharacter();
    ch.classes = [{ classId: "ID_WOTC_TCOE_CLASS_ARTIFICER", level: 5 }];
    ch.abilityBase = { ...ch.abilityBase, intelligence: 16 };
    const slot = resolve(ch, reg).slots.find((s) => s.rule.type === "Archetype")!;
    ch = { ...ch, selections: { [slot.key]: [slot.options.find((o) => /battle smith/i.test(o.name))!.id] } };
    const r = resolve(ch, reg);
    const sd = r.active.find((a) => a.el.type === "Companion")!.el;
    const b = formStats(r, sd, "companion");
    expect([b.ac, b.hp]).toEqual([15, 2 + 3 + 25]);
  }, 600000);

  it("reads companion formulas over the character", async () => {
    const { companionFormula } = await import("./forms");
    const ch = newCharacter();
    ch.classes = [{ classId: "ID_WOTC_PHB24_CLASS_RANGER", level: 5 }];
    ch.abilityBase = { ...ch.abilityBase, wisdom: 16 };
    const r = resolve(ch, reg);
    const land = reg.ofType("Companion").find((e) => e.name === "Beast of the Land" && /your/.test(e.setters.hp?.value ?? ""))!;
    expect(companionFormula(land.setters.ac?.value, r, land)).toBe(13 + 3);
    expect(companionFormula(land.setters.hp?.value, r, land)).toBe(5 + 25);
    const drake = reg.ofType("Companion").find((e) => e.name === "Drake Companion")!;
    expect(companionFormula(drake.setters.ac?.value, r, drake)).toBe(14 + 3);
    expect(companionFormula("13 (natural armor)", r, drake)).toBeUndefined();
  }, 600000);
});
