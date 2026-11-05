import { describe, expect, it } from "vitest";
import type { AElement, ARule } from "../aurora/types";
import { borrowMechanics } from "./mechanics";

const el = (id: string, name: string, type: string, origin: string, rules: ARule[]): AElement => ({ id, name, type, origin, source: "Player's Handbook", supports: [], rules }) as unknown as AElement;
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
