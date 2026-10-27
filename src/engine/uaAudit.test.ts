/**
 * The playtest audit (A4, RULES_TIER=ua): every Unearthed Arcana class, subclass, species, subrace, background and
 * feat, taken on a character and filled, then checked as official content is: the rules check's findings, choices
 * with nothing to pick, content that refers to something missing, and statistics nothing reads. The report, grouped by
 * kind, goes to <cache>/engine/ua.md; what is not fixed goes into docs/UA-UNSUPPORTED.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "vitest";
import { holder, loadTestContent } from "./testContent";
import { resolve } from "../aurora/engine";
import { autoFill } from "../aurora/autofill";
import { buildSheet } from "../aurora/sheet";
import { BookIndex } from "../aurora/books";
import { checkCharacter, type RefClass } from "../aurora/rulesCheck";
import type { AElement } from "../aurora/types";

const C = process.env.SOULFORGE_RULES;
const TYPES = ["Class", "Archetype", "Race", "Sub Race", "Background", "Feat"];

it.skipIf(!C || process.env.RULES_TIER !== "ua")("playtest audit", () => {
  const reg = loadTestContent(C!);
  const books = new BookIndex(reg);
  const ref: RefClass[] = JSON.parse(readFileSync(join(C!, "rules-ref.json"), "utf8"));
  const kinds = new Map<string, string[]>();
  const add = (kind: string, line: string) => (kinds.get(kind) ?? kinds.set(kind, []).get(kind)!).push(line);
  let checked = 0, clean = 0;
  const ua = (e: AElement) => books.info(e.source).playtest && !e.comingSoon;
  for (const type of TYPES) for (const el of reg.ofType(type).filter(ua)) {
    let ch = holder(reg, el);
    // A feat with a prerequisite is taken by a character who meets it: the species or subrace (Feats for Races), or
    // the feat it needs (Wild Talent for the psionic feats). The first alternative that is one of those.
    if (ch && type === "Feat") {
      // Only what the feat needs, not what it rules out ("!(ID_..._CHEF||...)": not another version of itself).
      for (const id of (el.requirements ?? "").replace(/!\([^)]*\)|!ID_\w+/g, " ").replace(/[()]/g, " ").split(/\|\||,/).map((x) => x.trim()).filter((x) => /^ID_/.test(x))) {
        const req = reg.get(id);
        if (req?.type === "Race") { ch = { ...ch, race: id }; break; }
        if (req?.type === "Sub Race") { const sub = holder(reg, req); if (sub) { ch = { ...sub, classes: ch.classes, extras: ch.extras }; break; } }
        if (req?.type === "Feat") { ch = { ...ch, extras: [id, ...ch.extras] }; break; }
        if (req?.type === "Background") { ch = { ...ch, background: id }; break; }
      }
    }
    const label = `${type} ${el.name} (${el.source})`;
    if (!ch) { add("cannot be taken", label); continue; }
    checked++;
    let found = 0;
    try {
      // The character's other choices take nothing of the same name (a published Telekinetic beside the playtest one).
      const r = resolve(autoFill(ch, reg, undefined, (o) => o.name.toLowerCase() !== el.name.toLowerCase()), reg);
      for (const s of r.slots) {
        if (s.rule.optional || s.rule.type === "List" || s.chosen.length >= s.rule.number) continue;
        if (!s.options.some((o) => !s.blocked.has(o.id) && !s.chosen.includes(o.id))) { add("nothing to pick", `${label}: "${s.rule.name}" (${s.rule.type})`); found++; }
      }
      for (const f of checkCharacter(r, buildSheet(r), ref)) {
        // Findings about the holder's own class (a level 20 class needs no rules reference for a playtest class) are noise.
        if (/Class not in the rules reference|required choice is not made/.test(f.rule)) continue;
        add(f.rule, `${label}: ${f.detail}`);
        found++;
      }
    } catch (e) {
      add("fails to build", `${label}: ${(e as Error).message}`);
      found++;
    }
    if (!found) clean++;
  }
  const out = ["# Playtest audit", "", `${checked} playtest entries built, ${clean} with nothing found (${checked ? Math.round((clean / checked) * 100) : 100}%).`, ""];
  for (const [kind, lines] of [...kinds].sort((a, b) => b[1].length - a[1].length)) out.push(`## ${kind} (${lines.length})`, "", ...lines.map((l) => `- ${l}`), "");
  mkdirSync(join(C!, "engine"), { recursive: true });
  writeFileSync(join(C!, "engine", "ua.md"), out.join("\n"));
  console.log(`UA ${checked} built, ${clean} clean; ${[...kinds].map(([k, l]) => `${k} ${l.length}`).join("; ")}`);
}, 7200000);

it.skipIf(!C || process.env.RULES_TIER !== "ua")("random characters with playtest content", async () => {
  const { randomCharacter } = await import("../aurora/randomCharacter");
  const reg = loadTestContent(C!);
  const books = new BookIndex(reg);
  const ref: RefClass[] = JSON.parse(readFileSync(join(C!, "rules-ref.json"), "utf8"));
  let seed = 2026;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const kinds = new Map<string, string[]>();
  let withUa = 0;
  for (let i = 0; i < 150; i++) {
    const ch = randomCharacter(reg, 1 + Math.floor(rng() * 20), { legacy: true, playtest: true, unusual: true }, rng);
    const r = resolve(ch, reg);
    if (!r.active.some((a) => books.info(a.el.source).playtest)) continue;
    withUa++;
    for (const f of checkCharacter(r, buildSheet(r), ref)) (kinds.get(f.rule) ?? kinds.set(f.rule, []).get(f.rule)!).push(`${i}: ${f.detail}`);
  }
  const out = ["# Random characters with playtest content", "", `${withUa} of 150 used playtest content.`, ""];
  for (const [k, l] of [...kinds].sort((a, b) => b[1].length - a[1].length)) out.push(`## ${k} (${l.length})`, "", ...l.slice(0, 30).map((x) => `- ${x}`), "");
  writeFileSync(join(C!, "engine", "ua-random.md"), out.join("\n"));
  console.log(`UARANDOM ${withUa} with playtest; ${[...kinds].map(([k, l]) => `${k} ${l.length}`).join("; ")}`);
}, 7200000);
