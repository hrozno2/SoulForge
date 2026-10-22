/**
 * The post-import audit (RULES_TIER=parity): every entry the builder lists, after Aurora and 5e.tools are both
 * loaded. Three things are checked for every species, subrace, background, class, subclass and feat:
 * - the list shows each one once (one book from two providers is one entry);
 * - nothing it offers is a required choice with nothing to pick, at any depth the autofill reaches;
 * - where both providers have it, the two agree on what it gives: the choices it opens, the proficiencies, senses,
 *   size, speed and ability scores. A difference names the side that lacks something.
 * The report goes to <cache>/engine/parity.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { holder, loadTestContent } from "./testContent";
import { it } from "vitest";
import type { ARegistry } from "../aurora/registry";
import type { Character } from "../aurora/character";
import { resolve } from "../aurora/engine";
import { autoFill } from "../aurora/autofill";
import { BookIndex, bookKey, groupVariants } from "../aurora/books";
import { conceptOf, conceptOfMarker } from "./concepts";
import type { AElement } from "../aurora/types";

const C = process.env.SOULFORGE_RULES;
const load = () => loadTestContent(C!);

const TYPES = ["Race", "Sub Race", "Background", "Class", "Archetype", "Feat"];
/** What the element gives on its own: the holder minus the bare class. */
function profile(reg: ARegistry, el: AElement, ch: Character) {
  const bare = resolve({ ...ch, race: el.type === "Race" || el.type === "Sub Race" ? undefined : ch.race, background: el.type === "Background" ? undefined : ch.background, extras: [], selections: el.type === "Archetype" || el.type === "Sub Race" ? {} : ch.selections }, reg);
  const r = resolve(ch, reg);
  // By concept, not by id: what the bare character has under any provider's id is not the element's.
  const conceptsOf = (x: typeof r) => {
    const out = new Set<string>();
    for (const a of x.active) { const k = conceptOf(a.el); if (k) out.add(k); }
    for (const id of x.ids) { const k = conceptOfMarker(id); if (k) out.add(k); }
    return out;
  };
  const had = conceptsOf(bare);
  const concepts = new Set([...conceptsOf(r)].filter((k) => !had.has(k)));
  // Aurora gives "martial weapons" as every martial weapon as well; one weapon inside a category the element gives
  // is not a difference.
  if (concepts.has("weapon:simple") || concepts.has("weapon:martial")) for (const k of [...concepts]) if (/^weapon:/.test(k) && k !== "weapon:simple" && k !== "weapon:martial") concepts.delete(k);
  // Armor the same way: Aurora gives "light armor" as each light armor too.
  if (["armor:light", "armor:medium", "armor:heavy"].some((k) => concepts.has(k))) for (const k of [...concepts]) if (/^armor:/.test(k) && !["armor:light", "armor:medium", "armor:heavy", "armor:shield"].includes(k)) concepts.delete(k);
  // Auran, Aquan, Ignan and Terran are dialects of Primordial (2024 5e.tools folds them in).
  for (const d of ["auran", "aquan", "ignan", "terran"]) if (concepts.delete(`language:${d}`)) concepts.add("language:primordial");
  const baseSlots = new Set(bare.slots.map((s) => s.key));
  const choices = new Map<string, number>();
  // The two providers file one decision under different types (Aurora's Draconic Ancestry is a Racial Trait
  // choice, 5e.tools' a Sub Race), so decisions are counted, with spells and cantrips apart.
  for (const s of r.slots) if (!baseSlots.has(s.key) && !s.rule.optional && s.rule.type !== "List") {
    const kind = s.rule.type === "Spell" ? (/cantrip|, ?0\b/i.test(`${s.rule.name} ${s.rule.supports}`) ? "cantrips" : "spells") : "decisions";
    choices.set(kind, (choices.get(kind) ?? 0) + (kind === "decisions" ? 1 : s.rule.number));
  }
  const stat = (n: string) => r.stats.get(n) - bare.stats.get(n);
  const nums: Record<string, number> = {};
  for (const n of ["speed", "strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma", "darkvision"]) { const v = stat(n); if (v) nums[n] = v; }
  return { concepts, choices, nums };
}

