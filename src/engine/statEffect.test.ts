/**
 * W3 (docs/ENGINE-LEGAL-PLAN.md): every statistic content writes is proved by its effect, measured rather than claimed.
 * For random characters on a content set, each statistic their active elements write is raised by 3 (a custom
 * bonus, as a player would add one) and the sheet and companion cards are built again; a name that changes nothing on
 * any character that has it is listed, with an element that writes it. RULES_TIER=stateffect, RULES_CONTENT=<set>,
 * STAT_N=<characters> (default 120). The report is <cache>/engine/stat-effect-<set>.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { resolve } from "../aurora/engine";
import { buildSheet } from "../aurora/sheet";
import { formStats } from "../aurora/forms";
import { randomBatch } from "../aurora/randomBatch";
import type { Character } from "../aurora/character";
import { loadContentSet, type ContentSet } from "./testContent";

const C = process.env.SOULFORGE_RULES;

it.skipIf(!C || process.env.RULES_TIER !== "stateffect")(
  "every statistic content writes changes something",
  () => {
    const set = (process.env.RULES_CONTENT ?? "5etools") as ContentSet;
    const reg = loadContentSet(set.startsWith("srd") ? "" : C!, set);
    let seed = 777;
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const chars = randomBatch(reg, Number(process.env.STAT_N) || 120, { legacy: true, playtest: false, unusual: false }, rng);
    const seen = new Map<string, { n: number; hit: number; by: string; on: string }>();
    const view = (ch: Character) => {
      const r = resolve(ch, reg);
      const sh = buildSheet(r);
      const pals = r.active.filter((a) => a.el.type === "Companion").map((a) => formStats(r, a.el, "companion"));
      return JSON.stringify([sh, pals]);
    };
    chars.forEach((ch, i) => {
      const r = resolve(ch, reg);
      const before = view(ch);
      const names = new Map<string, string>();
      for (const a of r.active)
        for (const rule of a.el.rules)
          if (rule.kind === "stat" && !names.has(rule.name.toLowerCase())) names.set(rule.name.toLowerCase(), a.el.name);
      for (const [name, by] of names) {
        const s = seen.get(name) ?? { n: 0, hit: 0, by, on: `#${i}` };
        s.n++;
        if (!s.hit) {
          // Raised by 3, then (a flag such as "x:spellcasting:ability:wisdom", whose presence is its effect) taken to 0.
          const try_ = (value: number) =>
            view({ ...ch, customStats: [...(ch.customStats ?? []), { id: "w3", stat: name, value }] }) !== before;
          const now = r.stats.get(name);
          if (try_(3) || (now && try_(-now))) s.hit++;
        }
        seen.set(name, s);
      }
    });
    // Effects that need a context the character may lack, each with its reason; anything else is a finding.
    const CONTEXT: [RegExp, string][] = [
      [/^multiclass:spellcasting:level$/, "the shared slot table of two or more casters"],
      [/^innate speed:(climb|fly|swim|burrow):misc$/, "a bonus to a speed the character may not have"],
      [/^\w+:max(:extra)?$/, "a raised maximum shows when a score reaches it"],
      [/^wild shape:/, "Wild Shape's limits filter the forms list in Play"],
      [/^ac:/, "another way to work out armor class, used when it is the best"],
      [/:spellcasting:slots:count$/, "Pact Magic's mark; its slots are the levels' own"],
      [
        /:spellcasting:slots:\d$/,
        'a caster\'s own slots, which the shared table replaces on a multiclass character (judged by "Spell slots")',
      ],
      [/^ranged(:[\w ]+)?:attack$/, "a bonus to ranged attacks, on a character who may carry no ranged weapon (Archery)"],
      [/:spellcasting:ability:\w+$/, "the casting ability a player chose: read by its presence (castingAbility.test.ts)"],
    ];
    const dead = [...seen].filter(([name, s]) => !s.hit && !CONTEXT.some(([re]) => re.test(name))).sort((a, b) => b[1].n - a[1].n);
    const out = [
      `# Statistics with no effect (${set}, W3)`,
      "",
      `${chars.length} random characters; ${seen.size} statistic names written by their active elements; ${dead.length} changed nothing when raised by 3.`,
      "",
      ...dead.map(([name, s]) => `- \`${name}\`: on ${s.n} characters, e.g. from ${s.by} (${s.on})`),
    ];
    mkdirSync(join(C!, "engine"), { recursive: true });
    writeFileSync(join(C!, "engine", `stat-effect-${set}.md`), out.join("\n"));
    console.log(`STATEFFECT ${set}: ${seen.size} names, ${dead.length} with no effect`);
    expect(dead.map(([name]) => name)).toEqual([]);
  },
  3600000,
);
