/** The kinds of starting gear a pack or background may name without saying which one. */
export type GenericKind = "instrument" | "gaming" | "artisan";

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
  /** The item's own name when it differs from the base item, for example "Requital" for a +2 longsword. */
  label?: string;
  /** A +1, +2 or +3 item: added to attack and damage for weapons, to armor class for armor and shields. */
  magic?: number;
  /** Free-form fields for custom items and per-item notes. */
  custom?: { name: string; type?: string; weight?: number; cost?: string; description?: string; ac?: number; damage?: string };
  /**
   * Starting gear that names only a kind ("a musical instrument", "a gaming set", "artisan's tools") and nothing the
   * character took settles: the player still picks which one (src/aurora/startingEquipment.ts genericOptions).
   */
  pending?: GenericKind;
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

/** Changes the player made to an attack that comes from an equipped weapon. */
export interface AttackEdit {
  name?: string;
  /** Added to the calculated attack bonus. */
  bonusAdjust?: number;
  /** Replaces the calculated damage text. */
  damage?: string;
  damageType?: string;
  notes?: string;
  hidden?: boolean;
  /** Inventory uid of the ammunition this weapon uses. */
  ammoUid?: string;
}

export interface CompanionEntry {
  uid: string;
  /** Companion element id, or custom stat block. */
  id: string;
  name: string;
  hp?: number;
  notes?: string;
}

export interface JournalEntry {
  uid: string;
  /** ISO date of the session, such as 2026-10-10. */
  date: string;
  title: string;
  text: string;
}

/** Something pinned to the favorites row above the play sheet. `ref` is an attack id, spell id, feature id or inventory uid, by kind. */
export interface Favorite {
  uid: string;
  kind: "weapon" | "spell" | "feature" | "item";
  ref: string;
}

export interface Resource {
  id: string;
  name: string;
  current: number;
  max: number;
  /** When it comes back: after a short rest, a long rest, or never on its own. */
  refresh: "short" | "long" | "none";
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
  /** Exhaustion level, 0 to 6. Each level takes 2 off d20 tests and 5 feet off speed. */
  exhaustion?: number;
  /** What the character is concentrating on, if anything. */
  concentration?: string;
  /** Active wild shape form, if any. Damage lands here first. */
  wildShape?: { name: string; hp: number; maxHp: number; kind?: "wildshape" | "polymorph" | "truepoly" | "other"; creatureId?: string };
  /** Current hit points of companions and mounts, keyed by their uid or element id. */
  companionHp?: Record<string, number>;
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
  /** The base scores last used with each method, so switching methods and back resumes where you were. */
  abilityBases?: Partial<Record<"pointbuy" | "standard" | "manual", Record<AbilityId, number>>>;
  /** House rules for point buy. Missing means the standard 27 points, 8 to 15. */
  pointBuy?: { budget: number; min: number; max: number; costs: Record<number, number> };
  /** Slot key (`ownerId|ruleIndex`) to chosen element ids. */
  selections: Record<string, string[]>;
  /** Optional and variant choices (slot keys) the player chose not to take: not counted as choices left open. */
  declined?: string[];
  /** Optional and variant choices (slot keys) the player opted into: they start not taken until ticked or picked. */
  taken?: string[];
  /** Option elements the player enabled (type Option). */
  options: string[];
  /** Bonuses the player adds by hand, for table rulings and things the content does not cover. */
  customStats: { id: string; stat: string; value: number; note?: string }[];
  /** Content added by hand outside the normal rules: extra languages, feats, spells, features. */
  extras: string[];
  hpMode: "average" | "roll";
  /** Hit point roll for each level from 2 up, by character level number as a string. */
  hpRolls: Record<string, number>;
  /**
   * Who made each hit point roll and when, by level: "app" when Soul Forge rolled it (a Roll button, a random
   * character), "player" when it was typed in. Kept so the rolls can be checked (src/aurora/hpRolls.ts).
   */
  hpRollLog?: Record<string, { value: number; die: number; by: "app" | "player"; at?: number }>;
  /** Prepared spell ids by spellcasting name (for example "Wizard"). */
  prepared: Record<string, string[]>;
  inventory: InvItem[];
  coins: Coinage;
  attacks: CustomAttack[];
  companions: CompanionEntry[];
  /** Counters the player tracks by hand, such as ki points, a pet's charges or a magic item's uses. */
  resources: Resource[];
  /** What the starting equipment dialog has already added, so it can fold away. */
  equipmentAdded?: string[];
  /** Items features gave ("equipment:<id>" statistics) already put in the inventory, so a removed one does not return. */
  grantedItemsAdded?: string[];
  /** What each starting equipment label added, so choosing another option can take it back out. */
  equipmentLedger?: Record<string, { items: { id: string; name: string; qty: number }[]; gp: number }>;
  /** Edits to attacks that come from equipped weapons, by inventory item uid. */
  attackEdits?: Record<string, AttackEdit>;
  info: CharacterInfo;
  notes: string;
  /** The report of the import that made this character (what matched, what is missing, the to-do list), kept to read or copy into the notes. */
  importReport?: string;
  /** Session log, newest first when shown. */
  journal?: JournalEntry[];
  /** Pinned weapons, spells, features and items. Resources always show in the same row. */
  favorites?: Favorite[];
  /** The player hid the favorites row. */
  favoritesHidden?: boolean;
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
    resources: [],
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

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];


/** Fills in anything a saved or imported character is missing, so older files keep working as fields are added. */
export function normalizeCharacter(raw: Partial<Character>): Character {
  const base = newCharacter();
  return {
    ...base,
    ...raw,
    info: { ...base.info, ...(raw.info ?? {}) },
    play: { ...base.play, ...(raw.play ?? {}), deathSaves: { ...base.play.deathSaves, ...(raw.play?.deathSaves ?? {}) } },
    coins: { ...base.coins, ...(raw.coins ?? {}) },
    abilityBase: { ...base.abilityBase, ...(raw.abilityBase ?? {}) },
    resources: raw.resources ?? [],
    classes: raw.classes ?? [],
    inventory: raw.inventory ?? [],
    selections: raw.selections ?? {},
    version: 2,
  };
}

/** The name to show for an inventory item: its own label, the element's name, or the custom name. */
export function itemLabel(it: InvItem, name?: string): string {
  const base = it.label?.trim() || name || it.custom?.name || it.id;
  return it.magic && !/[+]\d/.test(base) ? `${base} +${it.magic}` : base;
}
