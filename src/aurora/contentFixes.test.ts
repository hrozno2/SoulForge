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
