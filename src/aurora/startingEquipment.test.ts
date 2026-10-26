import { describe, expect, it } from "vitest";
import { nodeXml, loadRegistry } from "./fixture";
import { parseElementsXml } from "./parse";
import { ARegistry } from "./registry";
import { newCharacter } from "./character";
import { ItemIndex, addToInventory, autoEquip, equipmentText, parseItems, planFor, resolveRef, splitTop, startingPlans, variantItems, adventuringPacks, commonGear } from "./startingEquipment";

describe("text parsing", () => {
  it("splits lists at top level only", () => {
    expect(splitTop("Calligrapher's Supplies, Book (history), Parchment (8 sheets), Robe, 8 GP")).toEqual(["Calligrapher's Supplies", "Book (history)", "Parchment (8 sheets)", "Robe", "8 GP"]);
    expect(splitTop("a light crossbow and 20 bolts")).toEqual(["a light crossbow", "20 bolts"]);
    expect(splitTop("a trophy (a dagger, broken blade, or piece of a banner), a set of bone dice")).toHaveLength(2);
  });
  it("reads quantities and gold", () => {
    const p = parseItems("2 Daggers, Arcane Focus (Quarterstaff), Robe, Scholar's Pack, and 5 GP");
    expect(p.gp).toBe(5);
    expect(p.refs.map((r) => `${r.qty} ${r.text}`)).toEqual(["2 Daggers", "1 Arcane Focus (Quarterstaff)", "1 Robe", "1 Scholar's Pack"]);
    expect(parseItems("a belt pouch containing 10 gp").gp).toBe(10);
    expect(parseItems("an explorer’s pack").refs[0]).toEqual({ text: "explorer’s pack", qty: 1 });
  });
  it("finds the equipment text in each edition", () => {
    expect(equipmentText(`<tr><td><b>Starting Equipment</b></td><td class="left"><i>Choose A or B:</i> (A) Robe; or (B) 55 GP</td></tr>`)!.kind).toBe("letters");
    expect(equipmentText(`<li><strong>Equipment:</strong> An insignia of rank, a set of common clothes, and a belt pouch containing 10 gp</li>`)!.kind).toBe("plain");
    const g = equipmentText(`<h5 class="caption">EQUIPMENT</h5><p>x</p><ul><li><i>(a)</i> a mace or <i>(b)</i> a warhammer</li><li>A shield</li></ul><h5>NEXT</h5>`)!;
    expect(g.kind).toBe("groups");
    expect(g.items).toHaveLength(2);
  });
});

const XML = `<elements>
  <element name="Wizard" type="Class" source="B" id="C_WIZ"><description><table><tr><td><b>Starting Equipment</b></td><td>Choose A or B: (A) 2 Daggers, Robe, Explorer's Pack and 5 GP; or (B) 55 GP</td></tr></table></description></element>
  <element name="Cleric" type="Class" source="B" id="C_CLR"><description><h5>EQUIPMENT</h5><ul><li><i>(a)</i> a mace or <i>(b)</i> a warhammer (if proficient)</li><li>A shield and a holy symbol</li></ul></description><rules><grant type="Proficiency" id="ID_PROFICIENCY_ARMOR_PROFICIENCY_SHIELDS" /></rules></element>
  <element name="Shields" type="Proficiency" source="B" id="ID_PROFICIENCY_ARMOR_PROFICIENCY_SHIELDS"><description><p>Shields.</p></description></element>
  <element name="Dagger" type="Weapon" source="B" id="W_DAGGER"><setters><set name="damage" type="piercing">1d4</set></setters></element>
  <element name="Mace" type="Weapon" source="B" id="W_MACE"><setters><set name="damage" type="bludgeoning">1d6</set></setters></element>
  <element name="Robe" type="Item" source="B" id="I_ROBE"/>
  <element name="Shield" type="Armor" source="B" id="A_SHIELD"><setters><set name="armor">Shield</set></setters></element>
  <element name="Amulet" type="Item" source="B" id="I_AMULET"/>
  <element name="Arrows (20)" type="Item" source="B" id="I_ARROWS"/>
  <element name="Explorer's Pack" type="Item" source="B" id="I_EXP"><setters><set name="category">Equipment Packs</set></setters><extract><item>I_ROBE</item><item amount="2">I_ARROWS</item></extract></element>
</elements>`;

