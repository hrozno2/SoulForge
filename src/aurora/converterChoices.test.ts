/**
 * 5e.tools choices the converter used to drop or leave open (A0.1, 2026-10-28): a language chosen from a list
 * ("choose": {"from": [...]}), and a species' subrace choice starting on the standard version. SOULFORGE_RULES=<folder>.
 */
import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { loadTestContent } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;

describe.skipIf(!C)("converted choices", () => {
  const reg = C ? loadTestContent(C) : undefined!;
  const withRace = (id: string) => { const ch = newCharacter(); ch.race = id; ch.classes = [{ classId: "ID_WOTC_PHB_CLASS_WIZARD", level: 1 }]; return resolve(ch, reg); };

  it("offers the Simic Hybrid a language from its list, any language included", () => {
    const r = withRace("ID_5ET_RACE_GGR_SIMIC_HYBRID");
    const lang = r.slots.find((s) => s.root === "race" && s.rule.type === "Language");
    expect(lang?.options.length).toBeGreaterThan(5);
  }, 600000);

  it("offers a Ravnica background a language from its own list", () => {
    const bg = reg.ofType("Background").find((b) => b.name === "Rakdos Cultist" && b.id.startsWith("ID_5ET_"));
    if (!bg) return;
    const ch = newCharacter(); ch.background = bg.id; ch.classes = [{ classId: "ID_WOTC_PHB_CLASS_WIZARD", level: 1 }];
    const lang = resolve(ch, reg).slots.find((s) => s.root === "background" && s.rule.type === "Language");
    expect(lang?.options.map((o) => o.name).sort()).toEqual(["Abyssal", "Giant"]);
  }, 600000);

  it("starts a 5e.tools Human on the standard version, with its +1s", () => {
    const r = withRace("ID_5ET_RACE_PHB_HUMAN");
    const sub = r.slots.find((s) => s.rule.type === "Sub Race")!;
    expect(sub.chosen.map((id) => reg.get(id)?.name)).toEqual(["Human (standard)"]);
    expect(r.stats.get("strength")).toBe(r.character.abilityBase.strength + 1);
  }, 600000);
});

describe.skipIf(!C)("proficiencies from feature text", () => {
  const reg = C ? loadTestContent(C) : undefined!;
  const withSub = (classId: string, level: number, sub: RegExp) => {
    let ch = newCharacter(); ch.classes = [{ classId, level }];
    const slot = resolve(ch, reg).slots.find((s) => s.rule.type === "Archetype")!;
    const pick = slot.options.find((o) => sub.test(o.name) && o.id.startsWith("ID_5ET_"))!;
    ch = { ...ch, selections: { [slot.key]: [pick.id] } };
    return resolve(ch, reg);
  };
  it.each([
    ["ID_5ET_CLASS_PHB_CLERIC", 1, /^forge domain$/i, ["ID_5ET_PROF_ARMOR_HEAVY"]],
    ["ID_5ET_CLASS_PHB_RANGER", 7, /^gloom stalker$/i, ["ID_5ET_SAVE_WISDOM"]],
    ["ID_5ET_CLASS_PHB_WIZARD", 2, /^bladesinging$/i, ["ID_5ET_PROF_ARMOR_LIGHT", "ID_5ET_SKILL_PERFORMANCE"]],
  ] as const)("%s %s %s", (classId, level, sub, ids) => {
    if (!reg.get(classId)) return;
    const r = withSub(classId, level, sub);
    for (const id of ids) expect(r.ids.has(id), id).toBe(true);
  }, 600000);
});

describe.skipIf(!C)("Plutonium effects with a signed value", () => {
  it("gives the 5e.tools Mobile feat its +10 speed", () => {
    const reg = loadTestContent(C!);
    const feat = reg.ofType("Feat").find((f) => f.name === "Mobile" && f.id.startsWith("ID_5ET_") && /2014|Player's Handbook$/.test(f.source) || (f.name === "Mobile" && f.id === "ID_5ET_FEAT_PHB_MOBILE"));
    if (!feat) return;
    const ch = newCharacter(); ch.classes = [{ classId: "ID_WOTC_PHB_CLASS_FIGHTER", level: 1 }];
    const base = resolve(ch, reg).stats.get("speed");
    expect(resolve({ ...ch, extras: [feat.id] }, reg).stats.get("speed")).toBe(base + 10);
  }, 600000);
});
