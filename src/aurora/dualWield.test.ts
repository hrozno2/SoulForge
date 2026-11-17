/**
 * "While you are wielding a separate melee weapon in each hand" (the 2014 Dual Wielder's +1 AC): the engine's
 * "[primary:any],[secondary:any]". It was never true (only armor and shield were judged), and the 5e.tools copy had no
 * condition at all, so the bonus was off on Aurora's content and always on on 5e.tools'. Found 2026-11-17.
 */
import { describe, expect, it } from "vitest";
import { loadContentSet } from "../engine/testContent";
import { newCharacter, type InvItem } from "./character";
import { resolve } from "./engine";
import { buildSheet } from "./sheet";
import type { AElement } from "./types";

const reg = loadContentSet("", "srd");
const feat: AElement = {
  id: "ID_TEST_DUAL",
  name: "Two Weapons",
  type: "Feat",
  source: "test",
  supports: [],
  description: "",
  compendiumHidden: false,
  setters: {},
  rules: [{ kind: "stat", name: "ac:misc", value: "1", equipped: "[primary:any],[secondary:any]" }],
} as AElement;
reg.addElements([feat]);
reg.build();
const weapon = (name: string) => reg.ofType("Weapon").find((w) => w.name === name)!.id;
const ac = (items: { id: string; twoHanded?: boolean }[]) => {
  const inventory = items.map(
    (x, i) => ({ uid: `u${i}`, id: x.id, qty: 1, equipped: true, attuned: false, twoHanded: x.twoHanded }) as InvItem,
  );
  return buildSheet(resolve({ ...newCharacter(), extras: [feat.id], inventory }, reg)).ac.value;
};

describe("a weapon in each hand", () => {
  it("two melee weapons: the bonus holds", () => {
    expect(ac([{ id: weapon("Dagger") }, { id: weapon("Dagger") }])).toBe(ac([]) + 1);
  });
  it("one weapon, a ranged second, or a weapon in both hands: it does not", () => {
    expect(ac([{ id: weapon("Dagger") }])).toBe(ac([]));
    expect(ac([{ id: weapon("Dagger") }, { id: weapon("Shortbow") }])).toBe(ac([]));
    expect(ac([{ id: weapon("Longsword"), twoHanded: true }, { id: weapon("Dagger") }])).toBe(ac([]));
  });
});
