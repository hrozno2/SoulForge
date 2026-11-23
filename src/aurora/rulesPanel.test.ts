/** The rules check in one panel: three kinds, each finding said once, one verdict line. */
import { describe, expect, it } from "vitest";
import type { Finding } from "./rulesCheck";
import { panelTone, panelVerdict, rulesPanel } from "./rulesPanel";

const f = (rule: string, detail = "x", fix = false): Finding =>
  ({ rule, detail, ...(fix ? { fix: { label: "Clear them" } } : {}) }) as Finding;
const none = { rules: [], content: [], notes: [], accepted: [] };

describe("the rules check in one panel", () => {
  it("sorts findings into to fix, your call and accepted", () => {
    const p = rulesPanel(
      {
        rules: [f("Too many skills")],
        content: [f("Earlier choices with no place now", "3 picks", true), f("Content refers to something missing", "ID_GONE")],
        notes: [f("Point buy", "2 points are unspent")],
        accepted: [f("Origin editions mixed")],
      },
      [f("A pick is no longer offered", "Cantrip: Guidance")],
    );
    expect(p.toFix.map((x) => x.rule)).toEqual(["Too many skills", "Earlier choices with no place now", "A pick is no longer offered"]);
    expect(p.yourCall.map((x) => x.rule)).toEqual(["Point buy", "Content refers to something missing"]);
    expect(p.accepted.map((x) => x.rule)).toEqual(["Origin editions mixed"]);
  });
  it("says each finding once, and an accepted one never as a fault", () => {
    const same = f("Too many skills");
    const p = rulesPanel({ ...none, rules: [same, same], accepted: [f("Kept")] }, [same, f("Kept")]);
    expect(p.toFix).toHaveLength(1);
    expect(p.accepted).toHaveLength(1);
  });
  it("gives one verdict line", () => {
    expect(panelVerdict(rulesPanel(none))).toBe("Follows the rules");
    expect(panelVerdict(rulesPanel({ ...none, notes: [f("Point buy")] }))).toBe("Follows the rules, 1 to look at");
    expect(panelVerdict(rulesPanel({ ...none, accepted: [f("a"), f("b")], notes: [f("Point buy")] }))).toBe(
      "Follows the rules, with 2 table rulings; 1 to look at",
    );
    expect(panelVerdict(rulesPanel({ rules: [f("a"), f("b")], content: [f("c")], notes: [], accepted: [f("d")] }))).toBe(
      "2 to fix, 1 your call, 1 table ruling accepted",
    );
  });
  it("is coloured by the worst kind present", () => {
    expect(panelTone(rulesPanel(none))).toBe("ok");
    expect(panelTone(rulesPanel({ ...none, notes: [f("Point buy")] }))).toBe("warn");
    expect(panelTone(rulesPanel({ ...none, rules: [f("a")], notes: [f("Point buy")] }))).toBe("bad");
  });
});
