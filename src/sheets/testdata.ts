import type { FillData } from "./data";

const sk = (b: string, prof = true) => ({ bonus: b, prof, expert: false });
const SKILLS = ["acrobatics", "animal handling", "arcana", "athletics", "deception", "history", "insight", "intimidation", "investigation", "medicine", "nature", "perception", "performance", "persuasion", "religion", "sleight of hand", "stealth", "survival"];
const spell = (level: number, i: number) => ({ level: String(level), name: `Spell ${level}-${i}`, school: "Evoc", time: "1A", range: "60 ft", duration: "Inst", concentration: i % 2 === 0, ritual: i % 3 === 0, v: true, s: true, m: i % 2 === 1, notes: level ? "prepared" : "" });

/** A character with everything filled in, so a test can see which fields of a sheet the filler reaches. */
export function maximal(): FillData {
  const abil = { score: "14", mod: "+2", save: "+4", saveProf: true };
  return {
    name: "Test Hero", background: "Sage", className: "Wizard", species: "Elf", subclass: "Evoker", level: 5, xp: 6500, ac: 15, shield: true, hpMax: 40, hpCurrent: 30, hpTemp: 5, hdSpent: 2, hdMax: "5d6",
    speed: "30", size: "Medium", darkvision: "60 ft", inspiration: true, conditions: "", exhaustion: "", deathSuccess: 2, deathFail: 1, profBonus: "+3", initiative: "+2", passive: "15",
    abilities: { strength: abil, dexterity: abil, constitution: abil, intelligence: abil, wisdom: abil, charisma: abil },
    skills: Object.fromEntries(SKILLS.map((k) => [k, sk("+5")])),
    armorTraining: { light: true, medium: true, heavy: true, shield: true }, weaponTraining: { simple: true, martial: true, improvised: false },
    tools: "Thieves' tools", toolsOnly: "Thieves' tools", weaponsOther: "", languages: "Common, Elvish", traits: [], feats: [], classFeatures: [],
    weapons: Array.from({ length: 6 }, (_, i) => ({ name: `Weapon ${i + 1}`, bonus: "+5", damage: "1d8+3 slashing", notes: "finesse" })),
    casting: { ability: "Intelligence", mod: "+4", dc: "15", attack: "+7", focus: "Crystal", slots: [4, 3, 3, 3, 2, 1, 1, 1, 1], used: [1, 1, 1, 1, 1, 1, 1, 1, 1] },
    spells: [...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((lv) => Array.from({ length: 20 }, (_, i) => spell(lv, i)))],
    armorWorn: "Chain mail", weaponsText: "Longsword\nDagger", otherGear: "Rope\nTorch\nBackpack", magicItems: [{ name: "Ring", attuned: true }, { name: "Wand", attuned: true }, { name: "Cloak", attuned: false }],
    coins: { cp: "1", sp: "2", ep: "3", gp: "4", pp: "5" }, carryCapacity: "150", pushDrag: "300",
    backstory: "Backstory text", personality: "Traits: brave\nIdeals: honour\nBonds: family\nFlaws: pride", appearance: "Tall", alignment: "Neutral", notes: "Some notes",
    body: { age: "30", height: "6ft", weight: "150", eyes: "blue", hair: "brown", skin: "pale", gender: "m", deity: "Mystra", allies: "The Guild", player: "Sam" },
    featureList: [{ group: "Class features", name: "Arcane Recovery", usage: "1/Long Rest", text: "Recover slots." }, { group: "Class features", name: "Potent Cantrip", usage: "", text: "Half damage on a save." }, { group: "Species traits", name: "Darkvision", usage: "", text: "See in the dark." }, { group: "Feats", name: "Alert", usage: "", text: "Initiative bonus." }],
  } as unknown as FillData;
}

