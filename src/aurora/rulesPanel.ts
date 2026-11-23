/**
 * The rules check in one panel (Chris 2026-11-23, plan item 5). Everything the app has to say about whether a
 * character follows the rules is sorted into three kinds, and said in one place:
 *
 * - to fix: against the rules, or left over in the file (a pick a choice no longer offers, earlier choices with no
 *   place now). Each can be put right, or kept on purpose as a table ruling.
 * - your call: within the rules but perhaps not meant (point buy points unspent), and content problems the player
 *   cannot repair in the character (a reference to something the loaded content does not have).
 * - accepted: findings the player keeps on purpose, the table rulings.
 *
 * The older-build notice and the import report point here instead of keeping lists of their own.
 */
import type { Finding } from "./rulesCheck";

export interface PanelInput {
  rules: Finding[];
  content: Finding[];
  notes: Finding[];
  accepted: Finding[];
}

export interface RulesPanel {
  toFix: Finding[];
  yourCall: Finding[];
  accepted: Finding[];
}

const key = (f: Finding) => `${f.rule}|${f.detail}`;

/**
 * The three kinds. `stale` is what an older build's character holds that no longer lines up (olderBuild's
 * misalignments); what the check's own findings already say is not said twice.
 */
export function rulesPanel(res: PanelInput, stale: Finding[] = []): RulesPanel {
  const seen = new Set<string>();
  const once = (list: Finding[]) => list.filter((f) => !seen.has(key(f)) && !!seen.add(key(f)));
  const accepted = once(res.accepted);
  const toFix = once([...res.rules, ...res.content.filter((f) => f.fix), ...stale]);
  const yourCall = once([...res.notes, ...res.content.filter((f) => !f.fix)]);
  return { toFix, yourCall, accepted };
}

const count = (n: number, one: string) => (n ? `${n} ${one}` : "");

/** The panel's one-line verdict: "Follows the rules", or how many of each kind. */
export function panelVerdict(p: RulesPanel): string {
  const rulings = p.accepted.length ? `${p.accepted.length} table ${p.accepted.length === 1 ? "ruling" : "rulings"}` : "";
  if (!p.toFix.length) {
    const rest = [rulings && `with ${rulings}`, count(p.yourCall.length, "to look at")].filter(Boolean);
    return `Follows the rules${rest.length ? `, ${rest.join("; ")}` : ""}`;
  }
  return [count(p.toFix.length, "to fix"), count(p.yourCall.length, "your call"), rulings && `${rulings} accepted`]
    .filter(Boolean)
    .join(", ");
}

/** How the panel is coloured: something to fix, something to look at, or all well. */
export const panelTone = (p: RulesPanel): "bad" | "warn" | "ok" => (p.toFix.length ? "bad" : p.yourCall.length ? "warn" : "ok");
