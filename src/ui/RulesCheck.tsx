import { useEffect, useMemo, useState } from "react";
import { logEvent } from "../logbook";

/** The last findings logged, so only a change is logged. */
let lastFindings = "";
import type { Resolved } from "../aurora/engine";
import { buildSheet } from "../aurora/sheet";
import { checkCharacter, type Finding } from "../aurora/rulesCheck";
import { ensureRulesRef, onRulesRef, rulesRef } from "../aurora/rulesRefStore";
import { RULES_REF_CLASSES } from "../aurora/rulesRef";
import { markChecked, misalignments } from "../aurora/olderBuild";
import type { Character } from "../aurora/character";

declare const __APP_VERSION__: string;
export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

/** Choices still to make are shown by the Build tab's badges; the check lists only the rest. */
const OPEN_CHOICE = /^A required choice is not made$/;
/** Problems in the content (a reference to something missing) rather than in the character. */
const CONTENT = /^(Content refers to something missing|A required choice has no options|Class not in the rules reference)$/;

export interface RulesCheckResult {
  rules: Finding[];
  content: Finding[];
  /** False when the 5e.tools reference has not been downloaded: class tables were not checked. */
  full: boolean;
}

/** The rules check for a character, kept up to date with the downloaded reference. */
export function useRulesCheck(r: Resolved): RulesCheckResult {
  const [ref, setRef] = useState(rulesRef());
  // Downloaded only for characters with a class 5e.tools covers (not for homebrew-only content).
  const official = r.character.classes.some((c) => RULES_REF_CLASSES.includes((r.reg.get(c.classId)?.name ?? "").toLowerCase()));
  useEffect(() => {
    const off = onRulesRef(() => setRef(rulesRef()));
    if (official) void ensureRulesRef();
    return () => void off();
  }, [official]);
  return useMemo(() => {
    if (!r.character.classes.length) return { rules: [], content: [], full: !!ref };
    let found: Finding[] = [];
    try {
      found = checkCharacter(r, buildSheet(r), ref ?? []);
    } catch (e) {
      // A failing check was silent; the log says so (A2.11).
      logEvent("rules", `rules check failed: ${(e as Error).message}`);
      found = [];
    }
    // The findings when they change (not on every keystroke): what the rules check says about this character.
    const sig = found.map((f) => `${f.rule}: ${f.detail}`).join(" | ");
    if (sig !== lastFindings) {
      lastFindings = sig;
      if (found.length) logEvent("rules", `${found.length} findings for ${r.character.name || "a character"}: ${found.slice(0, 6).map((f) => `${f.rule}: ${f.detail}`).join(" | ")}${found.length > 6 ? " ..." : ""}`);
    }
    const kept = found.filter((f) => !OPEN_CHOICE.test(f.rule) && !(!official && /^Class not in the rules reference$/.test(f.rule)) && !(ref === null && /^Class not in the rules reference$/.test(f.rule)));
    return { rules: kept.filter((f) => !CONTENT.test(f.rule)), content: kept.filter((f) => CONTENT.test(f.rule)), full: !!ref || !official };
  }, [r, ref, official]);
}

/** A bar on the Build tab: "Follows the rules", or each problem and what rule it breaks. */
export function RulesCheckBar({ r }: { r: Resolved }) {
  const res = useRulesCheck(r);
  const [open, setOpen] = useState(false);
  if (!r.character.classes.length) return null;
  const n = res.rules.length + res.content.length;
  return (
    <section className={`rules-check ${res.rules.length ? "bad" : res.content.length ? "warn" : "ok"}`} aria-label="Rules check">
      <button className="rules-check-head" aria-expanded={n ? open : undefined} onClick={() => n && setOpen(!open)}>
        <b>Rules check</b>
        <span>{n === 0 ? "Follows the rules" : `${res.rules.length ? `${res.rules.length} against the rules` : ""}${res.rules.length && res.content.length ? ", " : ""}${res.content.length ? `${res.content.length} content problem${res.content.length > 1 ? "s" : ""}` : ""}`}</span>
        {!res.full && <small className="muted">class tables not checked yet (the rules reference downloads with content)</small>}
        {n > 0 && <span className="chev">{open ? "▴" : "▾"}</span>}
      </button>
      {open && n > 0 && (
        <ul>
          {res.rules.map((f, i) => <li key={`r${i}`}><b>{f.rule}:</b> {f.detail}</li>)}
          {res.content.map((f, i) => <li key={`c${i}`} className="muted"><b>{f.rule}:</b> {f.detail}</li>)}
        </ul>
      )}
    </section>
  );
}

/** The rule problems of a character as plain lines (for the import report and the export warning). */
export function ruleProblems(r: Resolved): string[] {
  if (!r.character.classes.length) return [];
  try {
    return checkCharacter(r, buildSheet(r), rulesRef() ?? [])
      .filter((f) => !OPEN_CHOICE.test(f.rule) && !CONTENT.test(f.rule))
      .map((f) => `${f.rule}: ${f.detail}`);
  } catch {
    return [];
  }
}

/** Before export: a short warning when the character breaks the rules, so a sheet is not printed unaware. */
export function ExportRulesNote({ r }: { r: Resolved }) {
  const res = useRulesCheck(r);
  if (!res.rules.length) return null;
  return (
    <p className="rules-export-note noprint" role="note">
      <b>Rules check:</b> {res.rules.length} {res.rules.length === 1 ? "thing breaks" : "things break"} the rules ({res.rules.slice(0, 2).map((f) => f.rule.toLowerCase()).join("; ")}{res.rules.length > 2 ? "; ..." : ""}). The sheets show the character as it is; the details are on Build.
    </p>
  );
}

/**
 * A character saved by an older Soul Forge, opened in this version: what no longer lines up (picks a choice no longer
 * offers, content that is gone, what the rules check now finds), listed once. "Got it" marks it checked in this
 * version; a character with nothing to report is marked without a word.
 */
export function OlderBuildNotice({ r, set }: { r: Resolved; set: (fn: (c: Character) => Character) => void }) {
  const res = useRulesCheck(r);
  const items = useMemo(() => misalignments(r, [...res.rules, ...res.content]), [r, res]);
  const ready = res.full;
  useEffect(() => {
    if (ready && !items.length) set((c) => markChecked(c, APP_VERSION));
  }, [ready, items.length, set]);
  useEffect(() => {
    if (ready && items.length) logEvent("older-build", `${r.character.name || "a character"} from ${r.character.checkedWith ?? "an older version"}: ${items.length} not aligned`);
  }, [ready, items.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ready || !items.length) return null;
  return (
    <section className="older-build" role="status" aria-label="Changes since this character was saved">
      <p>
        <b>{r.character.name || "This character"} was saved {r.character.checkedWith ? `in Soul Forge ${r.character.checkedWith}` : "by an older Soul Forge"}.</b>{" "}
        {items.length === 1 ? "One thing no longer lines up" : `${items.length} things no longer line up`} with this version's content and rules:
      </p>
      <ul>
        {items.slice(0, 12).map((f, i) => <li key={i}><b>{f.rule}:</b> {f.detail}</li>)}
        {items.length > 12 && <li className="muted">and {items.length - 12} more (the rules check on Build lists them)</li>}
      </ul>
      <button onClick={() => set((c) => markChecked(c, APP_VERSION))}>Got it</button>
    </section>
  );
}
