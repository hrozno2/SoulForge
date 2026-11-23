/**
 * The guided first character (Chris 2026-11-23): plain questions for someone new to D&D, turned into recommendations
 * and never into picks. A small table written by hand, on the free SRD rules of the 2024 edition, so it works on a
 * fresh install. The player does the real things on the real board; the guide says what to look for and why.
 */
import type { AbilityId } from "./character";

export type PlayStyle = "fight" | "magic" | "cunning" | "support";
export type Upkeep = 1 | 2 | 3;

export const STYLE_QUESTION = "What sounds like the most fun?";
export const STYLES: { id: PlayStyle; label: string }[] = [
  { id: "fight", label: "Hitting things, and taking hits" },
  { id: "magic", label: "Casting spells" },
  { id: "cunning", label: "Sneaking, tricking and talking" },
  { id: "support", label: "Healing and protecting friends" },
];
export const UPKEEP_QUESTION = "How much do you want to keep track of?";
export const UPKEEPS: { id: Upkeep; label: string }[] = [
  { id: 1, label: "As little as possible" },
  { id: 2, label: "Some is fine" },
  { id: 3, label: "Give me everything" },
];

interface ClassGuide {
  name: string;
  styles: PlayStyle[];
  /** How much there is to track at the table: 1 little, 3 a lot. */
  upkeep: Upkeep;
  line: string;
  /** Species and backgrounds of the free rules that suit it, the first the plainest fit. */
  species: string[];
  backgrounds: string[];
  /** The standard array, highest score first. */
  scores: AbilityId[];
}

const S = "strength";
const D = "dexterity";
const C = "constitution";
const I = "intelligence";
const W = "wisdom";
const H = "charisma";

export const CLASS_GUIDE: ClassGuide[] = [
  {
    name: "Fighter",
    styles: ["fight"],
    upkeep: 1,
    line: "Good with every weapon and armor, tough, and simple to run.",
    species: ["Human", "Orc", "Dwarf"],
    backgrounds: ["Soldier"],
    scores: [S, C, D, W, H, I],
  },
  {
    name: "Barbarian",
    styles: ["fight"],
    upkeep: 1,
    line: "Rages, hits hard and shrugs off blows.",
    species: ["Orc", "Goliath", "Dwarf"],
    backgrounds: ["Soldier"],
    scores: [S, C, D, W, H, I],
  },
  {
    name: "Monk",
    styles: ["fight", "cunning"],
    upkeep: 2,
    line: "Fast, unarmed and hard to pin down.",
    species: ["Elf", "Human", "Halfling"],
    backgrounds: ["Acolyte", "Soldier"],
    scores: [D, W, C, S, I, H],
  },
  {
    name: "Paladin",
    styles: ["fight", "support"],
    upkeep: 2,
    line: "A knight in heavy armor who heals and smites.",
    species: ["Human", "Dragonborn", "Dwarf"],
    backgrounds: ["Soldier", "Acolyte"],
    scores: [S, H, C, W, D, I],
  },
  {
    name: "Ranger",
    styles: ["fight", "cunning"],
    upkeep: 2,
    line: "A hunter and tracker with a bow and a little magic.",
    species: ["Elf", "Human", "Halfling"],
    backgrounds: ["Soldier", "Criminal"],
    scores: [D, W, C, S, I, H],
  },
  {
    name: "Rogue",
    styles: ["cunning"],
    upkeep: 1,
    line: "Sneaks, picks locks and strikes where it hurts.",
    species: ["Halfling", "Elf", "Human"],
    backgrounds: ["Criminal"],
    scores: [D, C, H, W, I, S],
  },
  {
    name: "Bard",
    styles: ["cunning", "support", "magic"],
    upkeep: 3,
    line: "Talks, inspires friends and casts a bit of everything.",
    species: ["Human", "Tiefling", "Elf"],
    backgrounds: ["Criminal", "Sage"],
    scores: [H, D, C, W, I, S],
  },
  {
    name: "Cleric",
    styles: ["support", "magic"],
    upkeep: 2,
    line: "Heals, protects and calls on a god's power.",
    species: ["Dwarf", "Human", "Goliath"],
    backgrounds: ["Acolyte"],
    scores: [W, C, S, H, D, I],
  },
  {
    name: "Druid",
    styles: ["support", "magic"],
    upkeep: 3,
    line: "Nature's magic, and later the shapes of beasts.",
    species: ["Elf", "Gnome", "Human"],
    backgrounds: ["Acolyte", "Sage"],
    scores: [W, C, D, I, H, S],
  },
  {
    name: "Sorcerer",
    styles: ["magic"],
    upkeep: 2,
    line: "A few spells, cast often and bent to your will.",
    species: ["Tiefling", "Dragonborn", "Human"],
    backgrounds: ["Sage", "Criminal"],
    scores: [H, C, D, W, I, S],
  },
  {
    name: "Warlock",
    styles: ["magic", "cunning"],
    upkeep: 2,
    line: "A pact with a patron: few spells, always at full strength.",
    species: ["Tiefling", "Human", "Elf"],
    backgrounds: ["Sage", "Criminal"],
    scores: [H, C, D, W, I, S],
  },
  {
    name: "Wizard",
    styles: ["magic"],
    upkeep: 3,
    line: "The most spells of anyone, kept in a spellbook.",
    species: ["Gnome", "Elf", "Human"],
    backgrounds: ["Sage"],
    scores: [I, C, D, W, H, S],
  },
];

/** Up to three classes for the answers: those of the style first, the nearest to the upkeep the player wants first. */
export function recommendClasses(style: PlayStyle, upkeep: Upkeep): ClassGuide[] {
  return CLASS_GUIDE.filter((c) => c.styles.includes(style))
    .map((c, i) => ({ c, far: Math.abs(c.upkeep - upkeep), first: c.styles[0] === style ? 0 : 1, i }))
    .sort((a, b) => a.far - b.far || a.first - b.first || a.i - b.i)
    .slice(0, 3)
    .map((x) => x.c);
}

export const guideFor = (className: string | undefined) => CLASS_GUIDE.find((c) => c.name === className);

const ARRAY = [15, 14, 13, 12, 10, 8];
/** The standard array placed for a class: its best score where the class needs it most. */
export function recommendedScores(className: string): Record<AbilityId, number> | undefined {
  const g = guideFor(className);
  return g ? (Object.fromEntries(g.scores.map((a, i) => [a, ARRAY[i]])) as Record<AbilityId, number>) : undefined;
}
