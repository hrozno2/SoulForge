/**
 * Audit E1: saved picks under old keys are upgraded once, at the door (`upgradeSelections`), instead of being read anew by every pass over
 * every choice. A character saved before stable keys (docs/ENGINE-PLAN.md 1.6) has its picks under the choice's
 * position in its element ("<element id>|<n>"); the content has moved its rules since. `upgradePositionKeys` gives
 * each choice the picks the resolver used to work out for it, under the choice's stable key. The position keys stay
 * in the character as they were (nothing is thrown away, and a book not loaded now can still be read later); a
 * stable key always wins over them.
 */
import type { Character } from "../aurora/character";
import type { ARegistry } from "../aurora/registry";
import type { AElement, SelectRule } from "../aurora/types";
import { choiceKey, skippable } from "../aurora/engine";

/**
 * Whether old picks are among a choice's options, so a pick that only shares the kind is not read into it (a
 * species' two Standard languages are not its optional "Customized Language" picks). A filter that depends on the
 * character ("$(spellcasting:...)") is not judged here.
 */
function offers(reg: ARegistry, rule: SelectRule, ids: string[]): boolean {
  if (!rule.supports || rule.supports.includes("$(")) return true;
  const offered = new Set(reg.find(rule.type, rule.supports).map((e) => e.id));
  return ids.every((id) => offered.has(id));
}

/**
 * A pick whose position moved: the content moved its rules since (a species' Size was its 2nd rule, its languages the
 * 6th). An old pick at another position of this element, that position no longer holding a choice it fits, is this
 * choice's when it is the only one whose every pick is among this choice's options (2026-10-29: saved 2024 species
 * lost their size and languages).
 */
function moved(ch: Character, reg: ARegistry, el: AElement, rule: SelectRule, idx: number): string[] | undefined {
  if (rule.type === "List" || !rule.supports) return undefined;
  const prefix = `${el.id}|`;
  const keys = Object.keys(ch.selections).filter(
    (k) => k.startsWith(prefix) && /^\d+$/.test(k.slice(prefix.length)) && Number(k.slice(prefix.length)) !== idx,
  );
  if (!keys.length) return undefined;
  const offered = new Set(reg.find(rule.type, rule.supports).map((e) => e.id));
  const fitsAt = (n: number, ids: string[]) => {
    const r = el.rules[n];
    // An optional choice at that position does not hold on to it against this required one, nor one switched off by
    // an option the character does not use (Tasha's "Customized Language").
    const off = (x: { requirements?: string }) => {
      const q = (x.requirements ?? "").trim();
      return /^ID_[A-Z0-9_]+$/.test(q) && !ch.options.includes(q);
    };
    return (
      !!r &&
      r.kind === "select" &&
      !off(r as { requirements?: string }) &&
      ids.every((id) => reg.get(id)?.type === r.type) &&
      offers(reg, r, ids) &&
      !(skippable(r, el) && !skippable(rule, el) && offers(reg, rule, ids))
    );
  };
  const found = keys.filter((k) => {
    const ids = ch.selections[k] ?? [];
    return ids.length > 0 && !fitsAt(Number(k.slice(prefix.length)), ids) && ids.every((id) => offered.has(id));
  });
  return found.length === 1 ? ch.selections[found[0]] : undefined;
}

/** The picks a choice reads from the character's old position keys; undefined when it has its own, or none fits. */
function fromPosition(ch: Character, reg: ARegistry, el: AElement, rule: SelectRule, idx: number): string[] | undefined {
  if (ch.selections[choiceKey(el, rule, idx)] !== undefined) return undefined;
  // Read only when every pick is of this choice's kind, so a pick that now sits at another position is never taken
  // for this one.
  const old = ch.selections[`${el.id}|${idx}`];
  // An optional choice (Customized Language) leaves an old pick to a required one of its kind that also offers it and
  // has none (the species' own Language): the pick was made for that one.
  const requiredTakes = (ids: string[]) =>
    skippable(rule, el) &&
    el.rules.some(
      (r, j) =>
        j !== idx &&
        r.kind === "select" &&
        r.type === rule.type &&
        !skippable(r, el) &&
        ch.selections[choiceKey(el, r, j)] === undefined &&
        offers(reg, r, ids),
    );
  // Whether the pick is among the options is asked only where the element has another choice of the same kind to mix
  // it up with; elsewhere the kind settles it (options built at run time, such as a class's increases, are not all in
  // the registry's list).
  const twin = el.rules.some((r, j) => j !== idx && r.kind === "select" && r.type === rule.type);
  const fits =
    !!old &&
    (rule.type === "List" ||
      (old.every((id) => reg.get(id)?.type === rule.type) && (!twin || (offers(reg, rule, old) && !requiredTakes(old)))));
  return fits ? old : moved(ch, reg, el, rule, idx);
}