describe("planning and applying", () => {
  const reg = new ARegistry();
  reg.addFile(parseElementsXml(XML, nodeXml));
  reg.build();
  const idx = new ItemIndex(reg);

  it("builds option A and B for a 2024 style class", () => {
    const plan = planFor(reg.get("C_WIZ")!, "class", reg)!;
    expect(plan.variants.map((v) => v.label)).toEqual(["Option A", "Option B"]);
    expect(plan.variants[1].gp).toBe(55);
    const items = variantItems(plan.variants[0], [], idx, "B", true);
    // daggers x2, robe, and the pack opened into robe + 2 bundles of arrows
    expect(items.map((i) => `${i.qty} ${i.name}`)).toEqual(["2 Dagger", "1 Robe", "1 Robe", "2 Arrows (20)"]);
  });

  it("builds choice groups for an older style class", () => {
    const plan = planFor(reg.get("C_CLR")!, "class", reg)!;
    expect(plan.variants[0].choices[0].options).toHaveLength(2);
    const pick1 = variantItems(plan.variants[0], [1], idx, "B", true).map((i) => i.name);
    expect(pick1).toContain("Shield");
    expect(pick1).toContain("Amulet"); // holy symbol resolves to the amulet
  });

  it("matches arrow bundles and unknown items become custom items", () => {
    expect(resolveRef({ text: "arrows", qty: 20 }, idx, "B")).toMatchObject({ name: "Arrows (20)", qty: 1 });
    expect(resolveRef({ text: "trophy from a fallen enemy", qty: 1 }, idx, "B").el).toBeUndefined();
  });

  it("adds items, gold and equips sensibly", () => {
    const plan = planFor(reg.get("C_CLR")!, "class", reg)!;
    let ch = newCharacter();
    ch.classes = [{ classId: "C_CLR", level: 1 }];
    ch = addToInventory(ch, variantItems(plan.variants[0], [0], idx, "B", true), 10);
    ch = autoEquip(ch, reg);
    expect(ch.coins.gp).toBe(10);
    expect(ch.inventory.find((i) => i.id === "W_MACE")!.equipped).toBe(true);
    expect(ch.inventory.find((i) => i.id === "A_SHIELD")!.equipped).toBe(true);
    // adding again stacks unequipped items instead of repeating them
    const again = addToInventory(ch, [{ el: reg.get("I_ROBE"), name: "Robe", qty: 1 }]);
    expect(again.inventory.filter((i) => i.id === "I_ROBE")).toHaveLength(1);
  });

  it("lists packs and common gear from the content", () => {
    expect(adventuringPacks(reg, "B").map((p) => p.name)).toEqual(["Explorer's Pack"]);
    expect(commonGear(reg, "B").map((g) => g.name)).toEqual(expect.arrayContaining(["Dagger", "Shield"]));
    expect(startingPlans({ ...newCharacter(), classes: [{ classId: "C_WIZ", level: 1 }] }, reg)).toHaveLength(1);
  });
});

const C14 = process.env.AURORA_FIXTURES_2014;
const C24 = process.env.AURORA_FIXTURES;
describe.skipIf(!C14)("2014 content", () => {
  const reg = C14 ? loadRegistry(C14) : undefined;
  const find = (t: string, n: string) => reg!.ofType(t).find((e) => e.name === n && /Handbook$/.test(e.source))!;
  const idx = reg ? new ItemIndex(reg) : undefined;

  it("reads the Cleric's equipment and the Soldier's", () => {
    const cleric = planFor(find("Class", "Cleric"), "class", reg!)!;
    expect(cleric.variants[0].choices.length).toBe(4);
    const items = variantItems(cleric.variants[0], [0, 1, 0, 0], idx!, "Player’s Handbook", true).map((i) => i.name);
    expect(items).toContain("Mace");
    expect(items).toContain("Leather");
    expect(items).toContain("Light Crossbow");
    const soldier = planFor(find("Background", "Soldier"), "background", reg!)!;
    expect(soldier.variants[0].gp).toBe(10);
    const sItems = variantItems(soldier.variants[0], [], idx!, "Player’s Handbook", true);
    expect(sItems.some((i) => i.el?.name === "Clothes, Common")).toBe(true);
  });
});

describe.skipIf(!C24)("2024 content", () => {
  const reg = C24 ? loadRegistry(C24) : undefined;
  const idx = reg ? new ItemIndex(reg) : undefined;
  it("offers A, B and C for the Fighter, with the class pack for A", () => {
    const f = reg!.ofType("Class").find((c) => c.name === "Fighter" && /2024/.test(c.source))!;
    const plan = planFor(f, "class", reg!)!;
    expect(plan.variants.map((v) => v.label)).toEqual(["Option A", "Option B", "Option C"]);
    expect(plan.variants[0].packId).toBeTruthy();
    expect(plan.variants[2].gp).toBe(155);
    const a = variantItems(plan.variants[0], [], idx!, f.source, true).map((i) => i.name);
    expect(a).toEqual(expect.arrayContaining(["Chain Mail", "Greatsword"]));
    const b = variantItems(plan.variants[1], [], idx!, f.source, true);
    expect(b.filter((i) => !i.el).map((i) => i.name)).toEqual([]);
  });
});

describe("gear that names only a kind", () => {
  it("is a pending choice of that kind when nothing the character took settles it", async () => {
    const { resolveChosenTools, addToInventory } = await import("./startingEquipment");
    const { ARegistry } = await import("./registry");
    const { newCharacter } = await import("./character");
    const reg = new ARegistry();
    reg.build();
    const items = resolveChosenTools([{ name: "Musical Instrument (one of your choice)", qty: 1 }, { name: "Gaming Set (same as above)", qty: 1 }, { name: "Artisan's Tools", qty: 1 }], [], reg);
    expect(items.map((i) => i.pending)).toEqual(["instrument", "gaming", "artisan"]);
    const ch = addToInventory(newCharacter(), items);
    expect(ch.inventory.map((i) => i.pending)).toEqual(["instrument", "gaming", "artisan"]);
  });
});
