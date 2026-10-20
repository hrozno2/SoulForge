import type { ARegistry } from "./registry";
import type { Character } from "./character";
import { resolve, stillToChoose } from "./engine";
import { totalLevel } from "./character";
import { atLevel } from "../engine/timeline";
import { conceptOf } from "../engine/concepts";
import { buildSheet, preparePool } from "./sheet";

/**
 * Fills every open choice with the first sensible option. Used for random characters and tests.
 * `prefer` can steer picks, for example by element name.
 */
export function autoFill(ch: Character, reg: ARegistry, prefer: (slotName: string, optionName: string) => number = () => 0, allow: (el: import("./types").AElement) => boolean = () => true): Character {
  let cur = ch;
  // Picks that made an earlier choice illegal (2014 Alert at level 4 after 2024 Alert at level 5), not tried again.
  const bad = new Set<string>();
  // A pick that makes an earlier choice illegal, or opens a choice with no legal option left (Resilient for a
  // monk who already has every saving throw), is a dead end.
  const blockedCount = (r: ReturnType<typeof resolve>) => r.slots.reduce((n, s) => {
    const dead = !s.rule.optional && s.chosen.length < s.rule.number && s.options.length > 0 && s.options.every((o) => s.chosen.includes(o.id) || s.blocked.has(o.id) || r.ids.has(o.id));
    return n + s.chosen.filter((id) => s.blocked.has(id)).length + (dead ? 1 : 0);
  }, 0);
  // Level by level, the way a player builds: origin and level 1 first, then each level's new choices, judged against
  // the character at that level. Each pick then only touches the level being built (the timeline reuses the levels
  // below it), and no choice is filled with something only a later level allows.
  const total = totalLevel(ch);
  for (let n = total === 0 ? 0 : 1; n <= total; n++) cur = fillLevel(cur, n);
  return prepareSpells(cur);

  /**
   * Prepared casters prepare up to what the rules allow, from the list they prepare from (a wizard's spellbook, a
   * cleric's class list), keeping what is already prepared. The same order as every other pick.
   */
  function prepareSpells(start: Character): Character {
    const r = resolve(start, reg);
    let prepared = { ...start.prepared };
    let changed = false;
    for (const line of buildSheet(r).casting) {
      if (!line.prepare || line.prepareMax <= 0) continue;
      const always = new Set([...line.granted.map((g) => g.id), ...line.spells.filter((p) => p.granted).map((p) => p.id)]);
      const have = (prepared[line.name] ?? []).filter((id) => !always.has(id));
      if (have.length >= line.prepareMax) continue;
      const pool = preparePool(r, line).filter((e) => !always.has(e.id) && !have.includes(e.id) && allow(e)).sort((a, b) => prefer(`Prepared (${line.name})`, b.name) - prefer(`Prepared (${line.name})`, a.name));
      prepared = { ...prepared, [line.name]: [...have, ...pool.slice(0, line.prepareMax - have.length).map((e) => e.id)] };
      changed = true;
    }
    return changed ? { ...start, prepared } : start;
  }

  function fillLevel(start: Character, n: number): Character {
  let cur = start;
  for (let i = 0; i < 600; i++) {
    const r = resolve(atLevel(cur, n), reg);
    const open = r.slots.find((s) => !s.defaulted && stillToChoose(s, r));
    if (!open) break;
    const taken = new Set(open.chosen);
    // Not what the character already has, under any provider's id.
    const hadConcepts = new Set(r.active.map((a) => conceptOf(a.el)).filter(Boolean));
    const had = (o: (typeof open.options)[number]) => r.ids.has(o.id) || (!!conceptOf(o) && hadConcepts.has(conceptOf(o)));
    const free = open.options.filter((o) => !taken.has(o.id) && !open.blocked.has(o.id) && !had(o) && !bad.has(`${open.key} ${o.id}`));
    // Options from books the player shows come first; the others only when nothing else fits.
    const shown = free.filter(allow);
    const candidates = (shown.length ? shown : free)
      .sort((a, b) => prefer(open.rule.name, b.name) - prefer(open.rule.name, a.name));
    // If every allowed option leads to a dead end somewhere else, the best allowed one is still better than none;
    // an option the rules rule out is never picked (with none allowed, stillToChoose leaves the choice alone).
    const pick = candidates[0] ?? open.options.find((o) => !taken.has(o.id) && !open.blocked.has(o.id));
    if (!pick) break;
    const next = { ...cur, selections: { ...cur.selections, [open.key]: [...open.chosen, pick.id] } };
    if (candidates.length > 1 && blockedCount(resolve(atLevel(next, n), reg)) > blockedCount(r)) { bad.add(`${open.key} ${pick.id}`); continue; }
    cur = next;
  }
  return cur;
  }
}
