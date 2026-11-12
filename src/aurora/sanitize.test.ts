import { describe, expect, it } from "vitest";
import { loadContentSet } from "../engine/testContent";
import { newCharacter, normalizeCharacter, openCharacter, sanitizeCharacter, type Character } from "./character";
import { resolve } from "./engine";
import { randomCharacter } from "./randomCharacter";
import { buildSheet } from "./sheet";

/** A small seeded generator, so a failure names a case that can be run again. */
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const JUNK: unknown[] = [null, undefined, 0, -1, 500, NaN, Infinity, "", "x", true, [], {}, [null], [1, "a", {}], { a: null }, "1e9"];

/** One random change somewhere in the object: a key deleted, or a value swapped for junk. */
function damage(value: unknown, rng: () => number): unknown {
  const copy = JSON.parse(JSON.stringify(value)) as unknown;
  const spots: { holder: Record<string, unknown> | unknown[]; key: string | number }[] = [];
  const walk = (v: unknown, depth: number) => {
    if (!v || typeof v !== "object" || depth > 4) return;
    for (const k of Object.keys(v as object)) {
      spots.push({ holder: v as Record<string, unknown>, key: k });
      walk((v as Record<string, unknown>)[k], depth + 1);
    }
  };
  walk(copy, 0);
  const n = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < n && spots.length; i++) {
    const s = spots[Math.floor(rng() * spots.length)];
    if (rng() < 0.25 && !Array.isArray(s.holder)) delete s.holder[s.key as string];
    else (s.holder as Record<string, unknown>)[s.key as string] = JUNK[Math.floor(rng() * JUNK.length)];
  }
  return copy;
}

describe("reading a character from a file or the library (the audit's S6)", () => {
  const reg = loadContentSet("", "srd");

  it("leaves a sound character exactly as it is", () => {
    const rng = seeded(7);
    for (let i = 0; i < 40; i++) {
      const ch = normalizeCharacter(randomCharacter(reg, 1 + Math.floor(rng() * 20), { legacy: true, playtest: false, unusual: true, scifi: false, modern: false }, rng));
      const again = sanitizeCharacter(JSON.parse(JSON.stringify(ch)));
      expect(again.repaired).toEqual([]);
      expect(again.character).toEqual(JSON.parse(JSON.stringify(ch)));
    }
  });

  it("fills in what an older save lacks without calling it damage", () => {
    const { character, repaired } = sanitizeCharacter({ version: 2, name: "Old", classes: [{ classId: "X", level: 3 }] });
    expect(repaired).toEqual([]);
    expect(character.play.deathSaves).toEqual({ success: 0, fail: 0 });
    expect(character.coins.gp).toBe(0);
    expect(character.inventory).toEqual([]);
  });

  it("keeps fields a newer version added", () => {
    const { character } = sanitizeCharacter({ ...newCharacter(), somethingNew: { a: 1 } });
    expect((character as unknown as { somethingNew: unknown }).somethingNew).toEqual({ a: 1 });
  });

  it("refuses a file from a newer format, in words", () => {
    expect(() => sanitizeCharacter({ ...newCharacter(), version: 3 })).toThrow(/newer Soul Forge/);
  });

  it("names what it put right", () => {
    const { character, repaired } = sanitizeCharacter({ ...newCharacter(), options: null, classes: [{ classId: "A", level: 500 }, { classId: "B", level: 3 }, "Fighter"], selections: [], coins: { gp: "many" } });
    expect(character.options).toEqual([]);
    expect(character.classes).toEqual([{ classId: "A", level: 20 }]);
    expect(character.selections).toEqual({});
    expect(character.coins.gp).toBe(0);
    expect(repaired).toEqual(expect.arrayContaining(["options", "classes", "class levels", "choices", "coins"]));
  });

  it("anything at all opens: not an object, an array, a string", () => {
    for (const raw of [null, undefined, 5, "character", [], [newCharacter()]]) {
      const { character } = sanitizeCharacter(raw);
      expect(() => buildSheet(resolve(character, reg))).not.toThrow();
    }
  });

  it("2,000 damaged characters never crash the reader, the engine or the sheet, and stay sound when read again", () => {
    const rng = seeded(20261110);
    const filters = { legacy: true, playtest: false, unusual: true, scifi: false, modern: false };
    const sound: Character[] = Array.from({ length: 25 }, () => randomCharacter(reg, 1 + Math.floor(rng() * 20), filters, rng));
    for (let i = 0; i < 2000; i++) {
      const raw = damage(sound[i % sound.length], rng);
      let step = "read";
      try {
        const { character } = sanitizeCharacter(raw);
        step = "read again";
        expect(sanitizeCharacter(JSON.parse(JSON.stringify(character))).repaired).toEqual([]);
        step = "resolve";
        const r = resolve(character, reg);
        step = "sheet";
        buildSheet(r);
      } catch (e) {
        // A version number above this one's is refused on purpose, in words.
        if (step === "read" && /newer Soul Forge/.test((e as Error).message)) continue;
        throw new Error(`case ${i} failed at "${step}": ${(e as Error).message}\n${JSON.stringify(raw).slice(0, 1500)}`);
      }
    }
  }, 120_000);
});

