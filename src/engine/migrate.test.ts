/**
 * D6 (docs/PLAN-5ETOOLS.md): saved characters moved to 5e.tools ids (RULES_TIER=migrate). Each saved character of the
 * test cache's runs is resolved with both providers, moved (migrate.ts) and resolved with 5e.tools alone; the sheets
 * are compared, what is dropped is listed with why, and the moved character goes through the rules check
 * (migrateReport.ts, the same comparison Soul Forge Test's "Move characters to 5e.tools" makes). The report is
 * <cache>/engine/migrate.md; the gate allows no more changed sheets, drops or rules findings than the last accepted
 * counts (RULES_SNAPSHOT=1 accepts).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { normalizeCharacter } from "../aurora/character";
import type { RefClass } from "../aurora/rulesCheck";
import { moveAndCompare, moveReport, type MoveResult } from "./migrateReport";
import { loadContentSet, loadTestContent } from "./testContent";

const CACHE = process.env.SOULFORGE_RULES;
const walkDir = (d: string, test: (f: string) => boolean, out: string[] = [], depth = 0): string[] => {
  for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (depth < 3) walkDir(p, test, out, depth + 1); } else if (test(p)) out.push(p); }
  return out;
};

it.skipIf(!CACHE || process.env.RULES_TIER !== "migrate")("saved characters moved to 5e.tools ids keep their sheets and the rules", () => {
  const both = loadTestContent(CACHE!);
  const five = loadContentSet(CACHE!, "5etools");
  const ref: RefClass[] = existsSync(join(CACHE!, "rules-ref.json")) ? JSON.parse(readFileSync(join(CACHE!, "rules-ref.json"), "utf8")) : [];
  const files = walkDir(join(CACHE!, "runs"), (p) => p.endsWith("-character.json") && !/import_|big-|full-|rerun-/.test(p)).sort();
  const max = Number(process.env.RULES_DIFF_MAX) || 400;
  const step = Math.max(1, Math.floor(files.length / max));
  const picked = files.filter((_, i) => i % step === 0).slice(0, max);
  const results: MoveResult[] = [];
  for (const f of picked) {
    let ch;
    try { ch = normalizeCharacter(JSON.parse(readFileSync(f, "utf8"))); } catch { continue; }
    const r = moveAndCompare(ch, both, five, ref);
    results.push({ ...r, name: f.split("/").slice(-3).join("/") });
  }
  const dir = join(CACHE!, "engine");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "migrate.md"), moveReport(results));
  const now = { changed: results.filter((r) => r.changed.length).length, dropped: results.filter((r) => r.dropped.length).length, rules: results.filter((r) => r.rules.length).length };
  const base = join(dir, "migrate-count.json");
  const was = existsSync(base) ? (JSON.parse(readFileSync(base, "utf8")) as Partial<typeof now>) : {};
  if (!existsSync(base) || process.env.RULES_SNAPSHOT) writeFileSync(base, JSON.stringify(now));
  console.log(`MIGRATE ${results.length} characters; changed ${now.changed}, dropped ${now.dropped}, rules ${now.rules} (accepted ${JSON.stringify(was)})`);
  for (const k of Object.keys(now) as (keyof typeof now)[]) if (typeof was[k] === "number") expect(now[k], k).toBeLessThanOrEqual(was[k]!);
}, 7200000);
