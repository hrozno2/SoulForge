/**
 * Species and backgrounds of different editions (2024 PHB, chapter 2, "Backgrounds and Species from Older Books"):
 * a background that raises ability scores is where the increases come from, and an older species' own are ignored.
 * Until 2026-11-12 the 5e.tools converter had it the other way round (found when a Kobold with the 2024 Merchant kept
 * +2 Dexterity and lost the Merchant's increases in a move from Aurora's content, which had it right).
 */
import { describe, expect, it } from "vitest";
import { newCharacter, type Character } from "./character";
import { autoFill } from "./autofill";
import { resolve } from "./engine";
import { checkCharacter } from "./rulesCheck";
import { buildSheet } from "./sheet";
import { loadContentSet } from "../engine/testContent";

describe("an older species with a 2024 background", () => {
  const reg = loadContentSet("", "srd");
  const of = (type: string, name: string, edition: string) => reg.ofType(type).find((e) => e.name === name && e.source.includes(edition))!;
  const build = (race: string, bg: string): Character => autoFill({ ...newCharacter(), race, background: bg, classes: [{ classId: of("Class", "Fighter", "2024").id, level: 1 }], abilityMethod: "manual", abilityBase: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 } }, reg);

  it("takes its increases from the background alone: three points, none from the species", () => {
    const dwarf = of("Race", "Dwarf", "2014"), acolyte = of("Background", "Acolyte", "2024");
    expect(dwarf && acolyte).toBeTruthy();
    const r = resolve(build(dwarf.id, acolyte.id), reg);
    const sh = buildSheet(r);
    expect(sh.abilities.reduce((n, a) => n + a.score - 10, 0)).toBe(3);
    // Acolyte raises Intelligence, Wisdom and Charisma; the Dwarf's Constitution +2 is ignored.
    expect(sh.abilities[2].score).toBe(10);
    expect(checkCharacter(r, sh, []).filter((f) => /species|Origin editions/i.test(f.rule))).toEqual([]);
  });

  it("keeps its own increases with a 2014 background", () => {
    const dwarf = of("Race", "Dwarf", "2014"), acolyte = of("Background", "Acolyte", "2014");
    const sh = buildSheet(resolve(build(dwarf.id, acolyte.id), reg));
    expect(sh.abilities[2].score).toBeGreaterThanOrEqual(12);
  });

  it("a 2024 species with a 2024 background gets the background's three points", () => {
    const sh = buildSheet(resolve(build(of("Race", "Dwarf", "2024").id, of("Background", "Acolyte", "2024").id), reg));
    expect(sh.abilities.reduce((n, a) => n + a.score - 10, 0)).toBe(3);
  });
});
