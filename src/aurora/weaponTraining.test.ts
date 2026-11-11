/**
 * Weapon attack lines on the bundled SRD content (so this runs everywhere): a class's named weapons count as trained,
 * and a Monk's weapons follow Martial Arts. Both were wrong until 2026-11-10 and no check said so, because the rules
 * check took "not proficient" from the sheet it was judging.
 */
import { describe, expect, it } from "vitest";
import { loadContentSet } from "../engine/testContent";
import { newCharacter, type Character } from "./character";
import { resolve } from "./engine";
import type { ARegistry } from "./registry";
import { checkCharacter, type RefClass } from "./rulesCheck";
import { buildSheet } from "./sheet";

const reg = loadContentSet("", "srd");
const find = (type: string, name: string, year: "2014" | "2024") => {
  const e = reg.ofType(type).find((x) => x.name === name && x.source.includes(year));
  if (!e) throw new Error(`${type} ${name} (${year}) is not in the SRD bundle`);
  return e;
};
function build(r: ARegistry, cls: string, year: "2014" | "2024", weapons: string[], extra: Partial<Character> = {}, armor?: string) {
  const items = [...weapons.map((w) => find("Weapon", w, year)), ...(armor ? [find("Armor", armor, year)] : [])];
  const ch: Character = {
    ...newCharacter(), classes: [{ classId: find("Class", cls, year).id, level: 5 }], abilityMethod: "manual",
    abilityBase: { strength: 8, dexterity: 18, constitution: 12, intelligence: 10, wisdom: 14, charisma: 10 },
    inventory: items.map((e, i) => ({ uid: `u${i}`, id: e.id, qty: 1, equipped: true, attuned: false })), ...extra,
  };
  const res = resolve(ch, r);
  const sheet = buildSheet(res);
  const line = (name: string) => sheet.attacks.find((a) => a.name === name)!;
  return { res, sheet, line };
}

describe("a class's named weapons are trained (the converter read the link's own words into the id)", () => {
  it.each([
    ["Rogue", ["Rapier", "Longsword", "Shortsword", "Hand Crossbow"]],
    ["Bard", ["Rapier", "Longsword", "Shortsword", "Hand Crossbow"]],
    ["Wizard", ["Dagger", "Dart", "Quarterstaff", "Light Crossbow"]],
    ["Sorcerer", ["Dagger", "Sling"]],
    ["Druid", ["Scimitar", "Sickle", "Spear"]],
    ["Monk", ["Shortsword"]],
  ] as const)("2014 %s", (cls, weapons) => {
    const { line } = build(reg, cls, "2014", [...weapons]);
    for (const w of weapons) expect(line(w).notes, w).not.toContain("not proficient");
  });

  it("and what a class does not train still is not", () => {
    const { line } = build(reg, "Wizard", "2014", ["Longsword"]);
    expect(line("Longsword").notes).toContain("not proficient");
  });

  // The rules check judges training on its own now: with the class's reference it names a trained weapon shown untrained.
  it("the rules check says so when a trained weapon shows as untrained", () => {
    const { res, sheet } = build(reg, "Rogue", "2014", ["Rapier"]);
    const ref = [{ name: "Rogue", source: "PHB", edition: "classic", hd: 8, saves: [], caster: null, cantrips: null, prepared: null, preparedFormula: null, known: null, slots: null, pact: null, features: [], subclassLevel: 3, asiLevels: [], epicBoon: null, multiclass: null, multiclassOr: null, primaryAbility: null, subclasses: [], startWeapons: ["simple"], startWeaponNames: ["hand crossbow", "longsword", "rapier", "shortsword"], startMartialWith: [] }] as unknown as RefClass[];
    const broken = { ...sheet, attacks: sheet.attacks.map((a) => (a.name === "Rapier" ? { ...a, bonus: a.bonus - sheet.proficiency, notes: "not proficient" } : a)) };
    expect(checkCharacter(res, broken, ref).map((f) => f.rule)).toContain("Weapon the class trains counted as untrained");
    expect(checkCharacter(res, sheet, ref).map((f) => f.rule)).not.toContain("Weapon the class trains counted as untrained");
  });
});

describe("Martial Arts with monk weapons (both rule books' wording, from the SRD)", () => {
  // Strength 8 (-1), Dexterity 18 (+4), proficiency +3 at 5th level.
  it("2014: simple melee weapons that are not two-handed or heavy, and shortswords, use Dexterity", () => {
    const { line, res, sheet } = build(reg, "Monk", "2014", ["Quarterstaff", "Handaxe", "Greatclub", "Longsword"]);
    expect(line("Quarterstaff")).toMatchObject({ bonus: 7, damage: "1d6+4" });
    expect(line("Handaxe")).toMatchObject({ bonus: 7, damage: "1d6+4" });
    // Two-handed: not a monk weapon in 2014. Strength.
    expect(line("Greatclub")).toMatchObject({ bonus: 2, damage: "1d8-1" });
    // Martial and not a shortsword: Strength, and untrained.
    expect(line("Longsword").bonus).toBe(-1);
    expect(checkCharacter(res, sheet, []).filter((f) => /Weapon attack bonus/.test(f.rule))).toEqual([]);
  });

  it("2024: simple melee weapons and light martial ones; the Martial Arts die replaces a smaller one", () => {
    const { line, res, sheet } = build(reg, "Monk", "2024", ["Quarterstaff", "Dagger", "Greatclub", "Scimitar", "Longsword"]);
    // d8 at 5th level in the 2024 rules.
    expect(line("Quarterstaff")).toMatchObject({ bonus: 7, damage: "1d8+4" });
    expect(line("Dagger")).toMatchObject({ bonus: 7, damage: "1d8+4" });
    expect(line("Greatclub")).toMatchObject({ bonus: 7, damage: "1d8+4" });
    expect(line("Scimitar").bonus).toBe(7);
    expect(line("Longsword").bonus).toBe(-1);
    expect(line("Quarterstaff").notes).toContain("Martial Arts d8");
    expect(checkCharacter(res, sheet, []).filter((f) => /Weapon attack bonus/.test(f.rule))).toEqual([]);
  });

  it("not in armor, and not for another class", () => {
    const armored = build(reg, "Monk", "2014", ["Quarterstaff"], {}, "Leather Armor");
    expect(armored.line("Quarterstaff")).toMatchObject({ bonus: 2, damage: "1d6-1" });
    const fighter = build(reg, "Fighter", "2014", ["Quarterstaff"]);
    expect(fighter.line("Quarterstaff")).toMatchObject({ bonus: 2, damage: "1d6-1" });
  });

  // The rules check judges the damage itself (it judged only the attack bonus).
  it("a wrong damage is named by the rules check", () => {
    const { res, sheet } = build(reg, "Fighter", "2014", ["Longsword"]);
    expect(checkCharacter(res, sheet, []).map((f) => f.rule)).not.toContain("Weapon damage");
    const wrong = { ...sheet, attacks: sheet.attacks.map((a) => (a.name === "Longsword" ? { ...a, damage: "1d10+7" } : a)) };
    expect(checkCharacter(res, wrong, []).map((f) => f.rule)).toContain("Weapon damage");
  });
});
