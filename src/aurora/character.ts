export const ABILITY_IDS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;
export type AbilityId = (typeof ABILITY_IDS)[number];

export const ABILITY_LABEL: Record<AbilityId, string> = {
  strength: "Strength",
  dexterity: "Dexterity",
  constitution: "Constitution",
  intelligence: "Intelligence",
  wisdom: "Wisdom",
  charisma: "Charisma",
};

export const ABILITY_SHORT: Record<AbilityId, string> = {
  strength: "STR",
  dexterity: "DEX",
  constitution: "CON",
  intelligence: "INT",
  wisdom: "WIS",
  charisma: "CHA",
};

/** Skill (as named in stat rules) to governing ability. */
export const SKILL_ABILITY: Record<string, AbilityId> = {
  acrobatics: "dexterity",
  "animal handling": "wisdom",
  arcana: "intelligence",
  athletics: "strength",
  deception: "charisma",
  history: "intelligence",
  insight: "wisdom",
  intimidation: "charisma",
  investigation: "intelligence",
  medicine: "wisdom",
  nature: "intelligence",
  perception: "wisdom",
  performance: "charisma",
  persuasion: "charisma",
  religion: "intelligence",
  "sleight of hand": "dexterity",
  stealth: "dexterity",
  survival: "wisdom",
};

export interface ClassLevel {
  classId: string;
  level: number;
}

export interface InvItem {
  uid: string;
  /** Element id, or empty for a custom item. */
  id: string;
  qty: number;
  equipped: boolean;
  attuned: boolean;
  /** Wielded with two hands, which uses the versatile damage of a weapon that has one. */
  twoHanded?: boolean;
  /** Uid of the container (storage) holding it. */
  container?: string;
  /** Free-form fields for custom items and per-item notes. */
  custom?: { name: string; type?: string; weight?: number; cost?: string; description?: string; ac?: number; damage?: string };
  notes?: string;
}

export interface Coinage {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

export interface CustomAttack {
  uid: string;
  name: string;
  ability: AbilityId;
  proficient: boolean;
  damage: string;
  damageType: string;
  bonus: number;
  notes?: string;
}

export interface CompanionEntry {
  uid: string;
  /** Companion element id, or custom stat block. */
  id: string;
  name: string;
  hp?: number;
  notes?: string;
}

export interface CharacterInfo {
  alignment: string;
  gender: string;
  age: string;
  height: string;
  weight: string;
  eyes: string;
  hair: string;
  skin: string;
  deity: string;
  traits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  backstory: string;
  allies: string;
}

export interface PlayState {
  hp: number | null;
  tempHp: number;
  inspiration: boolean;
  /** Slots spent per spell level, key is the level as a string. */
  slotsUsed: Record<string, number>;
  hitDiceUsed: number;
  conditions: string[];
  deathSaves: { success: number; fail: number };
  /** Uses spent per feature id. */
  featureUses: Record<string, number>;
}

export interface Character {
  version: 2;
  name: string;
  playerName: string;
  xp: number;
  race?: string;
  background?: string;
  classes: ClassLevel[];
  abilityBase: Record<AbilityId, number>;
  abilityMethod: "pointbuy" | "standard" | "manual";
  /** Slot key (`ownerId|ruleIndex`) to chosen element ids. */
  selections: Record<string, string[]>;
  /** Option elements the player enabled (type Option). */
  options: string[];
  /** Bonuses the player adds by hand, for table rulings and things the content does not cover. */
  customStats: { id: string; stat: string; value: number; note?: string }[];
  /** Content added by hand outside the normal rules: extra languages, feats, spells, features. */
  extras: string[];
  hpMode: "average" | "roll";
  /** Hit point roll for each level from 2 up, by character level number as a string. */
  hpRolls: Record<string, number>;
  /** Prepared spell ids by spellcasting name (for example "Wizard"). */
  prepared: Record<string, string[]>;
  inventory: InvItem[];
  coins: Coinage;
  attacks: CustomAttack[];
  companions: CompanionEntry[];
  info: CharacterInfo;
  notes: string;
  /** Small portrait as a data URL, set on the Manage tab. */
  portrait?: string;
  play: PlayState;
  /** Source names the player has restricted the builder to. Empty means everything. */
  sources: string[];
}

export function newCharacter(): Character {
  return {
    version: 2,
    name: "",
    playerName: "",
    xp: 0,
    classes: [],
    abilityBase: { strength: 8, dexterity: 8, constitution: 8, intelligence: 8, wisdom: 8, charisma: 8 },
    abilityMethod: "pointbuy",
    selections: {},
    options: [],
    customStats: [],
    extras: [],
    hpMode: "average",
    hpRolls: {},
    prepared: {},
    inventory: [],
    coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    attacks: [],
    companions: [],
    info: {
      alignment: "",
      gender: "",
      age: "",
      height: "",
      weight: "",
      eyes: "",
      hair: "",
      skin: "",
      deity: "",
      traits: "",
      ideals: "",
      bonds: "",
      flaws: "",
      backstory: "",
      allies: "",
    },
    notes: "",
    play: {
      hp: null,
      tempHp: 0,
      inspiration: false,
      slotsUsed: {},
      hitDiceUsed: 0,
      conditions: [],
      deathSaves: { success: 0, fail: 0 },
      featureUses: {},
    },
    sources: [],
  };
}

export const totalLevel = (ch: Character): number => ch.classes.reduce((n, c) => n + c.level, 0);

export const uid = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** XP thresholds for levels 1 to 20 (index 0 is level 1). */
export const XP_TABLE = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000,
  305000, 355000,
];

export const xpToLevel = (xp: number): number => {
  let lvl = 1;
  for (let i = 0; i < XP_TABLE.length; i++) if (xp >= XP_TABLE[i]) lvl = i + 1;
  return lvl;
};

export const POINT_BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUY_BUDGET = 27;
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

export function pointBuySpent(base: Record<AbilityId, number>): number {
  return ABILITY_IDS.reduce((n, a) => n + (POINT_BUY_COST[base[a]] ?? 99), 0);
}
