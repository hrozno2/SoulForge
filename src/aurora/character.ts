/** The kinds of starting gear a pack or background may name without saying which one. */
/** A kind of item the gear names without saying which: tools, and spellcasting focuses (C7.7). */
export type GenericKind = "instrument" | "gaming" | "artisan" | "artisanOrInstrument" | "arcane" | "druidic" | "holy";

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
  /** Pact Magic slots spent, counted apart from the spell slots of the same level (src/aurora/rest.ts). */
  pactUsed?: number;
  /** Hit dice spent in all; kept in step with `hitDiceByDie` when that is set. */
  hitDiceUsed: number;
  /** Hit dice spent by size ("10" for d10), for characters with more than one size (src/aurora/rest.ts). */
  hitDiceByDie?: Record<string, number>;
  conditions: string[];
  /** Exhaustion level, 0 to 6. Each level takes 2 off d20 tests and 5 feet off speed. */
  exhaustion?: number;
  /** What the character is concentrating on, if anything. */
  concentration?: string;
  /** Active wild shape form, if any. Damage lands here first. */
  wildShape?: { name: string; hp: number; maxHp: number; kind?: "wildshape" | "polymorph" | "truepoly" | "other"; creatureId?: string; ownHp?: boolean };
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
  /** The player chose fixed or rolled hit points (C7.10); until then the hit point bar asks to configure them. */
  hpChosen?: boolean;
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
  /** The Soul Forge version this character was last checked in (src/aurora/olderBuild.ts); unset for older saves. */
  checkedWith?: string;
  /** The shop's price multiplier for this character (its table's), 1 when unset (src/aurora/shop.ts). */
  priceMultiplier?: number;
  /** Magic items without a price cost their rarity's value (the 2024 DMG's table), as Plutonium's option does. */
  rarityPrices?: boolean;
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
  /** What a damaged file had wrong when it was opened (repairReport below), kept to read again from Build. */
  repairReport?: string;
  /** Soul Forge Test only (D6): the id of the saved character this one was moved to 5e.tools from. */
  movedFrom?: string;
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
  return sanitizeCharacter(raw).character;
}

type Obj = Record<string, unknown>;

