/**
 * Soul Forge against Aurora (RULES_TIER=aurora): for every Aurora class (at level 20), species and background, the
 * choices Aurora's content defines, read straight from the elements (the element and everything it grants, without
 * following choices), against the choices Soul Forge offers for the same element on a character. The report,
 * <cache>/engine/aurora.md, lists per element:
 * - choices Aurora defines that Soul Forge does not show (with the requirement, when Aurora gates them);
 * - choices Soul Forge adds (optional class features, the edition rule's replacements);
 * - choices whose options differ in number, and why (the edition rule, repeat copies, the provider rule).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "vitest";
import { resolve } from "../aurora/engine";
import { newCharacter, type Character } from "../aurora/character";
import type { AElement, SelectRule } from "../aurora/types";
import type { ARegistry } from "../aurora/registry";
import { isModern } from "../aurora/edition";
import { loadTestContent } from "./testContent";

const C = process.env.SOULFORGE_RULES;

/** Every choice an element defines, itself and through what it grants, at any level up to `maxLevel`. */
function auroraChoices(reg: ARegistry, el: AElement, maxLevel: number): { rule: SelectRule; owner: AElement }[] {
  const out: { rule: SelectRule; owner: AElement }[] = [];
  const seen = new Set<string>();
  const visit = (e: AElement, depth: number) => {
    if (seen.has(e.id) || depth > 6) return;
    seen.add(e.id);
    for (const r of e.rules) {
      if (r.level !== undefined && r.level > maxLevel) continue;
      if (r.kind === "select") out.push({ rule: r, owner: e });
      else if (r.kind === "grant" && r.id) { const t = reg.get(r.id); if (t) visit(t, depth + 1); }
    }
  };
  visit(el, 0);
  return out;
}

const key = (owner: string, r: { type: string; name: string }) => `${owner}|${r.type}|${r.name.toLowerCase()}`;

it.skipIf(!C || process.env.RULES_TIER !== "aurora")("Soul Forge against Aurora, per class, species and background", () => {
  const reg = loadTestContent(C!);
  const aurora = (e: AElement) => e.origin !== "5etools" && !e.compendiumHidden && !/unearthed|playtest/i.test(e.source);
  const lines: string[] = ["# Soul Forge against Aurora", ""];
  const totals = { elements: 0, auroraOnly: 0, gated: 0, ours: 0, fewer: 0 };
  const why = new Map<string, number>();
  for (const type of ["Class", "Race", "Background"]) {
    for (const el of reg.ofType(type).filter(aurora)) {
      totals.elements++;
      const fighter = isModern(el) ? "ID_WOTC_PHB24_CLASS_FIGHTER" : "ID_WOTC_PHB_CLASS_FIGHTER";
      const ch: Character = type === "Class" ? { ...newCharacter(), classes: [{ classId: el.id, level: 20 }] } : type === "Race" ? { ...newCharacter(), race: el.id, classes: [{ classId: fighter, level: 20 }] } : { ...newCharacter(), background: el.id, classes: [{ classId: fighter, level: 1 }] };
      const r = resolve(ch, reg);
      const theirs = auroraChoices(reg, el, 20);
      const rootOf = (s: { root: string }) => (type === "Class" ? s.root === `class:${el.id}` : type === "Race" ? s.root === "race" : s.root === "background");
      const ours = r.slots.filter(rootOf);
      const ourKeys = new Map(ours.map((s) => [key(s.owner.id, s.rule), s]));
      const theirKeys = new Set(theirs.map((t) => key(t.owner.id, t.rule)));
      const notes: string[] = [];
      for (const t of theirs) {
        const s = ourKeys.get(key(t.owner.id, t.rule));
        if (!s) {
          const gate = t.rule.requirements;
          if (gate) totals.gated++; else totals.auroraOnly++;
          if (!gate) notes.push(`- Aurora only: "${t.rule.name}" [${t.rule.type}] in ${t.owner.name}`);
          continue;
        }
        if (t.rule.type === "List") continue;
        const all = reg.find(t.rule.type, s.filter);
        const shownIds = new Set(s.options.map((o) => o.id));
        const missing = all.filter((o) => !shownIds.has(o.id));
        if (!missing.length) continue;
        totals.fewer++;
        const reasons = new Map<string, number>();
        for (const o of missing) {
          const rsn = isModern(o) !== isModern(el) ? "the other edition" : all.some((x) => x !== o && x.name === o.name && x.source === o.source) ? "a repeat copy" : o.origin === "5etools" ? "the other provider's copy" : ch.sources?.length ? "book restriction" : "other";
          reasons.set(rsn, (reasons.get(rsn) ?? 0) + 1);
          why.set(rsn, (why.get(rsn) ?? 0) + 1);
        }
        if (reasons.has("other")) notes.push(`- Fewer options in "${t.rule.name}": ${s.options.length} of ${all.length} (${[...reasons].map(([k, n]) => `${n} ${k}`).join(", ")})`);
      }
      for (const s of ours) if (!theirKeys.has(key(s.owner.id, s.rule))) { totals.ours++; notes.push(`- Soul Forge adds: "${s.rule.name}" [${s.rule.type}]`); }
      if (notes.length) lines.push(`## ${type} ${el.name} (${el.source})`, ...notes, "");
    }
  }
  lines.splice(2, 0, `Elements ${totals.elements}. Choices only in Aurora: ${totals.auroraOnly} (and ${totals.gated} Aurora switches off by a requirement). Choices Soul Forge adds: ${totals.ours}. Choices with fewer options: ${totals.fewer} (${[...why].map(([k, n]) => `${n} options: ${k}`).join("; ")}).`, "");
  mkdirSync(join(C!, "engine"), { recursive: true });
  writeFileSync(join(C!, "engine", "aurora.md"), lines.join("\n"));
  console.log(`AURORA ${lines[2]}`);
}, 7200000);
