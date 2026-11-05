/**
 * What Aurora still changes on a 5e.tools character (RULES_TIER=parity-effect, Stage D4): the same random characters are
 * built with 5e.tools alone and with Aurora loaded too, and their sheets compared field by field. A borrowed mechanic
 * that changes no sheet needs no port. The report goes to <cache>/engine/parity-effect.md.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, it } from "vitest";
import { ARegistry } from "../aurora/registry";
import { convertFiveTools } from "../aurora/fivetools";
import { randomCharacter } from "../aurora/randomCharacter";
import { resolve } from "../aurora/engine";
import { buildSheet } from "../aurora/sheet";
import { loadTestContent, walkDir } from "./testContent";

const C = process.env.SOULFORGE_RULES;
// A change to what random characters pick shifts the draw, so the same mechanics can score a few apart: read the report.
const FLOOR = 427;

/** Every leaf of a value that differs, with array indexes left out of the path so like differences group together. */
function diff(a: unknown, b: unknown, path: string, out: { path: string; alone: unknown; both: unknown }[]) {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    const key = (x: unknown) => (x && typeof x === "object" && "name" in x ? String((x as { name: unknown }).name) : JSON.stringify(x));
    const am = new Map(a.map((x) => [key(x), x])), bm = new Map(b.map((x) => [key(x), x]));
    for (const [k, x] of am) { if (bm.has(k)) diff(x, bm.get(k), `${path}[]`, out); else out.push({ path: `${path}[] only alone`, alone: k, both: undefined }); }
    for (const k of bm.keys()) if (!am.has(k)) out.push({ path: `${path}[] only with Aurora`, alone: undefined, both: k });
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, out);
    return;
  }
  out.push({ path, alone: a, both: b });
}

it.skipIf(!C || process.env.RULES_TIER !== "parity-effect")("what Aurora changes on 5e.tools characters", () => {
  const dir = join(C!, "5etools-data");
  const json: Record<string, unknown> = {};
  for (const f of walkDir(dir, ".json")) { const rel = relative(dir, f); if (!/index\.json$/.test(rel) && !rel.startsWith("bestiary")) json[rel] = JSON.parse(readFileSync(f, "utf8")); }
  const alone = new ARegistry();
  alone.addElements(convertFiveTools({ files: json as never }));
  alone.build();
  const both = loadTestContent(C!);
  let seed = 23;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const N = Number(process.env.PARITY_EFFECT_N ?? 500);
  const paths = new Map<string, { n: number; samples: string[] }>();
  let same = 0, crashed = 0;
  for (let i = 0; i < N; i++) {
    try {
      const ch = randomCharacter(alone, 1 + (i % 20), {} as never, rng);
      const out: { path: string; alone: unknown; both: unknown }[] = [];
      diff(buildSheet(resolve(ch, alone)), buildSheet(resolve(ch, both)), "sheet", out);
      if (!out.length) same++;
      const who = ch.classes.map((c) => `${alone.get(c.classId)?.name} ${c.level}`).join("/");
      for (const d of out) {
        const e = paths.get(d.path) ?? { n: 0, samples: [] };
        e.n++;
        // Long text: from where the two start to differ.
        const [a, b] = [String(JSON.stringify(d.alone)), String(JSON.stringify(d.both))];
        let at = 0;
        while (at < a.length && a[at] === b[at]) at++;
        if (e.samples.length < 6) e.samples.push(`${who}: ${a.slice(Math.max(0, at - 20), at + 70)} -> ${b.slice(Math.max(0, at - 20), at + 70)}`);
        paths.set(d.path, e);
      }
    } catch { crashed++; }
  }
  const lines = [`# What Aurora changes on 5e.tools characters`, "", `${N} characters, ${same} with the same sheet, ${crashed} failed to build.`, ""];
  for (const [p, e] of [...paths].sort((a, b) => b[1].n - a[1].n)) lines.push(`## ${p} (${e.n})`, ...e.samples.map((s) => `- ${s}`), "");
  writeFileSync(join(C!, "engine", "parity-effect.md"), lines.join("\n"));
  console.log(`PARITY same sheet with and without Aurora: ${same} of ${N}`);
  // May only go up (Stage D4). The seed is fixed, so a drop is a mechanic lost, not luck.
  expect(crashed).toBe(0);
  if (N === 500) expect(same).toBeGreaterThanOrEqual(FLOOR);
}, 1800000);
