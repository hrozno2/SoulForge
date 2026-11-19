import { expect, it } from "vitest";
import { parseElementsXml } from "./parse";
import { nodeXml } from "./fixture";
import { ARegistry } from "./registry";

const xml = `<elements>
  <element name="Githyanki Psionics" type="Racial Trait" source="Test" id="ID_T_PSIONICS">
    <rules><grant type="Spell" name="ID_T_SPELL_MAGE_HAND" /></rules>
  </element>
  <element name="Martial Adept" type="Feat" source="Test" id="ID_T_FEAT">
    <rules><stat name="superiority dice:amount" value="1" requirements="ID_ARCHETYPE_FEATURE_BATTLE_MASTER_COMBAT_SUPERIORITY" /></rules>
  </element>
</elements>`;

it("reads an ID written in a grant's name attribute (Githyanki Psionics)", () => {
  const file = parseElementsXml(xml, nodeXml);
  const el = file.elements.find((e) => e.id === "ID_T_PSIONICS")!;
  expect(el.rules[0]).toMatchObject({ kind: "grant", type: "Spell", id: "ID_T_SPELL_MAGE_HAND" });
});

it("corrects mistyped IDs in requirements when the registry is built", () => {
  const reg = new ARegistry();
  reg.addFile(parseElementsXml(xml, nodeXml));
  reg.build();
  const rule = reg.get("ID_T_FEAT")!.rules[0] as { requirements?: string };
  expect(rule.requirements).toBe("ID_WOTC_PHB_ARCHETYPE_FEATURE_BATTLE_MASTER_COMBAT_SUPERIORITY");
});

it("gives the 2024 Moon Druid Fount of Moonlight at level 7, not Aurora's 9", async () => {
  const { applyContentFixes } = await import("./contentFixes");
  const el = {
    id: "ID_WOTC_PHB24_ARCHETYPE_FEATURE_DRUID_MOON_CIRCLE_OF_MOON_SPELLS",
    name: "Level 3: Circle of the Moon Spells",
    type: "Archetype Feature",
    source: "Player’s Handbook (2024)",
    supports: [],
    description: "",
    compendiumHidden: false,
    setters: {},
    rules: [{ kind: "grant", type: "Spell", id: "ID_WOTC_PHB24_SPELL_FOUNT_OF_MOONLIGHT", level: 9 }],
  } as never;
  applyContentFixes(el);
  expect((el as { rules: { level: number }[] }).rules[0].level).toBe(7);
});

it("offers the 2024 Rogue's own skill list to a character multiclassing into it", async () => {
  const { applyContentFixes } = await import("./contentFixes");
  const el = {
    id: "ID_WOTC_PHB24_CLASS_ROGUE",
    name: "Rogue",
    type: "Class",
    source: "Player’s Handbook (2024)",
    supports: [],
    description: "",
    compendiumHidden: false,
    setters: {},
    rules: [],
    multiclass: {
      id: "ID_WOTC_PHB24_MULTICLASS_ROGUE",
      setters: {},
      rules: [{ kind: "select", type: "Proficiency", name: "Skill Proficiency (Rogue)", supports: "Skill,Rogue", number: 1 }],
    },
  } as unknown as import("./types").AElement;
  applyContentFixes(el);
  expect((el.multiclass!.rules[0] as { supports: string }).supports).toBe("Skill,PHB24 Rogue");
});

it("gives Aurora's Witherbloom Student the language of the player's choice the book gives", async () => {
  const { applyContentFixes } = await import("./contentFixes");
  const el = {
    id: "ID_WOTC_SCOC_BACKGROUND_WITHERBLOOM_STUDENT",
    name: "Witherbloom Student",
    type: "Background",
    source: "Strixhaven: A Curriculum of Chaos",
    supports: [],
    description: "",
    compendiumHidden: false,
    setters: {},
    rules: [{ kind: "grant", type: "Proficiency", id: "ID_PROFICIENCY_TOOL_PROFICIENCY_HERBALISM_KIT" }],
  } as unknown as import("./types").AElement;
  applyContentFixes(el);
  applyContentFixes(el);
  expect(el.rules.filter((r) => r.kind === "select")).toEqual([
    { kind: "select", type: "Language", name: "Language (Witherbloom Student)", supports: "Standard||Exotic", number: 1 },
  ]);
});
