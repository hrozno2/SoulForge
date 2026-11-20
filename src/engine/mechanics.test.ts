import { describe, expect, it } from "vitest";
import type { AElement, ARule } from "../aurora/types";
import { borrowMechanics } from "./mechanics";

const el = (id: string, name: string, type: string, origin: string, rules: ARule[]): AElement =>
  ({ id, name, type, origin, source: "Player's Handbook", supports: [], rules }) as unknown as AElement;
const speed = (name: string, value = "10") => ({ kind: "stat", name, value }) as ARule;

/** A class and its feature from each provider, as a twin pair. */
function pair(mine: ARule[], twin: ARule[]) {
  const all = [
    el("5E_CLASS", "Barbarian", "Class", "5etools", [{ kind: "grant", type: "Class Feature", id: "5E_F" } as ARule]),
    el("5E_F", "Fast Movement", "Class Feature", "5etools", mine),
    el("AU_CLASS", "Barbarian", "Class", "aurora", [{ kind: "grant", type: "Class Feature", id: "AU_F" } as ARule]),
    el("AU_F", "Fast Movement", "Class Feature", "aurora", twin),
  ];
  const byId = new Map(all.map((e) => [e.id, e]));
  borrowMechanics(byId);
  return byId.get("5E_F")!.rules.map((r) => (r as { name?: string }).name);
}

describe("borrowed speeds", () => {
  const aurora = [speed("innate speed:misc"), speed("innate speed:climb:misc"), speed("innate speed:swim:misc")];
  it("a feature that raises walking speed itself takes no raise to climbing or swimming", () => {
    // Fast Movement with Bestial Soul: a climb speed equal to walking speed, 40, read 50 with Aurora loaded.
    expect(pair([speed("innate speed:misc")], aurora)).toEqual(["innate speed:misc"]);
  });
  it("a feature that sets no speed still borrows them", () => {
    expect(pair([], aurora)).toEqual(expect.arrayContaining(["innate speed:climb:misc"]));
  });
});

// Big batch on mixed content, 2026-11-20: the 5e.tools Bugbear gives Stealth itself (with another skill if the
// character has it), and its trait Sneaky borrowed Aurora's Stealth too, so the species' own became "another skill".
describe("a training the owner already gives", () => {
  const skill = (id: string) => el(id, "Skill Proficiency (Stealth)", "Proficiency", id.startsWith("5E") ? "5etools" : "aurora", []);
  const build = (raceRules: ARule[]) => {
    const all = [
      el("5E_RACE", "Bugbear", "Race", "5etools", [{ kind: "grant", type: "Racial Trait", id: "5E_T" } as ARule, ...raceRules]),
      el("5E_T", "Sneaky", "Racial Trait", "5etools", []),
      el("AU_RACE", "Bugbear", "Race", "aurora", [{ kind: "grant", type: "Racial Trait", id: "AU_T" } as ARule]),
      el("AU_T", "Sneaky", "Racial Trait", "aurora", [{ kind: "grant", type: "Proficiency", id: "AU_STEALTH" } as ARule]),
      skill("5E_STEALTH"),
      skill("AU_STEALTH"),
    ];
    const byId = new Map(all.map((e) => [e.id, e]));
    borrowMechanics(byId);
    return byId.get("5E_T")!.rules.length;
  };
  it("is not borrowed by the owner's feature", () => {
    expect(build([{ kind: "grant", type: "Proficiency", id: "5E_STEALTH" } as ARule])).toBe(0);
  });
  it("is borrowed where the owner gives none", () => {
    expect(build([])).toBe(1);
  });
});
