/**
 * Every ability score improvement can give +2 to one ability (A1.9), on the real content: SOULFORGE_RULES=<folder>.
 * The 2024 Ability Score Improvement feat from both providers, and a saved character's old two +1s still count.
 */
import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { loadTestContent } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;

describe.skipIf(!C)("+2 to one ability", () => {
  const reg = C ? loadTestContent(C) : undefined!;
  it("offers +2 to one ability in every choice whose text says 'by 2, or ... by 1'", () => {
    const bad: string[] = [];
    for (const el of reg.all()) {
      if (!/\bby 2,? or\b[^.]*\bby 1\b/i.test(el.description.replace(/<[^>]+>/g, " "))) continue;
      for (const r of el.rules) if (r.kind === "select" && r.type === "Ability Score Improvement" && r.number === 2) {
        const opts = reg.all().filter((e) => e.type === r.type && e.supports.length && reg.find(r.type, r.supports).includes(e));
        if (opts.length && opts.every((o) => o.rules.length === 1 && o.rules[0].kind === "stat" && (o.rules[0] as { value: string }).value === "1")) bad.push(`${el.name} [${el.id}]: ${r.name}`);
      }
    }
    expect(bad).toEqual([]);
  }, 600000);

  for (const feat of ["ID_WOTC_PHB24_FEAT_ABILITY_SCORE_IMPROVEMENT", "ID_5ET_FEAT_XPHB_ABILITY_SCORE_IMPROVEMENT"]) {
    it(`gives +2 Strength through ${feat}`, () => {
      const el = reg.get(feat);
      if (!el) return;
      const ch = newCharacter();
      ch.classes = [{ classId: "ID_WOTC_PHB24_CLASS_FIGHTER", level: 1 }];
      ch.extras = [feat];
      const r = resolve(ch, reg);
      const before = r.stats.get("strength");
      const outer = r.slots.find((s) => s.owner.id === feat)!;
      // Whichever option leads to a choice offering +2 Strength (the providers name them differently).
      const strength2 = (o: { rules: { kind: string; name?: string; value?: string }[] }) => o.rules.some((x) => x.kind === "stat" && x.name === "strength" && x.value === "2");
      let done = false;
      for (const opt of outer.options) {
        const next = { ...ch, selections: { ...ch.selections, [outer.key]: [opt.id] } };
        const inner = resolve(next, reg).slots.find((s) => s.owner.id === opt.id && s.options.some(strength2 as never));
        if (!inner) continue;
        const pick = { ...next, selections: { ...next.selections, [inner.key]: [inner.options.find(strength2 as never)!.id] } };
        expect(resolve(pick, reg).stats.get("strength")).toBe(before + 2);
        done = true;
      }
      expect(done).toBe(true);
    }, 600000);
  }

  it("keeps a saved character's two +1s", () => {
    const feat = "ID_WOTC_PHB24_FEAT_ABILITY_SCORE_IMPROVEMENT";
    const el = reg.get(feat)!;
    const ch = newCharacter();
    ch.classes = [{ classId: "ID_WOTC_PHB24_CLASS_FIGHTER", level: 1 }];
    ch.extras = [feat];
    const key = resolve(ch, reg).slots.find((s) => s.owner.id === el.id)!.key;
    const old = { ...ch, selections: { [key]: ["ID_INTERNAL_ABILITY_SCORE_IMPROVEMENT_FEAT_STRENGTH", "ID_INTERNAL_ABILITY_SCORE_IMPROVEMENT_FEAT_DEXTERITY"] } };
    const r = resolve(old, reg);
    expect(r.stats.get("strength")).toBe(resolve(ch, reg).stats.get("strength") + 1);
    expect(r.stats.get("dexterity")).toBe(resolve(ch, reg).stats.get("dexterity") + 1);
  }, 600000);
});
