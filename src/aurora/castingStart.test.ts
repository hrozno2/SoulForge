/**
 * A class prepares spells from its first spell slot, not before (2026-11-16): the 2014 Paladin gains Spellcasting at
 * 2nd level, and the "at least one prepared spell" floor gave a level-1 Paladin one, on every content set. Found when
 * a moved 2014 Paladin 1 came out with Bless and Wardaway prepared.
 */
import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { buildSheet } from "./sheet";
import { loadContentSet } from "../engine/testContent";

describe("preparing spells starts with the first spell slot", () => {
  const reg = loadContentSet("", "srd");
  const line = (name: string, edition: string, level: number) => {
    const cls = reg.ofType("Class").find((c) => c.name === name && c.source.includes(edition))!;
    return buildSheet(resolve({ ...newCharacter(), classes: [{ classId: cls.id, level }] }, reg)).casting.find((c) => c.name === name);
  };
  it("a 2014 Paladin prepares nothing at level 1 and at least one spell at level 2", () => {
    expect(line("Paladin", "5.1", 1)?.prepareMax ?? 0).toBe(0);
    expect(line("Paladin", "5.1", 2)!.prepareMax).toBeGreaterThanOrEqual(1);
  });
  it("a 2024 Paladin and Ranger prepare from level 1, where they have slots", () => {
    expect(line("Paladin", "5.2", 1)!.prepareMax).toBe(2);
    expect(line("Ranger", "5.2", 1)!.prepareMax).toBe(2);
  });
});
