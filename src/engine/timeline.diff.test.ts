/**
 * Saved characters as a regression gate (RULES_TIER=diff), now that the old resolver is gone (docs/ENGINE-PLAN.md,
 * E5): every saved character in the test cache's runs resolves, and its sheet numbers are kept in a snapshot
 * (<cache>/engine/sheets.json). A later run that changes a number lists the change; RULES_SNAPSHOT=1 accepts them.
 * It also times the resolver on one change, the case the UI meets on every click.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { normalizeCharacter } from "../aurora/character";
import { resolve } from "../aurora/engine";
import { buildSheet } from "../aurora/sheet";
import { loadTestContent } from "./testContent";

const CACHE = process.env.SOULFORGE_RULES;
const walkDir = (d: string, test: (f: string) => boolean, out: string[] = [], depth = 0): string[] => {
  for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (depth < 3) walkDir(p, test, out, depth + 1); } else if (test(p)) out.push(p); }
  return out;
};

it.skipIf(!CACHE || process.env.RULES_TIER !== "diff")("saved characters keep their sheets", () => {
  const reg = loadTestContent(CACHE!);
  const files = walkDir(join(CACHE!, "runs"), (p) => p.endsWith("-character.json") && !/import_/.test(p)).sort();
  const max = Number(process.env.RULES_DIFF_MAX) || 400;
  const step = Math.max(1, Math.floor(files.length / max));
  const picked = files.filter((_, i) => i % step === 0).slice(0, max);
  const now: Record<string, unknown> = {};
  const illegal: string[] = [];
  let ms = 0;
  for (const f of picked) {
    let ch;
    try { ch = normalizeCharacter(JSON.parse(readFileSync(f, "utf8"))); } catch { continue; }
    // The run folder too: every rules-check run writes the same file names.
    const name = f.split("/").slice(-3).join("/");
    const t = performance.now();
    const r = resolve(ch, reg);
    ms += performance.now() - t;
    const sh = buildSheet(r);
    now[name] = { hp: sh.hp, ac: sh.ac.value, prof: sh.proficiency, speed: sh.speed, init: sh.initiative, scores: sh.abilities.map((a) => a.score), saves: sh.abilities.map((a) => a.save), skills: sh.skills.map((k) => k.bonus), dc: sh.casting.map((c) => c.dc) };
    for (const s of r.slots) for (const id of s.chosen) if (s.blocked.has(id)) illegal.push(`${name}: ${s.rule.name}: ${reg.get(id)?.name ?? id}`);
  }
  const dir = join(CACHE!, "engine");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "sheets.json");
  const was: Record<string, unknown> = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  const changed = Object.keys(now).filter((k) => k in was && JSON.stringify(was[k]) !== JSON.stringify(now[k])).map((k) => `${k}: ${JSON.stringify(was[k])} -> ${JSON.stringify(now[k])}`);
  if (!existsSync(path) || process.env.RULES_SNAPSHOT) writeFileSync(path, JSON.stringify({ ...was, ...now }, null, 2));
  writeFileSync(join(dir, "illegal-picks.txt"), illegal.join("\n"));
  console.log(`DIFF characters ${picked.length}; ${Math.round(ms)} ms; sheets changed ${changed.length}; picks the rules rule out ${illegal.length}`);
  for (const c of changed.slice(0, 20)) console.log(`DIFF changed ${c}`);
  if (!process.env.RULES_SNAPSHOT) expect(changed).toEqual([]);
}, 3600000);

it.skipIf(!CACHE || process.env.RULES_TIER !== "diff")("the timeline reuses unchanged levels", () => {
  const reg = loadTestContent(CACHE!);
  const f = walkDir(join(CACHE!, "runs"), (p) => /L20_Wizard_Player_s_Handbook_2024_20-character\.json$/.test(p))[0];
  const ch = normalizeCharacter(JSON.parse(readFileSync(f, "utf8")));
  let t = performance.now();
  const first = resolve(ch, reg);
  const cold = performance.now() - t;
  // Change the last choice of the highest level: only that level and later need work.
  const last = [...first.slots].reverse().find((s) => s.chosen.length && s.options.length > 1)!;
  const other = last.options.find((o) => !last.chosen.includes(o.id) && !last.blocked.has(o.id))!;
  const changed = { ...ch, selections: { ...ch.selections, [last.key]: [...last.chosen.slice(0, -1), other.id] } };
  t = performance.now();
  resolve(changed, reg);
  console.log(`TIMING cold ${cold.toFixed(1)} ms, after one change ${(performance.now() - t).toFixed(1)} ms`);
}, 600000);
