// Runs the rules tests: builds varied characters, level 20s in every class, level-ups, multiclasses, companions,
// optional rules and community builds, checks them against the rules, and checks their exports.
// Passes only when everything comes out with no findings. Usage: node scripts/rules-check.mjs [seed]
// The tests run in groups side by side (one process each), so a run uses the whole machine; each group writes its
// files to a folder of its own and the reports are joined into one.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureCache, CACHE } from "./rules-cache.mjs";

await ensureCache();
const seed = process.argv[2] || String(Date.now() % 2147483647);
const out = join(CACHE, "runs", new Date().toISOString().replace(/[:.]/g, "-"));
mkdirSync(out, { recursive: true });
console.log(`Rules check, seed ${seed}. Files and report: ${out}`);

const groups = [
  ["random", "a batch of 10 varied|levelling up|adding a second class"],
  ["level20", "level 20 in every class"],
  ["builds", "companions and optional rules|known builds|imported characters"],
  ["elements", "every element on its own"],
  ["reference", "content linter|spell lists match|feat prerequisites match"],
];
if (process.env.RULES_TIER === "full") groups.push(["coverage", "coverage: every subclass"]);
if (process.env.RULES_TIER === "options") groups.push(["options", "options never picked"]);

const runGroup = ([name, pattern]) => new Promise((done) => {
  const dir = join(out, name);
  mkdirSync(dir, { recursive: true });
  const env = { ...process.env, SOULFORGE_RULES: CACHE, RULES_SEED: seed, RULES_OUT: dir };
  const p = spawn("npx", ["vitest", "run", "src/aurora/rules.suite.test.ts", "-t", `${pattern}|writes the report`], { env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  p.stdout.on("data", (d) => (log += d));
  p.stderr.on("data", (d) => (log += d));
  p.on("close", (code) => {
    writeFileSync(join(dir, "log.txt"), log);
    console.log(`  ${name}: ${code === 0 ? "passed" : "FAILED"}`);
    done({ name, code, dir });
  });
});

const results = await Promise.all(groups.map(runGroup));
const report = [`Seed ${seed}`];
for (const r of results) {
  const f = join(r.dir, "report.md");
  report.push(`\n## ${r.name}${r.code ? " (failed)" : ""}`, existsSync(f) ? readFileSync(f, "utf8").replace(/^Seed \d+\n/, "") : "(no report; see log.txt)");
}
writeFileSync(join(out, "report.md"), report.join("\n"));
if (results.some((r) => r.code)) {
  console.error(`Rules check FAILED. Report: ${join(out, "report.md")}`);
  process.exit(1);
}
console.log(`Rules check passed. Report: ${join(out, "report.md")}`);
