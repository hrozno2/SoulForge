/**
 * Initiative is a Dexterity check, so a bonus to every ability check reaches it (2014 Jack of All Trades: "any ability
 * check"). The 2024 Jack of All Trades is for "an ability check you make that uses a skill proficiency you lack", and
 * initiative uses no skill: no initiative bonus (found 2026-11-17 moving a 2024 Lore Bard, both content sets had it).
 */
import { describe, expect, it } from "vitest";
import type { AElement } from "../aurora/types";
import { checksIncludeInitiative, SKILL_NAMES } from "./mechanics";

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
});
