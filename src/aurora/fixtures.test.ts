/**
 * Runs the engine against Soul Forge's own small test ruleset, which ships in the repository, so these tests
 * run everywhere, CI included. The content is original: it is not taken from any published book.
 */
import { describe, expect, it } from "vitest";
import { loadRegistry } from "./fixture";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { autoFill } from "./autofill";
import { buildSheet } from "./sheet";
import { ItemIndex, addToInventory, adventuringPacks, autoEquip, expandPack, ledgerOf, removeAdded, startingPlans, variantItems } from "./startingEquipment";
import { importForeignCharacter } from "./foreign";
import { HANDS, handsUsed, setTwoHanded, toggleEquip } from "../aurora/hands";
import { mergeSlots, ownership } from "../ui/Slots";
import { exportFoundry, exportRoll20 } from "./exportForeign";

const reg = loadRegistry("fixtures/content");

const build = (race: string, bg: string, cls: string, level: number) => {
  const ch = newCharacter();
  ch.race = race;
  ch.background = bg;
  ch.classes = [{ classId: cls, level }];
  return autoFill(ch, reg);
};

describe("test ruleset", () => {
  it("loads every element type the engine uses", () => {
    expect(reg.size).toBeGreaterThan(60);
    for (const t of ["Race", "Background", "Class", "Archetype", "Spell", "Weapon", "Armor", "Feat", "Proficiency"]) expect(reg.ofType(t).length, t).toBeGreaterThan(0);
  });

  it("builds every combination without open choices, bad numbers or leftover templates", () => {
    const races = reg.ofType("Race");
    const bgs = reg.ofType("Background");
    const classes = reg.ofType("Class");
    let n = 0;
    for (const race of races) for (const bg of bgs) for (const cls of classes) for (const level of [1, 4, 5, 8]) {
      const ch = build(race.id, bg.id, cls.id, level);
      const r = resolve(ch, reg);
      const tag = `${race.name}/${bg.name}/${cls.name}/${level}`;
      const open = r.slots.filter((s) => !s.rule.optional && !s.defaulted && s.chosen.length < s.rule.number && s.options.length);
      expect(open.map((s) => s.rule.name), tag).toEqual([]);
      const sh = buildSheet(r);
      expect(sh.hp, tag).toBeGreaterThan(0);
      for (const a of sh.abilities) expect(Number.isFinite(a.score) && a.score >= 1 && a.score <= 30, `${tag} ${a.id}`).toBe(true);
      expect(sh.features.map((f) => f.text).join(" "), tag).not.toMatch(/\{\{|\$\(/);
      expect(r.warnings, tag).toEqual([]);
      n++;
    }
    expect(n).toBe(races.length * bgs.length * classes.length * 4);
  });

  it("works out ability scores, skills and armor class", () => {
    const ch = build("ID_SF_RACE_EMBERKIN", "ID_SF_BACKGROUND_WAYFARER", "ID_SF_CLASS_WARDEN", 1);
    ch.abilityBase = { strength: 15, dexterity: 12, constitution: 14, intelligence: 8, wisdom: 10, charisma: 10 };
    const sh = buildSheet(resolve(ch, reg));
    expect(sh.proficiency).toBe(2);
    expect(sh.abilities.find((a) => a.id === "strength")).toMatchObject({ score: 15, mod: 2, save: 4, saveProficient: true });
    expect(sh.skills.find((x) => x.name === "athletics")?.bonus).toBe(4); // background proficiency
    expect(sh.hp).toBe(12); // d10 at level 1 plus Constitution
    expect(sh.ac.value).toBe(11); // 10 plus Dexterity
  });

  it("gives a caster the right slots, spell counts and prepared limit", () => {
    const ch = build("ID_SF_RACE_EMBERKIN", "ID_SF_BACKGROUND_WAYFARER", "ID_SF_CLASS_SPELLSINGER", 5);
    ch.abilityBase.charisma = 16;
    const sh = buildSheet(resolve(ch, reg));
    const c = sh.casting[0];
    expect(c.slots.map((s) => s.total)).toEqual([4, 3, 2]);
    expect(c.dc).toBe(8 + 3 + 3);
    expect(c.attack).toBe(6);
    expect(c.prepareMax).toBe(3 + 5);
    expect(c.cantripsKnown.length).toBe(3); // two at level 1 and one more at level 4
  });

  it("drops an older species' ability increase when the background has its own", () => {
    const base = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };
    const old = build("ID_SF_RACE_HOLLOWFOLK", "ID_SF_BACKGROUND_WAYFARER", "ID_SF_CLASS_WARDEN", 1);
    old.abilityBase = { ...base };
    expect(resolve(old, reg).stats.get("constitution")).toBe(12);
    const mixed = build("ID_SF_RACE_HOLLOWFOLK", "ID_SF_BACKGROUND_SCHOLAR", "ID_SF_CLASS_WARDEN", 1);
    mixed.abilityBase = { ...base };
    const r = resolve(mixed, reg);
    expect(r.stats.get("constitution")).toBe(10);
    // the background's own +1 +1 land once
    expect(r.stats.get("intelligence") + r.stats.get("wisdom") + r.stats.get("charisma")).toBe(32);
  });

  it("does not offer the same feat twice", () => {
    const ch = build("ID_SF_RACE_EMBERKIN", "ID_SF_BACKGROUND_SCHOLAR", "ID_SF_CLASS_WARDEN", 4);
    const r = resolve(ch, reg);
    const have = [...r.ids].filter((i) => reg.get(i)?.type === "Feat");
    for (const s of r.slots.filter((x) => x.rule.type === "Feat")) for (const id of have) if (!s.chosen.includes(id) && s.options.some((o) => o.id === id)) expect(s.blocked.has(id)).toBe(true);
  });

  it("reads starting equipment, adds it and equips armor and weapons", () => {
    const ch = build("ID_SF_RACE_EMBERKIN", "ID_SF_BACKGROUND_WAYFARER", "ID_SF_CLASS_WARDEN", 1);
    const plans = startingPlans(ch, reg);
    expect(plans.map((p) => p.kind)).toEqual(["class", "background"]);
    const idx = new ItemIndex(reg);
    expect(adventuringPacks(reg, "").map((p) => p.name)).toContain("Trail Pack");
    const pack = expandPack(reg.get("ID_SF_ITEM_TRAIL_PACK")!, reg);
    expect(pack.map((i) => `${i.qty} ${i.name}`)).toEqual(["5 Torch", "1 Rope (50 feet)", "10 Rations (1 day)"]);
    void idx;
    const withGear = autoEquip(addToInventory(ch, [{ el: reg.get("ID_SF_ARMOR_CHAIN_HAUBERK")!, name: "Chain Hauberk", qty: 1 }, { el: reg.get("ID_SF_WEAPON_WARDENS_BLADE")!, name: "Warden's Blade", qty: 1 }], 5), reg);
    expect(withGear.coins.gp).toBe(5);
    expect(withGear.inventory.filter((i) => i.equipped).map((i) => i.id).sort()).toEqual(["ID_SF_ARMOR_CHAIN_HAUBERK", "ID_SF_WEAPON_WARDENS_BLADE"]);
    withGear.abilityBase.strength = 14;
    const sh = buildSheet(resolve(withGear, reg));
    expect(sh.ac.value).toBe(16);
    expect(sh.attacks[0]).toMatchObject({ name: "Warden's Blade", damageType: "slashing" });
  });

  it("imports a small Roll20 and a small Foundry character", async () => {
    const { default: roll20 } = await import("../../fixtures/characters/roll20-sample.json");
    const { default: foundry } = await import("../../fixtures/characters/foundry-sample.json");
    const a = importForeignCharacter(roll20, reg);
    expect(a.character.name).toBe("Mira Ashdown");
    expect(a.character.classes[0]).toMatchObject({ classId: "ID_SF_CLASS_SPELLSINGER", level: 4 });
    expect(a.character.race).toBe("ID_SF_RACE_EMBERKIN");
    expect(a.character.coins.gp).toBe(40);
    expect(a.missing.join()).toMatch(/Moonlit Sonata/);
    const b = importForeignCharacter(foundry, reg);
    expect(b.character.name).toBe("Brandt Kell");
    expect(b.character.classes[0]).toMatchObject({ classId: "ID_SF_CLASS_WARDEN", level: 5 });
    expect(b.character.race).toBe("ID_SF_RACE_HOLLOWFOLK");
    expect(resolve(b.character, reg).stats.get("strength")).toBe(17);
    // What the file does not settle is left open, and every open choice is on the to-do list (decision D1).
    const open = resolve(b.character, reg).slots.filter((s) => !s.rule.optional && s.chosen.length < s.rule.number && s.options.length);
    expect(open.length).toBe(b.todo.length);
    expect(b.todo.join()).toMatch(/Hill kin, choose 1/);
  });
});

describe("export to other tools", () => {
  const ch = build(reg.ofType("Race")[0].id, reg.ofType("Background")[0].id, reg.ofType("Class")[0].id, 5);
  ch.name = "Round Trip";
  const r = resolve(ch, reg);
  const sheet = buildSheet(r);
  for (const [label, exp] of [["Foundry", exportFoundry], ["Roll20", exportRoll20]] as const) {
    it(`${label}: Soul Forge can read its own export`, () => {
      const back = importForeignCharacter(JSON.parse(JSON.stringify(exp(r))), reg);
      expect(back.character.name).toBe("Round Trip");
      expect(back.character.race).toBe(ch.race);
      expect(back.character.background).toBe(ch.background);
      expect(back.character.classes).toEqual(ch.classes);
      expect(sheet.hp).toBeGreaterThan(0);
      for (const a of sheet.abilities) expect(buildSheet(resolve(back.character, reg)).abilities.find((x) => x.id === a.id)!.score, `${label} ${a.id}`).toBe(a.score);
    });
  }
});

describe("what already gives an option", () => {
  it("names the source of an option the character has from somewhere else", () => {
    let found = 0;
    for (const race of reg.ofType("Race")) for (const cls of reg.ofType("Class")) {
      const r = resolve(build(race.id, reg.ofType("Background")[0].id, cls.id, 3), reg);
      for (const slot of r.slots) for (const el of slot.options) {
        if (slot.chosen.includes(el.id) || !r.ids.has(el.id)) continue;
        const why = ownership(r, el, slot.key);
        expect(why, `${slot.rule.name}: ${el.name}`).toMatch(/^(Granted by .+|You chose this for .+|Already granted by your build)\.$/);
        found++;
      }
    }
    expect(found).toBeGreaterThan(0);
  });
  it("says nothing for something the character does not have", () => {
    const r = resolve(build(reg.ofType("Race")[0].id, reg.ofType("Background")[0].id, reg.ofType("Class")[0].id, 1), reg);
    const missing = reg.ofType("Spell").find((e) => !r.ids.has(e.id))!;
    expect(ownership(r, missing, "x")).toBeUndefined();
  });
});

describe("identical choices from several levels are one choice", () => {
  it("merges repeats without changing how many picks are needed", () => {
    let merged = 0;
    for (const cls of reg.ofType("Class")) {
      const r = resolve(build(reg.ofType("Race")[0].id, reg.ofType("Background")[0].id, cls.id, 8), reg);
      const out = mergeSlots(r.slots);
      expect(out.reduce((n, s) => n + s.rule.number, 0)).toBe(r.slots.reduce((n, s) => n + s.rule.number, 0));
      expect(out.reduce((n, s) => n + s.chosen.length, 0)).toBe(r.slots.reduce((n, s) => n + s.chosen.length, 0));
      for (const m of out) if (m.members) { merged++; expect(m.members.length).toBeGreaterThan(1); expect(m.chosen).toEqual(m.members.flatMap((x) => x.chosen)); }
    }
    expect(merged).toBeGreaterThan(0);
  });
});

describe("spell school as a filter word", () => {
  it("finds spells of a school by the school's name", () => {
    const evo = reg.find("Spell", "Evocation");
    expect(evo.length).toBeGreaterThan(0);
    for (const e of evo) expect(e.setters.school?.value).toBe("Evocation");
    expect(reg.find("Spell", "Evocation, 0").every((e) => e.setters.level?.value === "0")).toBe(true);
  });
});

describe("replacing a starting equipment option", () => {
  it("takes back what it added, gold included", () => {
    const ch0 = build(reg.ofType("Race")[0].id, reg.ofType("Background")[0].id, reg.ofType("Class")[0].id, 1);
    const idx = new ItemIndex(reg);
    const plan = startingPlans(ch0, reg)[0];
    const v = plan.variants[0];
    const items = variantItems(v, [], idx, plan.source, true, {});
    const label = `${plan.title}, ${v.label.toLowerCase()}`;
    let ch = addToInventory(ch0, items, v.gp);
    ch = { ...ch, equipmentAdded: [label], equipmentLedger: { [label]: ledgerOf(items, v.gp) } };
    expect(ch.inventory.length).toBeGreaterThanOrEqual(ch0.inventory.length);
    const back = removeAdded(ch, [label]);
    expect(back.coins.gp).toBe(ch0.coins.gp);
    expect(back.inventory.map((i) => `${i.id}:${i.qty}`).sort()).toEqual(ch0.inventory.map((i) => `${i.id}:${i.qty}`).sort());
    expect(back.equipmentAdded).toEqual([]);
  });
});

describe("two hands", () => {
  const find = (name: RegExp) => reg.all().find((e) => name.test(e.name) && (e.type === "Weapon" || e.type === "Armor"))!;
  const sword = find(/sword|blade/i), bow = find(/bow/i), shield = find(/shield/i);
  const item = (e: { id: string }, uidv: string) => ({ uid: uidv, id: e.id, qty: 1, equipped: false, attuned: false });
  it("puts earlier items away when the hands are full", () => {
    let inv = [item(sword, "a"), item(shield, "b"), item(bow, "c")];
    inv = toggleEquip(inv, "a", reg).inventory;
    inv = toggleEquip(inv, "b", reg).inventory;
    expect(handsUsed(inv, reg)).toBe(2);
    const res = toggleEquip(inv, "c", reg);
    expect(res.dropped.length).toBe(2);
    expect(res.inventory.filter((i) => i.equipped).map((i) => i.uid)).toEqual(["c"]);
    expect(handsUsed(res.inventory, reg)).toBeLessThanOrEqual(HANDS);
  });
  it("a two-handed grip takes both hands and lets go of the shield", () => {
    let inv = [item(sword, "a"), item(shield, "b")];
    inv = toggleEquip(toggleEquip(inv, "a", reg).inventory, "b", reg).inventory;
    const res = setTwoHanded(inv, "a", true, reg);
    expect(res.dropped).toEqual([shield.name]);
    expect(res.inventory.find((i) => i.uid === "a")!.twoHanded).toBe(true);
    expect(handsUsed(res.inventory, reg)).toBe(2);
  });
  it("two weapons with a two-handed grip: the second takes the grip", () => {
    let inv = [item(sword, "a"), { ...item(sword, "b") }];
    inv = toggleEquip(inv, "a", reg).inventory;
    inv = setTwoHanded(inv, "a", true, reg).inventory;
    const res = toggleEquip(inv, "b", reg);
    expect(res.inventory.find((i) => i.uid === "a")!.twoHanded).toBe(false);
    expect(res.inventory.find((i) => i.uid === "a")!.equipped).toBe(false);
  });
});
