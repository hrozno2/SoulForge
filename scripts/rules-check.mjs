// Runs the rules tests: builds varied characters, level 20s in every class, level-ups, multiclasses, companions,
// optional rules and community builds, checks them against the rules, and checks their exports.
// Passes only when everything comes out with no findings. Usage: node scripts/rules-check.mjs [seed]
import { execSync } from "node:child_process";
import { join } from "node:path";
import { ensureCache, CACHE } from "./rules-cache.mjs";

await ensureCache();
const seed = process.argv[2] || String(Date.now() % 2147483647);
const out = join(CACHE, "runs", new Date().toISOString().replace(/[:.]/g, "-"));
console.log(`Rules check, seed ${seed}. Files and report: ${out}`);
try {
  execSync("npx vitest run src/aurora/rules.suite.test.ts", { stdio: "inherit", env: { ...process.env, SOULFORGE_RULES: CACHE, RULES_SEED: seed, RULES_OUT: out } });
  console.log(`Rules check passed. Report: ${join(out, "report.md")}`);
} catch {
  console.error(`Rules check FAILED. Report: ${join(out, "report.md")}`);
  process.exit(1);
}
