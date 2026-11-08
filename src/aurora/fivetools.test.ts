/**
 * Runs the 5etools converter on a local copy of 5etools-format data (set FIVETOOLS_FIXTURES to its `data` folder).
 * The data is not part of this repository. Small inline samples cover the conversion rules without it.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { convertFiveTools, entriesHtml, proseChoiceRules } from "./fivetools";
import { ARegistry } from "./registry";
import { multiclassCasterLevel, resolve } from "./engine";
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

describe("a combined total of languages and tools", () => {
  // The 2014 Custom Background: "Languages and Tool Proficiencies: Two of your choice" is one total of two.
  it("asks once, and every set holds the same total", () => {
    const els = convertFiveTools({ files: { "backgrounds.json": { background: [{
      name: "Custom Background", source: "X", skillProficiencies: [{ any: 2 }], languageProficiencies: [{ anyStandard: 2 }],
      skillToolLanguageProficiencies: [{ anyLanguage: 2 }, { anyLanguage: 1, anyTool: 1 }, { anyTool: 1 }],
      entries: [{ type: "list", items: [{ type: "item", name: "Languages and Tool Proficiencies:", entry: "Two of your choice" }] }],
    }] } } });
    const bg = els.find((e) => e.type === "Background")!;
    const selects = bg.rules.filter((r) => r.kind === "select");
    expect(selects.filter((r) => r.kind === "select" && r.type === "Language")).toEqual([]);
    const sets = els.filter((e) => e.type === "Training Option");
    expect(sets.map((e) => e.name)).toEqual(["Two languages", "One language and one tool", "Two tools"]);
    for (const o of sets) expect(o.rules.reduce((t, r) => t + (r.kind === "select" ? r.number : 0), 0), o.name).toBe(2);
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

  it("a Storm Herald chooses the environment once: the 6th and 14th level follow the 3rd", () => {
    for (const barb of reg!.ofType("Class").filter((c) => c.name === "Barbarian")) {
      let ch = newCharacter();
      ch.classes = [{ classId: barb.id, level: 14 }];
      let r = resolve(ch, reg!);
      const sub = r.slots.find((s) => s.options.some((o) => o.name === "Path of the Storm Herald"));
      if (!sub) continue;
      ch.selections[sub.key] = [sub.options.find((o) => o.name === "Path of the Storm Herald")!.id];
      r = resolve(ch, reg!);
      const aura = r.slots.filter((s) => s.options.some((o) => o.id === "ID_5ET_SF_XGE_STORM_HERALD_SEA_3"));
      expect(aura, barb.source).toHaveLength(1);
      ch = { ...ch, selections: { ...ch.selections, [aura[0].key]: ["ID_5ET_SF_XGE_STORM_HERALD_SEA_3"] } };
      r = resolve(ch, reg!);
      const env = r.active.map((a) => a.el.id).filter((id) => /STORM_HERALD_(DESERT|SEA|TUNDRA)_/.test(id)).sort();
      expect(env, barb.source).toEqual(["ID_5ET_SF_XGE_STORM_HERALD_SEA_14", "ID_5ET_SF_XGE_STORM_HERALD_SEA_3", "ID_5ET_SF_XGE_STORM_HERALD_SEA_6"]);
      const at5 = resolve({ ...ch, classes: [{ classId: barb.id, level: 5 }] }, reg!).active.map((a) => a.el.id).filter((id) => /STORM_HERALD_(DESERT|SEA|TUNDRA)_/.test(id));
      expect(at5, barb.source).toEqual(["ID_5ET_SF_XGE_STORM_HERALD_SEA_3"]);
    }
  });

  it("a proficiency with a fallback (\"if you already have it, …\") is the choice's default, not a second grant", () => {
    const envoy = reg!.all().filter((e) => e.name === "Royal Envoy" && e.id.startsWith("ID_5ET"));
    expect(envoy.length).toBeGreaterThan(0);
    for (const el of envoy) {
      expect(el.rules.some((r) => r.kind === "grant" && r.id === "ID_5ET_SKILL_PERSUASION"), el.id).toBe(false);
      const pick = el.rules.filter((r) => r.kind === "select" && r.type === "Proficiency");
      expect(pick.map((r) => (r as { default?: string }).default), el.id).toEqual(["ID_5ET_SKILL_PERSUASION"]);
    }
    // The fallback that is a Training Option with its own default (Iron Mind) gets no plain grant beside it.
    for (const el of reg!.all().filter((e) => e.name === "Iron Mind" && e.id.startsWith("ID_5ET"))) {
      expect(el.rules.some((r) => r.kind === "grant" && /^ID_5ET_SAVE_/.test(String(r.id))), el.id).toBe(false);
    }
  });

  it("a background's several feats are a choice of one (Rewarded; the Haunted One's Survivor or a Dark Gift)", () => {
    const feats = (bgName: string) => {
      const bg = reg!.ofType("Background").find((b) => b.name === bgName);
      if (!bg) return undefined;
      const ch = newCharacter(); ch.background = bg.id; ch.classes = [{ classId: reg!.ofType("Class").find((c) => c.name === "Fighter" && c.source.includes("2024"))!.id, level: 1 }];
      const r = resolve(ch, reg!);
      return { had: r.active.filter((a) => a.el.type === "Feat").map((a) => a.el.name), slot: r.slots.find((s) => s.rule.name === `${bgName} feat`) };
    };
    const rew = feats("Rewarded");
    if (rew) {
      expect(rew.had).not.toContain("Skilled");
      expect(rew.slot!.options.map((o) => o.name.replace(/ \(.*\)$/, "")).filter((n, i, a) => a.indexOf(n) === i).sort()).toEqual(["Lucky", "Magic Initiate", "Skilled"]);
    }
    const ho = feats("Haunted One");
    if (ho) {
      expect(ho.had).not.toContain("Survivor");
      const names = ho.slot!.options.map((o) => o.name);
      expect(names).toContain("Survivor");
      expect(names.length).toBeGreaterThan(2);
    }
  });

  it("a 2014 Ranger picks favored enemies (1, 6, 14) and terrains (1, 6, 10)", () => {
    const ranger = reg!.ofType("Class").find((c) => c.name === "Ranger" && !c.source.includes("2024"))!;
    const slots = (level: number, re: RegExp) => { const ch = newCharacter(); ch.classes = [{ classId: ranger.id, level }]; return resolve(ch, reg!).slots.filter((s) => re.test(s.rule.name)); };
    expect(slots(1, /^Favored enemy \(level/i).length).toBe(1);
    expect(slots(14, /^Favored enemy \(level/i).length).toBe(3);
    expect(slots(5, /^Favored terrain \(level/i).length).toBe(1);
    expect(slots(10, /^Favored terrain \(level/i).length).toBe(3);
    const names = slots(1, /^Favored enemy \(level/i)[0].options.map((o) => o.name);
    expect(names).toContain("Aberrations");
    expect(names).toContain("Humanoids (two races)");
    expect(slots(1, /^Favored terrain \(level/i)[0].options.map((o) => o.name)).toContain("Underdark");
    // Tasha's Favored Foe replaces Favored Enemy, and its picks with it.
    const ch = newCharacter(); ch.classes = [{ classId: ranger.id, level: 6 }];
    const foe = resolve(ch, reg!).slots.find((s) => /Optional class feature: Favored Foe/.test(s.rule.name))!;
    const r = resolve({ ...ch, selections: { [foe.key]: [foe.options[0].id] } }, reg!);
    expect(r.slots.filter((s) => /^Favored enemy \(level/i.test(s.rule.name))).toHaveLength(0);
  });

  it("Customizing Your Origin moves a species' fixed increases, as an option", () => {
    const bug = reg!.ofType("Race").find((r) => r.name === "Bugbear" && /Volo/.test(r.source))!;
    const opt = reg!.ofType("Option").find((o) => o.name === "Customized Ability Score Increases")!;
    expect(opt).toBeDefined();
    const fighter = reg!.ofType("Class").find((c) => c.name === "Fighter" && !c.source.includes("2024"))!;
    const scores = (ch: ReturnType<typeof newCharacter>) => buildSheet(resolve(ch, reg!)).abilities.map((a) => a.score);
    let ch = newCharacter();
    ch.race = bug.id; ch.classes = [{ classId: fighter.id, level: 1 }];
    expect(scores(ch).slice(0, 2)).toEqual([10, 9]);
    ch = { ...ch, options: [opt.id] };
    let r = resolve(ch, reg!);
    const slots = r.slots.filter((s) => /customized increase/.test(s.rule.name));
    expect(slots.map((s) => s.rule.name.replace(/^.*\(/, "("))).toEqual(["(+2)", "(+1)"]);
    expect(scores(ch).slice(0, 2)).toEqual([8, 8]);
    const pick = (s: (typeof slots)[number], ab: string) => s.options.find((o) => o.name === ab)!.id;
    ch = { ...ch, selections: { [slots[0].key]: [pick(slots[0], "+2 Constitution")], [slots[1].key]: [pick(slots[1], "+1 Wisdom")] } };
    r = resolve(ch, reg!);
    expect(buildSheet(r).abilities.map((a) => a.score)).toEqual([8, 8, 10, 8, 9, 8]);
    // Each increase on a different score.
    const again = r.slots.find((s) => s.key === slots[1].key)!;
    expect(again.blocked.has(again.options.find((o) => o.name === "+1 Constitution")!.id)).toBe(true);
  });

  it("a class's own always-prepared spells come at their level (2024 Paladin's Divine Smite, Ranger's Hunter's Mark)", () => {
    const granted = (cls: string, level: number) => {
      const c = reg!.ofType("Class").find((x) => x.name === cls && x.source.includes("2024"))!;
      const ch = newCharacter(); ch.classes = [{ classId: c.id, level }];
      return buildSheet(resolve(ch, reg!)).casting.flatMap((k) => k.granted.map((p) => reg!.get(p.id)?.name));
    };
    expect(granted("Paladin", 1)).toEqual([]);
    expect(granted("Paladin", 2)).toEqual(["Divine Smite"]);
    expect(granted("Paladin", 5).sort()).toEqual(["Divine Smite", "Find Steed"]);
    expect(granted("Ranger", 1)).toEqual(["Hunter's Mark"]);
    expect(granted("Warlock", 9)).toContain("Contact Other Plane");
  });

  it("a 2014 Bard's Magical Secrets takes spells from any class, out of the spells known", () => {
    const bard = reg!.ofType("Class").find((c) => c.name === "Bard" && !c.source.includes("2024"))!;
    const at = (level: number) => { const ch = newCharacter(); ch.classes = [{ classId: bard.id, level }]; return resolve(ch, reg!).slots.filter((s) => s.rule.type === "Spell" && s.rule.spellcasting === "Bard" && !/^Cantrip/.test(s.rule.name)); };
    const total = (level: number) => at(level).reduce((n, s) => n + s.rule.number, 0);
    // Spells Known: 12 at 9th level, 14 at 10th (two of them Magical Secrets), 22 at 18th.
    expect(total(9)).toBe(12);
    expect(total(10)).toBe(14);
    expect(total(18)).toBe(22);
    const secrets = at(10).filter((s) => /^Magical Secrets/.test(s.rule.name));
    expect(secrets.map((s) => s.rule.number)).toEqual([2]);
    const names = secrets[0].options.map((o) => o.name);
    expect(names).toContain("Fireball");
    expect(names).toContain("Fire Bolt");
    expect(names).not.toContain("Wish");
    expect(at(18).filter((s) => /^Magical Secrets/.test(s.rule.name))).toHaveLength(3);
  });

  it("an optional subclass feature is a choice and replaces its feature (Blessed Strikes for Divine Strike)", () => {
    const cleric = reg!.ofType("Class").find((c) => c.name === "Cleric" && !c.source.includes("2024"))!;
    let ch = newCharacter();
    ch.classes = [{ classId: cleric.id, level: 8 }];
    let r = resolve(ch, reg!);
    const sub = r.slots.find((s) => s.options.some((o) => o.name === "Life Domain"))!;
    ch = { ...ch, selections: { [sub.key]: [sub.options.find((o) => o.name === "Life Domain")!.id] } };
    r = resolve(ch, reg!);
    const names = () => r.active.map((a) => a.el.name);
    expect(names()).toContain("Divine Strike");
    expect(names()).not.toContain("Blessed Strikes");
    const opt = r.slots.find((s) => /Optional class feature: Blessed Strikes/.test(s.rule.name))!;
    expect(opt.rule.optional).toBe(true);
    ch = { ...ch, selections: { ...ch.selections, [opt.key]: [opt.options[0].id] } };
    r = resolve(ch, reg!);
    expect(names()).toContain("Blessed Strikes");
    expect(names()).not.toContain("Divine Strike");
  });

  it("a Beast Master chooses a companion: a small beast in 2014, one of three primal beasts in 2024", () => {
    const seen = new Set<boolean>();
    for (const ranger of reg!.ofType("Class").filter((c) => c.name === "Ranger")) {
      let ch = newCharacter();
      ch.classes = [{ classId: ranger.id, level: 3 }];
      let r = resolve(ch, reg!);
      const sub = r.slots.find((s) => s.options.some((o) => o.name === "Beast Master" || o.name === "Beast Master Conclave"));
      if (!sub) continue;
      const bm = sub.options.find((o) => /^Beast Master/.test(o.name))!;
      ch = { ...ch, selections: { [sub.key]: [bm.id] } };
      r = resolve(ch, reg!);
      const pet = r.slots.filter((s) => s.rule.type === "Companion");
      expect(pet.length, `${ranger.source} ${bm.source}`).toBeGreaterThan(0);
      const names = new Set(pet.flatMap((s) => s.options.map((o) => o.name)));
      seen.add(/2024/.test(ranger.source));
      if (/2024/.test(ranger.source)) expect([...names].sort(), ranger.source).toEqual(["Beast of the Land", "Beast of the Sea", "Beast of the Sky"]);
      else {
        expect(names.has("Wolf"), ranger.source).toBe(true);
        expect(names.has("Swarm of Rats"), "no swarms").toBe(false);
        expect(names.has("Black Bear"), "nothing above CR 1/4").toBe(false);
        expect(names.has("Giant Eagle"), "nothing above Medium").toBe(false);
      }
    }
    expect([...seen].sort()).toEqual([false, true]);
  });

  it("a Simic Hybrid takes an animal enhancement at 1st level and another at 5th", () => {
    const race = reg!.ofType("Race").find((r) => r.name === "Simic Hybrid");
    if (!race) return;
    const fighter = reg!.ofType("Class").find((c) => c.name === "Fighter" && c.source.includes("2024"))!;
    const enh = (level: number, picks: Record<string, string[]> = {}) => {
      const ch = newCharacter();
      ch.race = race.id;
      ch.classes = [{ classId: fighter.id, level }];
      ch.selections = { ...picks };
      const r = resolve(ch, reg!);
      return { r, slots: r.slots.filter((s) => s.rule.type === "Training Option" && /Animal Enhancement/.test(s.rule.name)) };
    };
    expect(enh(4).slots).toHaveLength(1);
    expect(enh(4).slots[0].options.map((o) => o.name).sort()).toEqual(["Manta Glide", "Nimble Climber", "Underwater Adaptation"]);
    const first = enh(5).slots;
    expect(first).toHaveLength(2);
    const climber = first[0].options.find((o) => o.name === "Nimble Climber")!;
    const { r, slots } = enh(5, { [first[0].key]: [climber.id] });
    expect(slots[1].options).toHaveLength(6);
    expect(slots[1].blocked.has(climber.id)).toBe(true);
    expect(slots[0].blocked.has(climber.id)).toBe(false);
    expect(r.stats.get("innate speed:climb")).toBe(r.stats.get("innate speed"));
  });

  it("a Rune Shaper knows half the proficiency bonus in runes, not the whole table", () => {
    const bg = reg!.ofType("Background").find((b) => b.name === "Rune Carver");
    if (!bg) return;
    const runeSlots = (level: number) => {
      const ch = newCharacter();
      ch.classes = [{ classId: reg!.ofType("Class").find((c) => c.name === "Wizard" && c.source.includes("2024"))!.id, level }];
      ch.background = bg.id;
      const r = resolve(ch, reg!);
      const feat = r.active.find((a) => a.el.name === "Rune Shaper" && a.el.type === "Feat");
      expect(feat, `level ${level}`).toBeDefined();
      const granted = r.active.filter((a) => a.el.type === "Spell" && a.from === feat!.el.id).map((a) => a.el.name.toLowerCase());
      expect(granted, `level ${level}`).toEqual(["comprehend languages"]);
      return r.slots.filter((s) => s.owner?.id === feat!.el.id && s.rule.type === "Spell");
    };
    for (const [level, n] of [[1, 1], [8, 1], [9, 2], [17, 3]] as const) {
      const slots = runeSlots(level);
      expect(slots, `level ${level}`).toHaveLength(n);
      expect(slots[0].options.map((o) => o.name.toLowerCase()), `level ${level}`).toContain("burning hands");
      expect(slots[0].options, `level ${level}`).toHaveLength(13);
    }
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

describe("choices only worded in prose", () => {
  const ctx = { books: {}, spellClasses: {}, baseItems: new Map() } as never;
  const run = (entries: unknown[], level?: number) => { const out: never[] = []; return { out: out as { id: string; name: string; rules: { id?: string }[] }[], rules: proseChoiceRules({ name: "F", source: "XPHB", entries }, "X", level, ctx, out) as { type: string; name: string; supports: string; number: number; level?: number }[] }; };
  it("a list of named options", () => {
    const { rules, out } = run(["You gain one of the following feature options of your choice. Whenever you finish a {@variantrule Short Rest|XPHB|Short} rest, you can replace it.", { type: "entries", entries: [{ type: "entries", name: "Colossus Slayer", entries: ["A."] }, { type: "entries", name: "Horde Breaker", entries: ["B."] }] }], 3);
    expect(rules).toHaveLength(1);
    expect(out.map((e) => e.name)).toEqual(["Colossus Slayer", "Horde Breaker"]);
    expect(rules[0].level).toBe(3);
  });
  it("a damage type, granting resistance only when the text says so", () => {
    const affinity = run(["Choose one of those types: Acid, Cold, or Fire.", "You have {@variantrule Resistance|XPHB} to that damage type, and more."]);
    expect(affinity.out.map((e) => e.name)).toEqual(["Acid", "Cold", "Fire"]);
    expect(affinity.out[0].rules[0].id).toBe("ID_INTERNAL_CONDITION_DAMAGE_RESISTANCE_ACID");
    expect(run(["When you gain this feat, choose one of the following damage types: acid, cold, or fire."]).out[0].rules).toEqual([]);
  });
  it("leaves choices made in play alone", () => {
    for (const text of ["Your Rage taps into animals. Whenever you activate your Rage, you gain one of the following options of your choice.", "Choose one of the following damage types: Acid or Cold. You and your allies have {@variantrule Resistance|XPHB} to that damage type while in your Aura.", "Choose a damage type when you activate this aura: acid or cold."])
      expect(run([text, { type: "entries", name: "A", entries: ["x"] }, { type: "entries", name: "B", entries: ["y"] }]).rules).toEqual([]);
  });
  it("kensei weapons and another feat of a category", () => {
    expect(run(["Choose two types of weapons to be your kensei weapons: one melee."], 3).rules.map((r) => [r.level, r.number])).toEqual([[3, 2], [6, 1], [11, 1], [17, 1]]);
    expect(run(["You gain another {@filter Fighting Style feat|feats|category=FS} of your choice."], 7).rules[0].supports).toBe("5et feat,(category FS)");
  });
});

describe("item entries", () => {
  it("fills shared item text from the item's own fields, and leaves no template behind", () => {
    const els = convertFiveTools({ files: { "items-base.json": { itemEntry: [{ name: "Ring of Resistance", source: "XDMG", entriesTemplate: ["You have Resistance to {{getFullImmRes item.resist}} damage. A {{item.detail1}} gem."] }] }, "items.json": { item: [{ name: "Ring of Acid Resistance", source: "XDMG", rarity: "rare", resist: ["acid"], detail1: "pearl", entries: ["{#itemEntry Ring of Resistance|XDMG}"] }] } } as never });
    const ring = els.find((e) => e.name === "Ring of Acid Resistance")!;
    expect(ring.description).toContain("Resistance to acid damage. A pearl gem.");
    expect(ring.description).not.toMatch(/\{[#{@=]/);
  });
});

describe("inline tags show what the book shows", () => {
  const show = (t: string) => entriesHtml([t]).replace(/<[^>]+>/g, "");
  it.each([
    ["{@scaledamage 8d6|3-9|1d6}", "1d6"], ["{@scaledice 6d10|1-9|2d10}", "2d10"],
    ["{@chance 25}", "25 percent"], ["{@chance 10|one in ten||a|b}", "one in ten"],
    ["{@quickref difficult terrain||3}", "difficult terrain"], ["{@quickref Cover||3||total cover}", "total cover"],
    ["{@classFeature Divine Sense|Paladin|PHB|1}", "Divine Sense"], ["{@classFeature Flash of Genius|Artificer|EFA|7|EFA|the flash}", "the flash"],
    ["{@subclassFeature Guardian|Artificer|EFA|Armorer|EFA|3|EFA}", "Guardian"], ["{@subclass Armorer|Artificer|EFA|EFA}", "Armorer"],
    ["{@card Fool|Deck of Many Things|BMT}", "Fool"], ["{@deity Lliira|Faerûnian|scag}", "Lliira"],
    ["{@dice 1d34|Playing Card}", "Playing Card"], ["{@damage 2d6}", "2d6"],
    ["{@note Wrong, {@link this is incorrect.|https://x.y/z}}", "Wrong, this is incorrect."],
    ["{@spell fire shield||warm shield}", "warm shield"], ["{@item dart|phb|darts}", "darts"], ["{@spell Identify|XPHB}", "Identify"], ["{@filter demons|bestiary|tag=demon}", "demons"],
  ])("%s", (raw, want) => { expect(show(raw)).toBe(want); });
});

describe("spell range", () => {
  const rangeOf = (range: unknown) => convertFiveTools({ files: { "spells/spells-x.json": { spell: [{ name: "S", source: "PHB", level: 1, school: "V", time: [{ number: 1, unit: "action" }], range, components: { v: true }, duration: [{ type: "instant" }], entries: ["x"] }] } } } as never).find((e) => e.type === "Spell")!.setters?.range?.value;
  it("an area around the caster is Self with its size; a point is a range", () => {
    expect(rangeOf({ type: "cone", distance: { type: "feet", amount: 15 } })).toBe("Self (15-foot cone)");
    expect(rangeOf({ type: "radius", distance: { type: "feet", amount: 10 } })).toBe("Self (10-foot radius)");
    expect(rangeOf({ type: "point", distance: { type: "feet", amount: 150 } })).toBe("150 feet");
    expect(rangeOf({ type: "point", distance: { type: "touch" } })).toBe("touch");
    expect(rangeOf({ type: "point", distance: { type: "self" } })).toBe("Self");
  });
});

describe("spell facts read in the right number", () => {
  const facts = (extra: Record<string, unknown>) => convertFiveTools({ files: { "spells.json": { spell: [{ name: "X", source: "PHB", level: 1, school: "A", time: [{ number: 1, unit: "action" }], range: { type: "point", distance: { type: "feet", amount: 30 } }, duration: [{ type: "timed", duration: { type: "hour", amount: 8 } }], entries: ["x"], ...extra }] } } as never }).find((e) => e.name === "X")!.setters;
  it("plural when more than one, singular for one", () => {
    expect(facts({}).duration.value).toBe("8 hours");
    expect(facts({ duration: [{ type: "timed", duration: { type: "minute", amount: 10 }, concentration: true }] }).duration.value).toBe("Concentration, up to 10 minutes");
    expect(facts({ duration: [{ type: "timed", duration: { type: "minute", amount: 1 } }] }).duration.value).toBe("1 minute");
    expect(facts({ range: { type: "point", distance: { type: "miles", amount: 1 } } }).range.value).toBe("1 mile");
    expect(facts({ time: [{ number: 10, unit: "minute" }] }).time.value).toBe("10 minutes");
    expect(facts({ time: [{ number: 1, unit: "bonus" }] }).time.value).toBe("Bonus Action");
  });
});

describe("a feat's prerequisites", () => {
  const feats = (prerequisite: unknown, extra: Record<string, unknown> = {}) => convertFiveTools({ files: { "feats.json": { feat: [{ name: "X", source: "PHB", prerequisite, entries: ["x"] }] }, ...extra } as never }).find((e) => e.name === "X")!.requirements;
  it("the list is any one of them, an entry all of its parts", () => {
    expect(feats([{ level: 4, ability: [{ str: 13 }] }, { level: 4, ability: [{ dex: 13 }] }])).toBe("(([str:13],[level:4])||([dex:13],[level:4]))");
    expect(feats([{ ability: [{ str: 13 }, { dex: 13 }] }])).toBe("([str:13]||[dex:13])");
    expect(feats([{ level: 19 }])).toBe("[level:19]");
  });
  it("armor training and casting", () => {
    expect(feats([{ proficiency: [{ armor: "medium" }] }])).toBe("ID_5ET_PROF_ARMOR_MEDIUM");
    expect(feats([{ spellcasting: true }])).toBe("[type:spell]");
  });
  it("what names another element finds it, and what names nothing here stops nobody", () => {
    const withRace = feats([{ race: [{ name: "halfling" }] }], { "races.json": { race: [{ name: "Halfling", source: "PHB", entries: [] }] } });
    expect(withRace).toMatch(/^ID_5ET_RACE/);
    expect(feats([{ race: [{ name: "halfling" }] }])).toBe("[level:0]");
    expect(feats([{ campaign: ["Eberron"] }])).toBeUndefined();
  });
});

describe("a weapon's facts", () => {
  const weapon = (extra: Record<string, unknown>) => convertFiveTools({ files: { "items-base.json": { baseitem: [{ name: "W", source: "XPHB", type: "M", weaponCategory: "martial", weapon: true, dmg1: "1d10", dmgType: "P", ...extra }] } } as never }).find((e) => e.name === "W")!;
  it("a property with a note counts (the 2024 Lance), and two hands fill two hands", () => {
    const w = weapon({ property: ["H", { uid: "2H|XPHB", note: "unless mounted" }] });
    expect(w.supports).toContain("two-handed");
    expect(w.supports.join()).not.toContain("object");
    expect(w.setters.slot.value).toBe("twohand");
  });
  it("keeps its range", () => {
    expect(weapon({ property: ["A"], range: "150/600", type: "R" }).setters.range.value).toBe("150/600");
  });
});

describe("a class's starting gear", () => {
  const gear = (startingEquipment: unknown) => convertFiveTools({ files: { "class/class-x.json": { class: [{ name: "X", source: "XPHB", hd: { faces: 8 }, classFeatures: [], startingEquipment }] } } as never }).find((e) => e.name === "X" && e.type === "Class")!.description;
  it("the book's line decides the gold over a mistyped number", () => {
    expect(gear({ defaultData: [{ A: [{ value: 7000 }], B: [{ value: 11000 }] }], entries: ["(A) 7 GP; or (B) 110 GP"] })).toContain("(A) 7 GP; or (B) 110 GP");
  });
  it("one of two kinds of tool is offered", () => {
    expect(gear({ defaultData: [{ A: [{ equipmentTypes: ["instrumentMusical", "toolArtisan"] }], B: [{ value: 5000 }] }] })).toContain("Artisan's Tools or Musical Instrument chosen for the tool proficiency above");
  });
});

describe("spell facts with more than one way", () => {
  const facts = (extra: Record<string, unknown>) => convertFiveTools({ files: { "spells.json": { spell: [{ name: "X", source: "PHB", level: 1, school: "A", time: [{ number: 1, unit: "action" }], range: { type: "point", distance: { type: "self" } }, duration: [{ type: "instant" }], entries: ["x"], ...extra }] } } as never }).find((e) => e.name === "X")!.setters;
  it("two casting times, and an ending by trigger", () => {
    expect(facts({ time: [{ number: 1, unit: "action", note: "Overgrowth" }, { number: 8, unit: "hour", note: "Enrichment" }] }).time.value).toBe("Action (Overgrowth) or 8 hours (Enrichment)");
    expect(facts({ duration: [{ type: "permanent", ends: ["dispel", "trigger"] }] }).duration.value).toBe("Until dispelled or triggered");
  });
});

describe("choices worded only in prose", () => {
  const conv = (files: Record<string, unknown>) => convertFiveTools({ files: files as never });
  const feat = (over: Record<string, unknown>) => conv({ "feats.json": { feat: [{ name: "X", source: "XPHB", entries: ["x"], ...over }] } }).find((e) => e.name === "X")!;
  it("a feat's weapon mastery comes from the class's list", () => {
    const r = feat({ entries: ["You gain the following benefits.", { type: "entries", name: "Mastery Property", entries: ["Your training allows you to use the mastery property of one kind of Simple or Martial weapon of your choice, provided you have proficiency with it."] }] }).rules.find((x) => x.kind === "select" && x.type === "Class Feature");
    expect(r).toMatchObject({ supports: "5et weapon mastery", number: 1 });
  });
  it("one of the benefits listed below", () => {
    const r = feat({ entries: ["When you take this feat, choose one of the benefits listed below.", { type: "entries", name: "A", entries: ["a"] }, { type: "entries", name: "B", entries: ["b"] }] }).rules.find((x) => x.kind === "select" && x.type === "Training Option");
    expect(String((r as { supports: string }).supports).split("|")).toHaveLength(2);
  });
  it("a spellcasting ability named in the text", () => {
    expect(feat({ entries: ["Your spellcasting ability for this feat is Intelligence, Wisdom, or Charisma (choose when you select this feat)."] }).rules.some((x) => x.kind === "select" && x.type === "Spellcasting Ability")).toBe(true);
  });
  it("Custom Lineage's variable trait is darkvision or a skill, not both", () => {
    const els = conv({ "races.json": { race: [{ name: "L", source: "TCE", size: ["M"], speed: 30, darkvision: 60, skillProficiencies: [{ any: 1 }], entries: [], _versions: [{ name: "L; Darkvision", source: "TCE", skillProficiencies: null }, { name: "L; Skill Proficiency", source: "TCE", darkvision: null }] }] } });
    const r = els.find((e) => e.name === "L" && e.type === "Race")!;
    expect(r.rules.filter((x) => x.kind === "grant" && x.type === "Vision")).toHaveLength(0);
    expect(r.rules.some((x) => x.kind === "select" && x.type === "Proficiency")).toBe(false);
    const dark = els.find((e) => e.name === "Darkvision" && e.type === "Sub Race")!;
    expect(dark.rules.some((x) => x.kind === "grant" && x.type === "Vision")).toBe(true);
    const skill = els.find((e) => e.name === "Skill Proficiency" && e.type === "Sub Race")!;
    expect(skill.rules.some((x) => x.kind === "select" && x.type === "Proficiency")).toBe(true);
  });
});

describe("what a species gives", () => {
  const race = (over: Record<string, unknown>, extra: Record<string, unknown> = {}) => { const els = convertFiveTools({ files: { "races.json": { race: [{ name: "R", source: "XPHB", size: ["M"], speed: 30, entries: [], ...over }], ...extra } } as never }); return { el: els.find((e) => e.name === "R" && e.type === "Race")!, els }; };
  it("a feat: of a category (2024 Human), or any (Variant Human's subrace)", () => {
    expect(race({ feats: [{ anyFromCategory: { category: ["O"], count: 1 } }] }).el.rules.find((x) => x.kind === "select" && x.type === "Feat")).toMatchObject({ supports: "5et feat,(category O)", number: 1 });
    const v = race({}, { subrace: [{ name: "Variant", raceName: "R", raceSource: "XPHB", source: "XPHB", feats: [{ any: 1 }] }] }).els.find((e) => e.type === "Sub Race")!;
    expect(v.rules.some((x) => x.kind === "select" && x.type === "Feat")).toBe(true);
  });
  it("what the versions set is not asked of the species as well", () => {
    const { el, els } = race({ resist: [{ choose: { from: ["acid", "fire"] } }], _versions: [{ name: "R; Acid", source: "XPHB", resist: ["acid"] }, { name: "R; Fire", source: "XPHB", resist: ["fire"] }] });
    expect(el.rules.filter((x) => x.kind === "select" && /resist/i.test(x.name ?? ""))).toHaveLength(0);
    expect(els.filter((e) => e.type === "Sub Race").every((e) => e.rules.some((x) => x.kind === "grant" && /RESISTANCE/.test(x.id ?? "")))).toBe(true);
  });
  it("a size that varies is a choice", () => {
    expect(race({ size: ["V"] }).el.rules.some((x) => x.kind === "select" && x.type === "Size")).toBe(true);
  });
});

describe("what is not always on", () => {
  it("an enchantment and what rides on it stay off the character (Enhanced Arcane Focus was +3 for every Artificer)", () => {
    const els = convertFiveTools({ files: {
      "feats.json": { feat: [{ name: "X", source: "PHB", entries: ["x"] }] },
      "foundry-feats.json": { feat: [{ name: "X", source: "PHB", effects: [{ foundryId: "a", type: "enchantment", changes: [{ key: "system.bonuses.msak.attack", mode: "ADD", value: "+ 1" }] }, { name: "Rider", enchantmentRiderParent: "a", transfer: true, changes: [{ key: "system.bonuses.msak.attack", mode: "ADD", value: "+ 1" }] }] }] },
    } as never });
    expect(els.find((e) => e.name === "X")!.rules.filter((r) => r.kind === "stat" && /attack/.test(r.name))).toHaveLength(0);
  });
  it("a condition immunity has an element to point at", () => {
    const els = convertFiveTools({ files: { "feats.json": { feat: [{ name: "X", source: "PHB", conditionImmune: ["poisoned"], entries: ["x"] }] } } as never });
    expect(els.find((e) => e.id === "ID_INTERNAL_CONDITION_CONDITION_IMMUNITY_POISONED")?.type).toBe("Condition");
  });
});

describe("a spell's class lists", () => {
  const spell = (src: string, list: Record<string, unknown>) => convertFiveTools({ files: { "spells/sources.json": { [src]: { X: list } }, "spells/spells.json": { spell: [{ name: "X", source: src, level: 1, school: "A", time: [{ number: 1, unit: "action" }], range: { type: "point", distance: { type: "self" } }, duration: [{ type: "instant" }], entries: ["x"] }] } } as never }).find((e) => e.name === "X")!.supports;
  it("what a later book adds counts in the spell's own book, and for a class that book brought", () => {
    expect(spell("XGE", { classVariant: [{ name: "Wizard", source: "PHB", definedInSource: "XGE" }, { name: "Artificer", source: "TCE", definedInSource: "TCE" }] })).toEqual(expect.arrayContaining(["Wizard", "Artificer"]));
    expect(spell("PHB", { class: [{ name: "Wizard", source: "PHB" }], classVariant: [{ name: "Bard", source: "PHB", definedInSource: "TCE" }] })).not.toContain("Bard");
  });
});

describe("the shared spell slot table", () => {
  const pass = (entries: { name: string; owner: string; level: number; fromClass: boolean }[], stats: Record<string, number> = {}) => ({ spellcasting: new Map(entries.map((e) => [e.name, e])), stats: { get: (n: string) => stats[n] ?? 0 } }) as never;
  const reg = { get: (id: string) => ({ name: id, source: "PHB", id }) } as never;
  it("one class that casts has its own table, whatever feats add", () => {
    expect(multiclassCasterLevel(pass([{ name: "ranger", owner: "Ranger", level: 3, fromClass: true }, { name: "aasimar", owner: "Aasimar", level: 3, fromClass: false }], { "multiclass:spellcasting:level": 1 }), reg)).toBe(0);
  });
  it("a third-caster subclass counts when it has slots, not for a few spells", () => {
    const two = (stats: Record<string, number>) => multiclassCasterLevel(pass([{ name: "wizard", owner: "Wizard", level: 3, fromClass: true }, { name: "k", owner: "Fighter", level: 9, fromClass: true }], { "wizard:spellcasting:slots:1": 4, ...stats }), reg);
    expect(two({ "k:spellcasting:slots:1": 3 })).toBe(6);
    expect(two({})).toBe(0);
  });
});
