/** The check-box grid model (A1.9) on the real content: SOULFORGE_RULES=<test content folder>. */
import { describe, expect, it } from "vitest";
import { newCharacter, type Character } from "./character";
import { resolve } from "./engine";
import { boxesSelections, findGrids, setBoxesSelections, tickBox, tickUnified, unifiedOf, unifiedSelections } from "./improvements";
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

  it("takes a Custom Background's three abilities from the ticks, no combination picked first (C7.11)", () => {
    const ch = base((c) => { c.background = "ID_WOTC_DMG24_BACKGROUND_CUSTOM"; });
    const r = resolve(ch, reg);
    const g = findGrids(r, r.slots).find((x) => x.sets?.each?.length)!;
    expect(new Set(g.sets!.each!.flatMap((w) => [...w.abilities])).size).toBe(6);
    const before = { str: r.stats.get("strength"), wis: r.stats.get("wisdom"), cha: r.stats.get("charisma") };
    // +2 Strength, +1 Wisdom: the ticks settle a set holding both.
    const sel = setBoxesSelections(g, ["strength", "strength", "wisdom"])!;
    expect(sel).toBeDefined();
    const after = resolve({ ...ch, selections: { ...ch.selections, ...sel } }, reg);
    expect(after.stats.get("strength")).toBe(before.str + 2);
    expect(after.stats.get("wisdom")).toBe(before.wis + 1);
    expect(after.stats.get("charisma")).toBe(before.cha);
    // Three +1s anywhere among the six.
    const sel2 = setBoxesSelections(g, ["dexterity", "intelligence", "charisma"])!;
    const after2 = resolve({ ...ch, selections: { ...ch.selections, ...sel2 } }, reg);
    expect(after2.stats.get("charisma")).toBe(before.cha + 1);
  }, 600000);

  it("never shows half-feats as ways of taking a class's increase: the feats stay a list", () => {
    const ch = newCharacter();
    ch.classes = [{ classId: "ID_WOTC_PHB24_CLASS_DRUID", level: 4 }];
    const r = resolve(ch, reg);
    const asi = r.slots.find((s) => /Ability Score Improvement \(Druid 4\)/.test(s.rule.name))!;
    expect(asi, "the Druid 4 improvement").toBeTruthy();
    const grid = findGrids(r, r.slots).find((g) => g.anchor.key === asi.key);
    expect(grid?.modes.map((m) => m.label) ?? []).not.toContain("Crusher");
    expect(grid).toBeUndefined();
  }, 600000);

  it("draws the 2024-rules background increase once, not again for its inner choice (C6.1)", () => {
    let ch = newCharacter();
    ch.classes = [{ classId: "ID_WOTC_PHB_CLASS_FIGHTER", level: 1 }];
    ch.background = "ID_BACKGROUND_ACOLYTE";
    const opt = resolve(ch, reg).slots.find((s) => s.root === "background" && /2024 rules/i.test(s.rule.name))!;
    ch = { ...ch, taken: [opt.key], selections: { [opt.key]: [opt.options[0].id] } };
    let r = resolve(ch, reg);
    const combo = r.slots.find((s) => s.root === "background" && s.rule.type === "Ability Score Improvement" && s.options.length > 1)!;
    ch = { ...ch, selections: { ...ch.selections, [combo.key]: [combo.options[0].id] } };
    r = resolve(ch, reg);
    const bg = findGrids(r, r.slots).filter((g) => g.anchor.root === "background");
    expect(bg).toHaveLength(1);
  }, 600000);

  it("one grid for both ways: the ticks decide +2/+1 or +1/+1/+1 (C6.2)", () => {
    let ch = newCharacter();
    ch.classes = [{ classId: "ID_WOTC_PHB_CLASS_FIGHTER", level: 1 }];
    ch.background = "ID_BACKGROUND_ACOLYTE";
    const opt = resolve(ch, reg).slots.find((s) => s.root === "background" && /2024 rules/i.test(s.rule.name))!;
    ch = { ...ch, taken: [opt.key], selections: { [opt.key]: [opt.options[0].id] } };
    const combo = resolve(ch, reg).slots.find((s) => s.root === "background" && s.rule.type === "Ability Score Improvement" && s.options.length > 1)!;
    const strDexCon = combo.options.find((o) => /strength.*dexterity.*constitution/i.test(o.name)) ?? combo.options[0];
    ch = { ...ch, selections: { ...ch.selections, [combo.key]: [strDexCon.id] } };
    const r = resolve(ch, reg);
    const g = findGrids(r, r.slots).find((x) => x.anchor.root === "background")!;
    const u = unifiedOf(g)!;
    expect(u).toBeTruthy();
    const base = (a: "strength" | "dexterity" | "constitution") => r.stats.get(a);
    const a = resolve({ ...ch, selections: { ...ch.selections, ...unifiedSelections(u, "strength", ["dexterity"]) } }, reg);
    expect([a.stats.get("strength") - base("strength"), a.stats.get("dexterity") - base("dexterity")]).toEqual([2, 1]);
    const b = resolve({ ...ch, selections: { ...ch.selections, ...unifiedSelections(u, undefined, ["strength", "dexterity", "constitution"]) } }, reg);
    expect([b.stats.get("strength") - base("strength"), b.stats.get("dexterity") - base("dexterity"), b.stats.get("constitution") - base("constitution")]).toEqual([1, 1, 1]);
  }, 600000);

  it("ticks the same ability twice for +2 in the Ability Score Improvement feat's two +1 columns", () => {
    const feat = "ID_WOTC_PHB24_FEAT_ABILITY_SCORE_IMPROVEMENT";
    const ch = newCharacter();
    ch.classes = [{ classId: "ID_WOTC_PHB24_CLASS_FIGHTER", level: 1 }];
    ch.extras = [feat];
    const r = resolve(ch, reg);
    const g = findGrids(r, r.slots).find((x) => x.anchor.owner.id === feat)!;
    const u = unifiedOf(g)!;
    expect(u.ones).toBe(2);
    let boxes = tickUnified([undefined, undefined], 0, "wisdom", u);
    boxes = tickUnified(boxes, 1, "wisdom", u);
    const two = resolve({ ...ch, selections: { ...ch.selections, ...boxesSelections(u, boxes) } }, reg);
    expect(two.stats.get("wisdom") - r.stats.get("wisdom")).toBe(2);
    boxes = tickUnified(boxes, 1, "dexterity", u);
    const split = resolve({ ...ch, selections: { ...ch.selections, ...boxesSelections(u, boxes) } }, reg);
    expect([split.stats.get("wisdom") - r.stats.get("wisdom"), split.stats.get("dexterity") - r.stats.get("dexterity")]).toEqual([1, 1]);
  }, 600000);
});
