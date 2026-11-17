/**
 * The rules check catches what breaks the rules (RULES_TIER=mutations; RULES_CONTENT=<set>; MUT_N characters, default
 * 60). Random characters the check finds clean are each broken in one known way, and the check must then find
 * something; a mutation it misses is a blind spot. The mutations:
 *   - a point-buy base score above the method's range;
 *   - a standard array with a number changed;
 *   - a pick added to a choice that is already full;
 *   - a required pick taken away;
 *   - a cantrip from outside the class's list put in a class cantrip choice;
 *   - heavy armor worn by a character without the training.
 * The report is <cache>/engine/mutations-<set>.md.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { Character } from "../aurora/character";
import { resolve } from "../aurora/engine";
import { randomBatch } from "../aurora/randomBatch";
import { buildSheet } from "../aurora/sheet";
import { checkCharacter, type RefClass } from "../aurora/rulesCheck";
import { loadContentSet, type ContentSet } from "./testContent";

const C = process.env.SOULFORGE_RULES;

it.skipIf(!C || process.env.RULES_TIER !== "mutations")(
  "the rules check notices each kind of break",
  () => {
    const set = (process.env.RULES_CONTENT ?? "5etools") as ContentSet;
    const reg = loadContentSet(set.startsWith("srd") ? "" : C!, set);
    const ref: RefClass[] = existsSync(join(C!, "rules-ref.json")) ? JSON.parse(readFileSync(join(C!, "rules-ref.json"), "utf8")) : [];
    let seed = Number(process.env.MUT_SEED) || 5150;
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const chars = randomBatch(reg, Number(process.env.MUT_N) || 60, { legacy: true, playtest: false, unusual: false }, rng);
    const check = (ch: Character) => {
      const r = resolve(ch, reg);
      return checkCharacter(r, buildSheet(r), ref);
    };
    const clone = (ch: Character): Character => JSON.parse(JSON.stringify(ch));
    type Mutation = { name: string; apply: (ch: Character) => Character | undefined };
    const MUTATIONS: Mutation[] = [
      {
        name: "point-buy score above its range",
        apply: (ch) => (ch.abilityMethod === "pointbuy" ? { ...clone(ch), abilityBase: { ...ch.abilityBase, strength: 17 } } : undefined),
      },
      {
        name: "standard array changed",
        apply: (ch) =>
          ch.abilityMethod === "standard"
            ? { ...clone(ch), abilityBase: { ...ch.abilityBase, strength: ch.abilityBase.strength + 1 } }
            : undefined,
      },
      {
        name: "a pick added to a full choice",
        apply: (ch) => {
          const r = resolve(ch, reg);
          const s = r.slots.find(
            (x) =>
              x.rule.type === "Proficiency" &&
              x.chosen.length === x.rule.number &&
              x.options.some((o) => !x.chosen.includes(o.id) && !r.ids.has(o.id)),
          );
          if (!s) return undefined;
          const extra = s.options.find((o) => !s.chosen.includes(o.id) && !r.ids.has(o.id))!;
          const out = clone(ch);
          out.selections[s.key] = [...s.chosen, extra.id];
          return out;
        },
      },
      {
        name: "a required pick taken away",
        apply: (ch) => {
          const r = resolve(ch, reg);
          const s = r.slots.find(
            (x) => !x.rule.optional && x.rule.type === "Proficiency" && x.chosen.length > 0 && ch.selections[x.key]?.length,
          );
          if (!s) return undefined;
          const out = clone(ch);
          out.selections[s.key] = ch.selections[s.key].slice(1);
          return out;
        },
      },
      {
        name: "a cantrip from outside the list",
        apply: (ch) => {
          const r = resolve(ch, reg);
          const s = r.slots.find(
            (x) => x.rule.type === "Spell" && /cantrip/i.test(x.rule.name) && x.chosen.length && ch.selections[x.key]?.length,
          );
          if (!s) return undefined;
          const offered = new Set(s.options.map((o) => o.id));
          const alien = reg.ofType("Spell").find((e) => e.setters.level?.value === "0" && !offered.has(e.id) && !r.ids.has(e.id));
          if (!alien) return undefined;
          const out = clone(ch);
          out.selections[s.key] = [...ch.selections[s.key].slice(1), alien.id];
          return out;
        },
      },
      {
        name: "heavy armor without the training",
        apply: (ch) => {
          const r = resolve(ch, reg);
          if (buildSheet(r).proficiencies.armor.some((a) => /heavy/i.test(a))) return undefined;
          const plate = reg.ofType("Armor").find((e) => /^plate( armor)?$/i.test(e.name));
          if (!plate) return undefined;
          const out = clone(ch);
          out.inventory = [
            ...out.inventory.map((it) => ({ ...it, equipped: false })),
            { uid: "mut", id: plate.id, qty: 1, equipped: true, attuned: false },
          ];
          return out;
        },
      },
    ];
    const tried = new Map<string, number>();
    const missed: string[] = [];
    chars.forEach((ch, i) => {
      if (check(ch).length) return; // only characters the check finds clean
      for (const m of MUTATIONS) {
        const bad = m.apply(ch);
        if (!bad) continue;
        tried.set(m.name, (tried.get(m.name) ?? 0) + 1);
        if (!check(bad).length) missed.push(`#${i} ${m.name}`);
      }
    });
    const out = [
      `# Rules check against known breaks (${set})`,
      "",
      ...[...tried].map(([n, k]) => `- ${n}: tried ${k}, missed ${missed.filter((x) => x.endsWith(n)).length}`),
      "",
      ...missed.map((x) => `- missed: ${x}`),
    ];
    mkdirSync(join(C!, "engine"), { recursive: true });
    writeFileSync(join(C!, "engine", `mutations-${set}.md`), out.join("\n"));
    expect(missed).toEqual([]);
  },
  3600000,
);
