/**
 * Soul Forge additions (additions.ts): what a book's text gives and 5e.tools' data does not, built as elements of the
 * source "Soul Forge additions" (W10, Chris 2026-11-17).
 */
import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { ADDITIONS_SOURCE, soulForgeAdditions } from "./additions";
import type { AElement, ARule } from "./types";
import { loadContentSet } from "../engine/testContent";

const el = (id: string, type: string, rules: ARule[]): AElement => ({
  id,
  name: id,
  type,
  source: "Sword Coast Adventurer's Guide",
  supports: [],
  description: "",
  compendiumHidden: false,
  setters: {},
  rules,
});

describe("Soul Forge additions", () => {
  it("a half-elf descent takes one variant feature, not the skills and every feature together", () => {
    const D = "ID_5ET_SUBRACE_SCAG_HALF_ELF_VARIANT_DROW_DESCENT";
    const byId = new Map<string, AElement>([
      [
        "ID_5ET_RACE_PHB_HALF_ELF",
        el("ID_5ET_RACE_PHB_HALF_ELF", "Race", [
          { kind: "select", type: "Proficiency", name: "Half-Elf skill", supports: "5et skill", number: 2 },
        ]),
      ],
      [
        D,
        el(D, "Sub Race", [
          { kind: "select", type: "Proficiency", name: "Variant; Drow Descent skill", supports: "5et skill", number: 2 },
          { kind: "grant", type: "Spell", id: "ID_5ET_SPELL_XPHB_DANCING_LIGHTS", level: 1, spellcasting: "Variant; Drow Descent" },
        ]),
      ],
    ]);
    expect(soulForgeAdditions(byId)).toBe(1);
    const sub = byId.get(D)!;
    // The descent itself keeps neither; it grants the addition, which asks one of the two.
    expect(sub.rules.map((r) => r.kind)).toEqual(["grant"]);
    const add = byId.get((sub.rules[0] as { id: string }).id)!;
    expect(add.source).toBe(ADDITIONS_SOURCE);
    const choice = add.rules[0] as { supports: string; number: number };
    expect(choice.number).toBe(1);
    const opts = choice.supports.split("|").map((id) => byId.get(id)!);
    expect(opts.map((o) => o.name)).toEqual(["Skill Versatility", "Drow Magic"]);
    expect(opts[1].rules).toEqual([expect.objectContaining({ id: "ID_5ET_SPELL_XPHB_DANCING_LIGHTS" })]);
    // The parent's own Skill Versatility steps aside for the descent.
    expect(byId.get("ID_5ET_RACE_PHB_HALF_ELF")!.rules[0].requirements).toContain(`!${D}`);
    expect(byId.has("ID_SF_SOURCE_ADDITIONS")).toBe(true);
  });

  it("does nothing when the target is not loaded", () => {
    expect(soulForgeAdditions(new Map())).toBe(0);
  });
});

const C = process.env.SOULFORGE_RULES;
describe.skipIf(!C)("Soul Forge additions on 5e.tools content", () => {
  const reg = C ? loadContentSet(C, "5etools") : undefined!;
  const slotsOf = (race: string, sub?: string, sel: Record<string, string[]> = {}) => {
    const ch = { ...newCharacter(), race, subrace: sub, classes: [{ classId: "ID_5ET_CLASS_PHB_FIGHTER", level: 1 }], selections: sel };
    return resolve(ch as never, reg);
  };
  it("a Dhampir chooses two skills", () => {
    const r = slotsOf("ID_5ET_RACE_VRGR_DHAMPIR");
    expect(r.slots.some((s) => s.rule.name === "Ancestral Legacy skill" && s.rule.number === 2)).toBe(true);
  });
  it("an Aquatic Elf Descent half-elf chooses Skill Versatility or a swimming speed", () => {
    const sub = "ID_5ET_SUBRACE_SCAG_HALF_ELF_VARIANT_AQUATIC_ELF_DESCENT";
    const r = slotsOf("ID_5ET_RACE_PHB_HALF_ELF");
    const pick = r.slots.find((s) => /Sub Race/.test(s.rule.type));
    expect(pick).toBeDefined();
    const r2 = slotsOf("ID_5ET_RACE_PHB_HALF_ELF", undefined, { [pick!.key]: [sub] });
    const choice = r2.slots.find((s) => s.rule.name === "Variant feature (choose 1)");
    expect(choice?.options.map((o) => o.name).sort()).toEqual(["Skill Versatility", "Swim"]);
    // And the Half-Elf's own two skills are not asked besides.
    expect(r2.slots.some((s) => s.rule.name === "Half-Elf skill")).toBe(false);
    const swim = choice!.options.find((o) => o.name === "Swim")!;
    const r3 = slotsOf("ID_5ET_RACE_PHB_HALF_ELF", undefined, { [pick!.key]: [sub], [choice!.key]: [swim.id] });
    expect(r3.stats.get("innate speed:swim")).toBe(30);
  });
});

describe.skipIf(!C)("companions 5e.tools alone gives", () => {
  const reg = C ? loadContentSet(C, "5etools") : undefined!;
  const withSub = (classId: string, level: number, sub: RegExp, int = 10) => {
    let ch = { ...newCharacter(), classes: [{ classId, level }] };
    ch.abilityBase = { ...ch.abilityBase, intelligence: int };
    const slot = resolve(ch, reg).slots.find((s) => s.rule.type === "Archetype")!;
    ch = { ...ch, selections: { [slot.key]: [slot.options.find((o) => sub.test(o.name))!.id] } };
    return resolve(ch, reg);
  };
  it("an Echo Knight's echo: AC 14 + proficiency bonus, 1 hit point", async () => {
    const { formStats } = await import("./forms");
    const r = withSub("ID_5ET_CLASS_PHB_FIGHTER", 3, /^echo knight$/i);
    const echo = r.active.find((a) => a.el.type === "Companion")?.el;
    expect(echo?.name).toBe("Echo");
    expect(echo?.source).toBe(ADDITIONS_SOURCE);
    const b = formStats(r, echo!, "companion");
    expect([b.ac, b.hp]).toEqual([16, 1]);
  });
  it("a 2024-rules Battle Smith's Steel Defender: AC 12 + Intelligence, hit points 5 + 5 per level", async () => {
    const { formStats } = await import("./forms");
    const smith = reg.ofType("Class").find((c) => c.name === "Artificer" && /Forge of the Artificer/.test(c.source));
    if (!smith) return;
    const r = withSub(smith.id, 5, /^battle smith$/i, 16);
    const sd = r.active.find((a) => a.el.type === "Companion")?.el;
    expect(sd?.name).toBe("Steel Defender");
    const b = formStats(r, sd!, "companion");
    expect([b.ac, b.hp]).toEqual([15, 30]);
  });
});
