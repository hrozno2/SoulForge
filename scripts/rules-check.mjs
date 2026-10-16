// Runs the rules tests: builds varied characters, level 20s in every class, level-ups, multiclasses, companions,
// optional rules and community builds, checks them against the rules, and checks their exports.
// Passes only when everything comes out with no findings. Usage: node scripts/rules-check.mjs [seed]
// The tests run in groups side by side (one process each), so a run uses the whole machine; each group writes its
// files to a folder of its own and the reports are joined into one.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
// The options tier: the never-picked options in five parts side by side (RULES_SHARD), sharing one scan cache.
const SHARDS = 5;
if (process.env.RULES_TIER === "options") for (let i = 0; i < SHARDS; i++) groups.push([`options-${i}`, "options never picked", { RULES_SHARD: `${i}/${SHARDS}` }]);

const runGroup = ([name, pattern, extra = {}]) => new Promise((done) => {
  const dir = join(out, name);
  mkdirSync(dir, { recursive: true });
  const env = { ...process.env, ...extra, SOULFORGE_RULES: CACHE, RULES_SEED: seed, RULES_OUT: dir, RULES_RUN: out.split("/").pop() };
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

// Progress: characters written per group, against how many the last run wrote (rough, as the groups vary a little).
const countsPath = join(CACHE, "runs", "last-counts.json");
const expected = existsSync(countsPath) ? JSON.parse(readFileSync(countsPath, "utf8")) : {};
const finished = new Set();
const count = (name) => { try { return readdirSync(join(out, name)).filter((f) => f.endsWith("-character.json")).length; } catch { return 0; } };
const progress = () => groups.map(([name]) => {
  if (finished.has(name)) return `${name} done`;
  const n = count(name), want = expected[name];
  if (want === 0) return `${name} running`;
  return want ? `${name} ${Math.min(99, Math.round((100 * n) / want))}% (${n}/${want})` : `${name} ${n}`;
}).join(" · ");
const ticker = setInterval(() => console.log(`  ${progress()}`), 30000);
const results = await Promise.all(groups.map((g) => runGroup(g).then((r) => (finished.add(r.name), r))));
clearInterval(ticker);
writeFileSync(countsPath, JSON.stringify({ ...expected, ...Object.fromEntries(groups.map(([name]) => [name, count(name)])) }, null, 2));
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
