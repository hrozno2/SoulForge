import type { Pack } from "../engine/types";

/**
 * A tiny starter pack so the app is usable on first launch. Descriptions are
 * written fresh and intentionally brief. Import the real compendiums from the
 * Content tab. Check numbers against your own rulebooks.
 */
export const starterPack: Pack = {
  id: "starter",
  name: "Starter sample",
  version: "0.1.0",
  elements: [
    {
      id: "species-human",
      type: "species",
      name: "Human",
      description: "Versatile folk. Speed 30 ft.",
      rules: [{ kind: "stat", stat: "speed", op: "set", value: 30 }],
    },
    {
      id: "species-dwarf",
      type: "species",
      name: "Dwarf",
      description: "Sturdy and stone-wise. Darkvision, poison resilience, extra hit points per level.",
      rules: [
        { kind: "stat", stat: "speed", op: "set", value: 30 },
        { kind: "stat", stat: "hp", value: "level", note: "Dwarven Toughness" },
        { kind: "grant", ids: ["trait-darkvision-120"] },
      ],
    },
    {
      id: "trait-darkvision-120",
      type: "feature",
      name: "Darkvision (120 ft)",
      description: "You see in dim light and darkness out to 120 feet.",
    },
    {
      id: "class-fighter",
      type: "class",
      name: "Fighter",
      hitDie: 10,
      description: "Martial specialist. Strength and Constitution saves.",
      rules: [
        { kind: "proficiency", target: "save:str" },
        { kind: "proficiency", target: "save:con" },
        {
          kind: "choose",
          id: "fighter-skills",
          label: "Fighter skills",
          as: "skill",
          count: 2,
          options: ["acrobatics", "animal-handling", "athletics", "history", "insight", "intimidation", "perception", "survival"],
        },
      ],
    },
    {
      id: "class-wizard",
      type: "class",
      name: "Wizard",
      hitDie: 6,
      description: "Scholarly spellcaster. Intelligence and Wisdom saves.",
      rules: [
        { kind: "proficiency", target: "save:int" },
        { kind: "proficiency", target: "save:wis" },
        { kind: "spellcasting", ability: "int", caster: "full" },
        {
          kind: "choose",
          id: "wizard-skills",
          label: "Wizard skills",
          as: "skill",
          count: 2,
          options: ["arcana", "history", "insight", "investigation", "medicine", "nature", "religion"],
        },
      ],
    },
    {
      id: "background-soldier",
      type: "background",
      name: "Soldier",
      description: "Trained in the ranks. Increase Strength, Dexterity or Constitution.",
      rules: [
        { kind: "asi", options: ["str", "dex", "con"] },
        { kind: "proficiency", target: "skill:athletics" },
        { kind: "proficiency", target: "skill:intimidation" },
      ],
    },
    {
      id: "background-sage",
      type: "background",
      name: "Sage",
      description: "Years among books. Increase Constitution, Intelligence or Wisdom.",
      rules: [
        { kind: "asi", options: ["con", "int", "wis"] },
        { kind: "proficiency", target: "skill:arcana" },
        { kind: "proficiency", target: "skill:history" },
      ],
    },
    {
      id: "feat-tough-example",
      type: "feat",
      name: "Hardy (example homebrew)",
      description: "Example custom modifier: +2 hit points per level.",
      rules: [{ kind: "stat", stat: "hp", value: "level * 2" }],
    },
    {
      id: "item-shield-example",
      type: "item",
      name: "Shield",
      description: "+2 Armor Class.",
      rules: [{ kind: "stat", stat: "ac", value: 2 }],
    },
    {
      id: "item-chain-mail-example",
      type: "item",
      name: "Chain Mail",
      description: "Armor Class 16 regardless of Dexterity.",
      rules: [{ kind: "stat", stat: "ac", op: "set", value: 16 }],
    },
  ],
};
