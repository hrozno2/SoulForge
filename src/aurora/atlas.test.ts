/**
 * The atlas (docs/PLAN-audit.md, phase A): what the loaded content holds and how it connects. For every element it
 * lists what it grants, offers and changes, whether a character can reach it, and which references lead nowhere;
 * for every statistic the content sets, whether any code reads it. Run with RULES_TIER=atlas (the content stays in
 * the test cache; the report holds names and counts, no rules text). Output: <cache>/atlas/atlas.json and
 * docs/atlas/summary.md.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { it } from "vitest";
import { nodeXml } from "./fixture";
import { parseElementsXml } from "./parse";
import { ARegistry } from "./registry";
import { convertFiveTools } from "./fivetools";
import type { AElement, ARule } from "./types";

const CACHE = process.env.SOULFORGE_RULES;
const walk = (d: string, ext: string, out: string[] = []): string[] => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
};

/** Aurora, plus the 5e.tools data folder when it is in the cache, loaded the way the app loads them. */
function loadAll(): ARegistry {
  const reg = new ARegistry();
  const files = walk(join(CACHE!, "elements-master"), ".xml").sort((a, b) => Number(/internal|ALE/.test(b)) - Number(/internal|ALE/.test(a)));
  for (const f of files) {
    try { reg.addFile(parseElementsXml(readFileSync(f, "utf8").replace(/^﻿/, ""), nodeXml, f)); } catch { /* not a content file */ }
  }
  const dir = join(CACHE!, "5etools-data");
  if (existsSync(dir)) {
    const json: Record<string, unknown> = {};
    for (const f of walk(dir, ".json")) { const rel = relative(dir, f); if (!/index\.json$/.test(rel) && !rel.startsWith("bestiary")) json[rel] = JSON.parse(readFileSync(f, "utf8")); }
    reg.addElements(convertFiveTools({ files: json as never }));
  }
  reg.build();
  return reg;
}

