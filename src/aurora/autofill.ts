import type { ARegistry } from "./registry";
import type { Character } from "./character";
import { resolve } from "./engine";

/**
 * Fills every open choice with the first sensible option. Used for random characters and tests.
 * `prefer` can steer picks, for example by element name.
 */
export function autoFill(ch: Character, reg: ARegistry, prefer: (slotName: string, optionName: string) => number = () => 0): Character {
  let cur = ch;
  for (let i = 0; i < 600; i++) {
    const r = resolve(cur, reg);
    const open = r.slots.find((s) => !s.rule.optional && !s.defaulted && s.chosen.length < s.rule.number && s.options.length);
    if (!open) break;
    const taken = new Set(open.chosen);
    const candidates = open.options
      .filter((o) => !taken.has(o.id) && !open.blocked.has(o.id) && !r.ids.has(o.id))
      .sort((a, b) => prefer(open.rule.name, b.name) - prefer(open.rule.name, a.name));
    const pick = candidates[0] ?? open.options.find((o) => !taken.has(o.id));
    if (!pick) break;
    cur = { ...cur, selections: { ...cur.selections, [open.key]: [...open.chosen, pick.id] } };
  }
  return cur;
}
