/**
 * The mechanics table (docs/ENGINE-PLAN.md, 3.2 and E3). 5e.tools keeps most feature mechanics only in prose: its
 * Unarmored Defense has no AC formula, its College of Valor no armor training, its Mobile feat no speed. Where the
 * same feature exists in Aurora's content, its mechanics are known, so the 5e.tools copy takes them.
 *
 * Determinism: two features are the same when they have the same kind, the same name, the same edition and the same
 * owner (the class, subclass, species, background or feat they come with, by name). Ids are never compared. Only
 * what the 5e.tools copy lacks is added: a stat it does not set, a training it does not give. Rules that test
 * Aurora-only ids are left out, so nothing depends on content the character may not have. Every borrowed rule is
 * recorded in the report.
 */
import type { AElement, ARule } from "../aurora/types";
import { conceptOf, conceptOfMarker } from "./concepts";
import { isModern } from "../aurora/edition";
import { bookKey } from "../aurora/books";

const ROOT_TYPES = new Set(["Class", "Archetype", "Race", "Sub Race", "Race Variant", "Background", "Feat"]);
const FEATURE_TYPES = new Set(["Class Feature", "Archetype Feature", "Racial Trait", "Background Feature", "Feat Feature", "Feat"]);

const norm = (s: string) => s.toLowerCase().replace(/^level \d+:\s*/, "").replace(/[’‘`]/g, "'").replace(/\s*\((?:20\d\d|legacy)\)\s*$/, "").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();

export interface MechanicsReport {
  /** Features of 5e.tools content that took mechanics from their Aurora twin. */
  borrowed: { id: string; name: string; from: string; rules: string[] }[];
}

/** Which roots each element is reached from, by grant: a feature's owners. */
function ownersOf(all: AElement[], byId: Map<string, AElement>, rootsById: Map<string, Set<string>>): Map<string, Set<string>> {
  const parents = new Map<string, Set<string>>();
  for (const el of all) for (const r of el.rules) if (r.kind === "grant" && r.id) (parents.get(r.id) ?? parents.set(r.id, new Set()).get(r.id)!).add(el.id);
  const memo = new Map<string, Set<string>>();
  const roots = (id: string, depth: number): Set<string> => {
    const hit = memo.get(id);
    if (hit) return hit;
    const out = new Set<string>();
    const rootIds = rootsById.get(id) ?? rootsById.set(id, new Set()).get(id)!;
    memo.set(id, out);
    if (depth > 8) return out;
    for (const p of parents.get(id) ?? []) {
      const pe = byId.get(p);
      if (!pe) continue;
      if (ROOT_TYPES.has(pe.type)) { out.add(`${pe.type === "Race Variant" ? "Sub Race" : pe.type}:${norm(pe.name)}`); rootIds.add(pe.id); }
      else { for (const x of roots(p, depth + 1)) out.add(x); for (const x of rootsById.get(p) ?? []) rootIds.add(x); }
    }
    return out;
  };
  const result = new Map<string, Set<string>>();
  for (const el of all) if (FEATURE_TYPES.has(el.type)) result.set(el.id, el.type === "Feat" ? new Set(["Feat:" + norm(el.name)]) : roots(el.id, 0));
  return result;
}

/** A rule that only tests things every character can have: stats, levels, equipment; no content ids. */
/**
 * A rule that only tests things every character can have: stats, levels, equipment, and trainings ("unless you
 * already have Smith's Tools"), whose concept is the same whoever names it. A test of any other content id is not
 * portable.
 */
function portable(r: ARule, byId: Map<string, AElement>): boolean {
  const text = ("requirements" in r ? r.requirements ?? "" : "") + ("equipped" in r ? (r as { equipped?: string }).equipped ?? "" : "");
  return [...text.matchAll(/ID_[A-Z0-9_]+/g)].every((m) => { const t = byId.get(m[0]); return !!(t ? conceptOf(t) : conceptOfMarker(m[0])); });
}

export function borrowMechanics(byId: Map<string, AElement>): MechanicsReport {
  const report: MechanicsReport = { borrowed: [] };
  const all = [...byId.values()];
  if (!all.some((e) => e.origin === "5etools") || !all.some((e) => e.origin !== "5etools")) return report;
  const rootsById = new Map<string, Set<string>>();
  const owners = ownersOf(all, byId, rootsById);
  // The stats an owner sets itself or through its direct grants (the 5e.tools class sets its spell slots on the
  // class): a feature does not borrow what its owner already gives.
  const statsOf = (id: string) => new Set((byId.get(id)?.rules ?? []).filter((r) => r.kind === "stat").map((r) => (r as { name: string }).name.toLowerCase()));
  const ownerStats = new Map<string, Set<string>>();
  const statsUnder = (rootId: string) => {
    let set = ownerStats.get(rootId);
    if (!set) {
      set = statsOf(rootId);
      for (const r of byId.get(rootId)?.rules ?? []) if (r.kind === "grant" && r.id) for (const n of statsOf(r.id)) set.add(n);
      ownerStats.set(rootId, set);
    }
    return set;
  };
  const keyOf = (el: AElement) => `${el.type}|${norm(el.name)}|${isModern(el) ? "2024" : "2014"}`;
  const aurora = new Map<string, AElement[]>();
  for (const el of all) if (el.origin !== "5etools" && FEATURE_TYPES.has(el.type)) (aurora.get(keyOf(el)) ?? aurora.set(keyOf(el), []).get(keyOf(el))!).push(el);
  const conceptsOf = (el: AElement) => new Set(el.rules.flatMap((r) => (r.kind === "grant" && r.id ? [conceptOf(byId.get(r.id) ?? { type: r.type, id: r.id, name: "" }) ?? conceptOfMarker(r.id) ?? ""] : [])).filter(Boolean));
  for (const el of all) {
    if (el.origin !== "5etools" || !FEATURE_TYPES.has(el.type)) continue;
    const mine = owners.get(el.id) ?? new Set<string>();
    // The twin: same kind, name and edition, and an owner in common (a feat is its own owner).
    let twins = (aurora.get(keyOf(el)) ?? []).filter((t) => [...(owners.get(t.id) ?? [])].some((o) => mine.has(o)));
    // A reprint and its playtest share a name and an owner: the one from the same book is the twin.
    if (twins.length > 1) twins = twins.filter((t) => bookKey(t.source) === bookKey(el.source));
    if (twins.length !== 1) continue; // none, or more than one: nothing is guessed
    const twin = twins[0];
    const setHere = new Set(el.rules.filter((r) => r.kind === "stat").map((r) => (r as { name: string }).name.toLowerCase()));
    for (const rid of rootsById.get(el.id) ?? []) for (const n of statsUnder(rid)) setHere.add(n);
    const givenHere = conceptsOf(el);
    const added: ARule[] = [];
    for (const r of twin.rules) {
      if (!portable(r, byId)) continue;
      if (r.kind === "stat" && !setHere.has(r.name.toLowerCase())) added.push(r);
      if (r.kind === "grant" && r.id) {
        const target = byId.get(r.id);
        const k = target ? conceptOf(target) : conceptOfMarker(r.id);
        // Only trainings, senses, languages and sizes: their concept is the same whoever names it.
        if (k && !givenHere.has(k)) added.push(r);
      }
      // A training given with a fallback ("smith's tools, or another artisan's tool if you have them"): Aurora writes
      // it as a choice with a default. Other choices are not borrowed; the copy has its own (its expertise).
      if (r.kind === "select" && r.default && (r.type === "Proficiency" || r.type === "Language") && !el.rules.some((x) => x.kind === "select" && x.type === r.type)) {
        const opts = [...byId.values()].filter((o) => o.type === r.type && o.supports.some((t) => r.supports.split(/[,|]/).map((x) => x.trim()).includes(t)));
        if (opts.length && opts.every((o) => conceptOf(o))) added.push(r);
      }
    }
    if (!added.length) continue;
    el.rules = [...el.rules, ...added];
    report.borrowed.push({ id: el.id, name: el.name, from: twin.id, rules: added.map((r) => (r.kind === "stat" ? `${r.name} ${r.value}` : r.kind === "grant" ? r.id : "")) });
  }
  return report;
}

const SKILL_NAMES = ["acrobatics", "animal handling", "arcana", "athletics", "deception", "history", "insight", "intimidation", "investigation", "medicine", "nature", "perception", "performance", "persuasion", "religion", "sleight of hand", "stealth", "survival"];

/**
 * An effect on every skill is an effect on every ability check, and initiative is a Dexterity check (PHB 2014 p.177;
 * PHB 2024, Initiative). Content that adds the same bonus to all eighteen skills (Jack of All Trades) but not to
 * initiative gets it there too, once, with the same stacking group. Returns the ids changed.
 */
export function checksIncludeInitiative(byId: Map<string, AElement>): string[] {
  const changed: string[] = [];
  for (const el of byId.values()) {
    const stats = el.rules.filter((r): r is Extract<ARule, { kind: "stat" }> => r.kind === "stat");
    if (!stats.length || stats.some((r) => r.name.toLowerCase() === "initiative" || r.name.toLowerCase() === "initiative:misc")) continue;
    const per = new Map<string, { value: string; bonus?: string }>();
    for (const r of stats) { const m = /^(.+):misc$/.exec(r.name.toLowerCase()); if (m && SKILL_NAMES.includes(m[1])) per.set(m[1], { value: r.value, bonus: r.bonus }); }
    if (per.size !== SKILL_NAMES.length) continue;
    const vals = new Set([...per.values()].map((v) => `${v.value}|${v.bonus ?? ""}`));
    if (vals.size !== 1) continue;
    const { value, bonus } = [...per.values()][0];
    el.rules = [...el.rules, { kind: "stat", name: "initiative", value, ...(bonus ? { bonus } : {}) } as ARule];
    changed.push(el.id);
  }
  return changed;
}
