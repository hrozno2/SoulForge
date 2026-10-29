/**
 * Which choices can be turned down (C7.5). A variant's own choices are required once the variant is taken; the
 * Armorer's Armor Model is required though the content marks it optional. SOULFORGE_RULES for the content part.
 */
import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import { resolve, skippable, stillToChoose } from "./engine";
import { loadTestContent } from "../engine/testContent";

describe("skippable", () => {
  it("lets a variant be turned down, but not what a taken variant asks for", () => {
    expect(skippable({ name: "Variant Feature" })).toBe(true);
    expect(skippable({ name: "Feat (Human Variant)" }, { type: "Race Variant" })).toBe(false);
    expect(skippable({ name: "Variant Noble (Knight) language" }, { type: "Background Variant" })).toBe(false);
    expect(skippable({ name: "Anything", optional: true }, { type: "Race Variant" })).toBe(true);
  });
});

const C = process.env.SOULFORGE_RULES;
describe.skipIf(!C)("optional choices in the content", () => {
  const reg = C ? loadTestContent(C) : undefined!;

  it("asks a Variant Human for its increase, skill and feat", () => {
    const ch = newCharacter(); ch.race = "ID_RACE_HUMAN"; ch.classes = [{ classId: "ID_WOTC_PHB_CLASS_FIGHTER", level: 1 }];
    let r = resolve(ch, reg);
    const v = r.slots.find((s) => s.rule.type === "Race Variant")!;
    ch.selections[v.key] = [v.options.find((o) => /variant/i.test(o.name))!.id];
    ch.taken = [v.key];
    r = resolve(ch, reg);
    const own = r.slots.filter((s) => s.owner.type === "Race Variant");
    expect(own.length).toBeGreaterThanOrEqual(3);
    for (const s of own) { expect(s.declined, s.rule.name).toBeFalsy(); expect(stillToChoose(s), s.rule.name).toBe(true); }
  }, 600000);

  it("requires the Armorer's Armor Model", () => {
    const bad = reg.all().flatMap((e) => e.rules.filter((r) => r.kind === "select" && /armor model/i.test(r.name) && r.optional).map((r) => `${e.id}: ${r.name}`));
    expect(bad).toEqual([]);
  }, 600000);
});
