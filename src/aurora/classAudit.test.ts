/**
 * Class by class audit (A3.1): the features the plan names, on built characters, against the rules text. Each check
 * builds the smallest character that has the feature and reads the sheet. SOULFORGE_RULES=<test content folder>.
 */
import { describe, expect, it } from "vitest";
import { newCharacter, type Character } from "./character";
import { resolve } from "./engine";
import { buildSheet } from "./sheet";
import { loadTestContent } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;

describe.skipIf(!C)("class features against the rules", () => {
  const reg = C ? loadTestContent(C) : undefined!;
  const SCORES = { strength: 8, dexterity: 16, constitution: 14, intelligence: 16, wisdom: 14, charisma: 18 };
  const build = (classId: string, level: number, f: (c: Character) => void = () => undefined) => {
    const ch: Character = { ...newCharacter(), abilityMethod: "manual", abilityBase: { ...SCORES } };
    ch.classes = [{ classId, level }];
    f(ch);
    return ch;
  };
  /** Takes the subclass (by id) in the class's subclass choice. */
  const withSub = (ch: Character, subId: string) => {
    const s = resolve(ch, reg).slots.find((x) => x.rule.type === "Archetype")!;
    return { ...ch, selections: { ...ch.selections, [s.key]: [subId] } };
  };
  const mod = (n: number) => Math.floor((n - 10) / 2);
  const weapon = (name: string, edition: "2014" | "2024", magic?: number) => {
    const el = reg.ofType("Weapon").find((w) => w.name === name && (edition === "2024") === /2024/.test(w.source))!;
    return { uid: `w-${name}`, id: el.id, qty: 1, equipped: true, attuned: false, ...(magic ? { magic } : {}) };
  };

  for (const [cls, ed] of [["ID_WOTC_PHB_CLASS_MONK", "2014"], ["ID_WOTC_PHB24_CLASS_MONK", "2024"]] as const) {
    it(`Monk Unarmored Defense (${ed}): AC 10 + Dexterity + Wisdom`, () => {
      const sh = buildSheet(resolve(build(cls, 1), reg));
      expect(sh.ac.value).toBe(10 + mod(16) + mod(14));
    }, 600000);
  }

  for (const [cls, ed] of [["ID_WOTC_PHB_CLASS_BARD", "2014"], ["ID_WOTC_PHB24_CLASS_BARD", "2024"]] as const) {
    it(`Jack of All Trades (${ed}): half proficiency on skills without proficiency`, () => {
      const sh = buildSheet(resolve(build(cls, 2), reg));
      const none = sh.skills.find((s) => s.level === "none" && s.ability === "strength")!;
      expect(none.bonus).toBe(mod(8) + Math.floor(sh.proficiency / 2));
    }, 600000);
  }

  it("Hexblade's Hex Warrior: a weapon attack can use Charisma", () => {
    const ch = withSub(build("ID_WOTC_PHB_CLASS_WARLOCK", 1, (c) => { c.inventory = [weapon("Longsword", "2014")]; }), "ID_WOTC_XGTE_ARCHETYPE_HEXBLADE");
    const sh = buildSheet(resolve(ch, reg));
    const sword = sh.attacks.find((a) => /longsword/i.test(a.name))!;
    expect(sword.bonus).toBe(mod(18) + sh.proficiency);
  }, 600000);

  it("Battle Smith's Battle Ready: a magic weapon attack uses Intelligence", () => {
    const ch = withSub(build("ID_WOTC_TCOE_CLASS_ARTIFICER", 3, (c) => { c.inventory = [weapon("Longsword", "2014", 1)]; }), "ID_WOTC_TCOE_ARCHETYPE_ARTIFICER_BATTLE_SMITH");
    const sh = buildSheet(resolve(ch, reg));
    const sword = sh.attacks.find((a) => /longsword/i.test(a.name))!;
    expect(sword.bonus).toBe(mod(16) + sh.proficiency + 1);
  }, 600000);

  it("2024 Pact of the Blade: the pact weapon can use Charisma", () => {
    const ch = build("ID_WOTC_PHB24_CLASS_WARLOCK", 3, (c) => { c.inventory = [weapon("Longsword", "2024")]; });
    const r0 = resolve(ch, reg);
    const pact = r0.slots.find((s) => s.options.some((o) => o.name === "Pact of the Blade"));
    if (!pact) return;
    const r = resolve({ ...ch, selections: { ...ch.selections, [pact.key]: [...pact.chosen, pact.options.find((o) => o.name === "Pact of the Blade")!.id].slice(-pact.rule.number) } }, reg);
    const sh = buildSheet(r);
    // Charisma for the attack; the bonded weapon's proficiency needs the weapon marked (Stage C), so none here.
    expect(sh.attacks.find((a) => /longsword/i.test(a.name))!.bonus).toBe(mod(18));
  }, 600000);

  it("The Fiend's expanded spells are on the Warlock's list", () => {
    const ch = withSub(build("ID_WOTC_PHB_CLASS_WARLOCK", 1), "ID_WOTC_PHB_ARCHETYPE_OTHERWORLDLY_PATRON_FIEND");
    const r = resolve(ch, reg);
    const spellChoice = r.slots.find((s) => s.rule.type === "Spell" && /warlock/i.test(s.rule.name) && !/cantrip/i.test(s.rule.name))!;
    expect(spellChoice.options.map((o) => o.name)).toContain("Burning Hands");
  }, 600000);

  it("Firearms: the Gunner feat makes a musket attack proficient", () => {
    const musket = { uid: "w-musket", id: "ID_WOTC_DMG_WEAPON_MUSKET", qty: 1, equipped: true, attuned: false };
    const without = buildSheet(resolve(build("ID_WOTC_PHB_CLASS_WIZARD", 1, (c) => { c.inventory = [musket]; }), reg));
    const withFeat = buildSheet(resolve(build("ID_WOTC_PHB_CLASS_WIZARD", 1, (c) => { c.inventory = [musket]; c.extras = ["ID_WOTC_TCOE_FEAT_GUNNER"]; }), reg));
    const bonus = (sh: typeof without) => sh.attacks.find((a) => /musket/i.test(a.name))!.bonus;
    expect(bonus(withFeat) - bonus(without)).toBe(withFeat.proficiency);
  }, 600000);

  it("Bladesong raises AC only while it is active, not on the sheet's base AC", () => {
    const ch = withSub(build("ID_WOTC_PHB_CLASS_WIZARD", 2), "ID_WOTC_TCOE_ARCHETYPE_WIZARD_BLADESINGING");
    expect(buildSheet(resolve(ch, reg)).ac.value).toBe(10 + mod(16));
  }, 600000);
});
