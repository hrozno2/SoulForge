/**
 * The edition sweep (RULES_TIER=editions): where 2014 and 2024 rules meet in a choice. Every listed species,
 * background, class, subclass and feat is put on a character (and filled, to reach the choices it opens), and every
 * choice's open options are sorted by the edition of the choice's owner and of each option. The report,
 * <cache>/engine/editions.md, counts each meeting by kind of choice, with examples, so each one gets a rule.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "vitest";
import { resolve } from "../aurora/engine";
import { autoFill } from "../aurora/autofill";
import { isModern } from "../aurora/edition";
import type { AElement } from "../aurora/types";
import { holder, loadTestContent } from "./testContent";

const C = process.env.SOULFORGE_RULES;
/** Kinds that belong to no edition: skills, languages, sizes, internal markers. */
const NEUTRAL = /^(Proficiency|Language|Size|Vision|Grants|Information|Condition|Rule|Training Option|Item|Weapon|Armor)$/;
const editionOf = (e: AElement): "2024" | "2014" | "none" => (NEUTRAL.test(e.type) || /internal|aurora legacy essentials/i.test(e.source) ? "none" : isModern(e) ? "2024" : "2014");

it.skipIf(!C || process.env.RULES_TIER !== "editions")("where 2014 and 2024 meet in a choice", () => {
  const reg = loadTestContent(C!);
  const shown = (e: AElement) => !e.compendiumHidden && !/unearthed|playtest/i.test(e.source);
  const tally = new Map<string, { n: number; ex: Set<string> }>();
  const note = (k: string, ex: string) => { const t = tally.get(k) ?? tally.set(k, { n: 0, ex: new Set() }).get(k)!; t.n++; if (t.ex.size < 6) t.ex.add(ex); };
  for (const type of ["Race", "Sub Race", "Background", "Class", "Archetype", "Feat"]) {
    for (const el of reg.ofType(type).filter(shown)) {
      const ch = holder(reg, el);
      if (!ch) continue;
      let filled = ch;
      try { filled = autoFill(ch, reg); } catch { /* the holder alone still shows its first choices */ }
      const r = resolve(filled, reg);
      const rootEd = editionOf(el);
      for (const s of r.slots) {
        if (s.rule.type === "List") continue;
        const ownerEd = editionOf(s.owner) === "none" ? rootEd : editionOf(s.owner);
        for (const o of s.options) {
          if (s.blocked.has(o.id)) continue;
          const oe = editionOf(o);
          if (oe === "none" || oe === ownerEd || ownerEd === "none") continue;
          note(`${s.rule.type} | owner ${ownerEd} | option ${oe}`, `${el.name} (${el.source}): "${s.rule.name}" offers ${o.name} (${o.source})`);
        }
      }
    }
  }
  const lines = ["# Where 2014 and 2024 meet in a choice", "", ...[...tally].sort((a, b) => b[1].n - a[1].n).flatMap(([k, t]) => [`## ${k}: ${t.n}`, ...[...t.ex].map((x) => `- ${x}`), ""])];
  mkdirSync(join(C!, "engine"), { recursive: true });
  writeFileSync(join(C!, "engine", "editions.md"), lines.join("\n"));
  console.log(`EDITIONS ${[...tally].sort((a, b) => b[1].n - a[1].n).map(([k, t]) => `${k}: ${t.n}`).join("; ")}`);
}, 7200000);
