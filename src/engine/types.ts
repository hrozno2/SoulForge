export type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";

export const ABILITIES: Ability[] = ["str", "dex", "con", "int", "wis", "cha"];

export const ABILITY_NAMES: Record<Ability, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

/** Skill id -> governing ability. */
export const SKILLS: Record<string, Ability> = {
  acrobatics: "dex",
  "animal-handling": "wis",
  arcana: "int",
  athletics: "str",
  deception: "cha",
  history: "int",
  insight: "wis",
  intimidation: "cha",
  investigation: "int",
  medicine: "wis",
  nature: "int",
  perception: "wis",
  performance: "cha",
  persuasion: "cha",
  religion: "int",
  "sleight-of-hand": "dex",
  stealth: "dex",
  survival: "wis",
};

/** A number or a formula string such as "10 + dexMod" or "floor(level / 2)". */
export type Num = number | string;

export type ElementType =
  | "species"
  | "class"
  | "background"
  | "feat"
  | "feature"
  | "subclass"
  | "spell"
  | "item"
  | "custom";

/**
 * Rules are the only way an element changes a character. Everything the
 * engine does is expressed through these, so homebrew uses the same tools
 * as built-in content.
 *
 * stat ops are applied in this order per stat: set, max, min, add.
 * Stat keys: any ability ("str"), "ac", "hp", "speed", "initiative",
 * "skill.<id>", "save.<ability>", or any custom key you invent.
 */
type RuleCore =
  | { kind: "stat"; stat: string; op?: "add" | "set" | "max" | "min"; value: Num; note?: string }
  | { kind: "grant"; ids: string[] }
  | { kind: "proficiency"; target: string; level?: "proficient" | "expertise" }
  | {
      kind: "choose";
      id: string;
      label: string;
      /** What a pick does: skill and tool/language become proficiencies, element grants that element. */
      as: "skill" | "tool" | "language" | "element";
      options: string[];
      count?: number;
    }
  /** 2024 background style: +2 and +1, or +1/+1/+1, across exactly these abilities. */
  | { kind: "asi"; options: Ability[] }
  /**
   * Makes the character a spellcaster. `caster` sets the slot table: full (wizard), half (paladin, ranger,
   * rounded up), third (eldritch knight style, rounded up) or pact (warlock, slots of one level).
   */
  | { kind: "spellcasting"; ability: Ability; caster: "full" | "half" | "third" | "pact" };

/** Any rule can be gated: it only applies once the character reaches minLevel. */
export type Rule = RuleCore & { minLevel?: number };

export interface Element {
  id: string;
  type: ElementType;
  name: string;
  description?: string;
  /** Hit die size for classes, for example 10. */
  hitDie?: number;
  /** Display fields for cards: spell level, school, range, damage, cost and so on. */
  meta?: Record<string, string>;
  rules?: Rule[];
}

export interface Pack {
  id: string;
  name: string;
  version?: string;
  license?: string;
  elements: Element[];
}

export type AsiChoice =
  | { mode: "2/1"; plus2: Ability; plus1: Ability }
  | { mode: "1/1/1" }
  /** Scores already include the background increase (used by imports). */
  | { mode: "included" };

export interface Character {
  name: string;
  level: number;
  /** Base scores before any bonuses, normally from point buy or standard array. */
  abilityBase: Record<Ability, number>;
  species?: string;
  class?: string;
  background?: string;
  backgroundAsi?: AsiChoice;
  /** Extra element ids added by hand (feats, items, custom modifiers). */
  extras: string[];
  /** Answers to `choose` rules, keyed by rule id. */
  choices: Record<string, string[]>;
  /** Free text printed on the sheet, for example imported notes. */
  notes?: string;
}

export interface PendingChoice {
  id: string;
  label: string;
  as: "skill" | "tool" | "language" | "element";
  options: string[];
  count: number;
  picked: number;
}

export interface Spellcasting {
  ability: Ability;
  saveDC: number;
  attackBonus: number;
  /** Slots per spell level, index 0 is level 1. Empty when the class has none yet. */
  slots: number[];
  /** For pact casters, the level every slot is cast at. */
  pactLevel?: number;
}

export interface Sheet {
  abilities: Record<Ability, { score: number; mod: number }>;
  proficiencyBonus: number;
  saves: Record<Ability, { bonus: number; proficient: boolean }>;
  skills: Record<string, { bonus: number; level: "none" | "proficient" | "expertise" }>;
  hp: number;
  ac: number;
  speed: number;
  initiative: number;
  passivePerception: number;
  proficiencies: string[];
  elements: Element[];
  spellcasting?: Spellcasting;
  stats: Record<string, number>;
  pending: PendingChoice[];
  warnings: string[];
}
