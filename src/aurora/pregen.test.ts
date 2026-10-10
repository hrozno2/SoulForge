/**
 * Usability test: rebuild free official pregenerated characters (D&D Starter Set characters, 2014 rules)
 * with the builder and compare every number and list on the printed sheet with what Soul Forge produces.
 * Needs real content, which is not in this repository. Point AURORA_FIXTURES_2014 at a folder holding
 * the AuroraLegacy files (core internal.xml, ALE.xml and the 2014 players-handbook folder).
 */
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadRegistry } from "./fixture";
import { resolve } from "./engine";
import { buildSheet, type SheetData } from "./sheet";
import { autoFill } from "./autofill";
import { newCharacter, uid, ABILITY_IDS, type AbilityId, type Character } from "./character";
import type { ARegistry } from "./registry";

const DIR = process.env.AURORA_FIXTURES_2014;

interface Pregen {
  title: string;
  race: string;
  subrace?: string;
  className: string;
  background: string;
  /** Names to choose whenever a choice offers them. */
  picks: string[];
  /** Final scores as printed (racial bonuses included). */
  scores: Record<AbilityId, number>;
  inventory: string[];
  gp: number;
  expect: {
    prof: number;
    ac: number;
    initiative: number;
    speed: number;
    hp: number;
    hitDice: string;
    passivePerception: number;
    saves: Record<AbilityId, number>;
    skills: Record<string, number>;
    proficientSkills: string[];
    languages: string[];
    spell?: { dc: number; attack: number; slots: number[]; cantrips: string[]; spells: string[]; prepared: number };
    attacks?: Record<string, number>;
    features: string[];
    proficiencies: string[];
  };
}