/** One thing a damaged file had wrong: the part of the character, and what exactly was wrong and what was done. */
export interface Damage { part: string; detail: string }
/** Field names as a player would say them. */
const PART: Record<string, string> = { race: "species", background: "background", declined: "choices turned down", taken: "optional choices taken", equipmentAdded: "starting equipment", grantedItemsAdded: "items from features", importReport: "import notes", movedFrom: "the move's record", portrait: "portrait", checkedWith: "version check", abilityBases: "ability scores by method", pointBuy: "point buy rules", hpRollLog: "hit point roll log", equipmentLedger: "starting equipment", attackEdits: "attack edits" };
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * A character from anything read off a disk or a file (docs/AUDIT-2026-11-10.md, S6): every field the app reads has
 * the type it expects, so a damaged or hand-edited file opens with the damaged parts at their defaults instead of
 * crashing a screen later. `repaired` names what was put right. Fields this version does not know are kept (a newer
 * version's data must survive being opened here). A file from a newer format is refused.
 */
export function sanitizeCharacter(raw: unknown, nameOf?: (id: string) => string | undefined): { character: Character; repaired: string[]; damage: Damage[] } {
  const base = newCharacter();
  const repaired: string[] = [];
  const damage: Damage[] = [];
  /** `what` is the part (named once in `repaired`); `detail` says what exactly was wrong and what was done about it. */
  const fix = (what: string, detail?: string) => {
    if (!repaired.includes(what)) repaired.push(what);
    const text = detail ?? "could not be read and was set to its default";
    if (damage.length < 200 && !damage.some((d) => d.part === what && d.detail === text)) damage.push({ part: what, detail: text });
  };
  const nm = (id: string) => nameOf?.(id) ?? id;
  const show = (v: unknown) => { const t = typeof v === "string" ? `"${v}"` : JSON.stringify(v) ?? String(v); return t.length > 40 ? `${t.slice(0, 40)}…` : t; };
  const o: Obj = isObj(raw) ? raw : {};
  if (!isObj(raw)) fix("the file is not a character", "nothing in it could be read; this is an empty character");
  if (isNum(o.version) && o.version > 2) throw new Error("This character was saved by a newer Soul Forge. Update Soul Forge to open it.");

  const str = (v: unknown, d: string, what: string, label = what) => (typeof v === "string" ? v : (v !== undefined && fix(what, `${label} was ${show(v)}, not text; now ${d ? `"${d}"` : "empty"}`), d));
  const optStr = (key: string) => { if (o[key] !== undefined && typeof o[key] !== "string") { fix(PART[key] ?? key, `was ${show(o[key])}, not text; removed`); return undefined; } return o[key] as string | undefined; };
  const num = (v: unknown, d: number, what: string, min = -Infinity, max = Infinity, label = what) => {
    if (!isNum(v)) { if (v !== undefined) fix(what, `${label} was ${show(v)}, not a number; set to ${d}`); return d; }
    if (v < min || v > max) { const to = Math.min(max, Math.max(min, v)); fix(what, `${label} was ${v}, outside ${min === -Infinity ? "" : `${min} `}to${max === Infinity ? " any" : ` ${max}`}; set to ${to}`); return to; }
    return v;
  };
  const strings = (v: unknown, what: string): string[] => {
    if (v === undefined) return [];
    if (!Array.isArray(v)) { fix(what, `was ${show(v)}, not a list; now empty`); return []; }
    const bad = v.filter((x) => typeof x !== "string");
    if (bad.length) fix(what, `${bad.length} of ${v.length} entries were not text and were removed (${bad.slice(0, 3).map(show).join(", ")})`);
    return v.filter((x): x is string => typeof x === "string");
  };
  const optStrings = (key: string) => (o[key] === undefined ? undefined : strings(o[key], PART[key] ?? key));
  const record = <T>(v: unknown, what: string, value: (x: unknown) => T | undefined, label: (key: string) => string = (k) => k): Record<string, T> => {
    if (v === undefined) return {};
    if (!isObj(v)) { fix(what, `was ${show(v)}; everything in it is gone`); return {}; }
    const out: Record<string, T> = {};
    for (const [k, x] of Object.entries(v)) {
      const y = value(x);
      if (y === undefined) fix(what, `${label(k)}: was ${show(x)}; removed`);
      else {
        if (Array.isArray(x) && Array.isArray(y) && y.length < x.length) fix(what, `${label(k)}: ${x.length - y.length} of ${x.length} entries were unreadable and removed`);
        out[k] = y;
      }
    }
    return out;
  };
  const idList = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === "string") : undefined);
  const finite = (x: unknown) => (isNum(x) ? x : undefined);
  const objects = (v: unknown, what: string): Obj[] => {
    if (v === undefined) return [];
    if (!Array.isArray(v)) { fix(what, `was ${show(v)}, not a list; now empty`); return []; }
    const bad = v.filter((x) => !isObj(x));
    if (bad.length) fix(what, `${bad.length} of ${v.length} entries could not be read and were removed (${bad.slice(0, 3).map(show).join(", ")})`);
    return v.filter(isObj);
  };
  const optObj = (key: string) => { if (o[key] !== undefined && !isObj(o[key])) { fix(PART[key] ?? key, `was ${show(o[key])}; removed`); return undefined; } return o[key]; };

  const kept = (list: Obj[], ok: (x: Obj) => boolean, what: string) => {
    const out = list.filter(ok);
    if (out.length < list.length) fix(what, `${list.length - out.length} of ${list.length} entries were incomplete and were removed (${list.filter((x) => !ok(x)).slice(0, 3).map((x) => (typeof x.name === "string" && x.name) || show(x)).join(", ")})`);
    return out;
  };
  const itemName = (it: Obj) => (typeof it.label === "string" && it.label) || (typeof it.id === "string" && it.id && nm(it.id)) || (isObj(it.custom) && typeof it.custom.name === "string" && it.custom.name) || "an item";

  // Classes: a known id and a whole level from 1 to 20; twenty levels in all.
  let levels = 0;
  const classes: ClassLevel[] = [];
  for (const c of objects(o.classes, "classes")) {
    if (typeof c.classId !== "string" || !c.classId) { fix("classes", `a class entry named no class (${show(c.classId)}) and was removed${isNum(c.level) ? `; it had ${c.level} levels` : ""}`); continue; }
    let level = isNum(c.level) ? Math.round(c.level) : 1;
    const room = 20 - levels;
    if (room < 1) { fix("class levels", `${nm(c.classId)} was removed: the classes before it already have 20 levels`); continue; }
    const to = Math.min(room, Math.max(1, level));
    if (!isNum(c.level) || level !== c.level || to !== level) fix("class levels", `${nm(c.classId)}: level was ${show(c.level)}; set to ${to}`);
    level = to;
    levels += level;
    classes.push({ ...c, classId: c.classId, level } as ClassLevel);
  }

  const abilityIn = isObj(o.abilityBase) ? o.abilityBase : (o.abilityBase !== undefined && fix("ability scores", `were ${show(o.abilityBase)}; all six are back at ${base.abilityBase.strength}`), {});
  const abilityBase = { ...base.abilityBase };
  for (const a of ABILITY_IDS) abilityBase[a] = Math.round(num(abilityIn[a], base.abilityBase[a], "ability scores", 1, 30, cap(a)));

  const playIn: Obj = isObj(o.play) ? o.play : (o.play !== undefined && fix("play state", `was ${show(o.play)}; hit points, slots and uses spent are back at full`), {});
  const deathIn: Obj = isObj(playIn.deathSaves) ? playIn.deathSaves : {};
  const play: PlayState = {
    ...base.play,
    ...playIn,
    hp: playIn.hp === null || playIn.hp === undefined ? null : isNum(playIn.hp) ? playIn.hp : (fix("hit points", `current hit points were ${show(playIn.hp)}; back at full`), null),
    tempHp: num(playIn.tempHp, 0, "temporary hit points", 0),
    inspiration: !!playIn.inspiration,
    slotsUsed: record(playIn.slotsUsed, "spell slots used", finite, (k) => `level ${k}`),
    hitDiceUsed: num(playIn.hitDiceUsed, 0, "hit dice used", 0),
    conditions: strings(playIn.conditions, "conditions"),
    deathSaves: { success: num(deathIn.success, 0, "death saves", 0, 3), fail: num(deathIn.fail, 0, "death saves", 0, 3) },
    featureUses: record(playIn.featureUses, "feature uses", finite, nm),
  };
  if (playIn.exhaustion !== undefined) play.exhaustion = num(playIn.exhaustion, 0, "exhaustion", 0, 10);
  if (playIn.wildShape !== undefined && !isObj(playIn.wildShape)) { fix("wild shape"); delete play.wildShape; }
  if (playIn.pactUsed !== undefined) play.pactUsed = num(playIn.pactUsed, 0, "pact slots used", 0);
  if (playIn.hitDiceByDie !== undefined) play.hitDiceByDie = record(playIn.hitDiceByDie, "hit dice used", finite);
  if (playIn.companionHp !== undefined) play.companionHp = record(playIn.companionHp, "companion hit points", finite);
  if (playIn.concentration !== undefined && typeof playIn.concentration !== "string") { fix("concentration"); delete play.concentration; }

  const infoIn: Obj = isObj(o.info) ? o.info : (o.info !== undefined && fix("details", `were ${show(o.info)}; now empty`), {});
  const info = { ...base.info, ...infoIn } as CharacterInfo;
  for (const k of Object.keys(base.info) as (keyof CharacterInfo)[]) info[k] = str(infoIn[k], "", "details", String(k));

  const coinsIn: Obj = isObj(o.coins) ? o.coins : (o.coins !== undefined && fix("coins", `were ${show(o.coins)}; now none`), {});
  const coins = { ...base.coins };
  for (const k of Object.keys(base.coins) as (keyof Coinage)[]) coins[k] = num(coinsIn[k], 0, "coins", 0, Infinity, String(k));

  const inventory = objects(o.inventory, "inventory").map((it) => ({
    ...it,
    uid: typeof it.uid === "string" && it.uid ? it.uid : (fix("inventory", `${itemName(it)}: had no entry number; given a new one`), uid()),
    id: typeof it.id === "string" ? it.id : (fix("inventory", `${itemName(it)}: what item it is (${show(it.id)}) could not be read; it is kept as a nameless entry`), ""),
    qty: num(it.qty, 1, "inventory", 0, Infinity, `${itemName(it)}: quantity`),
    equipped: !!it.equipped,
    attuned: !!it.attuned,
  })) as InvItem[];

  const character: Character = {
    ...base,
    ...(o as Partial<Character>),
    version: 2,
    name: str(o.name, "", "name"),
    playerName: str(o.playerName, "", "player name"),
    notes: str(o.notes, "", "notes"),
    xp: num(o.xp, 0, "experience", 0),
    race: optStr("race"),
    background: optStr("background"),
    classes,
    abilityBase,
    abilityMethod: o.abilityMethod === "standard" || o.abilityMethod === "manual" || o.abilityMethod === "pointbuy" ? o.abilityMethod : (o.abilityMethod !== undefined && fix("ability score method", `was ${show(o.abilityMethod)}; set to ${base.abilityMethod}`), base.abilityMethod),
    selections: record(o.selections, "choices", idList, (k) => { const [owner, rule] = k.split("|"); return `${nm(owner)}${rule !== undefined && /^\d+$/.test(rule) ? `, choice ${Number(rule) + 1}` : ""}`; }),
    options: strings(o.options, "options"),
    extras: strings(o.extras, "added content"),
    sources: strings(o.sources, "books"),
    customStats: kept(objects(o.customStats, "custom bonuses"), (c) => typeof c.stat === "string" && isNum(c.value), "custom bonuses").map((c) => ({ ...c, id: typeof c.id === "string" ? c.id : uid() })) as Character["customStats"],
    hpMode: o.hpMode === "roll" ? "roll" : "average",
    hpRolls: record(o.hpRolls, "hit point rolls", (x) => (isNum(x) && x >= 1 ? Math.round(x) : undefined), (k) => `level ${k}`),
    prepared: record(o.prepared, "prepared spells", idList),
    inventory,
    coins,
    attacks: objects(o.attacks, "attacks") as unknown as CustomAttack[],
    companions: kept(objects(o.companions, "companions"), (c) => typeof c.name === "string", "companions").map((c) => ({ ...c, uid: typeof c.uid === "string" ? c.uid : uid(), id: typeof c.id === "string" ? c.id : "" })) as CompanionEntry[],
    resources: kept(objects(o.resources, "counters"), (x) => typeof x.name === "string" && isNum(x.current) && isNum(x.max), "counters") as unknown as Resource[],
    info,
    play,
  };
  // Optional fields: kept when well formed, dropped (and named) when not.
  for (const key of ["declined", "taken", "equipmentAdded", "grantedItemsAdded"] as const) { const v = optStrings(key); if (v === undefined) delete character[key]; else character[key] = v; }
  for (const key of ["importReport", "repairReport", "movedFrom", "portrait", "checkedWith"] as const) { const v = optStr(key); if (v === undefined) delete character[key]; else character[key] = v; }
  for (const key of ["abilityBases", "pointBuy", "hpRollLog", "equipmentLedger", "attackEdits"] as const) if (optObj(key) === undefined) delete character[key];
  for (const key of ["journal", "favorites"] as const) if (o[key] !== undefined) (character as unknown as Obj)[key] = objects(o[key], key);
  if (o.priceMultiplier !== undefined && !(isNum(o.priceMultiplier) && o.priceMultiplier > 0)) { fix("price multiplier", `was ${show(o.priceMultiplier)}; back to normal prices`); delete character.priceMultiplier; }
  return { character, repaired, damage };
}

