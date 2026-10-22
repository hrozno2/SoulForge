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
  fonts: "display: the script's font, for reading", images: "display: art (lore files); the app ships no third-party art", additionalEntries: LORE, entriesTemplate: LORE, appliesTo: LORE,
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
    spellsKnownProgressionFixedAllowLowerLevel: "display: spellbook additions may be of any level the wizard can cast; the slot filter already allows it",
  },
  classFeature: { consumes: "display: the resource a feature uses (Channel Divinity, Ki) is named in its text" },
  subclassFeature: { consumes: "display: as for class features" },
  optionalfeature: { consumes: "display: as for class features" },
  subclass: {
    subclassFeatures: "display: the feature list, read from the subclassFeature entries themselves",
    preparedSpellsChange: "display: as for classes",
  },
  feat: { repeatableHidden: "display: whether 5e.tools hides the repeatable note" },
  language: { dialects: LORE, origin: LORE },
  itemProperty: { abbreviation: "display: the property's short code, used inside other entries", template: "display: how 5e.tools words the property" },
  itemType: { abbreviation: "display: the type's short code, used inside other entries" },
  race: {
    sizeEntry: LORE,
  },
  subrace: {},
  spell: {
    savingThrow: SEARCH, damageInflict: SEARCH, conditionInflict: SEARCH, affectsCreatureType: SEARCH, spellAttack: SEARCH,
    abilityCheck: SEARCH, damageResist: SEARCH, damageImmune: SEARCH, damageVulnerable: SEARCH,
    scalingLevelDice: "display: a cantrip's damage by level is in its text, which the sheet shows",
  },
  item: {
    wondrous: SEARCH,         staff: SEARCH, detail1: LORE, detail2: LORE, focus: "display: whether the item is a spellcasting focus", sentient: LORE, poisonTypes: SEARCH,
    curse: LORE, tattoo: SEARCH, spellScrollLevel: SEARCH, grantsLanguage: SEARCH, grantsProficiency: SEARCH, packContents: "display: as for base items",
    containerCapacity: "display: what a container holds", carryingCapacity: "display: a mount's or vehicle's load", ammoType: "display: as for base items",
    typeAlt: SEARCH, valueRarity: SEARCH, barDimensions: LORE, firearm: SEARCH, group: SEARCH, atomicPackContents: "display: as for packs",
    weightNote: LORE, optionalfeatures: "display: which artificer infusion can make the item (Replicate Magic Item); the infusion's own choice lists the items", bonusSavingThrowConcentration: "display: a concentration bonus is in the item's text; the sheet has no concentration line", reqAttuneAlt: LORE,        seeAlsoVehicle: VEHICLE, seeAlsoDeck: LORE, vehSpeed: VEHICLE, crew: VEHICLE, crewMin: VEHICLE, crewMax: VEHICLE, vehAc: VEHICLE, vehHp: VEHICLE,
    vehDmgThresh: VEHICLE, capCargo: VEHICLE, capPassenger: VEHICLE, travelCost: VEHICLE, shippingCost: VEHICLE,
  },
  itemGroup: {
    wondrous: SEARCH, attachedSpells: "planned: as for items", reqAttuneTags: "planned: as for items", itemsHidden: SEARCH, recharge: "planned: as for items",
    sentient: LORE, focus: "display: as for items", charges: "planned: as for items", rechargeAmount: "planned: as for items", tattoo: SEARCH,
    curse: LORE, staff: SEARCH, grantsProficiency: SEARCH,
  },
};

/**
 * Plutonium's Foundry files (foundry.ts reads effects, activities and system.uses). The rest is how Plutonium builds
 * the Foundry item: bookkeeping, or choices the 5e.tools entries already give.
 */
const PLUTONIUM: Decision = "display: Plutonium's own bookkeeping for building the Foundry item";
export const FOUNDRY: Record<string, Decision> = {
  migrationVersion: PLUTONIUM, ignoreSrdActivities: PLUTONIUM, ignoreSrdEffects: PLUTONIUM, identifier: PLUTONIUM, img: "display: art",
  _merge: PLUTONIUM, isIgnored: "display: entries Plutonium leaves out; the 5e.tools entry itself is converted",
  entryData: PLUTONIUM, actorTokenMod: "display: token art", subEntities: "display: extra Foundry items (summons, statblocks) made with the feature",
  advancement: "display: Foundry's level-up choices; the same choices come from the 5e.tools entries (ASI, skills, scale values)",
  classSource: "display: identity, used to match the entry", subclassSource: "display: identity, used to match the entry",
  shortName: "display: identity, used to match the entry",
  system: "display: Foundry item data; its uses become the usage line, its ranges, durations and targets are in the text",
};

export function decisionFor(kind: string, field: string): Decision | undefined {
  if (kind.startsWith("foundry:")) return FOUNDRY[field] ?? ANY_KIND[field];
  return BY_KIND[kind]?.[field] ?? ANY_KIND[field];
}
