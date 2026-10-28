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