const PREGENS: Pregen[] = [
  {
    title: "Hill Dwarf Cleric (Life), Soldier",
    race: "Dwarf",
    subrace: "Hill Dwarf",
    className: "Cleric",
    background: "Soldier",
    picks: ["Life Domain", "Medicine", "Religion", "Light", "Sacred Flame", "Thaumaturgy", "Goblin", "Elvish"],
    scores: { strength: 14, dexterity: 8, constitution: 15, intelligence: 10, wisdom: 16, charisma: 12 },
    inventory: ["Chain Mail", "Shield", "Mace", "Handaxe", "Amulet", "Backpack", "Bedroll", "Mess Kit", "Tinderbox", "Torch", "Rations", "Waterskin", "Rope, Hempen (50 feet)", "Clothes, Common", "Pouch"],
    gp: 10,
    expect: {
      prof: 2, ac: 18, initiative: -1, speed: 25, hp: 11, hitDice: "1d8", passivePerception: 13,
      saves: { strength: 2, dexterity: -1, constitution: 2, intelligence: 0, wisdom: 5, charisma: 3 },
      skills: { acrobatics: -1, "animal handling": 3, arcana: 0, athletics: 4, deception: 1, history: 0, insight: 3, intimidation: 3, investigation: 0, medicine: 5, nature: 0, perception: 3, performance: 1, persuasion: 1, religion: 2, "sleight of hand": -1, stealth: -1, survival: 3 },
      proficientSkills: ["athletics", "intimidation", "medicine", "religion"],
      languages: ["Common", "Dwarvish", "Elvish", "Goblin"],
      spell: { dc: 13, attack: 5, slots: [2], cantrips: ["Light", "Sacred Flame", "Thaumaturgy"], spells: ["Bless", "Cure Wounds"], prepared: 4 },
      attacks: { Mace: 4, Handaxe: 4 },
      features: ["Darkvision", "Dwarven Resilience", "Dwarven Combat Training", "Stonecunning", "Dwarven Toughness", "Spellcasting", "Disciple of Life"],
      proficiencies: ["Heavy Armor", "Shield", "Simple Weapons", "Battleaxe", "Warhammer"],
    },
  },
  {
    title: "Wood Elf Fighter (Archery), Folk Hero",
    race: "Elf",
    subrace: "Wood Elf",
    className: "Fighter",
    background: "Folk Hero",
    picks: ["Archery", "Acrobatics", "History", "Dwarvish", "Halfling"],
    scores: { strength: 13, dexterity: 17, constitution: 14, intelligence: 10, wisdom: 13, charisma: 8 },
    inventory: ["Leather", "Longbow", "Arrow", "Greatsword", "Backpack", "Bedroll", "Mess Kit", "Tinderbox", "Torch", "Rations", "Waterskin", "Rope, Hempen (50 feet)", "Shovel", "Pot, Iron", "Clothes, Common", "Pouch"],
    gp: 10,
    expect: {
      prof: 2, ac: 14, initiative: 3, speed: 35, hp: 12, hitDice: "1d10", passivePerception: 13,
      saves: { strength: 3, dexterity: 3, constitution: 4, intelligence: 0, wisdom: 1, charisma: -1 },
      skills: { acrobatics: 5, "animal handling": 3, arcana: 0, athletics: 1, deception: -1, history: 2, insight: 1, intimidation: -1, investigation: 0, medicine: 1, nature: 0, perception: 3, performance: -1, persuasion: -1, religion: 0, "sleight of hand": 3, stealth: 3, survival: 3 },
      proficientSkills: ["acrobatics", "animal handling", "history", "perception", "survival"],
      languages: ["Common", "Dwarvish", "Elvish", "Halfling"],
      attacks: { Greatsword: 3, Longbow: 7 },
      features: ["Darkvision", "Fey Ancestry", "Trance", "Mask of the Wild", "Fighting Style", "Second Wind"],
      proficiencies: ["Light Armor", "Medium Armor", "Heavy Armor", "Shields", "Simple Weapons", "Martial Weapons"],
    },
  },
  {
    title: "High Elf Wizard, Sage",
    race: "Elf",
    subrace: "High Elf",
    className: "Wizard",
    background: "Sage",
    picks: ["Arcana", "History", "Insight", "Investigation", "Mage Hand", "Prestidigitation", "Ray of Frost", "Shocking Grasp", "Detect Magic", "Mage Armor", "Magic Missile", "Shield", "Sleep", "Thunderwave", "Celestial", "Draconic", "Dwarvish"],
    scores: { strength: 10, dexterity: 15, constitution: 14, intelligence: 16, wisdom: 12, charisma: 8 },
    inventory: ["Shortsword", "Component Pouch", "Spellbook", "Backpack", "Book", "Ink (1 ounce bottle)", "Ink Pen", "Parchment", "Sand", "Knife, Small", "Clothes, Common", "Pouch"],
    gp: 10,
    expect: {
      prof: 2, ac: 12, initiative: 2, speed: 30, hp: 8, hitDice: "1d6", passivePerception: 13,
      saves: { strength: 0, dexterity: 2, constitution: 2, intelligence: 5, wisdom: 3, charisma: -1 },
      skills: { acrobatics: 2, "animal handling": 1, arcana: 5, athletics: 0, deception: -1, history: 5, insight: 3, intimidation: -1, investigation: 5, medicine: 1, nature: 3, perception: 3, performance: -1, persuasion: -1, religion: 3, "sleight of hand": 2, stealth: 2, survival: 1 },
      proficientSkills: ["arcana", "history", "insight", "investigation", "perception"],
      languages: ["Common", "Celestial", "Draconic", "Dwarvish", "Elvish"],
      spell: { dc: 13, attack: 5, slots: [2], cantrips: ["Mage Hand", "Prestidigitation", "Ray of Frost", "Shocking Grasp"], spells: ["Detect Magic", "Mage Armor", "Magic Missile", "Shield", "Sleep", "Thunderwave"], prepared: 4 },
      attacks: { Shortsword: 4 },
      features: ["Darkvision", "Fey Ancestry", "Trance", "Cantrip", "Spellcasting", "Arcane Recovery", "Researcher"],
      proficiencies: ["Dagger", "Dart", "Sling", "Quarterstaff", "Light Crossbow", "Longsword", "Shortbow", "Shortsword"],
    },
  },
  {
    title: "Human Paladin, Noble",
    race: "Human",
    className: "Paladin",
    background: "Noble",
    picks: ["Athletics", "Insight", "Draconic", "Dwarvish", "Giant", "History", "Persuasion"],
    scores: { strength: 16, dexterity: 9, constitution: 15, intelligence: 11, wisdom: 13, charisma: 14 },
    inventory: ["Chain Mail", "Battleaxe", "Shield", "Javelin", "Amulet", "Backpack", "Bedroll", "Mess Kit", "Tinderbox", "Torch", "Rations", "Waterskin", "Rope, Hempen (50 feet)", "Clothes, Fine", "Signet Ring", "Scroll of Pedigree", "Pouch"],
    gp: 25,
    expect: {
      prof: 2, ac: 18, initiative: -1, speed: 30, hp: 12, hitDice: "1d10", passivePerception: 11,
      saves: { strength: 3, dexterity: -1, constitution: 2, intelligence: 0, wisdom: 3, charisma: 4 },
      skills: { acrobatics: -1, "animal handling": 1, arcana: 0, athletics: 5, deception: 2, history: 2, insight: 3, intimidation: 2, investigation: 0, medicine: 1, nature: 0, perception: 1, performance: 2, persuasion: 4, religion: 0, "sleight of hand": -1, stealth: -1, survival: 1 },
      proficientSkills: ["athletics", "history", "insight", "persuasion"],
      languages: ["Common", "Draconic", "Dwarvish", "Giant"],
      attacks: { Battleaxe: 5, Javelin: 5 },
      features: ["Divine Sense", "Lay on Hands", "Position of Privilege"],
      proficiencies: ["Light Armor", "Medium Armor", "Heavy Armor", "Shields", "Simple Weapons", "Martial Weapons"],
    },
  },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function find(reg: ARegistry, types: string[], name: string) {
  const hits = types.flatMap((t) => reg.ofType(t)).filter((e) => norm(e.name) === norm(name));
  return hits[0];
}

function build(reg: ARegistry, p: Pregen): { ch: Character; log: string[] } {
  const log: string[] = [];
  let ch = newCharacter();
  ch.name = p.title;
  const race = find(reg, ["Race"], p.race);
  const cls = find(reg, ["Class"], p.className);
  const bg = find(reg, ["Background"], p.background);
  if (!race) log.push(`no race ${p.race}`);
  if (!cls) log.push(`no class ${p.className}`);
  if (!bg) log.push(`no background ${p.background}`);
  ch.race = race?.id;
  ch.background = bg?.id;
  ch.classes = cls ? [{ classId: cls.id, level: 1 }] : [];
  const wanted = new Set([...(p.subrace ? [p.subrace] : []), ...p.picks].map(norm));
  ch = autoFill(ch, reg, (_slot, option) => (wanted.has(norm(option)) ? 1000 : Math.random() * 0));
  // Scores: printed finals minus bonuses from species/background choices.
  const r0 = resolve(ch, reg);
  const base = { ...ch.abilityBase };
  for (const a of ABILITY_IDS) base[a] = p.scores[a] - (r0.stats.get(a) - ch.abilityBase[a]);
  ch.abilityBase = base;
  ch.abilityMethod = "manual";
  for (const item of p.inventory) {
    const el = find(reg, ["Item", "Weapon", "Armor", "Magic Item"], item) ?? reg.search(item.split(",")[0].split("(")[0], undefined, 5).find((e) => ["Item", "Weapon", "Armor"].includes(e.type));
    if (!el) {
      // Not in the loaded content: the app lets you add it as a custom item.
      ch.inventory.push({ uid: uid(), id: "", qty: 1, equipped: false, attuned: false, custom: { name: item } });
      log.push(`custom item used for: ${item}`);
      continue;
    }
    const wear = el.type === "Armor" || el.type === "Weapon";
    ch.inventory.push({ uid: uid(), id: el.id, qty: 1, equipped: wear, attuned: false });
  }
  ch.coins.gp = p.gp;
  // Languages the sheet lists that no rule granted: add them by hand, as a player would.
  const have = new Set(buildSheet(resolve(ch, reg)).proficiencies.languages.map(norm));
  for (const lang of p.expect.languages) {
    if (have.has(norm(lang))) continue;
    const el = find(reg, ["Language"], lang);
    if (el) {
      ch.extras.push(el.id);
      log.push(`added language by hand: ${lang}`);
    }
  }
  return { ch, log };
}

function compare(reg: ARegistry, p: Pregen, ch: Character, sheet: SheetData, r: ReturnType<typeof resolve>) {
  const bad: string[] = [];
  const eq = (what: string, got: unknown, want: unknown) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${what}: got ${JSON.stringify(got)}, sheet says ${JSON.stringify(want)}`);
  };
  const e = p.expect;
  eq("proficiency bonus", sheet.proficiency, e.prof);
  for (const a of ABILITY_IDS) eq(`${a} score`, sheet.abilities.find((x) => x.id === a)!.score, p.scores[a]);
  for (const a of ABILITY_IDS) eq(`${a} save`, sheet.abilities.find((x) => x.id === a)!.save, e.saves[a]);
  for (const [s, v] of Object.entries(e.skills)) eq(`skill ${s}`, sheet.skills.find((x) => x.name === s)!.bonus, v);
  eq("proficient skills", sheet.skills.filter((s) => s.level !== "none").map((s) => s.name).sort(), [...e.proficientSkills].sort());
  eq("armor class", sheet.ac.value, e.ac);
  eq("initiative", sheet.initiative, e.initiative);
  eq("speed", sheet.speed, e.speed);
  eq("hit points", sheet.hp, e.hp);
  eq("hit dice", sheet.hitDice.map((h) => `${h.count}d${h.die}`).join("+"), e.hitDice);
  eq("passive perception", sheet.passivePerception, e.passivePerception);
  eq("languages", [...sheet.proficiencies.languages].sort(), [...e.languages].sort());
  eq("coins", ch.coins.gp, p.gp);
  if (e.spell) {
    const c = sheet.casting[0];
    eq("spell save DC", c?.dc, e.spell.dc);
    eq("spell attack", c?.attack, e.spell.attack);
    eq("spell slots", c?.slots.map((s) => s.total), e.spell.slots);
    const name = (id: string) => reg.get(id)?.name;
    eq("cantrips", [...(c?.cantripsKnown ?? []).map((x) => name(x.id))].sort(), [...e.spell.cantrips].sort());
    const all = [...(c?.spells ?? []), ...(c?.granted ?? [])].map((x) => name(x.id));
    for (const s of e.spell.spells) if (!all.includes(s)) bad.push(`spell ${s} missing`);
    eq("prepared spells allowed", c?.prepareMax, e.spell.prepared);
  } else eq("no spellcasting", sheet.casting.length, 0);
  for (const [w, bonus] of Object.entries(e.attacks ?? {})) {
    const a = sheet.attacks.find((x) => norm(x.name) === norm(w));
    if (!a) bad.push(`attack ${w} missing`);
    else eq(`attack bonus ${w}`, a.bonus, bonus);
  }
  const have = new Set([...sheet.features.map((f) => norm(f.name)), ...r.active.map((a) => norm(a.el.name))]);
  for (const f of e.features) if (![...have].some((h) => h.includes(norm(f)))) bad.push(`feature missing: ${f}`);
  const profs = [...sheet.proficiencies.armor, ...sheet.proficiencies.weapons].map(norm).join(" | ");
  for (const f of e.proficiencies) if (!profs.includes(norm(f))) bad.push(`proficiency missing: ${f}`);
  return bad;
}

describe.skipIf(!DIR)("pregenerated characters (Starter Set)", () => {
  const reg = DIR ? loadRegistry(DIR) : undefined;
  for (const p of PREGENS) {
    it(p.title, () => {
      const { ch, log } = build(reg!, p);
      const r = resolve(ch, reg!);
      const sheet = buildSheet(r);
      if (process.env.PREGEN_JSON) writeFileSync(`${process.env.PREGEN_JSON}/${p.className}.json`, JSON.stringify(ch));
      const open = r.slots.filter((s) => !s.rule.optional && s.chosen.length < s.rule.number).map((s) => s.rule.name);
      const bad = [...log.filter((l) => !/^(custom item|added language)/.test(l)), ...compare(reg!, p, ch, sheet, r), ...open.map((o) => `unfilled choice: ${o}`)];
      if (process.env.PREGEN_REPORT) writeFileSync(process.env.PREGEN_REPORT, `${p.title}\n${[...log.map((l) => `  note: ${l}`), ...bad.map((b) => `  - ${b}`)].join("\n") || "  all fields match"}\n\n`, { flag: "a" });
      expect(bad).toEqual([]);
    });
  }
});
