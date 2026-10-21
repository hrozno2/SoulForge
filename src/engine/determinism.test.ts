/**
 * The determinism contract (docs/ENGINE-PLAN.md 2), on saved characters (RULES_TIER=diff):
 * - the order of the recorded choices does not change the result;
 * - resolving twice gives the same state (the level cache changes nothing);
 * - taking the top level away and giving it back gives the same sheet (level down, level up).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { normalizeCharacter, totalLevel, type Character } from "../aurora/character";
import { resolve } from "../aurora/engine";
import { buildSheet } from "../aurora/sheet";
import { atLevel } from "./timeline";
import { loadTestContent } from "./testContent";

const CACHE = process.env.SOULFORGE_RULES;
const walkDir = (d: string, test: (f: string) => boolean, out: string[] = [], depth = 0): string[] => {
  for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (depth < 3) walkDir(p, test, out, depth + 1); } else if (test(p)) out.push(p); }
  return out;
};

it.skipIf(!CACHE || process.env.RULES_TIER !== "diff")("the determinism contract on saved characters", () => {
  const reg = loadTestContent(CACHE!);
  const files = walkDir(join(CACHE!, "runs"), (p) => p.endsWith("-character.json") && !/import_/.test(p)).sort();
  const step = Math.max(1, Math.floor(files.length / 150));
  const problems: string[] = [];
  const fingerprint = (ch: Character) => {
    const r = resolve(ch, reg);
    const sh = buildSheet(r);
    return JSON.stringify({ ids: [...r.ids].sort(), hp: sh.hp, ac: sh.ac.value, saves: sh.abilities.map((a) => a.save), skills: sh.skills.map((k) => k.bonus), slots: r.slots.map((s) => `${s.key}=${s.chosen.join("+")}`).sort(), blocked: r.slots.map((s) => [...s.blocked].sort().join("+")).sort() });
  };
  for (const f of files.filter((_, i) => i % step === 0).slice(0, 150)) {
    let ch: Character;
    try { ch = normalizeCharacter(JSON.parse(readFileSync(f, "utf8"))); } catch { continue; }
    const name = f.split("/").slice(-2).join("/");
    const a = fingerprint(ch);
    if (fingerprint(ch) !== a) problems.push(`${name}: resolving twice differs`);
    const reversed = { ...ch, selections: Object.fromEntries(Object.entries(ch.selections).reverse()) };
    if (fingerprint(reversed) !== a) problems.push(`${name}: the order of the choices changes the result`);
    const total = totalLevel(ch);
    if (total >= 2) {
      const down = atLevel(ch, total - 1);
      fingerprint(down);
      if (fingerprint({ ...down, classes: ch.classes }) !== a) problems.push(`${name}: level down and up again changes the result`);
    }
  }
  console.log(`DETERMINISM ${problems.length} problems`);
  for (const p of problems.slice(0, 20)) console.log(`DETERMINISM ${p}`);
  expect(problems).toEqual([]);
}, 3600000);
