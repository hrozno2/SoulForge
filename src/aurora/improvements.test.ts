/** The check-box grid model (A1.9) on the real content: SOULFORGE_RULES=<test content folder>. */
import { describe, expect, it } from "vitest";
import { newCharacter, type Character } from "./character";
import { resolve } from "./engine";
import { findGrids, tickBox } from "./improvements";
import { loadTestContent } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;

describe.skipIf(!C)("ability score increase grids", () => {
  const reg = C ? loadTestContent(C) : undefined!;
  const base = (f: (c: Character) => void) => { const ch = newCharacter(); ch.classes = [{ classId: "ID_WOTC_PHB24_CLASS_FIGHTER", level: 1 }]; f(ch); return ch; };
  const pickMode = (ch: Character, label: RegExp) => {
    const g = findGrids(resolve(ch, reg), resolve(ch, reg).slots).find((x) => x.modes.some((m) => label.test(m.label)))!;
    const m = g.modes.find((x) => label.test(x.label))!;
    return { ch: { ...ch, selections: { ...ch.selections, [g.modeKey!]: [m.optionId!] } }, mode: m };
  };

  it("gives the 2024 Ability Score Improvement feat a +2 column and a +1 +1 mode", () => {
    const ch = base((c) => { c.extras = ["ID_WOTC_PHB24_FEAT_ABILITY_SCORE_IMPROVEMENT"]; });
    const before = resolve(ch, reg).stats.get("strength");
    const { ch: c2, mode } = pickMode(ch, /^\+2 to one/);
    const c3 = { ...c2, selections: { ...c2.selections, ...tickBox(c2, mode, 0, 0, "strength") } };
    expect(resolve(c3, reg).stats.get("strength")).toBe(before + 2);
  }, 600000);

  it("makes one grid of a 5e.tools background's +2 and +1 choices, with different abilities", () => {
    const ch = base((c) => { c.race = "ID_WOTC_PHB24_RACE_DRAGONBORN"; c.background = "ID_5ET_BG_RHW_MIST_WANDERER"; });
    const r = resolve(ch, reg);
    const g = findGrids(r, r.slots.filter((s) => s.root === "background"));
    const grid = g.find((x) => x.modes[0]?.columns.length === 2);
    expect(grid?.modes[0].columns.map((c) => c.amount)).toEqual([2, 1]);
    const m = grid!.modes[0];
    let c2 = { ...ch, selections: { ...ch.selections, ...tickBox(ch, m, 0, 0, [...m.columns[0].options.keys()][0]) } };
    // The same ability in the +1 column moves it out of the +2 column.
    c2 = { ...c2, selections: { ...c2.selections, ...tickBox(c2, m, 1, 0, [...m.columns[0].options.keys()][0]) } };
    expect(c2.selections[m.columns[0].key]).toEqual([]);
  }, 600000);

  it("draws the Aurora 2024 Sage's and the Custom Background's increases as grids", () => {
    const sage = resolve(base((c) => { c.background = "ID_WOTC_PHB24_BACKGROUND_SAGE"; }), reg);
    expect(findGrids(sage, sage.slots).some((g) => g.modes.length >= 2)).toBe(true);
    const custom = resolve(base((c) => { c.background = "ID_WOTC_DMG24_BACKGROUND_CUSTOM"; }), reg);
    expect(findGrids(custom, custom.slots).some((g) => g.sets && g.sets.options.length >= 10)).toBe(true);
  }, 600000);
});
