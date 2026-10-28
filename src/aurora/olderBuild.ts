/**
 * Characters saved by an older Soul Forge (Chris, 2026-10-27: "if something isn't aligned Soul Forge lets them know").
 * Content and rules move on between versions: a pick a choice no longer offers (an edition rule, a requirement), a
 * reference to content that is gone, or anything the rules check now finds. When a character is opened in a version
 * it was not checked in, these are listed once; the player reads them and the character is marked as checked.
 */
import type { Resolved } from "./engine";
import type { Character } from "./character";
import type { Finding } from "./rulesCheck";

/** Choices still to make are shown by the Build tab's badges, not here. */
const OPEN_CHOICE = /^A required choice is not made$/;

/** Picks a choice holds that it no longer offers (or now rules out), one line per choice: "Cantrip: A, B (now ruled out)". */
export function picksNoLongerOffered(r: Resolved): Finding[] {
  const lines = new Map<string, { gone: string[]; out: string[] }>();
  for (const s of r.slots) {
    if (s.rule.type === "List" || s.defaulted) continue;
    for (const id of s.chosen) {
      if (s.options.some((o) => o.id === id) && !s.blocked.has(id)) continue;
      const line = lines.get(s.rule.name) ?? lines.set(s.rule.name, { gone: [], out: [] }).get(s.rule.name)!;
      (s.blocked.has(id) ? line.out : line.gone).push(r.reg.get(id)?.name ?? id);
    }
  }
  const uniq = (xs: string[]) => [...new Set(xs)].join(", ");
  return [...lines].map(([name, l]) => ({
    rule: "A pick is no longer offered",
    detail: `${name}: ${[l.gone.length ? uniq(l.gone) : "", l.out.length ? `${uniq(l.out)} (now ruled out)` : ""].filter(Boolean).join("; ")}`,
  }));
}

/** What no longer lines up for this character: picks no longer offered, then the rules check's findings. */
export function misalignments(r: Resolved, findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const stale = picksNoLongerOffered(r);
  // "Choice: Pick" pairs the stale lines already name; the rules check's "does not meet its requirements" for the same
  // pick says it again.
  const named = new Set(stale.flatMap((f) => { const [choice, rest] = f.detail.split(/: (.*)/s); return (rest ?? "").replace(/\s*\(now ruled out\)/g, "").split(/[;,]\s*/).map((p) => `${choice}: ${p.trim()}`); }));
  const said = (f: Finding) => /does not meet its requirements/.test(f.rule) && named.has(f.detail.trim());
  return [...stale, ...findings.filter((f) => !OPEN_CHOICE.test(f.rule) && !said(f))].filter((f) => {
    const k = `${f.rule}|${f.detail}`;
    return !seen.has(k) && !!seen.add(k);
  });
}

/** True when the character was last checked in another version (or never): its notice is due. */
export const checkDue = (ch: Character, version: string) => ch.classes.length > 0 && ch.checkedWith !== version;

/** The character marked as checked in this version. */
export const markChecked = (ch: Character, version: string): Character => ({ ...ch, checkedWith: version });