/** Where each damaged part is put right, for the report. */
const REDO: [RegExp, string][] = [
  [/^(choices|choices turned down|optional choices taken|options)$/, "On Build these choices are open again (marked as still to choose). Make them again there."],
  [/^(classes|class levels|species|background)$/, "Check your species, background, classes and levels on Build."],
  [/^(ability scores|ability score method|ability scores by method|point buy rules)$/, "Set your ability scores again on Build, Abilities."],
  [/^(hit point rolls|hit point roll log)$/, "Enter your hit point rolls again in the hit point dialog (click the hit points)."],
  [/^prepared spells$/, "Prepare your spells again on Magic."],
  [/^(inventory|coins|starting equipment|items from features|attack edits|attacks|price multiplier)$/, "Check your gear, coins and attacks on Equipment."],
  [/^(play state|hit points|temporary hit points|spell slots used|pact slots used|hit dice used|conditions|death saves|feature uses|exhaustion|wild shape|companion hit points|concentration)$/, "Set what is spent again on Play."],
  [/^(name|player name|notes|details|portrait|journal|experience)$/, "Fill these in again in the character's details."],
  [/^(added content|custom bonuses|companions|counters|books|favorites)$/, "Add these again on Manage."],
];

/**
 * The report of a damaged file, for the player: each damaged part, what exactly was wrong, what the app did, and where
 * to put it right. Kept on the character (`repairReport`) so Build can show it again. Empty when nothing was damaged.
 */
