// The big rules run, on request: many random characters (1,000 unless given), each checked against the rules and
// exported to every standard sheet. Only characters with findings keep their files; the report starts with a count
// of findings by rule. Takes hours. Usage: node scripts/rules-big.mjs [count] [seed]
import { execSync } from "node:child_process";
import { join } from "node:path";
import { ensureCache, CACHE } from "./rules-cache.mjs";

await ensureCache();
const count = process.argv[2] || "1000";
const seed = process.argv[3] || String(Date.now() % 2147483647);
const out = join(CACHE, "runs", `big-${new Date().toISOString().replace(/[:.]/g, "-")}`);
console.log(`Big rules run: ${count} characters, seed ${seed}. Report: ${join(out, "report.md")}`);
try {
  execSync(`npx vitest run src/aurora/rules.suite.test.ts -t "a big batch"`, { stdio: "inherit", env: { ...process.env, SOULFORGE_RULES: CACHE, RULES_SEED: seed, RULES_OUT: out, RULES_BIG: count } });
  console.log(`All ${count} clean. Report: ${join(out, "report.md")}`);
} catch {
  console.error(`Findings. Report: ${join(out, "report.md")}`);
  process.exit(1);
}
