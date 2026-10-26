/**
 * The 2024 rules for a 2014 background (A1.1). A 2024 background raises three ability scores and gives an origin feat;
 * a 2014 background does neither, so a 2024 species with one ends up with no increases at all. Each 2014 background
 * gets one optional choice, off until the player takes it: the same parts as the Dungeon Master's Guide (2024) Custom
 * Background (any three abilities as +2/+1 or +1/+1/+1, an origin feat), and the marker that tells a 2014 species its
 * own increases now come from the background. The background keeps its own skills, tool or languages and equipment.
 */
import type { AElement, ARule } from "../aurora/types";
import { isModern } from "../aurora/edition";

export const BACKGROUND_2024_ID = "ID_SF_BACKGROUND_2024_RULES";
export const BACKGROUND_ASI_MARKER = "ID_INTERNAL_GRANTS_BACKGROUND_ASI";
const CHOICE = "2024 rules: ability scores and origin feat";

export function background2024Choices(byId: Map<string, AElement>): number {
  // Only when the content has the parts: the three-ability combinations and the marker (Aurora's internal content).
  const combos = [...byId.values()].some((e) => e.supports.includes("Custom Background Ability Score Combination"));
  if (!combos || !byId.has(BACKGROUND_ASI_MARKER)) return 0;
  byId.set(BACKGROUND_2024_ID, {
    id: BACKGROUND_2024_ID,
    name: "2024 background rules",
    type: "Background Feature",
    source: "Internal",
    supports: [],
    edition: "2024",
    compendiumHidden: true,
    description: "<p>Use this background with the 2024 rules: choose three ability scores and increase one by 2 and another by 1, or all three by 1 (none above 20), and take an origin feat. A 2014 species then gives no ability score increases of its own. The background keeps its skills, tools, languages and equipment.</p>",
    setters: {},
    rules: [
      { kind: "select", type: "Ability Score Improvement", name: "Ability Score Combination (2024 rules)", supports: "Custom Background Ability Score Combination", number: 1 } as ARule,
      { kind: "select", type: "Feat", name: "Origin Feat (2024 rules)", supports: "Origin", number: 1 } as ARule,
      { kind: "grant", type: "Grants", id: BACKGROUND_ASI_MARKER } as ARule,
    ],
  });
  let added = 0;
  for (const bg of byId.values()) {
    if (bg.type !== "Background" || isModern(bg) || /custom/i.test(bg.name)) continue;
    if (bg.rules.some((r) => r.kind === "select" && r.name === CHOICE)) continue;
    bg.rules = [...bg.rules, { kind: "select", type: "Background Feature", name: CHOICE, supports: BACKGROUND_2024_ID, number: 1, optional: true } as ARule];
    added++;
  }
  return added;
}
