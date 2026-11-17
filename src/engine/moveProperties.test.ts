/**
 * Properties of the move to 5e.tools that hold for any character (RULES_TIER=move-props; MOVE_N characters each,
 * default 40; MOVE_SEED). Unlike the counts in migrate.test.ts, each is a law, so any break is a finding:
 *   1. Twice is once: moving a moved character changes nothing more (its picks are already 5e.tools').
 *   2. Native characters pass through: a character made on 5e.tools content alone moves to itself.
 *   3. A moved character saves and opens again to the same sheet (the file round trip).
 *   4. The move brings no rules finding of its own, on characters made legal on Aurora's content (the fresh kind):
 *      the report's "(new)" findings; a rule only 5e.tools states is the original's.
 * The report is <cache>/engine/move-props.md.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { normalizeCharacter, type Character } from "../aurora/character";
import { resolve } from "../aurora/engine";
import { randomCharacter } from "../aurora/randomCharacter";
import { buildSheet } from "../aurora/sheet";
import { checkCharacter, type RefClass } from "../aurora/rulesCheck";
import { migrateToFiveTools } from "./migrate";
import { moveAndCompare, sheetFacts } from "./migrateReport";
import { loadContentSet, loadTestContent } from "./testContent";

const C = process.env.SOULFORGE_RULES;

it.skipIf(!C || process.env.RULES_TIER !== "move-props")(
  "the move's laws",
  () => {
    const both = loadTestContent(C!);
    const five = loadContentSet(C!, "5etools");
    const aurora = loadContentSet(C!, "aurora");
    const ref: RefClass[] = existsSync(join(C!, "rules-ref.json")) ? JSON.parse(readFileSync(join(C!, "rules-ref.json"), "utf8")) : [];
    const N = Number(process.env.MOVE_N) || 40;
    let seed = Number(process.env.MOVE_SEED) || 9091;
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const filters = { legacy: true, playtest: false, unusual: false };
    const facts = (ch: Character) => JSON.stringify(sheetFacts(resolve(ch, five), five));
    const findings = (ch: Character, reg: typeof five) => {
      const r = resolve(ch, reg);
      return checkCharacter(r, buildSheet(r), ref).map((f) => `${f.rule}: ${f.detail}`);
    };
    const out: string[] = [];
    const breaks: string[] = [];
    for (let i = 0; i < N; i++) {
      const level = 1 + Math.floor(rng() * 20);
      // 1, 3 and 4 on a character made legal on Aurora's content (as a library from before 5e.tools holds).
      const old = randomCharacter(aurora, level, filters, rng);
      const before = findings(old, both);
      const once = migrateToFiveTools(old, both, five).ch;
      const twice = migrateToFiveTools(once, both, five).ch;
      if (facts(once) !== facts(twice)) {
        // Kept for a probe: <cache>/engine/move-props/twice-<n>.json is the original.
        mkdirSync(join(C!, "engine", "move-props"), { recursive: true });
        writeFileSync(join(C!, "engine", "move-props", `twice-${i}.json`), JSON.stringify(old, null, 1));
        breaks.push(`#${i} (level ${level}): moving twice changed the sheet: ${facts(once)} -> ${facts(twice)}`);
      }
      const reopened = normalizeCharacter(JSON.parse(JSON.stringify(once)));
      if (facts(reopened) !== facts(once)) breaks.push(`#${i}: saved and opened again, the moved sheet changed`);
      if (!before.length) {
        // The move report's own split: a finding the original had, or a rule only 5e.tools states (Fighting
        // Initiate's martial weapon, which Aurora's copy does not ask), is the original's; the rest is the move's.
        const res = moveAndCompare(old, both, five, ref);
        const made = res.rules.filter((f) => /\(new\)$/.test(f));
        if (made.length) breaks.push(`#${i} (level ${level}): the move brought: ${made.join("; ")}`);
      }
      // 2 on a character made on 5e.tools content alone.
      const native = randomCharacter(five, level, filters, rng);
      const moved = migrateToFiveTools(native, both, five).ch;
      if (facts(native) !== facts(moved))
        breaks.push(`#${i} (level ${level}): a 5e.tools character changed when moved: ${facts(native)} -> ${facts(moved)}`);
    }
    out.push(
      `# The move's laws`,
      "",
      `${N} characters of each kind, seed ${process.env.MOVE_SEED ?? 9091}; ${breaks.length} breaks.`,
      "",
      ...breaks.map((b) => `- ${b}`),
    );
    mkdirSync(join(C!, "engine"), { recursive: true });
    writeFileSync(join(C!, "engine", "move-props.md"), out.join("\n"));
    expect(breaks).toEqual([]);
  },
  7200000,
);