/**
 * A class's multiclass block is walked as an element of its own (the id the content gives the block), though the
 * registry holds none: the same stand-in the resolver makes, so its choices have the same keys.
 */
const MULTICLASS = new WeakMap<ARegistry, Map<string, AElement>>();
function multiclassBlock(reg: ARegistry, id: string): AElement | undefined {
  let byId = MULTICLASS.get(reg);
  if (!byId) {
    byId = new Map();
    for (const cls of reg.ofType("Class"))
      if (cls.multiclass)
        byId.set(cls.multiclass.id, {
          id: cls.multiclass.id,
          name: `${cls.name} (multiclass)`,
          type: "Multiclass",
          source: cls.source,
          supports: [],
          description: "",
          compendiumHidden: true,
          setters: cls.multiclass.setters,
          rules: cls.multiclass.rules,
        });
    MULTICLASS.set(reg, byId);
  }
  return byId.get(id);
}

/**
 * The character with every choice's old position-keyed picks written under the choice's stable key. The same object
 * when it has no position keys (or none that any loaded element's choice reads).
 */
/** The upgrade of one saved set of picks, kept while that set is the character's (every pass asks again). */
const DONE = new WeakMap<Record<string, string[]>, { reg: ARegistry; options: string[]; next: Record<string, string[]> | undefined }>();

export function upgradePositionKeys(ch: Character, reg: ARegistry): Character {
  const kept = DONE.get(ch.selections);
  if (kept && kept.reg === reg && kept.options === ch.options) return kept.next ? { ...ch, selections: kept.next } : ch;
  const next = upgraded(ch, reg);
  DONE.set(ch.selections, { reg, options: ch.options, next });
  return next ? { ...ch, selections: next } : ch;
}

function upgraded(ch: Character, reg: ARegistry): Record<string, string[]> | undefined {
  const owners = new Set<string>();
  for (const key of Object.keys(ch.selections)) {
    const m = /^(.*)\|\d+$/.exec(key);
    if (m) owners.add(m[1]);
  }
  if (!owners.size) return undefined;
  let next: Record<string, string[]> | undefined;
  for (const id of owners) {
    const el = reg.get(id) ?? multiclassBlock(reg, id);
    if (!el) continue;
    el.rules.forEach((rule, idx) => {
      if (rule.kind !== "select") return;
      // Each choice reads the character as it was saved: one choice's upgrade never changes what another reads.
      const picks = fromPosition(ch, reg, el, rule, idx);
      if (picks) (next ??= { ...ch.selections })[choiceKey(el, rule, idx)] = picks;
    });
  }
  return next;
}

/**
 * Characters saved before a choice of two +1s became "+2 to one ability" or "+1 to two abilities" (registry.ts,
 * plusTwoChoices) keep their two +1s: the picks move inside "+1 to two abilities". Nothing else changes.
 */
function upgradePlusTwo(ch: Character, reg: ARegistry): Character {
  let out: Character | undefined;
  for (const [key, ids] of Object.entries(ch.selections)) {
    if (!ids.length || ids.some((id) => id.startsWith("ID_INTERNAL_PLUS_TWO_"))) continue;
    // Both key forms: "<id>#<hash>" (choiceKey) and the oldest saves' "<id>|<rule index>", which the resolver still
    // reads; a two-+1 pick under either moves inside "+1 to two abilities" (missed for the old form: one +1 was lost).
    const legacy = /^(.*)\|(\d+)$/.exec(key);
    const el = reg.get(legacy ? legacy[1] : key.split("#")[0]);
    if (!el) continue;
    el.rules.forEach((rule, idx) => {
      if (rule.kind !== "select" || !rule.supports.startsWith("Plus two ")) return;
      if (legacy ? Number(legacy[2]) !== idx : choiceKey(el, rule, idx) !== key) return;
      const plus1 = reg.get(`ID_INTERNAL_${`PLUS_TWO_${el.id}_${idx}`.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_PLUS1`);
      const inner = plus1?.rules[0];
      if (!plus1 || inner?.kind !== "select") return;
      out ??= { ...ch, selections: { ...ch.selections } };
      if (legacy) delete out.selections[key];
      out.selections[choiceKey(el, rule, idx)] = [plus1.id];
      out.selections[choiceKey(plus1, inner, 0)] = ids;
    });
  }
  return out ?? ch;
}

/** Everything a saved character's picks need before the resolver reads them: the two upgrades, in the order they came. */
export function upgradeSelections(ch: Character, reg: ARegistry): Character {
  return upgradePositionKeys(upgradePlusTwo(ch, reg), reg);
}
