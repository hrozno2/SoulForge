/**
 * Hardening, the content side (Chris 2026-11-23: "harden the engine so it can handle all edge cases and doesn't break
 * on anything"). engineFuzz.test.ts damages the character; this damages the CONTENT the character is built on, as a
 * homebrew file, a half-converted book or a spoiled cache could: a feature that grants itself, two that grant each
 * other, a grant of something that does not exist, a choice of minus one or a million picks, a level that is not a
 * number, requirements that do not parse, a statistic defined by itself. Whatever the content holds, loading it,
 * building a character on it, resolving, building the sheet, checking and exporting must not throw and must not hang.
 *
 * Runs on the bundled SRD, so everywhere. CONTENT_FUZZ=<rounds> for a longer run (default 40).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openCharacter } from "../aurora/character";
import { resolve } from "../aurora/engine";
import { buildSheet } from "../aurora/sheet";
import { checkCharacter } from "../aurora/rulesCheck";
import { exportFoundry, exportRoll20 } from "../aurora/exportForeign";
import { randomCharacter } from "../aurora/randomCharacter";
import { ARegistry } from "../aurora/registry";
import { workMs } from "./fuzzKit";
import type { AElement, ARule } from "../aurora/types";

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const BUNDLE: AElement[] = ["5.1", "5.2"].flatMap(
  (v) => (JSON.parse(readFileSync(join("public", "srd", `srd-${v}.json`), "utf8")) as { elements: AElement[] }).elements,
);
/** The elements a character is made of: damage there is damage a character meets. */
const LIVE = BUNDLE.map((e, i) => (e.rules?.length && /Class|Archetype|Race|Background|Feat|Feature|Trait/.test(e.type) ? i : -1)).filter(
  (i) => i >= 0,
);

const pick = <T>(xs: readonly T[], rng: () => number): T => xs[Math.floor(rng() * xs.length)];
const BAD_TEXT = ["", "((", ")", "!", "||", "&&", "[level:abc]", "ID_DOES_NOT_EXIST", "ID_A||(ID_B&&", "x".repeat(4000), "{{", "__proto__"];
const BAD_NUMBER = [-1, 0, 1e6, 1e9, NaN, Infinity, 2.5, "3", "many", null] as unknown as number[];

type Damage = { name: string; structural?: boolean; apply: (e: AElement, all: AElement[], rng: () => number) => void };

const rule = (e: AElement, rng: () => number, kind?: ARule["kind"]): ARule | undefined => {
  const rules = (e.rules ?? []).filter((r) => !kind || r.kind === kind);
  return rules.length ? pick(rules, rng) : undefined;
};

/** What is wrong in what content says: the shape is right, the meaning is not. */
const SEMANTIC: Damage[] = [
  {
    name: "a grant of itself",
    apply: (e) => void e.rules.push({ kind: "grant", type: e.type, id: e.id }),
  },
  {
    name: "two that grant each other",
    apply: (e, all, rng) => {
      const other = all[pick(LIVE, rng)];
      e.rules.push({ kind: "grant", type: other.type, id: other.id });
      other.rules = [...other.rules, { kind: "grant", type: e.type, id: e.id }];
    },
  },
  {
    name: "a grant of something that does not exist",
    apply: (e, _all, rng) => {
      const r = rule(e, rng, "grant");
      if (r && r.kind === "grant") r.id = pick(BAD_TEXT, rng);
      else e.rules.push({ kind: "grant", type: "Class Feature", id: "ID_DOES_NOT_EXIST" });
    },
  },
  {
    name: "a level that is no level",
    apply: (e, _all, rng) => {
      const r = rule(e, rng);
      if (r) r.level = pick(BAD_NUMBER, rng);
    },
  },
  {
    name: "a choice of an impossible number",
    apply: (e, _all, rng) => {
      const r = rule(e, rng, "select");
      if (r && r.kind === "select") r.number = pick(BAD_NUMBER, rng);
      else e.rules.push({ kind: "select", type: "Feat", name: "Anything", supports: "", number: pick(BAD_NUMBER, rng) });
    },
  },
  {
    name: "a choice among nothing that parses",
    apply: (e, _all, rng) => {
      const r = rule(e, rng, "select");
      if (r && r.kind === "select") r.supports = pick(BAD_TEXT, rng);
    },
  },
  {
    name: "a choice that offers its own giver",
    apply: (e) => void e.rules.push({ kind: "select", type: e.type, name: "Itself", supports: e.id, number: 1, default: e.id }),
  },
  {
    name: "requirements that do not parse",
    apply: (e, _all, rng) => {
      const r = rule(e, rng);
      if (r && rng() < 0.6) r.requirements = pick(BAD_TEXT, rng);
      else e.requirements = pick(BAD_TEXT, rng);
    },
  },
  {
    name: "a statistic defined by itself",
    apply: (e, _all, rng) => {
      const name = pick(["ac", "hp", "strength", "speed", "initiative", "proficiency", "level", "wizard:spellcasting:dc"], rng);
      e.rules.push({ kind: "stat", name, value: name });
      e.rules.push({ kind: "stat", name: `${name}:misc`, value: name, bonus: pick(BAD_TEXT, rng) });
    },
  },
  {
    name: "a statistic of nonsense",
    apply: (e, _all, rng) => {
      const r = rule(e, rng, "stat");
      if (r && r.kind === "stat") r.value = pick([...BAD_TEXT, "NaN", "-Infinity", "1e400"], rng);
      else e.rules.push({ kind: "stat", name: "ac", value: pick(BAD_TEXT, rng) });
    },
  },
  {
    name: "a thousand grants of the same thing",
    apply: (e, all, rng) => {
      const other = all[pick(LIVE, rng)];
      for (let i = 0; i < 1000; i++) e.rules.push({ kind: "grant", type: other.type, id: other.id });
    },
  },
];