describe("the repair report of a damaged character", () => {
  const names: Record<string, string> = { ID_FIGHTER: "Fighter", ID_WIZARD: "Wizard" };
  const nameOf = (id: string) => names[id];

  it("says which part was damaged, what exactly, what was done and where to put it right", () => {
    const raw = {
      ...newCharacter(),
      classes: [{ classId: "ID_FIGHTER", level: 500 }, { classId: "ID_WIZARD", level: 3 }, { level: 2 }],
      selections: { "ID_FIGHTER|1": "Archery", "ID_WIZARD|0": ["A", 7, "B"], "ID_WIZARD|2": ["C"] },
      abilityBase: { ...newCharacter().abilityBase, strength: "strong" },
      coins: { gp: "many" },
      prepared: { Wizard: 5 },
    };
    const { character, repaired } = openCharacter(raw, "hero.json", nameOf, new Date(2026, 10, 12));
    expect(repaired).toEqual(expect.arrayContaining(["classes", "class levels", "choices", "ability scores", "coins", "prepared spells"]));
    const text = character.repairReport!;
    expect(text).toMatch(/^Repair report: hero\.json/);
    expect(text).toContain("Fighter: level was 500; set to 20");
    expect(text).toContain("Wizard was removed: the classes before it already have 20 levels");
    expect(text).toContain("a class entry named no class");
    expect(text).toContain('Fighter, choice 2: was "Archery"; removed');
    expect(text).toContain("Wizard, choice 1: 1 of 3 entries were unreadable and removed");
    expect(text).not.toContain("Wizard, choice 3");
    expect(text).toContain('Strength was "strong", not a number; set to 8');
    expect(text).toContain("Make them again there");
    expect(text).toContain("Prepare your spells again on Magic");
    // The sound picks are kept.
    expect(character.selections).toEqual({ "ID_WIZARD|0": ["A", "B"], "ID_WIZARD|2": ["C"] });
  });

  it("stays on the character through a save and a reopen, and a sound character gets none", () => {
    const { character } = openCharacter({ ...newCharacter(), xp: "lots" }, "a.json");
    expect(character.repairReport).toContain("Experience");
    const again = openCharacter(JSON.parse(JSON.stringify(character)), "the library");
    expect(again.repaired).toEqual([]);
    expect(again.character.repairReport).toBe(character.repairReport);
    expect(openCharacter(newCharacter()).character.repairReport).toBeUndefined();
  });

  it("names every damaged part of 300 damaged characters, each with a detail", () => {
    const rng = seeded(11);
    for (let i = 0; i < 300; i++) {
      // A junk version number can read as a newer format, which is refused, not repaired.
      let out;
      try { out = sanitizeCharacter(damage(newCharacter(), rng)); } catch { continue; }
      const { repaired, damage: found } = out;
      expect(new Set(found.map((d) => d.part))).toEqual(new Set(repaired));
      for (const d of found) expect(d.detail.length).toBeGreaterThan(5);
    }
  });
});
