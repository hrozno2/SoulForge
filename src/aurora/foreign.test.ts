/**
 * Imports real exported characters and checks what comes through.
 *   AURORA_FIXTURES_2014=<content folder>  FOREIGN_FIXTURES=<folder with the .json files>
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadRegistry } from "./fixture";
import { importForeignCharacter } from "./foreign";
import { resolve } from "./engine";

const CONTENT = process.env.AURORA_FIXTURES_2014;
const DIR = process.env.FOREIGN_FIXTURES;
const CONTENT24 = process.env.AURORA_FIXTURES_2024;

describe.skipIf(!CONTENT || !DIR)("foreign character import", () => {
  const reg = CONTENT ? loadRegistry(CONTENT) : undefined;
  const load = (f: string) => JSON.parse(readFileSync(`${DIR}/${f}`, "utf8"));

  it("Roll20: Talaan, a level 13 College of Whispers bard", () => {
    const res = importForeignCharacter(load("Talaan Istodaewl(1).json"), reg!);
    if (process.env.SHOW) console.log(JSON.stringify({ notes: res.notes, missing: res.missing, matched: res.matched.length, ch: { ...res.character, inventory: res.character.inventory.length } }, null, 1));
    const ch = res.character;
    expect(ch.name).toBe("Talaan Istodaewl");
    expect(ch.classes[0].level).toBe(13);
    expect(reg!.get(ch.classes[0].classId)?.name).toBe("Bard");
    const r = resolve(ch, reg!);
    expect(r.stats.get("charisma")).toBe(20);
    expect(r.stats.get("dexterity")).toBe(18);
    expect(ch.coins.gp).toBe(263);
    expect(ch.info.alignment).toBe("Lawful Neutral");
    expect(reg!.get(ch.race ?? "")?.name).toBe("Elf");
    expect(ch.info.traits).toMatch(/larger pattern/);
    expect(ch.info.age).toBe("215");
    expect(ch.coins.sp).toBe(20);
    expect(ch.play.hp).toBe(105);
    // Rapier +1 falls back to the base Rapier.
    expect(ch.inventory.some((i) => i.id && reg!.get(i.id)?.name === "Rapier")).toBe(true);
    // Spells the content knows are placed; ones it does not know are reported, not lost silently.
    const placed = [...r.ids].filter((i) => reg!.get(i)?.type === "Spell").length;
    expect(placed).toBeGreaterThan(15);
    expect(res.missing.join()).toMatch(/Silvery Barbs/);
    // These come from books outside the PHB-only test content.
    expect(res.missing.join()).toMatch(/College of Whispers/);
  });

  it("Foundry: Waldrom Brahms", () => {
    const res = importForeignCharacter(load("fvtt-Actor-waldrom-brahms-Be4NGiw22hg7gVBb(1).json"), reg!);
    if (process.env.SHOW) console.log(JSON.stringify({ notes: res.notes, missing: res.missing, matched: res.matched.length, ch: { ...res.character, inventory: res.character.inventory.length } }, null, 1));
    expect(res.character.name).toMatch(/Waldrom/i);
    const ch = res.character;
    expect(reg!.get(ch.classes[0].classId)?.name).toBe("Fighter");
    expect(ch.classes[0].level).toBe(14);
    expect(reg!.get(ch.race ?? "")?.name).toBe("Human");
    expect(ch.xp).toBe(23000);
    expect(ch.info.alignment).toBe("Lawful Evil");
    expect(ch.info.age).toBe("61");
    expect(ch.info.hair).toBe("Silvery Grey");
    expect(ch.coins.sp).toBe(2);
    expect(ch.play.hp).toBe(117);
    const r = resolve(ch, reg!);
    expect(r.stats.get("strength")).toBe(20);
    expect(r.stats.get("constitution")).toBe(18);
    // "+1 Shield" and "Requital (+1 Longsword)" resolve to the base items.
    const names = ch.inventory.map((i) => (i.id ? reg!.get(i.id)?.name : undefined));
    expect(names).toContain("Shield");
    expect(names).toContain("Longsword");
    // Class features are not reported as missing feats.
    expect(res.missing.join()).not.toMatch(/Second Wind|Action Surge/);
  });
});

describe.skipIf(!CONTENT24 || !DIR)("foreign import against the 2024 rules", () => {
  it("settles species, class and feat choices from a Roll20 bard", () => {
    const reg = loadRegistry(CONTENT24!);
    const res = importForeignCharacter(JSON.parse(readFileSync(`${DIR}/Talaan Istodaewl(1).json`, "utf8")), reg);
    const r = resolve(res.character, reg);
    const open = r.slots.filter((s) => !s.rule.optional && !s.defaulted && s.chosen.length < s.rule.number && s.options.length);
    // Only a subclass the content does not have may stay open.
    expect(open.map((s) => s.options[0].type)).toEqual(["Archetype"]);
    const names = (id: string) => r.slots.filter((s) => s.key.includes(id)).flatMap((s) => s.chosen.map((c) => reg.get(c)?.name));
    expect(names("ELVEN_LINEAGE|")).toContain("Drow");
    expect(names("CLASS_FEATURE_BARD_EXPERTISE")).toEqual(expect.arrayContaining(["Skill Expertise (Perception)", "Skill Expertise (Stealth)"]));
    expect(names("CLASS_BARD|5")).toEqual(expect.arrayContaining(["Tool Proficiency (Lute)", "Tool Proficiency (Lyre)"]));
    // Resilient goes to the one saving throw the class does not already give.
    expect(names("FEAT_RESILIENT")).toEqual(["Constitution"]);
    expect(r.stats.get("charisma")).toBe(20);
  });

  it("settles the choices of a Foundry fighter", () => {
    const reg = loadRegistry(CONTENT24!);
    const res = importForeignCharacter(JSON.parse(readFileSync(`${DIR}/fvtt-Actor-waldrom-brahms-Be4NGiw22hg7gVBb(1).json`, "utf8")), reg);
    const r = resolve(res.character, reg);
    // Spell choices the file does not fill are left for the player; everything else is settled.
    const open = r.slots.filter((s) => s.rule.type !== "Spell" && !s.rule.optional && !s.defaulted && s.chosen.length < s.rule.number && s.options.length);
    expect(open.map((s) => s.rule.name)).toEqual([]);
    const names = (id: string) => r.slots.filter((s) => s.key.includes(id)).flatMap((s) => s.chosen.map((c) => reg.get(c)?.name));
    expect(names("RACE_HUMAN|2")).toEqual(["Medium"]);
    expect(names("FIGHTER_SUBCLASS")).toEqual(["Eldritch Knight"]);
    expect(names("FIGHTING_STYLE")).toContain("Dueling");
    // Level 4 and later choices are score improvements, not arbitrary feats.
    expect(names("FIGHTER_ABILITY_SCORE_IMPROVEMENT")).toEqual(Array(5).fill("Ability Score Improvement"));
    expect(r.stats.get("strength")).toBe(20);
  });
});