/** What is wrong in the shape itself: a spoiled cache or a hand-edited file. */
const STRUCTURAL: Damage[] = [
  { name: "no rules list", structural: true, apply: (e) => void ((e as { rules: unknown }).rules = null) },
  { name: "rules that are not rules", structural: true, apply: (e) => void ((e as { rules: unknown }).rules = [null, 3, "grant", {}, []]) },
  { name: "no name", structural: true, apply: (e) => void ((e as { name: unknown }).name = null) },
  { name: "no type", structural: true, apply: (e) => void ((e as { type: unknown }).type = undefined) },
  { name: "supports that is no list", structural: true, apply: (e) => void ((e as { supports: unknown }).supports = "Wizard") },
  { name: "no setters", structural: true, apply: (e) => void ((e as { setters: unknown }).setters = null) },
  { name: "a description that is no text", structural: true, apply: (e) => void ((e as { description: unknown }).description = { a: 1 }) },
  { name: "a sheet that is no sheet", structural: true, apply: (e) => void ((e as { sheet: unknown }).sheet = { descriptions: null }) },
  { name: "the same id twice", structural: true, apply: (e, all) => void all.push({ ...e, name: `${e.name} again`, rules: [] }) },
];

const FILTERS = { legacy: true, playtest: false, unusual: false, scifi: false };

function round(damages: Damage[], rng: () => number): { what: string[]; run: () => void } {
  const all = BUNDLE.slice();
  const what: string[] = [];
  const hits = 1 + Math.floor(rng() * 5);
  for (let h = 0; h < hits; h++) {
    const i = pick(LIVE, rng);
    // Only the damaged element is copied: the rest of the bundle is shared, and must stay as it was.
    const e = (all[i] = JSON.parse(JSON.stringify(all[i])) as AElement);
    const d = pick(damages, rng);
    d.apply(e, all, rng);
    what.push(`${d.name} on ${BUNDLE[i].name} (${BUNDLE[i].type})`);
  }
  return {
    what,
    run: () => {
      const reg = new ARegistry();
      reg.addElements(all);
      reg.build();
      for (const level of [1, 5, 20]) {
        const made = randomCharacter(reg, level, FILTERS, rng);
        const { character } = openCharacter(JSON.parse(JSON.stringify(made)), "built on damaged content", (id) => reg.get(id)?.name);
        const r = resolve(character, reg);
        const sh = buildSheet(r);
        checkCharacter(r, sh, []);
        exportFoundry(r);
        exportRoll20(r);
      }
    },
  };
}

describe("the engine never breaks on damaged content", () => {
  const N = Number(process.env.CONTENT_FUZZ) || 40;
  const cases: [string, Damage[], number][] = [
    ["content that says what cannot be", SEMANTIC, 20261123],
    ["content of the wrong shape", STRUCTURAL, 20261124],
    ["both at once", [...SEMANTIC, ...STRUCTURAL], 20261125],
  ];
  for (const [title, damages, seed] of cases)
    it(`${title}: ${N} rounds, three characters each, without a throw or a hang`, () => {
      const rng = seeded(seed);
      const broke: string[] = [];
      let slowest = 0;
      let slowestWhat = "";
      for (let i = 0; i < N; i++) {
        const { what, run } = round(damages, rng);
        const t0 = workMs();
        try {
          run();
        } catch (e) {
          if (broke.length < 10)
            broke.push(
              `#${i} [${what.join("; ")}]: ${(e as Error).message.slice(0, 140)} @ ${((e as Error).stack ?? "").split("\n")[1]?.trim().slice(0, 110)}`,
            );
        }
        const took = workMs() - t0;
        if (took > slowest) [slowest, slowestWhat] = [took, what.join("; ")];
      }
      expect(broke).toEqual([]);
      // Damaged content costs no more than a few seconds a round (a cycle must not be walked for ever).
      expect(slowest, slowestWhat).toBeLessThan(20000);
    }, 3600000);

  it("leaves the bundle itself as it was", () => {
    const before = JSON.stringify(BUNDLE[LIVE[0]]);
    const rng = seeded(7);
    for (let i = 0; i < 5; i++) round([...SEMANTIC, ...STRUCTURAL], rng);
    expect(JSON.stringify(BUNDLE[LIVE[0]])).toBe(before);
  });
});
