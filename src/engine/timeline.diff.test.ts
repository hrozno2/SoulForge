/**
 * Differential run (docs/ENGINE-PLAN.md, 4): the old resolver and the timeline resolver on saved characters, and
 * every difference that reaches a sheet. RULES_TIER=diff; RULES_DIFF_MAX caps the number of characters (default 400).
 * Output: <cache>/engine/diff.json and a summary in the test log.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { it } from "vitest";
import { nodeXml } from "../aurora/fixture";
import { parseElementsXml } from "../aurora/parse";
import { ARegistry } from "../aurora/registry";
import { convertFiveTools } from "../aurora/fivetools";
import { normalizeCharacter } from "../aurora/character";
import { resolveLegacy as resolve } from "../aurora/engine";
import { buildSheet } from "../aurora/sheet";
import { resolveTimeline } from "./timeline";

const CACHE = process.env.SOULFORGE_RULES;
const walkDir = (d: string, test: (f: string) => boolean, out: string[] = [], depth = 0): string[] => {
  for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (depth < 3) walkDir(p, test, out, depth + 1); } else if (test(p)) out.push(p); }
  return out;
};

it.skipIf(!CACHE || process.env.RULES_TIER !== "diff")("old and timeline resolvers on saved characters", () => {
  const reg = new ARegistry();
  for (const f of walkDir(join(CACHE!, "elements-master"), (p) => p.endsWith(".xml")).sort((a, b) => Number(/internal|ALE/.test(b)) - Number(/internal|ALE/.test(a)))) {
    try { reg.addFile(parseElementsXml(readFileSync(f, "utf8").replace(/^﻿/, ""), nodeXml, f)); } catch { /* not content */ }
  }
  const dir = join(CACHE!, "5etools-data");
  if (existsSync(dir)) {
    const json: Record<string, unknown> = {};
    for (const f of walkDir(dir, (p) => p.endsWith(".json"))) { const rel = relative(dir, f); if (!/index\.json$/.test(rel) && !rel.startsWith("bestiary")) json[rel] = JSON.parse(readFileSync(f, "utf8")); }
    reg.addElements(convertFiveTools({ files: json as never }));
  }
  reg.build();
  const files = walkDir(join(CACHE!, "runs"), (p) => p.endsWith("-character.json") && !/import_/.test(p)).sort();
  const max = Number(process.env.RULES_DIFF_MAX) || 400;
  const step = Math.max(1, Math.floor(files.length / max));
  const picked = files.filter((_, i) => i % step === 0).slice(0, max);
  const kinds = new Map<string, number>();
  const examples: Record<string, string[]> = {};
  const note = (kind: string, ex: string) => { kinds.set(kind, (kinds.get(kind) ?? 0) + 1); (examples[kind] ??= []).length < 8 && examples[kind].push(ex); };
  let ms = { old: 0, neu: 0 };
  for (const f of picked) {
    let ch;
    try { ch = normalizeCharacter(JSON.parse(readFileSync(f, "utf8"))); } catch { continue; }
    const name = f.split("/").slice(-2).join("/");
    let t = performance.now();
    const a = resolve(ch, reg);
    ms.old += performance.now() - t;
    t = performance.now();
    const b = resolveTimeline(ch, reg);
    ms.neu += performance.now() - t;
    if (b.findings.length) note("timeline finding", `${name}: ${b.findings.join("; ")}`);
    const onlyA = [...a.ids].filter((x) => !b.ids.has(x)), onlyB = [...b.ids].filter((x) => !a.ids.has(x));
    if (onlyA.length) note("element only in old", `${name}: ${onlyA.slice(0, 4).map((x) => reg.get(x)?.name ?? x).join(", ")}`);
    if (onlyB.length) note("element only in timeline", `${name}: ${onlyB.slice(0, 4).map((x) => reg.get(x)?.name ?? x).join(", ")}`);
    const illegal = (r: typeof a) => new Set(r.slots.flatMap((s) => s.chosen.filter((id) => s.blocked.has(id)).map((id) => `${s.rule.name}: ${reg.get(id)?.name ?? id}`)));
    const ia = illegal(a), ib = illegal(b);
    for (const x of ib) if (!ia.has(x)) note("pick illegal only in timeline", `${name}: ${x}`);
    for (const x of ia) if (!ib.has(x)) note("pick illegal only in old", `${name}: ${x}`);
    const sa = buildSheet(a), sb = buildSheet(b);
    for (const k of ["hp", "proficiency", "speed", "initiative"] as const) if (sa[k] !== sb[k]) note(`sheet ${k} differs`, `${name}: ${sa[k]} -> ${sb[k]}`);
    if (sa.ac.value !== sb.ac.value) note("sheet ac differs", `${name}: ${sa.ac.value} -> ${sb.ac.value}`);
    sa.abilities.forEach((x, i) => { if (x.score !== sb.abilities[i].score) note("sheet ability differs", `${name}: ${x.id} ${x.score} -> ${sb.abilities[i].score}`); });
    sa.skills.forEach((x, i) => { if (x.bonus !== sb.skills[i].bonus) note("sheet skill differs", `${name}: ${x.name} ${x.bonus} -> ${sb.skills[i].bonus}`); });
  }
  const out = join(CACHE!, "engine");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "diff.json"), JSON.stringify({ characters: picked.length, ms, kinds: Object.fromEntries(kinds), examples }, null, 2));
  console.log(`DIFF characters ${picked.length}; time old ${Math.round(ms.old)} ms, timeline ${Math.round(ms.neu)} ms`);
  for (const [k, n] of [...kinds].sort((x, y) => y[1] - x[1])) console.log(`DIFF ${n} ${k}`);
}, 3600000);

it.skipIf(!CACHE || process.env.RULES_TIER !== "diff")("the timeline reuses unchanged levels", () => {
  const reg = new ARegistry();
  for (const f of walkDir(join(CACHE!, "elements-master"), (p) => p.endsWith(".xml")).sort((a, b) => Number(/internal|ALE/.test(b)) - Number(/internal|ALE/.test(a)))) {
    try { reg.addFile(parseElementsXml(readFileSync(f, "utf8").replace(/^﻿/, ""), nodeXml, f)); } catch { /* not content */ }
  }
  reg.build();
  const f = walkDir(join(CACHE!, "runs"), (p) => /L20_Wizard_Player_s_Handbook_2024_20-character\.json$/.test(p))[0];
  const ch = normalizeCharacter(JSON.parse(readFileSync(f, "utf8")));
  let t = performance.now();
  const first = resolveTimeline(ch, reg);
  const cold = performance.now() - t;
  // Change the last choice of the highest level: only that level and later need work.
  const last = [...first.slots].reverse().find((s) => s.chosen.length && s.options.length > 1)!;
  const other = last.options.find((o) => !last.chosen.includes(o.id) && !last.blocked.has(o.id))!;
  const changed = { ...ch, selections: { ...ch.selections, [last.key]: [...last.chosen.slice(0, -1), other.id] } };
  t = performance.now();
  resolveTimeline(changed, reg);
  const warm = performance.now() - t;
  t = performance.now();
  resolve(changed, reg);
  const old = performance.now() - t;
  console.log(`TIMING cold ${cold.toFixed(1)} ms, after one change ${warm.toFixed(1)} ms, old resolver ${old.toFixed(1)} ms`);
}, 600000);