export function repairReportText(damage: Damage[], file = "", when = new Date()): string {
  if (!damage.length) return "";
  const parts = [...new Set(damage.map((d) => d.part))];
  const lines = [`Repair report${file ? `: ${file}` : ""}, ${when.toLocaleDateString()}`, `${parts.length === 1 ? "One part" : `${parts.length} parts`} of this character could not be read. Everything else is as it was saved.`, ""];
  const said = new Set<string>();
  for (const part of parts) {
    lines.push(`${cap(part)}:`, ...damage.filter((d) => d.part === part).map((d) => `- ${d.detail}`));
    const redo = REDO.find(([re]) => re.test(part))?.[1];
    if (redo && !said.has(redo)) { said.add(redo); lines.push(`To put right: ${redo}`); }
    lines.push("");
  }
  return lines.join("\n").trim();
}

/**
 * A character read from a file or the library, with the report of anything damaged kept on it. An earlier report
 * stays in front of nothing: the newer one goes first.
 */
export function openCharacter(raw: unknown, file = "", nameOf?: (id: string) => string | undefined, when = new Date()): { character: Character; repaired: string[] } {
  const { character, repaired, damage } = sanitizeCharacter(raw, nameOf);
  if (!damage.length) return { character, repaired };
  const text = repairReportText(damage, file, when);
  return { character: { ...character, repairReport: [text, character.repairReport].filter(Boolean).join("\n\n") }, repaired };
}

/** The name to show for an inventory item: its own label, the element's name, or the custom name. */
export function itemLabel(it: InvItem, name?: string): string {
  const base = it.label?.trim() || name || it.custom?.name || it.id;
  return it.magic && !/[+]\d/.test(base) ? `${base} +${it.magic}` : base;
}

/**
 * Whether the player has settled how hit points work (C7.10, Chris 2026-10-29: players did not know they could change
 * them): chosen in the hit point dialog, or plainly so from an older save (rolled, or rolls recorded).
 */
export const hpConfigured = (ch: Pick<Character, "hpChosen" | "hpMode" | "hpRolls">): boolean =>
  !!ch.hpChosen || ch.hpMode === "roll" || Object.keys(ch.hpRolls ?? {}).length > 0;
