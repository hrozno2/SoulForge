/**
 * Runs the 5etools converter on a local copy of 5etools-format data (set FIVETOOLS_FIXTURES to its `data` folder).
 * The data is not part of this repository. Small inline samples cover the conversion rules without it.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { convertFiveTools, entriesHtml } from "./fivetools";
import { ARegistry } from "./registry";
import { resolve } from "./engine";
import { autoFill } from "./autofill";
import { buildSheet } from "./sheet";
import { newCharacter } from "./character";

const DIR = process.env.FIVETOOLS_FIXTURES;

function load(dir: string) {
  const files: Record<string, unknown> = {};
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".json")) files[relative(dir, p)] = JSON.parse(readFileSync(p, "utf8"));
    }
  };
  walk(dir);
  const reg = new ARegistry();
  reg.addElements(convertFiveTools({ files }));
  reg.build();
  return reg;
}

describe("text conversion", () => {
  it("turns tags into readable text", () => {
    const html = entriesHtml(["Take {@damage 2d6} fire damage on a failed {@dc 15} save. {@atk mw} {@hit 5} to hit, see {@spell fireball|phb}."]);
    expect(html).toContain("2d6 fire damage");
    expect(html).toContain("DC 15");
    expect(html).toContain("+5");
    expect(html).toContain("fireball");
    expect(html).not.toContain("{@");
  });
  it("renders lists and tables", () => {
    expect(entriesHtml({ type: "list", items: ["a", "b"] })).toBe("<ul><li>a</li><li>b</li></ul>");
    expect(entriesHtml({ type: "table", colLabels: ["Roll", "Item"], rows: [["1", "x"]] })).toContain("<td>x</td>");
  });
});

describe("ability scores are not counted twice", () => {
  const files = {
    "races.json": { race: [{ name: "Dwarf", source: "PHB", ability: [{ con: 2 }], entries: ["Tough."] }, { name: "Elf", source: "XPHB", entries: ["Graceful."] }] },
    "backgrounds.json": { background: [{ name: "Sage", source: "XPHB", ability: [{ choose: { weighted: { from: ["con", "int", "wis"], weights: [2, 1] } } }], feats: [{ "magic initiate|xphb": true }], entries: ["Study."] }] },
  };
  const make = (race: string) => {
    const reg = new ARegistry();
    reg.addElements(convertFiveTools({ files }));
    reg.build();
    const ch = newCharacter();
    ch.race = reg.ofType("Race").find((e) => e.name === race)!.id;
    ch.background = reg.ofType("Background")[0].id;
    return resolve(ch, reg);
  };
  const asiSlots = (r: ReturnType<typeof make>) => r.slots.filter((s) => s.rule.type === "Ability Score Improvement").length;
  it("keeps the background's increase with a 2024 species", () => {
    expect(asiSlots(make("Elf"))).toBeGreaterThan(0);
  });
  it("drops the background's increase when an older species already raises scores", () => {
    const r = make("Dwarf");
    expect(asiSlots(r)).toBe(0);
    // base 8 plus the species' +2, and nothing from the background
    expect(r.stats.get("constitution")).toBe(10);
  });
});

describe("optional features and additional spells", () => {
  const sample = JSON.parse(readFileSync("fixtures/fivetools/sample.json", "utf8"));
  const els = convertFiveTools({ files: { "sample.json": sample } });
  it("turns optional features into selectable elements", () => {
    const two = els.find((e) => e.name === "Test Style Two")!;
    expect(two.type).toBe("Optional Feature");
    expect(two.supports).toEqual(expect.arrayContaining(["opt-FS:F", "opt-FS:P"]));
    expect(els.find((e) => e.name === "Test Invocation")!.setters.level?.value).toBe("5");
  });
  it("gives a class its optional feature choices by level", () => {
    const c = els.find((e) => e.name === "Tester")!;
    const picks = c.rules.filter((r) => r.kind === "select" && r.type === "Optional Feature") as Extract<typeof c.rules[number], { kind: "select" }>[];
    expect(picks.filter((r) => r.supports === "opt-FS:F").map((r) => [r.level, r.number])).toEqual([[1, 1]]);
    expect(picks.filter((r) => r.supports === "opt-EI").map((r) => [r.level, r.number])).toEqual([[2, 2], [5, 1], [9, 1]]);
  });
  it("grants a species its innate spell at the right level", () => {
    const r = els.find((e) => e.name === "Windkin")!;
    const g = r.rules.find((x) => x.kind === "grant" && x.type === "Spell") as Extract<typeof r.rules[number], { kind: "grant" }>;
    expect(g.level).toBe(3);
    expect(g.id).toBe(els.find((e) => e.name === "Gust Sample")!.id);
    expect(r.spellcasting?.ability).toBe("Intelligence");
  });
});

describe("inline samples", () => {
  it("converts a spell, an item and a feat", () => {
    const els = convertFiveTools({
      files: {
        "spells/spells-x.json": { spell: [{ name: "Zap", source: "X", level: 1, school: "V", time: [{ number: 1, unit: "action" }], range: { type: "point", distance: { type: "feet", amount: 60 } }, components: { v: true, s: true }, duration: [{ type: "instant" }], entries: ["Zap!"] }] },
        "items-base.json": { baseitem: [{ name: "Longsword", source: "X", type: "M|X", weight: 3, value: 1500, weaponCategory: "martial", dmg1: "1d8", dmgType: "S", dmg2: "1d10", property: ["V|X"] }, { name: "Shield", source: "X", type: "S|X", ac: 2, weight: 6, value: 1000 }] },
        "feats.json": { feat: [{ name: "Tough", source: "X", prerequisite: [{ level: 4 }], entries: ["More HP."] }] },
      },
    });
    const reg = new ARegistry();
    reg.addElements(els);
    reg.build();
    expect(reg.get("ID_5ET_SPELL_X_ZAP")!.setters.level.value).toBe("1");
    const sword = reg.get("ID_5ET_ITEM_X_LONGSWORD")!;
    expect(sword.type).toBe("Weapon");
    expect(sword.setters.damage.attrs.type).toBe("slashing");
    expect(sword.setters.versatile.value).toBe("1d10");
    expect(reg.get("ID_5ET_ITEM_X_SHIELD")!.rules.some((r) => r.kind === "stat" && r.name === "ac:shield")).toBe(true);
    expect(reg.get("ID_5ET_FEAT_X_TOUGH")!.requirements).toBe("[level:4]");
  });
});

describe.skipIf(!DIR)("real 5etools data", () => {
  const reg = DIR ? load(DIR) : undefined;

  it("loads content of every kind", () => {
    for (const t of ["Spell", "Race", "Sub Race", "Background", "Class", "Archetype", "Feat", "Weapon", "Armor", "Magic Item", "Language", "Class Feature"]) {
      expect(reg!.ofType(t).length, t).toBeGreaterThan(0);
    }
  });

  it("no element name has a capital right after an apostrophe", () => {
    const bad = reg!.all().filter((e) => /['’]S\b/.test(e.name)).map((e) => `${e.id}: ${e.name}`);
    expect(bad.slice(0, 20)).toEqual([]);
  });

  it("builds a level 5 Wizard (2024) with the right numbers", () => {
    const wiz = reg!.ofType("Class").find((c) => c.name === "Wizard" && c.source.includes("2024"))!;
    expect(wiz).toBeTruthy();
    let ch = newCharacter();
    ch.classes = [{ classId: wiz.id, level: 5 }];
    ch.abilityBase = { strength: 8, dexterity: 14, constitution: 14, intelligence: 16, wisdom: 12, charisma: 10 };
    ch = autoFill(ch, reg!);
    const r = resolve(ch, reg!);
    const sheet = buildSheet(r);
    expect(sheet.proficiency).toBe(3);
    expect(sheet.hp).toBe(6 + 2 + 4 * (4 + 2));
    expect(sheet.abilities.find((a) => a.id === "intelligence")!.saveProficient).toBe(true);
    const c = sheet.casting[0];
    expect(c.dc).toBe(8 + 3 + 3);
    expect(c.slots.map((s) => s.total)).toEqual([4, 3, 2]);
    expect(c.prepareMax).toBe(9);
    expect(c.cantripsKnown.length).toBe(4);
    expect(c.spells.length).toBe(6 + 2 * 4);
  });

  it("gives a Warlock pact slots", () => {
    const wl = reg!.ofType("Class").find((c) => c.name === "Warlock" && c.source.includes("2024"))!;
    let ch = newCharacter();
    ch.classes = [{ classId: wl.id, level: 5 }];
    ch = autoFill(ch, reg!);
    const c = buildSheet(resolve(ch, reg!)).casting[0];
    expect(c.pactLevel).toBe(3);
    expect(c.slots.map((s) => `${s.level}:${s.total}`)).toEqual(["3:2"]);
  });

  it("builds a Fighter in heavy armor with a shield", () => {
    const f = reg!.ofType("Class").find((c) => c.name === "Fighter" && c.source.includes("2024"))!;
    let ch = newCharacter();
    ch.classes = [{ classId: f.id, level: 1 }];
    ch.abilityBase = { strength: 16, dexterity: 12, constitution: 14, intelligence: 8, wisdom: 10, charisma: 10 };
    ch = autoFill(ch, reg!);
    const item = (name: string) => reg!.all().find((e) => e.name === name && e.source.includes("2024"))!;
    ch.inventory = [item("Chain Mail"), item("Shield"), item("Longsword")].map((e, i) => ({ uid: String(i), id: e.id, qty: 1, equipped: true, attuned: false }));
    const sheet = buildSheet(resolve(ch, reg!));
    expect(sheet.ac.value).toBe(18);
    expect(sheet.attacks.find((a) => a.name === "Longsword")!.bonus).toBe(3 + 2);
  });
});

describe("inline tags", () => {
  it("a filter link shows its words, not its search; a named link shows what it is told to", () => {
    expect(entriesHtml("any {@filter simple weapon|items|source=phb|category=basic|type=simple weapon}")).toBe("<p>any simple weapon</p>");
    expect(entriesHtml("{@spell fireball|phb|a fire spell} and {@spell shield|phb}")).toBe("<p>a fire spell and shield</p>");
    expect(entriesHtml("{@book Chapter 5|PHB|5}")).toBe("<p>Chapter 5</p>");
  });
});

describe("languages of a species that lists none", () => {
  const offered = (source: string) => convertFiveTools({ files: { "races.json": { race: [{ name: "Test Folk", source, speed: 30, size: ["M"] }] } } as never }).find((e) => e.type === "Race")!.rules.find((r) => r.kind === "select" && r.type === "Language") as { number: number };
  it("Common and two under the 2024 rules, Common and one in the books before them", () => {
    expect(offered("XPHB").number).toBe(2);
    expect(offered("MPMM").number).toBe(1);
    expect(offered("VRGR").number).toBe(1);
  });
});

describe("a subclass feature that is a choice of other features", () => {
  it("offers them, though the subclass's own list does not name them", () => {
    const f = (name: string, entries: unknown[] = ["Text."]) => ({ name, source: "PHB", className: "Ranger", classSource: "PHB", subclassShortName: "Hunter", subclassSource: "PHB", level: 3, entries });
    const els = convertFiveTools({ files: { "class/class-ranger.json": {
      class: [{ name: "Ranger", source: "PHB", hd: { number: 1, faces: 10 }, classFeatures: [], subclassTitle: "Conclave" }],
      subclass: [{ name: "Hunter", shortName: "Hunter", source: "PHB", className: "Ranger", classSource: "PHB", subclassFeatures: ["Hunter|Ranger||Hunter||3", "Hunter's Prey|Ranger||Hunter||3"] }],
      subclassFeature: [f("Hunter"), f("Hunter's Prey", ["Choose one.", { type: "options", count: 1, entries: [{ type: "refSubclassFeature", subclassFeature: "Colossus Slayer|Ranger||Hunter||3" }, { type: "refSubclassFeature", subclassFeature: "Giant Killer|Ranger||Hunter||3" }] }]), f("Colossus Slayer"), f("Giant Killer")],
    } } as never });
    const choice = els.find((e) => e.type === "Archetype")!.rules.find((r) => r.kind === "select" && r.name.startsWith("Hunter's Prey")) as { supports: string };
    expect(choice.supports.split("|").map((id) => els.find((e) => e.id === id)?.name)).toEqual(["Colossus Slayer", "Giant Killer"]);
  });
  it("does not offer optional features twice when a progression already does", () => {
    const f = { name: "Maneuvers", source: "PHB", className: "Fighter", classSource: "PHB", subclassShortName: "Battle Master", subclassSource: "PHB", level: 3, entries: ["Choose.", { type: "options", count: 3, entries: [{ type: "refOptionalfeature", optionalfeature: "Riposte" }] }] };
    const els = convertFiveTools({ files: { "class/class-fighter.json": {
      class: [{ name: "Fighter", source: "PHB", hd: { number: 1, faces: 10 }, classFeatures: [], subclassTitle: "Archetype" }],
      subclass: [{ name: "Battle Master", shortName: "Battle Master", source: "PHB", className: "Fighter", classSource: "PHB", subclassFeatures: ["Maneuvers|Fighter||Battle Master||3"], optionalfeatureProgression: [{ name: "Maneuvers", featureType: ["MV:B"], progression: { "3": 3, "7": 5 } }] }],
      subclassFeature: [f],
    } } as never });
    const picks = els.find((e) => e.type === "Archetype")!.rules.filter((r) => r.kind === "select" && r.type === "Optional Feature") as { number: number; level?: number }[];
    expect(picks.map((r) => [r.level, r.number])).toEqual([[3, 3], [7, 2]]);
  });
  it("with no count, the character has them all", () => {
    const f = (name: string, entries: unknown[] = ["Text."]) => ({ name, source: "TCE", className: "Fighter", classSource: "PHB", subclassShortName: "Psi Warrior", subclassSource: "TCE", level: 3, entries });
    const els = convertFiveTools({ files: { "class/class-fighter.json": {
      class: [{ name: "Fighter", source: "PHB", hd: { number: 1, faces: 10 }, classFeatures: [], subclassTitle: "Archetype" }],
      subclass: [{ name: "Psi Warrior", shortName: "Psi Warrior", source: "TCE", className: "Fighter", classSource: "PHB", subclassFeatures: ["Psionic Power|Fighter||Psi Warrior|TCE|3"] }],
      subclassFeature: [f("Psionic Power", ["The powers below.", { type: "options", entries: [{ type: "refSubclassFeature", subclassFeature: "Protective Field|Fighter||Psi Warrior|TCE|3" }, { type: "refSubclassFeature", subclassFeature: "Psionic Strike|Fighter||Psi Warrior|TCE|3" }] }]), f("Protective Field"), f("Psionic Strike")],
    } } as never });
    const rules = els.find((e) => e.type === "Archetype")!.rules;
    expect(rules.some((r) => r.kind === "select")).toBe(false);
    const given = rules.filter((r) => r.kind === "grant").map((r) => els.find((e) => e.id === (r as { id: string }).id)?.name);
    expect(given).toEqual(expect.arrayContaining(["Protective Field", "Psionic Strike"]));
  });
});

describe("entryData: a feature's fields as Foundry data", () => {
  const build = (name: string, entryData: unknown) => {
    const f = { name, source: "PHB", className: "Cleric", classSource: "PHB", subclassShortName: "Knowledge", subclassSource: "PHB", level: 1 };
    const els = convertFiveTools({ files: {
      "class/class-cleric.json": {
        class: [{ name: "Cleric", source: "PHB", hd: { number: 1, faces: 8 }, classFeatures: [], subclassTitle: "Domain" }],
        subclass: [{ name: "Knowledge Domain", shortName: "Knowledge", source: "PHB", className: "Cleric", classSource: "PHB", subclassFeatures: [`${name}|Cleric||Knowledge||1`] }],
        subclassFeature: [{ ...f, entries: ["Text only."] }],
      },
      "class/foundry.json": { subclassFeature: [{ ...f, entryData }] },
    } as never });
    return { els, feature: els.find((e) => e.name === name)! };
  };
  it("gives the choices the text only words", () => {
    const { feature } = build("Blessings of Knowledge", { languageProficiencies: [{ any: 2 }], skillProficiencies: [{ choose: { from: ["arcana", "history"], count: 2 } }], armorProficiencies: [{ heavy: true }], resist: ["psychic"] });
    const selects = feature.rules.filter((r) => r.kind === "select") as { type: string; number: number; supports: string }[];
    expect(selects.map((r) => [r.type, r.number])).toEqual(expect.arrayContaining([["Language", 2], ["Proficiency", 2]]));
    expect(feature.rules.some((r) => r.kind === "grant" && /ARMOR_HEAVY|HEAVY/.test(r.id ?? ""))).toBe(true);
    expect(feature.rules.some((r) => r.kind === "grant" && /DAMAGE_RESISTANCE_PSYCHIC/.test(r.id ?? ""))).toBe(true);
  });
  it("defaults a fixed training followed by a fallback, and leaves a real either-or open", () => {
    const fallback = build("Iron Mind", { savingThrowProficiencies: [{ wis: true }, { choose: { from: ["int", "cha"] } }] }).feature.rules.find((r) => r.kind === "select") as { default?: string };
    expect(fallback.default).toMatch(/_OPTION_1$/);
    const open = build("Expertise", { expertise: [{ anyProficientSkill: 2 }, { anyProficientSkill: 1, "thieves' tools": true }] }).feature.rules.find((r) => r.kind === "select") as { default?: string };
    expect(open.default).toBeUndefined();
  });
});
