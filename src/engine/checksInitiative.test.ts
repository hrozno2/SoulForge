/**
 * Initiative is a Dexterity check, so a bonus to every ability check reaches it (2014 Jack of All Trades: "any ability
 * check"). The 2024 Jack of All Trades is for "an ability check you make that uses a skill proficiency you lack", and
 * initiative uses no skill: no initiative bonus (found 2026-11-17 moving a 2024 Lore Bard, both content sets had it).
 */
import { describe, expect, it } from "vitest";
import type { AElement } from "../aurora/types";
import { checksIncludeInitiative, proficiencyCheckGroups, SKILL_NAMES } from "./mechanics";
import { ARegistry } from "../aurora/registry";
import { newCharacter } from "../aurora/character";
import { resolve } from "../aurora/engine";
import { buildSheet } from "../aurora/sheet";

const jack = (id: string, text: string): AElement =>
  ({
    id,
    name: "Jack of All Trades",
    type: "Class Feature",
    source: "x",
    supports: [],
    description: `<p>${text}</p>`,
    compendiumHidden: false,
    setters: {},
    rules: SKILL_NAMES.map((s) => ({ kind: "stat", name: `${s}:misc`, value: "proficiency:half" })),
  }) as AElement;

describe("a bonus to every skill and initiative", () => {
  it("reaches initiative when it is a bonus to any ability check (2014)", () => {
    const old = jack(
      "A",
      "you can add half your proficiency bonus, rounded down, to any ability check you make that doesn't already include your proficiency bonus.",
    );
    checksIncludeInitiative(new Map([["A", old]]));
    expect(old.rules.some((r) => r.kind === "stat" && r.name === "initiative")).toBe(true);
  });
  it("not when it is for checks that use a skill (2024)", () => {
    const now = jack(
      "B",
      "You can add half your Proficiency Bonus (round down) to any ability check you make that uses a skill proficiency you lack and that doesn't otherwise use your Proficiency Bonus.",
    );
    checksIncludeInitiative(new Map([["B", now]]));
    expect(now.rules.some((r) => r.kind === "stat" && r.name === "initiative")).toBe(false);
  });
  it("reaches initiative from a bonus to Dexterity checks that the content wrote on the Dexterity skills (2014 Remarkable Athlete)", () => {
    const athlete = {
      ...jack(
        "C",
        "you can add half your proficiency bonus (round up) to any Strength, Dexterity, or Constitution check you make that doesn't already use your proficiency bonus.",
      ),
      name: "Remarkable Athlete",
      rules: ["athletics", "acrobatics", "sleight of hand", "stealth"].map((s) => ({
        kind: "stat",
        name: `${s}:misc`,
        value: "proficiency:half:up",
      })),
    } as AElement;
    checksIncludeInitiative(new Map([["C", athlete]]));
    expect(athlete.rules.find((r) => r.kind === "stat" && r.name === "initiative")).toMatchObject({ value: "proficiency:half:up" });
  });
  it("half-proficiency bonuses do not stack with each other or with a full proficiency bonus on the same roll", () => {
    const feature = (id: string, name: string, value: string) =>
      ({ ...jack(id, "x"), name, rules: [{ kind: "stat", name: "initiative", value }] }) as AElement;
    const byId = new Map([
      ["J", feature("J", "Jack of All Trades", "proficiency:half")],
      ["R", feature("R", "Remarkable Athlete", "proficiency:half:up")],
      ["A", feature("A", "Alert", "proficiency")],
    ]);
    expect(proficiencyCheckGroups(byId)).toBe(2);
    const reg = new ARegistry();
    reg.addElements([
      {
        ...jack("CLS", "x"),
        name: "Bard",
        type: "Class",
        rules: ["J", "R"].map((id) => ({ kind: "grant", type: "Class Feature", id })),
      } as AElement,
      ...[...byId.values()].filter((e) => e.id !== "A"),
    ]);
    reg.build();
    // Proficiency bonus +3 at level 5: half rounded up (2) beats half rounded down (1); they do not add up to 3.
    const base = newCharacter();
    const sh = buildSheet(
      resolve({ ...base, abilityBase: { ...base.abilityBase, dexterity: 10 }, classes: [{ classId: "CLS", level: 5 }] }, reg),
    );
    expect(sh.initiative).toBe(2);
  });
  it("whole proficiency bonuses from two features add up, and half ones drop out beside them", () => {
    const feature = (id: string, value: string, bonus?: string) =>
      ({ ...jack(id, "x"), name: id, rules: [{ kind: "stat", name: "initiative", value, ...(bonus ? { bonus } : {}) }] }) as AElement;
    const reg = new ARegistry();
    reg.addElements([
      {
        ...jack("CLS", "x"),
        name: "Bard",
        type: "Class",
        rules: ["ALERT", "HARE", "JACK"].map((id) => ({ kind: "grant", type: "Class Feature", id })),
      } as AElement,
      feature("ALERT", "proficiency"),
      feature("HARE", "proficiency", "proficiency"),
      feature("JACK", "proficiency:half"),
    ]);
    reg.build();
    const base = newCharacter();
    const sh = buildSheet(
      resolve({ ...base, abilityBase: { ...base.abilityBase, dexterity: 10 }, classes: [{ classId: "CLS", level: 5 }] }, reg),
    );
    expect(sh.initiative).toBe(6); // +3 and +3; Jack of All Trades adds nothing to a roll that has the whole bonus
  });
});
