/**
 * What a feature's text promises and its rules do not give (docs/ENGINE-LEGAL-PLAN.md, W10; RULES_TIER=prose). For
 * every feature-like element of a content set: a text that says the character chooses something, gains a training,
 * learns a spell or a language, while neither the element nor the one that gives it has a rule of that kind. The
 * report, <cache>/engine/prose.md, lists them by kind and book. A starting measurement: many are choices made in
 * play ("choose one creature"), which a decided list will hold.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "vitest";
import type { AElement, ARule } from "../aurora/types";
import { stripHtml } from "../aurora/sheet";
import { loadContentSet } from "./testContent";

const C = process.env.SOULFORGE_RULES;
const FEATURE = /^(Racial Trait|Class Feature|Archetype Feature|Feat|Feat Feature|Background Feature|Optional Feature|Class Feature Option)$/;
/** A lasting promise, by kind, and what rule would keep it. In-play choices ("choose a creature", "choose one of the
 * following effects" when the feature is used) are left out where the wording says so. */
const PROMISES: { kind: string; re: RegExp; kept: (r: ARule) => boolean }[] = [
  { kind: "skill or tool training", re: /\b(?:gain|have|are) proficien(?:cy|t) (?:in|with) (?:one|two|three|a|an) (?:skill|tool|type|kind|of the following|artisan|musical|gaming)|proficiency in (?:one|two|three) (?:skills?|tools?|of the following)/i, kept: (r) => (r.kind === "select" && /Proficiency|Training Option/.test(r.type)) || (r.kind === "grant" && r.type === "Proficiency") },
  { kind: "language", re: /\b(?:learn|speak, read, and write|know) (?:one|two|three|an?) (?:additional |extra |other )?languages?\b/i, kept: (r) => (r as { type?: string }).type === "Language" },
  { kind: "spell or cantrip", re: /\byou (?:learn|know) (?:the |one |two |a )?(?:[a-z]+ )?(?:cantrips?|spells?)\b|\bcantrip of your choice\b|\bspells? of your choice\b/i, kept: (r) => (r as { type?: string }).type === "Spell" },
  { kind: "feat", re: /\bfeat of your choice\b|\bgain (?:a|an|one) [a-z ]*feat\b/i, kept: (r) => (r as { type?: string }).type === "Feat" },
  { kind: "a choice of options", re: /\b(?:choose|pick|select) (?:one|two|three) of the following\b(?! (?:effects|benefits) when)/i, kept: (r) => r.kind === "select" },
];

it.skipIf(!C || process.env.RULES_TIER !== "prose")("text promises that no rule keeps", () => {
  const set = (process.env.RULES_CONTENT ?? "5etools") as Parameters<typeof loadContentSet>[1];
  const reg = loadContentSet(set === "srd" ? "" : C!, set);
  const all = reg.all();
  const givers = new Map<string, AElement[]>();
  for (const e of all) for (const r of e.rules) {
    const ids = r.kind === "grant" && r.id ? [r.id] : r.kind === "select" ? String(r.supports ?? "").split("|").filter((x) => x.startsWith("ID_")) : [];
    for (const id of ids) (givers.get(id) ?? givers.set(id, []).get(id)!).push(e);
  }
  const optionRules = (e: AElement) => e.rules.flatMap((r) => (r.kind === "select" ? String(r.supports ?? "").split("|").flatMap((id) => reg.get(id)?.rules ?? []) : []));
  const byKind = new Map<string, { n: number; books: Map<string, number>; ex: string[] }>();
  let checked = 0;
  for (const e of all) {
    if (!FEATURE.test(e.type) || e.compendiumHidden && e.type !== "Optional Feature") continue;
    const text = stripHtml(e.description ?? "");
    if (text.length < 30) continue;
    checked++;
    const rules = [...e.rules, ...optionRules(e), ...(givers.get(e.id) ?? []).flatMap((g) => g.rules)];
    for (const p of PROMISES) {
      if (!p.re.test(text) || rules.some(p.kept)) continue;
      const x = byKind.get(p.kind) ?? { n: 0, books: new Map<string, number>(), ex: [] as string[] };
      x.n++;
      x.books.set(e.source, (x.books.get(e.source) ?? 0) + 1);
      if (x.ex.length < 25) x.ex.push(`${e.name} [${e.source}]: "${(p.re.exec(text)?.[0] ?? "").slice(0, 60)}"`);
      byKind.set(p.kind, x);
    }
  }
  const out = [`# Text promises no rule keeps (${set}, W10)`, "", `${checked} features with text checked.`, ""];
  for (const [k, x] of [...byKind].sort((a, b) => b[1].n - a[1].n)) {
    out.push(`## ${k}: ${x.n}`, "", `By book: ${[...x.books].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([b, n]) => `${b} ${n}`).join("; ")}`, "", ...x.ex.map((s) => `- ${s}`), "");
  }
  mkdirSync(join(C!, "engine"), { recursive: true });
  writeFileSync(join(C!, "engine", `prose-${set}.md`), out.join("\n"));
  console.log(`PROSE ${set}: ${checked} checked; ${[...byKind].map(([k, x]) => `${k} ${x.n}`).join(", ")}`);
}, 1800000);
