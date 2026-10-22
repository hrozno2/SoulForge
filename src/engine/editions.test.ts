/**
 * The edition sweep (RULES_TIER=editions): where 2014 and 2024 rules meet in a choice. Every listed species,
 * background, class, subclass and feat is put on a character (and filled, to reach the choices it opens), and every
 * choice's open options are sorted by the edition of the choice's owner and of each option. The report,
 * <cache>/engine/editions.md, counts each meeting by kind of choice, with examples, so each one gets a rule.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { resolve } from "../aurora/engine";
import { autoFill } from "../aurora/autofill";
import type { AElement } from "../aurora/types";
import { choiceEdition, editionOfElement } from "./editionPolicy";
import { holder, loadTestContent } from "./testContent";

const C = process.env.SOULFORGE_RULES;
const editionOf = editionOfElement;
const vname = (n: string) => n.toLowerCase().replace(/[’‘`]/g, "'").replace(/\s*\((?:20\d\d|legacy|2014|2024)\)\s*$/, "").replace(/\s+/g, " ").trim();

it.skipIf(!C || process.env.RULES_TIER !== "editions")("where 2014 and 2024 meet in a choice", () => {
  const reg = loadTestContent(C!);
  const shown = (e: AElement) => !e.compendiumHidden && !/unearthed|playtest/i.test(e.source);
  const tally = new Map<string, { n: number; ex: Set<string> }>();
  const bad: string[] = [];
  const note = (k: string, ex: string) => { const t = tally.get(k) ?? tally.set(k, { n: 0, ex: new Set() }).get(k)!; t.n++; if (t.ex.size < 6) t.ex.add(ex); };
  for (const type of ["Race", "Sub Race", "Background", "Class", "Archetype", "Feat"]) {
    for (const el of reg.ofType(type).filter(shown)) {
      const ch = holder(reg, el);
      if (!ch) continue;
      let filled = ch;
      try { filled = autoFill(ch, reg); } catch { /* the holder alone still shows its first choices */ }
      const r = resolve(filled, reg);
      for (const s of r.slots) {
        if (s.rule.type === "List") continue;
        // The engine's own rule for a choice's edition: its class, species or background, else its owner.
        const ownerEd = choiceEdition(s.owner, s.root, filled, reg);
        const ownVersions = new Set(s.options.filter((o) => editionOf(o) === ownerEd).map((o) => `${o.type}|${vname(o.name)}`));
        for (const o of s.options) {
          if (s.blocked.has(o.id)) continue;
          const oe = editionOf(o);
          if (oe === "none" || oe === ownerEd || ownerEd === "none") continue;
          // Against the rules: a 2024 option in a 2014 choice, or the other edition's version of an option.
          const wrong = ownerEd === "2014" || ownVersions.has(`${o.type}|${vname(o.name)}`);
          if (wrong) bad.push(`${el.name} (${el.source}): "${s.rule.name}" offers ${o.name} (${o.source})`);
          note(`${wrong ? "AGAINST THE RULES: " : "older content (allowed): "}${s.rule.type} | owner ${ownerEd} | option ${oe}`, `${el.name} (${el.source}): "${s.rule.name}" offers ${o.name} (${o.source})`);
        }
      }
    }
  }
  const lines = ["# Where 2014 and 2024 meet in a choice", "", ...[...tally].sort((a, b) => b[1].n - a[1].n).flatMap(([k, t]) => [`## ${k}: ${t.n}`, ...[...t.ex].map((x) => `- ${x}`), ""])];
  mkdirSync(join(C!, "engine"), { recursive: true });
  writeFileSync(join(C!, "engine", "editions.md"), lines.join("\n"));
  console.log(`EDITIONS ${[...tally].sort((a, b) => b[1].n - a[1].n).map(([k, t]) => `${k}: ${t.n}`).join("; ")}`);
  expect(bad.slice(0, 20)).toEqual([]);
}, 7200000);
