import { describe, expect, it } from "vitest";
import { ARegistry } from "./registry";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import type { AElement } from "./types";
import {
  armorClassFromText,
  stateOnly,
  applyArmorBonus,
  halfProficiencyFromText,
  initiativeFromText,
  checkBonusFromText,
  languagesFromText,
  limitsFromText,
  savesFromText,
  speedFromText,
  trainingsFromText,
} from "./textMechanics";

const names = (r: { kind: string; name?: string; id?: string }[]) => r.map((x) => x.name ?? x.id);

describe("lasting numbers read from a feature's text", () => {
  it("half proficiency: any check, or the named abilities, rounded as written", () => {
    const jack = halfProficiencyFromText(
      "you can add half your proficiency bonus, rounded down, to any ability check you make that doesn't already include your proficiency bonus",
    );
    expect(jack).toHaveLength(19);
    expect(names(jack)).toContain("initiative");
    expect(jack[0]).toMatchObject({ value: "proficiency:half", requirements: "!ID_5ET_SKILL_ATHLETICS,!ID_PROFICIENCY_SKILL_ATHLETICS" });
    expect(
      names(
        halfProficiencyFromText(
          "You can add half your Proficiency Bonus (round down) to any ability check you make that uses a skill proficiency you lack",
        ),
      ),
    ).not.toContain("initiative");
    const athlete = halfProficiencyFromText(
      "you can add half your proficiency bonus (round up) to any Strength, Dexterity, or Constitution check you make",
    );
    expect(names(athlete)).toEqual(["athletics:misc", "acrobatics:misc", "sleight of hand:misc", "stealth:misc"]);
    expect(athlete[0]).toMatchObject({ value: "proficiency:half:up" });
    expect(halfProficiencyFromText("you add half your proficiency bonus to the damage")).toEqual([]);
  });

  it("armor class: both wordings, and whether a shield breaks it", () => {
    const barb = armorClassFromText(
      "ID_B",
      "Unarmored Defense",
      "While you are not wearing any armor, your Armor Class equals 10 + your Dexterity modifier + your Constitution modifier. You can use a shield and still gain this benefit.",
    );
    expect(barb.map((r) => (r as { value: string }).value)).toEqual([
      "10",
      "dexterity:modifier",
      "constitution:modifier",
      "ac:unarmored defense id_b",
    ]);
    expect(barb[3]).toMatchObject({ equipped: "[armor:none]", bonus: "calculation" });
    const monk = armorClassFromText(
      "ID_M",
      "Unarmored Defense",
      "While you aren't wearing armor or wielding a Shield, your base Armor Class equals 10 plus your Dexterity and Wisdom modifiers.",
    );
    expect(monk.map((r) => (r as { value: string }).value).slice(1, 3)).toEqual(["dexterity:modifier", "wisdom:modifier"]);
    expect(monk[3]).toMatchObject({ equipped: "[armor:none],[shield:none]" });
    expect(armorClassFromText("ID_S", "Shell", "Your shell provides your base AC of 17")).toHaveLength(2);
    // The Tortle of Monsters of the Multiverse, 2026-11-17: every Tortle on 5e.tools content had AC 10 + Dexterity.
    const tortle = armorClassFromText(
      "ID_T",
      "Natural Armor",
      "Your shell provides you a base AC of 17 (your Dexterity modifier doesn't affect this number). You can't wear light, medium, or heavy armor, but if you are using a shield, you can apply the shield's bonus as normal.",
    );
    expect(tortle.map((r) => (r as { value: string }).value)).toEqual(["17", "ac:natural armor id_t"]);
    expect(tortle[1]).toMatchObject({ equipped: "[armor:none]" });
    // A creature's armor class is not the character's.
    expect(armorClassFromText("ID_C", "Companion", "Its AC equals 13 + your proficiency bonus")).toEqual([]);
  });

  // The Defense fighting style (found 2026-11-17 moving a Paladin): the 2014 one had no rule, the 2024 one a +1 at all
  // times. Its text: "While you are wearing armor, you gain a +1 bonus to AC."
  it("a bonus to armor class while wearing armor holds only in armor", () => {
    const el = (id: string, text: string, rules: unknown[] = []) =>
      ({
        id,
        name: "Defense",
        type: "Optional Feature",
        source: "x",
        origin: "5etools",
        supports: [],
        description: text,
        setters: {},
        rules,
        compendiumHidden: false,
      }) as never;
    const old = el("A", "<p>While you are wearing armor, you gain a +1 bonus to AC.</p>");
    const now = el("B", "While you're wearing Light, Medium, or Heavy armor, you gain a +1 bonus to Armor Class.", [
      { kind: "stat", name: "ac:misc", value: "1" },
    ]);
    const none = el("C", "You gain a +1 bonus to AC.");
    // The 2014 Dual Wielder: "+1 bonus to AC while you are wielding a separate melee weapon in each hand" (found
    // 2026-11-17: on 5e.tools content always on).
    const dual = el("D", "You gain a +1 bonus to AC while you are wielding a separate melee weapon in each hand.", [
      { kind: "stat", name: "ac:misc", value: "1" },
    ]);
    applyArmorBonus([dual]);
    expect((dual as { rules: unknown[] }).rules).toEqual([
      { kind: "stat", name: "ac:misc", value: "1", equipped: "[primary:any],[secondary:any]" },
    ]);
    applyArmorBonus([old, now, none]);
    expect((old as { rules: unknown[] }).rules).toEqual([{ kind: "stat", name: "ac:misc", value: "1", equipped: "[armor:any]" }]);
    expect((now as { rules: unknown[] }).rules).toEqual([{ kind: "stat", name: "ac:misc", value: "1", equipped: "[armor:any]" }]);
    expect((none as { rules: unknown[] }).rules).toEqual([]);
  });

  // The Scout's Survivalist (found 2026-11-17): expertise in Nature and Survival with no proficiency, because its
  // "if you don't already have it" read as a condition on the whole sentence.
  it('proficiency the text gives "if you don\'t already have it" is given', () => {
    expect(
      trainingsFromText(
        " When you choose this archetype at 3rd level, you gain proficiency in the Nature and Survival skills if you don't already have it.",
      ).skills,
    ).toEqual(["nature", "survival"]);
    expect(trainingsFromText("If you are raging, you gain proficiency in the Athletics skill.").skills).toEqual([]);
  });

  it("numbers held only in a state entered in play are not lasting ones", () => {
    expect(stateOnly("<p>While in a Wild Shape form, you gain the following benefits.</p>")).toBe(true);
    expect(stateOnly("While shifted, your walking speed increases by 10 feet.")).toBe(true);
    expect(stateOnly("While your Elemental Attunement is active, you also have a Fly Speed.")).toBe(true);
    expect(stateOnly("While raging, you have resistance to all damage except psychic damage.")).toBe(true);
    // Wearing or holding is the item rules' business, and a later sentence's "while" does not make the feature one.
    expect(stateOnly("While you're wearing Light, Medium, or Heavy armor, you gain a +1 bonus to Armor Class.")).toBe(false);
    expect(stateOnly("Your speed increases by 10 feet. While raging, you also ignore difficult terrain.")).toBe(false);
    // The 2024 Circle of the Moon's Circle Forms: everything it gives is the form's. Its "Until you leave the form,
    // your AC equals 13 plus your Wisdom modifier" was every Moon Druid's armor class, out of the form too (2026-11-28).
    const circleForms =
      "You can channel lunar magic when you assume a Wild Shape form, granting you the benefits below. Armor Class. Until you leave the form, your AC equals 13 plus your Wisdom modifier if that total is higher than the Beast's AC.";
    expect(stateOnly(circleForms)).toBe(true);
    expect(armorClassFromText("ID_CF", "Circle Forms", circleForms)).toEqual([]);
    expect(armorClassFromText("ID_X", "Stone Form", "Until the spell ends, your AC equals 16.")).toEqual([]);
    // Lasting formulas stay: not wearing armor is the item rules' condition, not a state.
    expect(
      armorClassFromText(
        "ID_U",
        "Unarmored Defense",
        "While you aren't wearing any armor, your AC equals 10 + your Dexterity modifier + your Wisdom modifier.",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("saving throws: all, or the named ones, and never a choice of them", () => {
    expect(names(savesFromText("your mastery of ki grants you proficiency in all saving throws"))).toHaveLength(6);
    expect(names(savesFromText("You gain proficiency in Wisdom and Charisma saving throws."))).toEqual([
      "ID_5ET_SAVE_WISDOM",
      "ID_5ET_SAVE_CHARISMA",
    ]);
    expect(savesFromText("You gain proficiency in Wisdom or Charisma saving throws.")).toEqual([]);
    expect(savesFromText("the creature has proficiency in Wisdom saving throws")).toEqual([]);
  });

  it("speed: a lasting bonus, a condition on armor, the Monk's table, and never a sometimes bonus", () => {
    expect(speedFromText("Starting at 5th level, your speed increases by 10 feet while you aren't wearing heavy armor.")[0]).toMatchObject({
      name: "innate speed:misc",
      value: "10",
      equipped: "![armor:heavy]",
    });
    const monk = speedFromText(
      "Your speed increases by 10 feet while you aren't wearing armor or wielding a Shield. This bonus increases when you reach certain Monk levels, as shown on the table.",
    );
    expect(monk.filter((r) => (r as { name: string }).name === "monk:unarmored movement")).toHaveLength(5);
    expect(monk.find((r) => (r as { name: string }).name === "innate speed:misc")).toMatchObject({
      value: "monk:unarmored movement",
      equipped: "[armor:none],[shield:none]",
    });
    expect(speedFromText("When you rage, your speed increases by 10 feet.")).toEqual([]);
    // Goliath's Large Form: the bonus is a separate sentence, under something switched on for a while.
    expect(speedFromText("As a Bonus Action, you change your size to Large for 10 minutes. Your Speed increases by 10 feet.")).toEqual([]);
    expect(names(speedFromText("You gain a climbing speed equal to your speed."))).toEqual(["innate speed:climb"]);
    expect(names(speedFromText("You have a Climb Speed and a Swim Speed equal to your Speed."))).toEqual([
      "innate speed:climb",
      "innate speed:swim",
    ]);
    expect(speedFromText("When you use this feature, you gain a flying speed equal to your speed.")).toEqual([]);
  });

  it("initiative: an ability, a number, or proficiency", () => {
    expect(initiativeFromText("a bonus to your initiative rolls equal to your Wisdom modifier")[0]).toMatchObject({
      value: "wisdom:modifier",
    });
    expect(initiativeFromText("You gain a +5 bonus to initiative.")[0]).toMatchObject({ value: "5" });
    // Chronurgy's Temporal Awareness.
    expect(initiativeFromText("You can add your Intelligence modifier to your initiative rolls.")[0]).toMatchObject({
      name: "initiative",
      value: "intelligence:modifier",
    });
    // The Harengon's Hare-Trigger (found 2026-11-17: every Harengon on 5e.tools content lacked it).
    expect(initiativeFromText("You can add your proficiency bonus to your initiative rolls.")[0]).toMatchObject({
      name: "initiative",
      value: "proficiency",
    });
    expect(initiativeFromText("When you roll Initiative, you can add your Proficiency Bonus to the roll.")[0]).toMatchObject({
      value: "proficiency",
    });
    expect(initiativeFromText("you have advantage on initiative")).toEqual([]);
  });

  it("attunement totals and score caps", () => {
    expect(limitsFromText("You can attune to up to four magic items at once.")[0]).toMatchObject({
      name: "attunement:max",
      value: "4",
      bonus: "base",
    });
    expect(names(limitsFromText("Your Strength and Constitution scores increase by 4. Your maximum for those scores is now 24."))).toEqual([
      "strength",
      "strength:max:extra",
      "constitution",
      "constitution:max:extra",
    ]);
    expect(limitsFromText("Your Strength and Constitution scores increase by 4, to a maximum of 25.")[1]).toMatchObject({ value: "5" });
    // Medium Armor Master, 2014 and 2024 wording.
    expect(
      limitsFromText("When you wear medium armor, you can add 3, rather than 2, to your AC if you have a Dexterity of 16 or higher.")[0],
    ).toMatchObject({ name: "ac:armored:dexterity:cap", value: "3" });
    expect(
      limitsFromText(
        "While you're wearing Medium armor, you can add 3, rather than 2 to your AC if you have a Dexterity score of 16 or higher.",
      )[0],
    ).toMatchObject({ name: "ac:armored:dexterity:cap", value: "3" });
    expect(limitsFromText("You can add 2 to your AC.")).toEqual([]);
  });

  it("trainings: by kind, and never a choice or another creature's", () => {
    expect(trainingsFromText("You gain proficiency with medium armor, shields, and martial weapons.")).toMatchObject({
      armor: ["medium", "shield"],
      weapons: ["martial"],
    });
    expect(trainingsFromText("You gain proficiency with the disguise kit and the poisoner's kit.").tools).toEqual([
      "disguise kit",
      "poisoner's kit",
    ]);
    expect(trainingsFromText("You gain proficiency in the Insight and Medicine skills.").skills).toEqual(["insight", "medicine"]);
    expect(trainingsFromText("You gain proficiency with one type of artisan's tools of your choice.").tools).toEqual([]);
    expect(trainingsFromText("You gain proficiency with smith's tools or another tool.").tools).toEqual([]);
    expect(trainingsFromText("The creature has proficiency with shields.").armor).toEqual([]);
    expect(trainingsFromText("You gain a Disguise Kit and a Poisoner's Kit, and you have proficiency with them.").tools).toEqual([
      "disguise kit",
      "poisoner's kit",
    ]);
    expect(trainingsFromText("You gain proficiency with Martial weapons and training with Medium armor and Shields.")).toMatchObject({
      armor: ["medium", "shield"],
      weapons: ["martial"],
    });
    expect(
      trainingsFromText("You gain proficiency in the Insight and Medicine skills and proficiency with the Herbalism Kit."),
    ).toMatchObject({ skills: ["insight", "medicine"], tools: ["herbalism kit"] });
    // Saying when the feature arrives is not a condition on it.
    expect(
      trainingsFromText(
        "When you join the College of Valor at 3rd level, you gain proficiency with medium armor, shields, and martial weapons.",
      ),
    ).toMatchObject({ armor: ["medium", "shield"], weapons: ["martial"] });
  });

  it("languages: only ones the content has", () => {
    expect(languagesFromText("You know Druidic, the secret language of druids.", ["Druidic", "Sylvan"])).toEqual(["Druidic"]);
    expect(languagesFromText("You know Thieves’ Cant.", ["Thieves' Cant"])).toEqual(["Thieves' Cant"]);
    expect(languagesFromText("You know Something Else.", ["Druidic"])).toEqual([]);
    expect(languagesFromText("During your training you learned thieves' cant, a secret mix.", ["Thieves' Cant"])).toEqual([
      "Thieves' Cant",
    ]);
    expect(languagesFromText("You know Thieves' Cant and one other language of your choice.", ["Thieves' Cant"])).toEqual([
      "Thieves' Cant",
    ]);
  });
});

describe("attunement slots", () => {
  const slots = (...rules: object[]) => {
    const reg = new ARegistry();
    reg.addElements([
      {
        id: "ID_T_CLASS",
        name: "T",
        type: "Class",
        source: "t",
        description: "",
        supports: [],
        setters: {},
        rules: rules.map((r) => ({ requirements: "", ...r })),
      } as unknown as AElement,
    ]);
    reg.build();
    return resolve({ ...newCharacter(), classes: [{ classId: "ID_T_CLASS", level: 1 }] }, reg).stats.get("attunement:max");
  };
  it("three by default, a stated total replaces them, a step adds to them", () => {
    expect(slots()).toBe(3);
    expect(slots({ kind: "stat", name: "attunement:max", value: "4", bonus: "base" })).toBe(4);
    expect(
      slots(
        { kind: "stat", name: "attunement:max", value: "6", bonus: "base" },
        { kind: "stat", name: "attunement:max", value: "4", bonus: "base" },
      ),
    ).toBe(6);
    expect(slots({ kind: "stat", name: "attunement:max", value: "1" })).toBe(4);
  });
});

describe("a bonus to an ability's checks equal to another's modifier", () => {
  it("reads the Fey Wanderer's Otherworldly Glamour onto every Charisma skill", () => {
    const rules = checkBonusFromText(
      "Whenever you make a Charisma check, you gain a bonus to the check equal to your Wisdom modifier (minimum of +1).",
    );
    expect(rules.map((r) => (r as { name: string }).name).sort()).toEqual([
      "deception:misc",
      "intimidation:misc",
      "performance:misc",
      "persuasion:misc",
    ]);
    // "(minimum of +1)": a Wisdom of 8 still gives +1, never a penalty (found by the audit's disagreement list,
    // 2026-11-24: 5e.tools' Foundry data had the minimum and the text reading did not).
    expect(rules.every((r) => (r as { value: string }).value === "(max(1,{wisdom:modifier}))")).toBe(true);
  });
  it("gives +1 with a Wisdom of 8, through the engine", () => {
    const [rule] = checkBonusFromText(
      "Whenever you make a Charisma (Persuasion) check, you gain a bonus to the check equal to your Wisdom modifier (minimum of +1).",
    );
    const reg = new ARegistry();
    reg.addElements([
      {
        id: "CLS",
        name: "Tester",
        type: "Class",
        source: "T",
        supports: [],
        description: "",
        compendiumHidden: false,
        setters: { hd: { value: "d8", attrs: {} } },
        rules: [rule],
      },
    ]);
    reg.build();
    const stats = (wisdom: number) =>
      resolve(
        {
          ...newCharacter(),
          abilityMethod: "manual",
          abilityBase: { ...newCharacter().abilityBase, wisdom },
          classes: [{ classId: "CLS", level: 1 }],
        },
        reg,
      ).stats;
    expect(stats(8).get("persuasion:misc")).toBe(1);
    expect(stats(18).get("persuasion:misc")).toBe(4);
  });
  it("and onto one skill when the text names it (the Samurai's Elegant Courtier)", () => {
    const rules = checkBonusFromText(
      "Whenever you make a Charisma (Persuasion) check, you gain a bonus to the check equal to your Wisdom modifier.",
    );
    expect(rules).toEqual([expect.objectContaining({ name: "persuasion:misc", value: "wisdom:modifier" })]);
  });
});