it.skipIf(!C || process.env.RULES_TIER !== "parity")("post-import audit", () => {
  const reg = load();
  writeFileSync(join(C!, "engine", "mechanics.md"), ["# Borrowed mechanics", "", ...reg.mechanics.borrowed.map((b) => `- ${b.name} (${b.id}) from ${b.from}: ${b.rules.join(", ")}`)].join("\n"));
  console.log(`PARITY borrowed mechanics for ${reg.mechanics.borrowed.length} features`);
  const books = new BookIndex(reg);
  const out: string[] = ["# Post-import audit", ""];
  const counts: Record<string, number> = {};
  const add = (kind: string, line: string) => { counts[kind] = (counts[kind] ?? 0) + 1; out.push(`- **${kind}**: ${line}`); };
  const shown = (e: AElement) => !e.compendiumHidden && !/unearthed|playtest/i.test(e.source);

  for (const type of TYPES) {
    const groups = groupVariants(reg.ofType(type).filter(shown), books);
    for (const g of groups) {
      // 1. One book from two providers is one entry.
      const byBook = new Map<string, AElement[]>();
      for (const v of g.variants) (byBook.get(bookKey(v.el.source)) ?? byBook.set(bookKey(v.el.source), []).get(bookKey(v.el.source))!).push(v.el);
      for (const [, els] of byBook) if (els.length > 1) add("shown twice", `${type} ${g.name}: ${els.map((e) => `${e.source} (${e.origin ?? "aurora"})`).join(", ")}`);
      // Two variants with one release date from different providers: very likely one book under two names.
      const rel = new Map<number, AElement[]>();
      for (const v of g.variants) if (v.book.release) (rel.get(v.book.release) ?? rel.set(v.book.release, []).get(v.book.release)!).push(v.el);
      for (const [, els] of rel) if (els.length > 1 && new Set(els.map((e) => e.origin === "5etools")).size > 1 && new Set(els.map((e) => bookKey(e.source))).size > 1) add("book named two ways", `${type} ${g.name}: ${els.map((e) => `"${e.source}"`).join(" and ")}`);
    }

    // 2 and 3, per element.
    const twins = new Map<string, { aurora?: AElement; five?: AElement }>();
    for (const el of reg.ofType(type).filter(shown)) {
      const ch = holder(reg, el);
      if (!ch) { if (type !== "Archetype" && type !== "Sub Race") add("cannot be taken", `${type} ${el.name} (${el.source})`); continue; }
      for (let k = 0; k < 2; k++) {
        let c: Character;
        try { c = autoFill(ch, reg, k ? (() => { let x = 7; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })() : undefined); } catch (e) { add("autofill fails", `${type} ${el.name} (${el.source}): ${(e as Error).message}`); break; }
        const r = resolve(c, reg);
        for (const s of r.slots) {
          if (s.rule.optional || s.rule.type === "List" || s.chosen.length >= s.rule.number) continue;
          const pickable = s.options.filter((o) => !s.blocked.has(o.id) && !s.chosen.includes(o.id));
          if (!pickable.length) add("nothing to pick", `${type} ${el.name} (${el.source}): "${s.rule.name}" (${s.rule.type}, ${s.options.length} options, all blocked or taken)`);
        }
      }
      const k = `${bookKey(el.source)}|${el.name.toLowerCase().replace(/[’]/g, "'")}`;
      const t = twins.get(k) ?? twins.set(k, {}).get(k)!;
      if (el.origin === "5etools") t.five ??= el; else t.aurora ??= el;
    }
    for (const [, t] of twins) {
      if (!t.aurora || !t.five) continue;
      const ca = holder(reg, t.aurora), cf = holder(reg, t.five);
      if (!ca || !cf) continue;
      const a = profile(reg, t.aurora, ca), f = profile(reg, t.five, cf);
      const label = `${type} ${t.aurora.name} (${t.aurora.source})`;
      const onlyA = [...a.concepts].filter((x) => !f.concepts.has(x)), onlyF = [...f.concepts].filter((x) => !a.concepts.has(x));
      if (onlyA.length || onlyF.length) add("twins differ: grants", `${label}: only Aurora ${onlyA.join(", ") || "-"}; only 5e.tools ${onlyF.join(", ") || "-"}`);
      const ct = new Set([...a.choices.keys(), ...f.choices.keys()]);
      const cd = [...ct].filter((x) => (a.choices.get(x) ?? 0) !== (f.choices.get(x) ?? 0)).map((x) => `${x} ${a.choices.get(x) ?? 0} vs ${f.choices.get(x) ?? 0}`);
      if (cd.length) add("twins differ: choices", `${label}: Aurora vs 5e.tools ${cd.join("; ")}`);
      const nk = new Set([...Object.keys(a.nums), ...Object.keys(f.nums)]);
      const nd = [...nk].filter((x) => (a.nums[x] ?? 0) !== (f.nums[x] ?? 0)).map((x) => `${x} ${a.nums[x] ?? 0} vs ${f.nums[x] ?? 0}`);
      if (nd.length) add("twins differ: numbers", `${label}: Aurora vs 5e.tools ${nd.join("; ")}`);
    }
  }
  out.splice(2, 0, `Counts: ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}`, "");
  mkdirSync(join(C!, "engine"), { recursive: true });
  writeFileSync(join(C!, "engine", "parity.md"), out.join("\n"));
  console.log(`PARITY ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(", ")}`);
}, 7200000);
