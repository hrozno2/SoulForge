// The full check, run on request (the engine plan's "nightly run", started by hand): every test and audit there is,
// one after another, with one summary. Usage: node scripts/full-check.mjs [seed] [--count N]
//   - unit tests; the loader gates (one key per concept, every 5e.tools field read or decided, every stat read)
//   - the standard rules check (random, level 20, builds and imports, every element, the reference), with the sheets
//   - N random characters (default 10,000) with every choice window checked, without the sheets
//   - the edition gate, Soul Forge against Aurora, Aurora against 5e.tools, the saved-character snapshot and the
//     determinism contract, the FastCharacter comparison
// The summary goes to <cache>/runs/full-<date>/summary.md and is printed at the end. Exit code 0 only when all pass.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureCache, CACHE } from "./rules-cache.mjs";

await ensureCache();
const args = process.argv.slice(2);
const seed = args.find((a) => /^\d+$/.test(a)) ?? String(Date.now() % 2147483647);
const countAt = args.indexOf("--count");
const count = countAt >= 0 ? Number(args[countAt + 1]) || 10000 : 10000;
const out = join(CACHE, "runs", `full-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(out, { recursive: true });

const run = (name, cmd, cmdArgs, env = {}) => new Promise((done) => {
  const started = Date.now();
  process.stdout.write(`  ${name}...`);
  const p = spawn(cmd, cmdArgs, { env: { ...process.env, SOULFORGE_RULES: CACHE, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  p.stdout.on("data", (d) => (log += d));
  p.stderr.on("data", (d) => (log += d));
  p.on("close", (code) => {
    writeFileSync(join(out, `${name.replace(/[^\w-]+/g, "_")}.log`), log);
    const mins = ((Date.now() - started) / 60000).toFixed(1);
    // The lines the tests print about themselves (counts, gates), for the summary.
    const facts = log.split("\n").filter((l) => /^(DIFF characters|DETERMINISM|EDITIONS|AURORA|PARITY|FASTCHAR|FIELDS|STATS|elements \d)|\d+ characters, \d+ with findings|Rules check (FAILED|passed)/.test(l.trim())).map((l) => l.trim().slice(0, 300));
    console.log(` ${code === 0 ? "passed" : "FAILED"} (${mins} min)`);
    done({ name, ok: code === 0, mins, facts });
  });
});

console.log(`Full check, seed ${seed}. Files: ${out}`);
const steps = [];
steps.push(await run("unit tests", "npx", ["vitest", "run"]));
steps.push(await run("loader gates", "npx", ["vitest", "run", "src/engine/load.test.ts", "--silent=false"]));
steps.push(await run("rules check", "node", ["scripts/rules-check.mjs", seed]));
const bigOut = join(out, "big");
mkdirSync(bigOut, { recursive: true });
steps.push(await run(`${count} random characters`, "npx", ["vitest", "run", "src/aurora/rules.suite.test.ts", "-t", "a big batch|writes the report", "--silent=false"], { RULES_SEED: seed, RULES_BIG: String(count), RULES_NOPDF: "1", RULES_OUT: bigOut, RULES_RUN: "full-big" }));
const bigReport = join(bigOut, "report.md");
if (existsSync(bigReport)) steps[steps.length - 1].facts.push(...readFileSync(bigReport, "utf8").split("\n").slice(2, 12).filter(Boolean));
for (const [name, tier, file] of [["edition gate", "editions", "src/engine/editions.test.ts"], ["against Aurora", "aurora", "src/engine/aurora.test.ts"], ["Aurora against 5e.tools", "parity", "src/engine/parity.test.ts"], ["saved characters", "diff", "src/engine/timeline.diff.test.ts src/engine/determinism.test.ts"], ["FastCharacter", "fastchar", "src/aurora/fastchar.test.ts"]]) {
  steps.push(await run(name, "npx", ["vitest", "run", ...file.split(" "), "--silent=false"], { RULES_TIER: tier }));
}

const ok = steps.every((s) => s.ok);
const summary = [`# Full check, ${new Date().toISOString().slice(0, 16).replace("T", " ")}`, "", `Seed ${seed}. ${ok ? "Everything passed." : "Something failed: see the step and its log."}`, "", ...steps.flatMap((s) => [`## ${s.ok ? "Passed" : "FAILED"}: ${s.name} (${s.mins} min)`, ...s.facts.map((f) => `- ${f}`), ""])];
writeFileSync(join(out, "summary.md"), summary.join("\n"));
console.log(`\n${summary.join("\n")}`);
process.exit(ok ? 0 : 1);
