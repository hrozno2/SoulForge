import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FillData } from "./data";
import { RECTS_2014, fill2014, fill2024Form, type Sink, type W } from "./forms";
import { buildPlan } from "./automap";

const sk = (b: string, prof = true) => ({ bonus: b, prof, expert: false });
const SKILLS = ["acrobatics", "animal handling", "arcana", "athletics", "deception", "history", "insight", "intimidation", "investigation", "medicine", "nature", "perception", "performance", "persuasion", "religion", "sleight of hand", "stealth", "survival"];
const spell = (level: number, i: number) => ({ level: String(level), name: `Spell ${level}-${i}`, school: "Evoc", time: "1A", range: "60 ft", duration: "Inst", concentration: i % 2 === 0, ritual: i % 3 === 0, v: true, s: true, m: i % 2 === 1, notes: level ? "prepared" : "" });

/** A character with everything filled in, so a test can see which fields of a sheet the filler reaches. */
function maximal(): FillData {
  const abil = { score: "14", mod: "+2", save: "+4", saveProf: true };
  return {
    name: "Test Hero", background: "Sage", className: "Wizard", species: "Elf", subclass: "Evoker", level: 5, xp: 6500, ac: 15, shield: true, hpMax: 40, hpCurrent: 30, hpTemp: 5, hdSpent: 2, hdMax: "5d6",
    speed: "30", size: "Medium", darkvision: "60 ft", inspiration: true, conditions: "", exhaustion: "", deathSuccess: 2, deathFail: 1, profBonus: "+3", initiative: "+2",
    abilities: { strength: abil, dexterity: abil, constitution: abil, intelligence: abil, wisdom: abil, charisma: abil },
    skills: Object.fromEntries(SKILLS.map((k) => [k, sk("+5")])),
    armorTraining: { light: true, medium: true, heavy: true, shield: true }, weaponTraining: { simple: true, martial: true, improvised: false },
    tools: "Thieves' tools", languages: "Common, Elvish", traits: [], feats: [], classFeatures: [],
    weapons: Array.from({ length: 6 }, (_, i) => ({ name: `Weapon ${i + 1}`, bonus: "+5", damage: "1d8+3 slashing", notes: "finesse" })),
    casting: { ability: "Intelligence", mod: "+4", dc: "15", attack: "+7", focus: "Crystal", slots: [4, 3, 3, 3, 2, 1, 1, 1, 1], used: [1, 1, 0, 0, 0, 0, 0, 0, 0] },
    spells: [...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((lv) => Array.from({ length: 20 }, (_, i) => spell(lv, i)))],
    armorWorn: "Chain mail", weaponsText: "Longsword\nDagger", otherGear: "Rope\nTorch\nBackpack", magicItems: [{ name: "Ring", attuned: true }, { name: "Wand", attuned: true }, { name: "Cloak", attuned: false }],
    coins: { cp: "1", sp: "2", ep: "3", gp: "4", pp: "5" }, carryCapacity: "150", pushDrag: "300",
    backstory: "Backstory text", personality: "Traits: brave\nIdeals: honour\nBonds: family\nFlaws: pride", appearance: "Tall", alignment: "Neutral", notes: "Some notes",
    body: { age: "30", height: "6ft", weight: "150", eyes: "blue", hair: "brown", skin: "pale", gender: "m", deity: "Mystra", allies: "The Guild", player: "Sam" },
    featureList: [{ group: "Class features", name: "Arcane Recovery", usage: "1/Long Rest", text: "Recover slots." }, { group: "Class features", name: "Potent Cantrip", usage: "", text: "Half damage on a save." }, { group: "Species traits", name: "Darkvision", usage: "", text: "See in the dark." }, { group: "Feats", name: "Alert", usage: "", text: "Initiative bonus." }],
  } as unknown as FillData;
}

const recorder = () => {
  const text = new Map<string, string>();
  const checks = new Map<string, boolean>();
  const sink: Sink = { text: (w, v) => void text.set(`${w.p}:${w.name}`, v), check: (w, on) => void checks.set(`${w.p}:${w.name}:${w.x}:${w.y}`, on), image: (w) => void checks.set(`${w.p}:${w.name}:${w.x}:${w.y}`, true) };
  return { sink, text, checks };
};

const unreached = (ws: W[], text: Map<string, string>) => [...new Set(ws.filter((w) => w.t === "Tx" && !text.has(`${w.p}:${w.name}`)).map((w) => w.name.trim()))];

describe("official sheets are fully mapped", () => {
  it("classic 2014 sheet: every text field is reached", () => {
    const { sink, text, checks } = recorder();
    fill2014(RECTS_2014, maximal(), sink);
    expect(unreached(RECTS_2014, text)).toEqual([]);
    // Saving throws, skills and prepared spells were ticked.
    expect([...checks.values()].filter(Boolean).length).toBeGreaterThan(20);
  });
  it("official 2024 sheet: every text field is reached", () => {
    const ws = (JSON.parse(readFileSync("fixtures/sheets/rects2024.json", "utf8")) as { n: string; t: "Tx" | "Btn"; p: number; x: number; y: number; w: number; h: number }[]).map((r) => ({ name: r.n, t: r.t, p: r.p, x: r.x, y: r.y, w: r.w, h: r.h }));
    const { sink, text, checks } = recorder();
    fill2024Form(ws, maximal(), sink);
    expect(unreached(ws, text)).toEqual([]);
    expect([...checks.values()].filter(Boolean).length).toBeGreaterThan(25);
  });
});

describe("check boxes", () => {
  const boxes = (ws: W[], checks: Map<string, boolean>) => ws.filter((w) => w.t === "Btn" && !checks.has(`${w.p}:${w.name}:${w.x}:${w.y}`)).map((w) => `${w.p}:${w.name}`);
  it("2024: every check box is decided", () => {
    const ws = (JSON.parse(readFileSync("fixtures/sheets/rects2024.json", "utf8")) as { n: string; t: "Tx" | "Btn"; p: number; x: number; y: number; w: number; h: number }[]).map((r) => ({ name: r.n, t: r.t, p: r.p, x: r.x, y: r.y, w: r.w, h: r.h }));
    const { sink, checks } = recorder();
    fill2024Form(ws, maximal(), sink);
    expect(boxes(ws, checks).filter((b) => !b.includes("Portrait"))).toEqual([]);
  });
  it("2014: every check box is decided", () => {
    const { sink, checks } = recorder();
    fill2014(RECTS_2014, maximal(), sink);
    expect(boxes(RECTS_2014, checks)).toEqual([]);
  });
});

describe("automatic matching of other fillable sheets", () => {
  it("recognises the fields of the classic sheet by name alone", () => {
    const { plan, unmatched } = buildPlan(RECTS_2014.map((w) => ({ ...w })));
    expect(plan.has("name")).toBe(true);
    expect(plan.has("strength.score")).toBe(true);
    expect(plan.has("skill.sleight of hand")).toBe(true);
    expect(unmatched.length).toBeLessThanOrEqual(2);
  });
});
