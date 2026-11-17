/**
 * The rules check judges a feature's uses by the class table itself (engine plan W5), never by the sheet's own number:
 * a Monk 9 had 1 ki point on the sheet once (2026-11-10), and nothing but a player's eye caught it.
 */
import { describe, expect, it } from "vitest";
import { loadContentSet } from "../engine/testContent";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { buildSheet } from "./sheet";
import { checkCharacter, type RefClass } from "./rulesCheck";

const reg = loadContentSet("", "srd");
const ref = (name: string, source: string, counters: RefClass["counters"]): RefClass => ({
  name,
  source,
  edition: source === "XPHB" ? "one" : "classic",
  hd: 8,
  saves: [],
  caster: null,
  cantrips: null,
  prepared: null,
  preparedFormula: null,
  known: null,
  slots: null,
  pact: null,
  features: [],
  subclassLevel: null,
  asiLevels: [],
  epicBoon: null,
  multiclass: null,
  multiclassOr: null,
  primaryAbility: null,
  subclasses: [],
  counters,
});
const findings = (cls: string, year: string, level: number, r: RefClass) => {
  const c = reg.ofType("Class").find((x) => x.name === cls && x.source.includes(year))!;
  const res = resolve({ ...newCharacter(), classes: [{ classId: c.id, level }] }, reg);
  return checkCharacter(res, buildSheet(res), [r]).filter((f) => f.rule === "Feature uses by level");
};
const FOCUS = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

describe("feature uses by the class table", () => {
  it("a Monk's Focus Points agree with the table", () => {
    expect(findings("Monk", "2024", 9, ref("Monk", "XPHB", { "Focus Points": FOCUS }))).toEqual([]);
  });
  it("a sheet that disagrees with the table is a finding", () => {
    const wrong = FOCUS.map((n) => n + 1);
    const f = findings("Monk", "2024", 9, ref("Monk", "XPHB", { "Focus Points": wrong }));
    expect(f).toHaveLength(1);
    expect(f[0].detail).toContain("class table: 10");
  });
  it("a Barbarian's rages, both editions", () => {
    const RAGES = [2, 2, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, "Unlimited"];
    expect(findings("Barbarian", "2014", 6, ref("Barbarian", "PHB", { Rages: RAGES }))).toEqual([]);
    expect(findings("Barbarian", "2024", 17, ref("Barbarian", "XPHB", { Rages: RAGES.slice(0, 19).concat([6]) }))).toEqual([]);
  });
});
