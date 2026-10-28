/**
 * The FastCharacter run (RULES_TIER=fastchar): characters made at fastcharacter.com (2024 rules), saved as text in
 * <cache>/fastcharacter/raw, imported into Soul Forge, checked against the rules, and their numbers compared with
 * FastCharacter's. The report, <cache>/fastcharacter/report.md, lists every difference by kind so each can be
 * classed as a Soul Forge bug, a FastCharacter mistake or a rules question.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { importFastCharacter } from "./foreign";
import { resolve } from "./engine";
import { buildSheet } from "./sheet";
import { checkCharacter, type RefClass } from "./rulesCheck";
import { loadTestContent } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;

it.skipIf(!C || process.env.RULES_TIER !== "fastchar")("FastCharacter characters, rebuilt and compared", () => {
  const dir = join(C!, "fastcharacter", "raw");
  if (!existsSync(dir)) return;
  const reg = loadTestContent(C!);
  const ref: RefClass[] = JSON.parse(readFileSync(join(C!, "rules-ref.json"), "utf8"));
  const out: string[] = ["# FastCharacter run", ""];
  const kinds = new Map<string, number>();
  const count = (k: string) => kinds.set(k, (kinds.get(k) ?? 0) + 1);
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".txt")).sort()) {
    const text = readFileSync(join(dir, f), "utf8");
    const title = /^Fast Character \| (.+?) \|/m.exec(text)?.[1] ?? f;
    const res = importFastCharacter(text, reg);
    const r = resolve(res.character, reg);
    const findings = checkCharacter(r, buildSheet(r), ref);
    out.push(`## ${f}: ${title}`);
    for (const d of res.differences) { out.push(`- differs: ${d}`); count(`differs: ${d.split(":")[0].replace(/ attack$/, " (attack)")}`); }
    for (const m of res.missing) { out.push(`- not found: ${m}`); count(`not found: ${m.replace(/^.*\(/, "(")}`); }
    for (const t of res.todo) { out.push(`- left open: ${t}`); count("left open"); }
    for (const x of findings) { out.push(`- rules: ${x.rule}: ${x.detail}`); count(`rules: ${x.rule}`); }
    out.push("");
  }
  out.splice(2, 0, "## Counts", ...[...kinds].sort((a, b) => b[1] - a[1]).map(([k, n]) => `- ${k}: ${n}`), "");
  writeFileSync(join(C!, "fastcharacter", "report.md"), out.join("\n"));
  console.log(`FASTCHAR ${[...kinds].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join("; ")}`);
  // An import never leaves a pick that repeats what the character has from elsewhere (it is taken back and left open).
  expect(kinds.get("rules: A choice repeats something the character already has") ?? 0).toBe(0);
}, 3600000);
