/**
 * Loads a registry (Aurora XML and converted 5e.tools, as parsed today) into the canonical model (ir.ts).
 * Step one of E1 in docs/ENGINE-PLAN.md: shared concepts get one key whatever source names them, every reference
 * is rewritten to canonical keys, and choices get stable keys. Later steps load 5e.tools JSON directly.
 */
import type { AElement, ARule } from "../aurora/types";
import type { ARegistry } from "../aurora/registry";
import { isModern } from "../aurora/edition";
import { conceptOf, conceptOfMarker } from "./concepts";
import type { Choice, Content, Effect, IRElement, LoadReport, Origin } from "./ir";

const CONCEPT_TYPES = new Set(["Proficiency", "Language", "Vision", "Size"]);
/** Grant targets that are markers or internal switches, not content (they never exist as elements). */
const isInternalRef = (id: string) => /^ID_INTERNAL_/.test(id) || /^SPELLREF:/.test(id);

const originOf = (e: AElement): Origin => (e.origin === "5etools" ? "5etools" : "aurora");

/** A short, stable hash of a string (FNV-1a, 32 bit), as base 36. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export function loadContent(reg: ARegistry): Content {
  const all = reg.all();
  const keyOf = new Map<string, string>();
  const report: LoadReport = { elements: 0, bySource: { aurora: 0, "5etools": 0 }, merged: 0, sharedConcepts: [], unmappedConcepts: [], danglingRefs: [], repeatedChoices: 0 };

  // 1. Canonical keys. A concept element is keyed by its concept; the first source to provide it is the primary
  //    (Aurora before 5e.tools, then by id, so the result never depends on load order).
  const sorted = [...all].sort((a, b) => (originOf(a) === originOf(b) ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : originOf(a) === "aurora" ? -1 : 1));
  const conceptOrigins = new Map<string, Set<Origin>>();
  for (const e of sorted) {
    const concept = CONCEPT_TYPES.has(e.type) ? conceptOf(e) : undefined;
    if (CONCEPT_TYPES.has(e.type) && !concept) report.unmappedConcepts.push({ id: e.id, name: e.name, type: e.type });
    keyOf.set(e.id, concept ?? e.id);
    if (concept) (conceptOrigins.get(concept) ?? conceptOrigins.set(concept, new Set()).get(concept)!).add(originOf(e));
  }
  report.sharedConcepts = [...conceptOrigins].filter(([, o]) => o.size > 1).map(([k]) => k).sort();

  // 2. Elements, with references rewritten to canonical keys.
  const elements = new Map<string, IRElement>();
  const ref = (owner: string, id: string, kind: string): string => {
    const k = keyOf.get(id) ?? conceptOfMarker(id);
    if (k) return k;
    if (!isInternalRef(id)) report.danglingRefs.push({ owner, ref: id, kind });
    return id;
  };
  for (const e of sorted) {
    const key = keyOf.get(e.id)!;
    const source = { id: e.id, book: e.source, origin: originOf(e) };
    report.bySource[source.origin]++;
    const existing = elements.get(key);
    if (existing) {
      // The same concept from another source: one element, its sources listed; the primary keeps the mechanics.
      existing.sources.push(source);
      report.merged++;
      continue;
    }
    const effects: Effect[] = [];
    const choices: Choice[] = [];
    const seen = new Map<string, number>();
    e.rules.forEach((r: ARule, index) => {
      if (r.kind === "grant") {
        const target = ref(e.id, r.id, `grant ${r.type}`);
        const concept = target.includes(":") && !target.startsWith("ID_") ? target : undefined;
        effects.push(concept
          ? { kind: "concept", key: concept, level: r.level, when: r.requirements }
          : { kind: "grant", element: target, elementType: r.type, level: r.level, when: r.requirements, spellcasting: r.spellcasting, prepared: r.prepared });
      } else if (r.kind === "stat") {
        effects.push({ kind: "stat", name: r.name.toLowerCase(), value: r.value, bonus: r.bonus, level: r.level, when: r.requirements, equipped: r.equipped });
      } else {
        const print = `${r.type}\u0000${r.name}\u0000${r.supports}\u0000${r.level ?? ""}\u0000${r.number}`;
        const n = seen.get(print) ?? 0;
        seen.set(print, n + 1);
        if (n > 0) report.repeatedChoices++;
        choices.push({
          key: `${key}#${hash(print)}${n ? `.${n + 1}` : ""}`, legacyKey: `${e.id}|${index}`,
          type: r.type, name: r.name, filter: r.supports, count: r.number, level: r.level, optional: !!r.optional,
          default: r.default ? ref(e.id, r.default, `default of ${r.name}`) : undefined, when: r.requirements, spellcasting: r.spellcasting, items: r.items,
        });
      }
    });
    elements.set(key, {
      key, type: e.type, name: e.name, edition: isModern(e) ? "2024" : "2014", sources: [source],
      concept: key !== e.id ? key : undefined, effects, choices, requires: e.requirements, supports: e.supports, hidden: e.compendiumHidden,
    });
  }
  report.elements = elements.size;
  return { elements, keyOf, report };
}
