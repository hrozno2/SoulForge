import { useEffect, useMemo, useState } from "react";
import { logEvent } from "../logbook";

/** The last findings logged, so only a change is logged. */
let lastFindings = "";
import type { Resolved } from "../aurora/engine";
import { buildSheet } from "../aurora/sheet";
import { checkCharacter, type Finding } from "../aurora/rulesCheck";
import { ensureRulesRef, onRulesRef, rulesRef } from "../aurora/rulesRefStore";
import { RULES_REF_CLASSES } from "../aurora/rulesRef";
import { checkDue, markChecked, misalignments } from "../aurora/olderBuild";
import { panelTone, panelVerdict, rulesPanel } from "../aurora/rulesPanel";
import type { Character } from "../aurora/character";
import { applyFix } from "../aurora/findingFix";
import { unspentPoints } from "../aurora/pointBuy";
import { acceptFinding, findingKey, unaccept } from "../aurora/makeLegal";
import { MakeLegal } from "./MakeLegal";

declare const __APP_VERSION__: string;
export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

/** Choices still to make are shown by the Build tab's badges; the check lists only the rest. */
const OPEN_CHOICE = /^A required choice is not made$/;
/** Problems in the content (a reference to something missing) rather than in the character. */
const CONTENT =
  /^(Content refers to something missing|A required choice has no options|Class not in the rules reference|Earlier choices with no place now)$/;

export interface RulesCheckResult {
  rules: Finding[];
  content: Finding[];
  /** Within the rules, but probably not meant (point buy points left unspent). Never counted as a fault. */
  notes: Finding[];
  /** Findings the player keeps on purpose, as table rulings (Character.acceptedFindings): shown apart, not counted. */
  accepted: Finding[];
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
    return () => {
      off();
    };
  }, [official]);
  return useMemo(() => {
    if (!r.character.classes.length) return { rules: [], content: [], notes: [], accepted: [], full: !!ref };
    const left = unspentPoints(r.character);
    const notes: Finding[] = left
      ? [
          {
            rule: "Point buy",
            detail: `${left} ${left === 1 ? "point is" : "points are"} unspent. That is allowed; spend them on Build if it was not meant.`,
          },
        ]
      : [];
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
      if (found.length)
        logEvent(
          "rules",
          `${found.length} findings for ${r.character.name || "a character"}: ${found
            .slice(0, 6)
            .map((f) => `${f.rule}: ${f.detail}`)
            .join(" | ")}${found.length > 6 ? " ..." : ""}`,
        );
    }
    const kept = found.filter(
      (f) =>
        !OPEN_CHOICE.test(f.rule) &&
        !(!official && /^Class not in the rules reference$/.test(f.rule)) &&
        !(ref === null && /^Class not in the rules reference$/.test(f.rule)),
    );
    const rulings = new Set(r.character.acceptedFindings ?? []);
    const open = kept.filter((f) => !rulings.has(findingKey(f)));
    return {
      rules: open.filter((f) => !CONTENT.test(f.rule)),
      content: open.filter((f) => CONTENT.test(f.rule)),
      accepted: kept.filter((f) => rulings.has(findingKey(f))),
      notes,
      full: !!ref || !official,
    };
  }, [r, ref, official]);
}

/** A bar on the Build tab: "Follows the rules", or each problem and what rule it breaks. */
export function RulesCheckBar({ r, set }: { r: Resolved; set?: (fn: (c: Character) => Character) => void }) {
  return <RulesCheckView r={r} res={useRulesCheck(r)} set={set} />;
}

/** Asked for while the panel was not on screen (another tab): it opens when it next shows. */
let wantOpen = false;
/** Opens the rules check's panel, now or as soon as Build shows it. */
export function showRulesCheck() {
  wantOpen = true;
  window.dispatchEvent(new CustomEvent("cf-rules-check"));
}

/** What an older build's character holds that no longer lines up, beyond what the check itself finds. */
function useStale(r: Resolved, res: RulesCheckResult): Finding[] {
  return useMemo(() => {
    if (!res.full || !checkDue(r.character, APP_VERSION)) return [];
    const own = new Set([...res.rules, ...res.content, ...res.accepted].map(findingKey));
    return misalignments(r, [...res.rules, ...res.content]).filter((f) => !own.has(findingKey(f)));
  }, [r, res]);
}

/**
 * The rules check in one panel (plan 2026-11-23, item 5): everything the app has to say about the character and
 * the rules, in three kinds: to fix, your call, accepted (rulesPanel.ts). The older-build notice and the import
 * report point here; "cf-rules-check" opens it.
 */
