/** E3.1: applying a rules-check finding's fix to the character (the fix itself is made by rulesCheck.ts). */
import type { Character } from "./character";
import type { FindingFix } from "./rulesCheck";

/**
 * Writes the choice's picks under its own key, an empty list included: the engine reads an older key only while the
 * choice's own is missing, so deleting it would bring an older file's pick back.
 */
export function applyFix(ch: Character, fix: FindingFix): Character {
  if (fix.clear) {
    const selections = { ...ch.selections };
    for (const k of fix.clear) delete selections[k];
    return { ...ch, selections };
  }
  let next = [...new Set(fix.picks)];
  if (fix.remove) next = next.filter((id) => !fix.remove!.includes(id));
  if (fix.keep !== undefined) next = next.slice(0, fix.keep);
  return { ...ch, selections: { ...ch.selections, [fix.slot]: next } };
}
