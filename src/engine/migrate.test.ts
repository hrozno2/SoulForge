/**
 * D6 (docs/PLAN-5ETOOLS.md): saved characters moved to 5e.tools ids keep their sheets (RULES_TIER=migrate). Each
 * saved character of the test cache's runs is resolved with both providers, moved (migrate.ts) and resolved with
 * 5e.tools alone; the sheets are compared field by field. The report is <cache>/engine/migrate.md; the gate allows
 * no more changed sheets than the last accepted count (RULES_SNAPSHOT=1 accepts).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { normalizeCharacter } from "../aurora/character";
import { resolve } from "../aurora/engine";
import type { ARegistry } from "../aurora/registry";
import { buildSheet } from "../aurora/sheet";
import { nameKey } from "./concepts";
import { migrateToFiveTools } from "./migrate";
import { loadContentSet, loadTestContent } from "./testContent";

const CACHE = process.env.SOULFORGE_RULES;
const walkDir = (d: string, test: (f: string) => boolean, out: string[] = [], depth = 0): string[] => {
  for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (depth < 3) walkDir(p, test, out, depth + 1); } else if (test(p)) out.push(p); }
  return out;
};

/** The numbers and names a player reads off the sheet. */
function facts(sh: ReturnType<typeof buildSheet>, r: ReturnType<typeof resolve>, reg: ARegistry) {
  // Names as either writes them: "Thieves’ Cant" and "Thieves' Cant", "Shadow-Touched" and "Shadow Touched" are one.
  const names = (t: RegExp) => [...new Set(r.active.filter((a) => t.test(a.el.type)).map((a) => nameKey(a.el.name)))].sort();
  const spells = [...new Set(sh.casting.flatMap((c) => [...c.cantripsKnown, ...c.spells, ...c.granted]).map((p) => nameKey(reg.get(p.id)?.name ?? p.id)))].sort();
  return {
    hp: sh.hp, ac: sh.ac.value, prof: sh.proficiency, speed: sh.speed, init: sh.initiative,
    scores: sh.abilities.map((a) => a.score), saves: sh.abilities.map((a) => a.save), skills: sh.skills.map((k) => k.bonus),
    // A feat by its name alone ("Magic Initiate (Cleric)" is 5e.tools' Magic Initiate), and the 2024 Ability Score
    // Improvement is no feat in Aurora's copy: neither is a change a player sees.
    feats: [...new Set(r.active.filter((a) => a.el.type === "Feat").map((a) => nameKey(a.el.name.replace(/\s*\(.*\)$/, ""))).filter((n) => !/^ability score improvement/.test(n)))].sort(), spells, languages: names(/^Language$/),
  };
}

it.skipIf(!CACHE || process.env.RULES_TIER !== "migrate")("saved characters moved to 5e.tools ids keep their sheets", () => {
  const both = loadTestContent(CACHE!);
  const five = loadContentSet(CACHE!, "5etools");
  const files = walkDir(join(CACHE!, "runs"), (p) => p.endsWith("-character.json") && !/import_/.test(p)).sort();
  const max = Number(process.env.RULES_DIFF_MAX) || 400;
  const step = Math.max(1, Math.floor(files.length / max));
  const picked = files.filter((_, i) => i % step === 0).slice(0, max);
  const changed: string[] = [];
  const byField = new Map<string, number>();
  const noTwin = new Map<string, number>();
  const unplaced = new Map<string, number>();
  const open = new Map<string, number>();
  const against = new Map<string, number>();
  let n = 0;
  for (const f of picked) {
    let ch;
    try { ch = normalizeCharacter(JSON.parse(readFileSync(f, "utf8"))); } catch { continue; }
    n++;
    const name = f.split("/").slice(-3).join("/");
    const r0 = resolve(ch, both);
    const before = facts(buildSheet(r0), r0, both);
    const m = migrateToFiveTools(ch, both, five);
    const r1 = resolve(m.ch, five);
    const after = facts(buildSheet(r1), r1, five);
    for (const x of m.noTwin) noTwin.set(`${x.type}: ${x.name}`, (noTwin.get(`${x.type}: ${x.name}`) ?? 0) + 1);
    for (const x of m.againstRules) against.set(x.replace(/^[^:]*\d+\)?: /, ""), (against.get(x.replace(/^[^:]*\d+\)?: /, "")) ?? 0) + 1);
    for (const x of m.open) open.set(x, (open.get(x) ?? 0) + 1);
    for (const x of m.unplaced) unplaced.set(`${x.choice}: ${x.name}`, (unplaced.get(`${x.choice}: ${x.name}`) ?? 0) + 1);
    const diffs = (Object.keys(before) as (keyof typeof before)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    for (const k of diffs) byField.set(k, (byField.get(k) ?? 0) + 1);
    if (diffs.length) changed.push(`${name}: ${diffs.map((k) => {
      const a = before[k], b = after[k];
      if (Array.isArray(a) && Array.isArray(b) && typeof a[0] === "string") return `${k} only before [${(a as string[]).filter((x) => !(b as string[]).includes(x)).join(", ")}] only after [${(b as string[]).filter((x) => !(a as string[]).includes(x)).join(", ")}]`;
      return `${k} ${JSON.stringify(a)} -> ${JSON.stringify(b)}`;
    }).join("; ")}`);
  }
  const top = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, v]) => `- ${k} (${v})`);
  const dir = join(CACHE!, "engine");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "migrate.md"), [
    "# Saved characters moved to 5e.tools ids", "", `${n} characters, ${changed.length} with a changed sheet.`, "",
    "## Changed fields", ...top(byField), "", "## No 5e.tools twin", ...top(noTwin), "", "## Picks with no place", ...top(unplaced), "", "## Choices left open", ...top(open), "", "## Kept against 5e.tools' rules", ...top(against), "",
    "## Changed sheets", ...changed.map((c) => `- ${c}`), "",
  ].join("\n"));
  const base = join(dir, "migrate-count.json");
  const was = existsSync(base) ? (JSON.parse(readFileSync(base, "utf8")) as { changed: number }).changed : Infinity;
  if (!existsSync(base) || process.env.RULES_SNAPSHOT) writeFileSync(base, JSON.stringify({ changed: changed.length }));
  console.log(`MIGRATE ${n} characters; changed ${changed.length} (accepted ${was})`);
  expect(changed.length).toBeLessThanOrEqual(was);
}, 7200000);
