/**
 * Foundry round trip (A2.4): random characters exported to a Foundry actor and imported back keep their class,
 * subclass, species, background, feats, spells, items and scores: SOULFORGE_RULES=<test content folder>.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "./engine";
import { randomCharacter } from "./randomCharacter";
import { exportFoundry } from "./exportForeign";
import { importForeignCharacter } from "./foreign";
import { loadTestContent } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;

describe.skipIf(!C)("Foundry round trip", () => {
  it("keeps what the character is made of, and adds nothing", () => {
    const reg = loadTestContent(C!);
    const filters = { legacy: true, playtest: false, unusual: false, scifi: false };
    let seed = 11;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const lost: string[] = [];
    const names = (r: ReturnType<typeof resolve>, types: RegExp) => new Set(r.active.filter((a) => types.test(a.el.type)).map((a) => a.el.name.toLowerCase()));
    for (let i = 0; i < 24; i++) {
      const ch = randomCharacter(reg, 1 + Math.floor(rng() * 19), filters, rng, { randomGear: true });
      const a = resolve(ch, reg);
      const actor = exportFoundry(a) as { items: { type: string; name: string; system: { school?: string } }[] };
      // dnd5e's school keys only (transmutation is "trs", not "tra").
      for (const it of actor.items) if (it.type === "spell" && !["abj", "con", "div", "enc", "evo", "ill", "nec", "trs"].includes(it.system.school ?? "")) lost.push(`${i}: spell ${it.name} school "${it.system.school}"`);
      const b = resolve(importForeignCharacter(JSON.parse(JSON.stringify(actor)), reg).character, reg);
      const who = `${i} ${a.reg.get(ch.classes[0].classId)?.name} ${ch.classes[0].level}`;
      for (const [label, re] of [["class", /^Class$/], ["subclass", /^Archetype$/], ["species", /^(Race|Sub Race)$/], ["background", /^Background$/], ["feat", /^Feat$/], ["spell", /^Spell$/]] as const) {
        const want = names(a, re), got = names(b, re);
        for (const n of want) if (!got.has(n)) lost.push(`${who}: ${label} ${n}`);
        for (const n of got) if (!want.has(n)) lost.push(`${who}: extra ${label} ${n}`);
      }
      for (const ab of ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]) if (a.stats.get(ab) !== b.stats.get(ab)) lost.push(`${who}: ${ab} ${a.stats.get(ab)} -> ${b.stats.get(ab)}`);
      const items = (r: typeof a) => r.character.inventory.length;
      if (items(b) < items(a)) lost.push(`${who}: items ${items(a)} -> ${items(b)}`);
    }
    console.log(`ROUNDTRIP lost ${lost.length}\n${lost.join("\n")}`);
    expect(lost).toEqual([]);
  }, 1800000);
});
