/**
 * The guided first character's recommendations: every answer leads somewhere, and everything recommended exists in
 * the free rules a fresh install has.
 */
import { describe, expect, it } from "vitest";
import { ABILITY_IDS } from "./character";
import { CLASS_GUIDE, recommendClasses, recommendedScores, STYLES, UPKEEPS } from "./guide";
import { loadContentSet } from "../engine/testContent";

describe("the guide's recommendations", () => {
  const reg = loadContentSet("", "srd-5.2");
  const names = (type: string) =>
    new Set(
      reg
        .ofType(type)
        .filter((e) => !e.compendiumHidden)
        .map((e) => e.name),
    );

  it("names only classes, species and backgrounds of the free 2024 rules, and every class of them", () => {
    const [classes, species, backgrounds] = [names("Class"), names("Race"), names("Background")];
    for (const c of CLASS_GUIDE) {
      expect(classes.has(c.name), c.name).toBe(true);
      for (const s of c.species) expect(species.has(s), `${c.name}: ${s}`).toBe(true);
      for (const b of c.backgrounds) expect(backgrounds.has(b), `${c.name}: ${b}`).toBe(true);
      expect(c.species.length).toBeGreaterThan(0);
      expect(c.backgrounds.length).toBeGreaterThan(0);
    }
    expect(CLASS_GUIDE.map((c) => c.name).sort()).toEqual([...classes].sort());
  });

  it("gives two or three classes for every pair of answers, the simplest first for someone who wants little to track", () => {
    for (const s of STYLES)
      for (const u of UPKEEPS) {
        const got = recommendClasses(s.id, u.id);
        expect(got.length, `${s.id} ${u.id}`).toBeGreaterThanOrEqual(2);
        expect(got.length).toBeLessThanOrEqual(3);
        for (const c of got) expect(c.styles).toContain(s.id);
      }
    expect(recommendClasses("fight", 1).map((c) => c.name)).toEqual(["Fighter", "Barbarian", "Monk"]);
    expect(recommendClasses("magic", 3)[0].name).toBe("Wizard");
    expect(recommendClasses("magic", 1)[0].name).toBe("Sorcerer");
  });

  it("places the standard array for each class, every score once", () => {
    for (const c of CLASS_GUIDE) {
      const s = recommendedScores(c.name)!;
      expect(Object.keys(s).sort()).toEqual([...ABILITY_IDS].sort());
      expect(Object.values(s).sort((a, b) => b - a)).toEqual([15, 14, 13, 12, 10, 8]);
    }
    expect(recommendedScores("Wizard")!.intelligence).toBe(15);
    expect(recommendedScores("Nobody")).toBeUndefined();
  });
});
