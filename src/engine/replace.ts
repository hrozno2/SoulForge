/**
 * Choices the rules let a character change after making them, so a pick is judged against the character's current
 * level, not only the level the choice opened at (docs/ENGINE-PLAN.md, 3.4). Everything else (feats, ability
 * increases, subclasses, species and background choices, spellbook spells) is fixed once made.
 *
 * - Spells known and cantrips: replace one when gaining a level in the class (PHB 2014 and 2024, every known caster;
 *   2024 cantrips too). Feat spells such as Magic Initiate (2024) likewise.
 * - Eldritch Invocations, Artificer Infusions, Maneuvers, Metamagic, Elemental Disciplines (PHB 2014 Way of the Four
 *   Elements: replace one whenever you learn a new one): replace one when gaining a level.
 * - Fighting Style (2024 Fighter), Weapon Mastery (change after a long rest): changeable.
 * - Content marked allowReplace.
 */
import type { SelectSlot } from "../aurora/engine";

const CHANGEABLE = /invocation|infusion|maneuver|metamagic|elemental discipline|fighting style|weapon mastery|mastery property/i;

export function replaceable(s: Pick<SelectSlot, "rule">): boolean {
  const r = s.rule;
  if (r.allowReplace) return true;
  if (r.type === "Spell") return !/spellbook/i.test(r.name);
  return CHANGEABLE.test(`${r.name} ${r.supports}`);
}