/** Stat names the code reads: string literals, and template literals turned into patterns ("${a}:save" becomes ".+:save"). */
function statsReadByCode(): { exact: Set<string>; patterns: RegExp[] } {
  const exact = new Set<string>();
  const patterns: RegExp[] = [];
  const dirs = ["src/aurora", "src/sheets", "src/pdf", "src/ui"];
  for (const d of dirs) for (const f of walk(d, ".ts").concat(walk(d, ".tsx"))) {
    if (/\.test\.tsx?$/.test(f)) continue;
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/(?:stats|\bs|r\.stats|this)\.(?:get|text|has|explain|aggregate|contribs\.has)\(\s*(["'`])((?:(?!\1).)+)\1/g)) {
      const raw = m[2];
      if (m[1] === "`" && raw.includes("${")) patterns.push(new RegExp(`^${raw.split(/\$\{[^}]*\}/).map((p) => p.replace(/[.*+?^()|[\]\\]/g, "\\$&")).join(".+")}$`));
      else exact.add(raw.toLowerCase());
    }
  }
  return { exact, patterns };
}

const kindOf = (r: ARule) => r.kind;

it.skipIf(!CACHE || process.env.RULES_TIER !== "atlas")("the atlas of the content", () => {
  const reg = loadAll();
  const all = reg.all();
  const origin = (e: AElement) => (e.origin === "5etools" ? "5etools" : "aurora");
  const isUA = (e: AElement) => /unearthed arcana|playtest/i.test(e.source);

  // Reachability: from every class, species, background and feat, through grants and every option a choice offers.
  const roots = all.filter((e) => ["Class", "Race", "Background", "Feat"].includes(e.type));
  const reached = new Map<string, string>(); // id -> the first element it was reached from
  const dynamic: { owner: string; select: string; supports: string }[] = [];
  const missing: { owner: string; kind: string; ref: string }[] = [];
  const queue: AElement[] = [];
  for (const r of roots) { reached.set(r.id, "(start)"); queue.push(r); }
  while (queue.length) {
    const el = queue.shift()!;
    for (const rule of el.rules) {
      if (rule.kind === "grant") {
        const t = reg.get(rule.id);
        if (!t) { if (!/^ID_INTERNAL_|^SPELLREF:/.test(rule.id) && !["Grants", "Information", "Size", "Condition", "Vision", "Rule"].includes(rule.type)) missing.push({ owner: el.id, kind: `grant ${rule.type}`, ref: rule.id }); continue; }
        if (!reached.has(t.id)) { reached.set(t.id, el.id); queue.push(t); }
      } else if (rule.kind === "select") {
        if (rule.type === "List") continue;
        if (/\$\(/.test(rule.supports)) { dynamic.push({ owner: el.id, select: rule.name, supports: rule.supports }); }
        let opts: AElement[] = [];
        try { opts = reg.find(rule.type, rule.supports.replace(/\$\([^)]*\)/g, "")); } catch { opts = []; }
        if (!opts.length && !/\$\(/.test(rule.supports)) missing.push({ owner: el.id, kind: `select ${rule.type} "${rule.name}" has no options`, ref: rule.supports });
        if (rule.default && !reg.get(rule.default)) missing.push({ owner: el.id, kind: `default of "${rule.name}"`, ref: rule.default });
        for (const o of opts) if (!reached.has(o.id)) { reached.set(o.id, el.id); queue.push(o); }
      }
    }
  }

  // Statistics the content sets, and whether code or other content reads them.
  const read = statsReadByCode();
  const setByContent = new Map<string, number>();
  const usedAsValue = new Set<string>();
  for (const e of all) {
    for (const r of e.rules) if (r.kind === "stat") {
      const n = r.name.toLowerCase();
      setByContent.set(n, (setByContent.get(n) ?? 0) + 1);
      if (isNaN(Number(r.value))) usedAsValue.add(r.value.toLowerCase());
      if (r.bonus && isNaN(Number(r.bonus))) usedAsValue.add(r.bonus.toLowerCase());
    }
    // Requirements read statistics too: "[strength:max:extra:2]" asks whether the stat is at least 2.
    const reqs = [e.requirements ?? "", ...e.rules.map((r) => ("requirements" in r ? r.requirements ?? "" : ""))].join(" ");
    for (const m of reqs.matchAll(/\[([a-z][^\]]*?):(-?\d+)\]/gi)) usedAsValue.add(m[1].trim().toLowerCase());
    for (const m of (e.description ?? "").matchAll(/\{\{([^}]+)\}\}/g)) usedAsValue.add(m[1].trim().toLowerCase());
    for (const d of e.sheet?.descriptions ?? []) for (const m of (d.text ?? "").matchAll(/\{\{([^}]+)\}\}/g)) usedAsValue.add(m[1].trim().toLowerCase());
    if (e.sheet?.usage) for (const m of e.sheet.usage.matchAll(/\{\{([^}]+)\}\}/g)) usedAsValue.add(m[1].trim().toLowerCase());
  }
  // The engine's own derived names (a score feeds its modifier, a skill its passive) count as read.
  const engineDerived = (n: string) => /^(strength|dexterity|constitution|intelligence|wisdom|charisma)(:score|:modifier|:save.*|:max)?$/.test(n) || /:(misc|proficiency|passive|bonus)$/.test(n);
  const unread = [...setByContent].filter(([n]) => !read.exact.has(n) && !read.patterns.some((p) => p.test(n)) && !usedAsValue.has(n) && !engineDerived(n)).sort((a, b) => b[1] - a[1]);

  // Counts by type, origin and reachability.
  const byType = new Map<string, { aurora: number; fivetools: number; ua: number; unreached: number }>();
  for (const e of all) {
    const row = byType.get(e.type) ?? byType.set(e.type, { aurora: 0, fivetools: 0, ua: 0, unreached: 0 }).get(e.type)!;
    row[origin(e) === "aurora" ? "aurora" : "fivetools"]++;
    if (isUA(e)) row.ua++;
    if (!reached.has(e.id) && !e.compendiumHidden) row.unreached++;
  }
  const ruleCounts = { grant: 0, select: 0, stat: 0 };
  for (const e of all) for (const r of e.rules) ruleCounts[kindOf(r)]++;

  const out = join(CACHE!, "atlas");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "atlas.json"), JSON.stringify({
    elements: all.map((e) => ({ id: e.id, name: e.name, type: e.type, source: e.source, origin: origin(e), ua: isUA(e), hidden: e.compendiumHidden, reachedFrom: reached.get(e.id) ?? null,
      grants: e.rules.filter((r) => r.kind === "grant").map((r) => r.kind === "grant" ? { type: r.type, id: r.id, level: r.level } : null),
      selects: e.rules.filter((r) => r.kind === "select").map((r) => r.kind === "select" ? { type: r.type, name: r.name, supports: r.supports, number: r.number, level: r.level } : null),
      stats: e.rules.filter((r) => r.kind === "stat").map((r) => r.kind === "stat" ? { name: r.name, value: r.value, bonus: r.bonus } : null),
      requirements: e.requirements ?? "" })),
    missing, dynamic, unreadStats: unread,
  }));

  // Field coverage: every field the 5e.tools data uses, per kind of entry, and whether the converter reads it at all.
  // A field the converter never mentions is data it silently drops (the species' lineages and resistances were).
  const fieldLines: string[] = [];
  const dir5 = join(CACHE!, "5etools-data");
  if (existsSync(dir5)) {
    const conv = readFileSync("src/aurora/fivetools.ts", "utf8");
    const reads = (k: string) => new RegExp(`[.\\[\"'\\s]${k.replace(/[$]/g, "\\$")}\\b`).test(conv);
    const IGNORED = new Set(["name", "source", "page", "srd", "srd52", "basicRules", "basicRules2024", "otherSources", "reprintedAs", "hasFluff", "hasFluffImages", "soundClip", "hasToken", "tokenCredit", "edition", "legacy", "freeRules2024", "isReprinted", "fluff", "_copy", "_isCopy", "_isBaseVersion", "token", "foundryImg"]);
    const kinds = new Map<string, Map<string, number>>();
    for (const f of walk(dir5, ".json")) {
      if (/index\.json$|bestiary|books\.json|sources\.json/.test(f)) continue;
      const data = JSON.parse(readFileSync(f, "utf8"));
      for (const [kind, list] of Object.entries(data)) {
        if (!Array.isArray(list) || kind.startsWith("_")) continue;
        const m = kinds.get(kind) ?? kinds.set(kind, new Map()).get(kind)!;
        for (const x of list) if (x && typeof x === "object") for (const k of Object.keys(x)) m.set(k, (m.get(k) ?? 0) + 1);
      }
    }
    for (const [kind, m] of [...kinds].sort()) {
      const missingFields = [...m].filter(([k]) => !IGNORED.has(k) && !reads(k)).sort((a, b) => b[1] - a[1]);
      if (missingFields.length) fieldLines.push(`- **${kind}** (${[...m.values()].reduce((a, b) => Math.max(a, b), 0)} entries): ${missingFields.map(([k, n]) => `\`${k}\` (${n})`).join(", ")}`);
    }
  }
  const lines: string[] = [
    "# Atlas: summary",
    "",
    `Generated by \`RULES_TIER=atlas npx vitest run src/aurora/atlas.test.ts\`. Content: Aurora${existsSync(join(CACHE!, "5etools-data")) ? " and the 5e.tools data folder" : ""}. Names and counts only.`,
    "",
    `- Elements: ${all.length} (Aurora ${all.filter((e) => origin(e) === "aurora").length}, 5e.tools ${all.filter((e) => origin(e) === "5etools").length}).`,
    `- Rules: ${ruleCounts.grant} grants, ${ruleCounts.select} choices, ${ruleCounts.stat} stat changes.`,
    `- Reachable from a class, species, background or feat: ${reached.size} of ${all.length}.`,
    `- References that lead nowhere: ${missing.length}.`,
    `- Choices whose options depend on the character (filled in at play): ${dynamic.length}.`,
    `- Statistics set by content that no code or content reads: ${unread.length} names (${unread.reduce((n, [, c]) => n + c, 0)} rules).`,
    "",
    "## Elements by type",
    "",
    "| Type | Aurora | 5e.tools | of these UA/playtest | not reachable (shown in lists) |",
    "|---|---:|---:|---:|---:|",
    ...[...byType].sort((a, b) => b[1].aurora + b[1].fivetools - a[1].aurora - a[1].fivetools).map(([t, r]) => `| ${t} | ${r.aurora} | ${r.fivetools} | ${r.ua} | ${r.unreached} |`),
    "",
    "## References that lead nowhere (first 80)",
    "",
    ...missing.slice(0, 80).map((m) => `- ${reg.get(m.owner)?.name ?? m.owner} (${m.owner}): ${m.kind} -> \`${m.ref}\``),
    "",
    "## 5e.tools fields the converter never reads",
    "",
    "Per kind of entry: the field, and how many entries use it. Each is data that never reaches a character. Some are display-only (art, tables); each one needs a decision.",
    "",
    ...fieldLines,
    "",
    "## Statistics nobody reads (most used first, first 80)",
    "",
    ...unread.slice(0, 80).map(([n, c]) => `- \`${n}\` (${c})`),
  ];
  mkdirSync("docs/atlas", { recursive: true });
  writeFileSync("docs/atlas/summary.md", lines.join("\n") + "\n");
  console.log(lines.slice(0, 12).join("\n"));
}, 3600000);
