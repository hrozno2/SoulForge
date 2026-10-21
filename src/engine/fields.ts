/**
 * The lossless-load gate (docs/ENGINE-PLAN.md 1.5): every field of every 5e.tools entry is either read by the
 * converter or decided here, with the reason it is not mechanics. "display" fields are text, art, tags for search,
 * or publishing facts; "planned" fields are mechanics not mapped yet, kept visible so they are not forgotten. A field
 * that is in neither place fails the test in load.test.ts: new 5e.tools data cannot drop rules silently.
 */
export type Decision = `display: ${string}` | `planned: ${string}`;

const PUBLISHING: Decision = "display: where and how the entry was published";
const SEARCH: Decision = "display: tags 5e.tools uses for its own filters and search";
const LORE: Decision = "display: descriptive text, not rules";
const VEHICLE: Decision = "display: vehicle statistics (ships, not characters)";

/** Fields that never carry character mechanics, for any kind of entry. */
export const ANY_KIND: Record<string, Decision> = {
  referenceSources: PUBLISHING, hasRefs: PUBLISHING, alias: "display: other names, for search",
  miscTags: SEARCH, traitTags: SEARCH, areaTags: SEARCH, creatureTypeTags: SEARCH, scfType: SEARCH, tier: SEARCH, lootTables: SEARCH,
  age: LORE, heightAndWeight: "display: height and weight tables for a description", isClassFeatureVariant: SEARCH,
  fonts: "display: the script's font, for reading", additionalEntries: LORE, entriesTemplate: LORE, appliesTo: LORE,
};

/** Per kind of entry. */
export const BY_KIND: Record<string, Record<string, Decision>> = {
  background: {
    fromFeature: "display: which features the background lists, already read from its entries",
  },
  baseitem: {
    ammoType: "display: which ammunition a weapon fires", firearm: SEARCH, group: SEARCH, packContents: "display: what a pack holds, listed in its text",
    valueRarity: SEARCH, sword: SEARCH, axe: SEARCH, hammer: SEARCH, club: SEARCH, polearm: SEARCH, spear: SEARCH, bow: SEARCH, mace: SEARCH,
    dagger: SEARCH, lance: SEARCH, rapier: SEARCH, staff: SEARCH, net: SEARCH, crossbow: SEARCH, arrow: SEARCH, bolt: SEARCH,
    needleBlowgun: SEARCH, bulletSling: SEARCH, bulletFirearm: SEARCH, cellEnergy: SEARCH,
  },
  class: {
    preparedSpellsChange: "display: when prepared spells may be changed (a long rest), not a number",
    itemMasteries: "display: a flag; the masteries come from itemMasteriesProgression, which is read",
    spellsKnownProgressionFixedByLevel: "planned: a wizard's spellbook additions by spell level (2024)",
    spellsKnownProgressionFixedAllowLowerLevel: "planned: with the above",
  },
  classFeature: { consumes: "planned: the resource a feature uses (Channel Divinity, Ki), for the resource tracker" },
  subclassFeature: { consumes: "planned: as for class features" },
  optionalfeature: { consumes: "planned: as for class features" },
  subclass: {
    subclassFeatures: "display: the feature list, read from the subclassFeature entries themselves",
    preparedSpellsChange: "display: as for classes",
  },
  feat: { repeatableHidden: "display: whether 5e.tools hides the repeatable note" },
  language: { dialects: LORE },
  race: {
    creatureTypes: "planned: creature type (humanoid, construct), shown on the sheet",
    sizeEntry: LORE,
  },
  subrace: {},
  spell: {
    savingThrow: SEARCH, damageInflict: SEARCH, conditionInflict: SEARCH, affectsCreatureType: SEARCH, spellAttack: SEARCH,
    abilityCheck: SEARCH, damageResist: SEARCH, damageImmune: SEARCH, damageVulnerable: SEARCH,
    scalingLevelDice: "planned: cantrip damage by level, for spell attack lines",
  },
  item: {
    wondrous: SEARCH, attachedSpells: "planned: spells an item lets the wearer cast", recharge: "planned: item charges, for the resource tracker",
    charges: "planned: with recharge", rechargeAmount: "planned: with recharge", reqAttuneTags: "planned: who may attune (a class, a species)",
    staff: SEARCH, detail1: LORE, detail2: LORE, focus: "display: whether the item is a spellcasting focus", sentient: LORE, poisonTypes: SEARCH,
    curse: LORE, tattoo: SEARCH, spellScrollLevel: SEARCH, grantsLanguage: SEARCH, grantsProficiency: SEARCH, packContents: "display: as for base items",
    containerCapacity: "display: what a container holds", carryingCapacity: "display: a mount's or vehicle's load", ammoType: "display: as for base items",
    typeAlt: SEARCH, valueRarity: SEARCH, barDimensions: LORE, firearm: SEARCH, group: SEARCH, atomicPackContents: "display: as for packs",
    weightNote: LORE, reqAttuneAlt: LORE, critThreshold: "planned: a weapon that scores a critical hit on a lower roll",
    bonusSavingThrowConcentration: "planned: a bonus to concentration saves", dexterityMax: "planned: an armor's own Dexterity cap",
    seeAlsoVehicle: VEHICLE, seeAlsoDeck: LORE, vehSpeed: VEHICLE, crew: VEHICLE, crewMin: VEHICLE, crewMax: VEHICLE, vehAc: VEHICLE, vehHp: VEHICLE,
    vehDmgThresh: VEHICLE, capCargo: VEHICLE, capPassenger: VEHICLE, travelCost: VEHICLE, shippingCost: VEHICLE,
  },
  itemGroup: {
    wondrous: SEARCH, attachedSpells: "planned: as for items", reqAttuneTags: "planned: as for items", itemsHidden: SEARCH, recharge: "planned: as for items",
    sentient: LORE, focus: "display: as for items", charges: "planned: as for items", rechargeAmount: "planned: as for items", tattoo: SEARCH,
    curse: LORE, staff: SEARCH, grantsProficiency: SEARCH,
  },
};

export function decisionFor(kind: string, field: string): Decision | undefined {
  return BY_KIND[kind]?.[field] ?? ANY_KIND[field];
}
