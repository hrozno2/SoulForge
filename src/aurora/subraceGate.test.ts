/**
 * A species' rule that steps aside for one of its sub races ("!<sub race>") holds when that sub race is chosen through
 * the species itself. The requirement context discounts what reaches the character only through the element being
 * judged (so "!Perception" on what grants Perception ends no loop); a sub race was discounted too, and every such gate
 * failed: the Half-Elf asked its own two skills besides a Sword Coast descent's, and gave its +1s besides a Mark's.
 */
import { expect, it } from "vitest";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { ARegistry } from "./registry";
import type { AElement } from "./types";

const el = (id: string, type: string, extra: Partial<AElement> = {}): AElement => ({
  id,
  name: id,
  type,
  source: "Test",
  supports: [],
  description: "",
  compendiumHidden: false,
  setters: {},
  rules: [],
  ...extra,
});

it("a species' rule gated on its own sub race steps aside when that sub race is chosen", () => {
  const reg = new ARegistry();
  reg.addElements([
    el("RACE", "Race", {
      rules: [
        { kind: "select", type: "Sub Race", name: "Subrace", supports: "SUB", number: 1 },
        { kind: "select", type: "Proficiency", name: "Own skills", supports: "SKILL", number: 2, requirements: "!SUB" },
      ],
    }),
    el("SUB", "Sub Race", { supports: ["SUB"] }),
    el("SKILL", "Proficiency", { supports: ["SKILL"] }),
  ]);
  reg.build();
  const ch = { ...newCharacter(), race: "RACE" };
  const key = resolve(ch, reg).slots.find((s) => s.rule.name === "Subrace")!.key;
  expect(resolve(ch, reg).slots.some((s) => s.rule.name === "Own skills")).toBe(true);
  expect(resolve({ ...ch, selections: { [key]: ["SUB"] } }, reg).slots.some((s) => s.rule.name === "Own skills")).toBe(false);
});
