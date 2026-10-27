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