export function RulesCheckView({
  r,
  res,
  set,
}: {
  r: Resolved;
  res: RulesCheckResult;
  /** With it, a finding can be put right or kept as a table ruling from here (E3.1). */
  set?: (fn: (c: Character) => Character) => void;
}) {
  const [open, setOpen] = useState(wantOpen);
  const [legal, setLegal] = useState(false);
  useEffect(() => {
    wantOpen = false;
    const show = () => setOpen(true);
    window.addEventListener("cf-rules-check", show);
    return () => window.removeEventListener("cf-rules-check", show);
  }, []);
  const stale = useStale(r, res);
  const panel = useMemo(() => rulesPanel(res, stale), [res, stale]);
  if (!r.character.classes.length) return null;
  const n = panel.toFix.length + panel.yourCall.length + panel.accepted.length;
  const older = res.full && checkDue(r.character, APP_VERSION) && panel.toFix.length + panel.yourCall.length > 0;
  const fixButton = (f: Finding) =>
    set &&
    f.fix && (
      <>
        {" "}
        <button className="fix-it" onClick={() => set((c) => applyFix(c, f.fix!))} title="Applies this; the choice opens again for you">
          {f.fix.label}
        </button>
      </>
    );
  return (
    <section className={`rules-check ${panelTone(panel)}`} aria-label="Rules check">
      <button className="rules-check-head" aria-expanded={n ? open : undefined} onClick={() => n && setOpen(!open)}>
        <b>Rules check</b>
        <span>{panelVerdict(panel)}</span>
        {!res.full && <small className="muted">class tables not checked yet (the rules reference downloads with content)</small>}
        {n > 0 && <span className="chev">{open ? "▴" : "▾"}</span>}
      </button>
      {set && (res.rules.length > 0 || res.content.some((f) => f.fix)) && (
        <button className="make-legal-open" onClick={() => setLegal(true)}>
          Make it legal…
        </button>
      )}
      {legal && set && <MakeLegal r={r} findings={[...res.rules, ...res.content]} set={set} onClose={() => setLegal(false)} />}
      {open && n > 0 && (
        <div className="rules-panel">
          {older && (
            <p className="rules-older">
              Saved {r.character.checkedWith ? `in Soul Forge ${r.character.checkedWith}` : "by an older Soul Forge"}: this is what no
              longer lines up with this version's content and rules.
              {set && (
                <>
                  {" "}
                  <button className="fix-it" onClick={() => set((c) => markChecked(c, APP_VERSION))}>
                    Got it
                  </button>
                </>
              )}
            </p>
          )}
          {panel.toFix.length > 0 && (
            <section aria-label="To fix">
              <h4>To fix ({panel.toFix.length})</h4>
              <ul>
                {panel.toFix.map((f, i) => (
                  <li key={i}>
                    <b>{f.rule}:</b> {f.detail}
                    {fixButton(f)}
                    {set && !stale.includes(f) && (
                      <>
                        {" "}
                        <button
                          className="fix-it"
                          onClick={() => set((c) => acceptFinding(c, f))}
                          title="Your table plays it this way: it is shown under Accepted and no longer counted"
                        >
                          Keep as a table ruling
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {panel.yourCall.length > 0 && (
            <section aria-label="Your call">
              <h4>Your call ({panel.yourCall.length})</h4>
              <ul>
                {panel.yourCall.map((f, i) => (
                  <li key={i} className="muted">
                    <b>{f.rule}:</b> {f.detail}
                    {fixButton(f)}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {panel.accepted.length > 0 && (
            <section aria-label="Accepted">
              <h4>Accepted ({panel.accepted.length})</h4>
              <ul>
                {panel.accepted.map((f, i) => (
                  <li key={i} className="muted">
                    <b>Table ruling:</b> {f.rule}: {f.detail}
                    {set && (
                      <>
                        {" "}
                        <button
                          className="fix-it"
                          onClick={() => set((c) => unaccept(c, findingKey(f)))}
                          title="It counts as a finding again"
                        >
                          Take back
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </section>
  );
}

/** The rule problems of a character as plain lines (for the import report and the export warning). */
export function ruleProblems(r: Resolved): string[] {
  if (!r.character.classes.length) return [];
  try {
    const rulings = new Set(r.character.acceptedFindings ?? []);
    return checkCharacter(r, buildSheet(r), rulesRef() ?? [])
      .filter((f) => !OPEN_CHOICE.test(f.rule) && !CONTENT.test(f.rule) && !rulings.has(findingKey(f)))
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
      <b>Rules check:</b> {res.rules.length} {res.rules.length === 1 ? "thing breaks" : "things break"} the rules (
      {res.rules
        .slice(0, 2)
        .map((f) => f.rule.toLowerCase())
        .join("; ")}
      {res.rules.length > 2 ? "; ..." : ""}). The sheets show the character as it is; the details are on Build.
    </p>
  );
}

/**
 * A character saved by an older Soul Forge, opened in this version: one line saying how much no longer lines up
 * (picks a choice no longer offers, content that is gone, what the rules check now finds). The list itself is in
 * the rules check's panel, which "Show" opens; "Got it" marks the character checked in this version, and one with
 * nothing to report is marked without a word.
 */
export function OlderBuildNotice({
  r,
  set,
  onShow,
}: {
  r: Resolved;
  set: (fn: (c: Character) => Character) => void;
  /** Brings Build to the front; the notice then opens the rules check's panel there. */
  onShow: () => void;
}) {
  const res = useRulesCheck(r);
  const items = useMemo(() => misalignments(r, [...res.rules, ...res.content]), [r, res]);
  const ready = res.full;
  useEffect(() => {
    if (ready && !items.length) set((c) => markChecked(c, APP_VERSION));
  }, [ready, items.length, set]);
  useEffect(() => {
    if (ready && items.length)
      logEvent(
        "older-build",
        `${r.character.name || "a character"} from ${r.character.checkedWith ?? "an older version"}: ${items.length} not aligned`,
      );
  }, [ready, items.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ready || !items.length) return null;
  return (
    <section className="older-build" role="status" aria-label="Changes since this character was saved">
      <p>
        <b>
          {r.character.name || "This character"} was saved{" "}
          {r.character.checkedWith ? `in Soul Forge ${r.character.checkedWith}` : "by an older Soul Forge"}.
        </b>{" "}
        {items.length === 1 ? "One thing no longer lines up" : `${items.length} things no longer line up`} with this version's content and
        rules. The rules check on Build lists {items.length === 1 ? "it" : "them"}, with what can be done about each.
      </p>
      <div className="row">
        <button
          className="primary"
          onClick={() => {
            onShow();
            showRulesCheck();
          }}
        >
          Show in the rules check
        </button>
        <button onClick={() => set((c) => markChecked(c, APP_VERSION))}>Got it</button>
      </div>
    </section>
  );
}
