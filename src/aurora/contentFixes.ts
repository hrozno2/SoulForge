/**
 * Corrections to the content, applied when the registry is built (plan principle P3: fix data in data). Each one
 * says what is wrong in AuroraLegacy and why the fix is right. The content linter finds these; the lint test fails
 * on any new finding that is neither fixed here nor accepted in LINT_ACCEPTED.
 */
import type { AElement } from "./types";

/** IDs written wrongly where a requirement names them: the wrong ID never matches, so the rule silently fails. */
export const ID_TYPOS: Record<string, string> = {
  // "DEXTERIY": increasing and decreasing the same ability (DMG adjusted scores) was not excluded for Dexterity.
  ID_WOTC_DMG_ADJUSTED_ABILITY_SCORE_DECREASE_DEXTERIY: "ID_WOTC_DMG_ADJUSTED_ABILITY_SCORE_DECREASE_DEXTERITY",
  ID_WOTC_DMG24_ADJUSTED_ABILITY_SCORE_DECREASE_DEXTERIY: "ID_WOTC_DMG24_ADJUSTED_ABILITY_SCORE_DECREASE_DEXTERITY",
  // Martial Adept gives an extra superiority die to a character who already has Combat Superiority (PHB p.168).
  ID_ARCHETYPE_FEATURE_BATTLE_MASTER_COMBAT_SUPERIORITY: "ID_WOTC_PHB_ARCHETYPE_FEATURE_BATTLE_MASTER_COMBAT_SUPERIORITY",
  // "ARCANA_EYE": the Theurgy wizard's Arcana Domain spell is Arcane Eye.
  ID_PHB_SPELL_ARCANA_EYE: "ID_PHB_SPELL_ARCANE_EYE",
  ID_WOTC_PHB24_SPELL_ARCANA_EYE: "ID_WOTC_PHB24_SPELL_ARCANE_EYE",
  // "VULNERAILITY": a damage vulnerability that never showed.
  ID_INTERNAL_CONDITION_DAMAGE_VULNERAILITY_BLUDGEONING: "ID_INTERNAL_CONDITION_DAMAGE_VULNERABILITY_BLUDGEONING",
  // "WOCT": the Initiate background's dissenter variant.
  ID_WOCT_PSA_BACKGROUND_FEATURE_DISSENTER_SHELTER_OF_DISSENTERS: "ID_WOTC_PSA_BACKGROUND_FEATURE_DISSENTER_SHELTER_OF_DISSENTERS",
};

/** Class spell lists missing a class the rules give (found by the 5e.tools spell list cross-check). */
/**
 * Wrong words in a description, fixed in place: [what the content says, what the book says]. The 2024 Ranger's,
 * Criminal's and Hermit's starting gold is in GP in the Player's Handbook; the content has CP, which put 7 copper on
 * the sheet where 7 gold belongs (GitHub issue #3).
 */
export const TEXT_FIXES: Record<string, [string, string][]> = {
  ID_WOTC_PHB24_CLASS_RANGER: [["Explorer's Pack, and 7 CP;", "Explorer's Pack, and 7 GP;"]],
  ID_WOTC_PHB24_BACKGROUND_CRIMINAL: [["Traveler's Clothes, 16 CP;", "Traveler's Clothes, 16 GP;"]],
  ID_WOTC_PHB24_BACKGROUND_HERMIT: [["Traveler's Clothes, 16 CP;", "Traveler's Clothes, 16 GP;"]],
};

export const SPELL_LIST_ADD: Record<string, string[]> = {
  // Tasha's artificer spell list includes Frostbite (Xanathar's); the other Xanathar's cantrips already have it.
  ID_XGTE_SPELL_FROSTBITE: ["Artificer"],
};

const SPELLCASTING_OR_PACT = "ID_INTERNAL_GRANTS_SPELLCASTING_FEATURE||ID_INTERNAL_GRANTS_PACT_MAGIC_FEATURE";

/** Feat prerequisites the content leaves out (found by the 5e.tools feat prerequisite probe). */
export const REQUIREMENTS_SET: Record<string, string> = {
  // Tasha's: "Prerequisite: Spellcasting or Pact Magic feature" (TCE p.79, p.80); the content has none.
  ID_WOTC_TCOE_FEAT_ELDRITCH_ADEPT: SPELLCASTING_OR_PACT,
  ID_WOTC_TCOE_FEAT_METAMAGIC_ADEPT: SPELLCASTING_OR_PACT,
  // 2014 War Caster: "Prerequisite: The ability to cast at least one spell" (PHB p.170); the content had only the
  // rule against taking both versions. [type:spell] is how the content says it for Spell Sniper.
  ID_PHB_FEAT_WARCASTER: "([type:spell],!ID_WOTC_PHB24_FEAT_WAR_CASTER)||ID_WOTC_PHB_GRANTS_FEAT_UNLOCKER",
};

/**
 * Grants the content forgets: the artificer's Spellcasting is a Spellcasting feature too (a marker other rules ask
 * for), and the 2024 druid is trained in the Herbalism Kit (PHB 2024 p.78; the class text says so, no rule gives it;
 * found by the class training cross-check).
 */
export const GRANTS_ADD: Record<string, { type: string; id: string; requirements?: string }[]> = {
  ID_WOTC_ERLW_CLASS_FEATURE_ARTIFICER_SPELLCASTING: [{ type: "Grants", id: "ID_INTERNAL_GRANTS_SPELLCASTING_FEATURE" }],
  ID_WOTC_TCOE_CLASS_FEATURE_ARTIFICER_SPELLCASTING: [{ type: "Grants", id: "ID_INTERNAL_GRANTS_SPELLCASTING_FEATURE" }],
  ID_WOTC_UA_CLASS_FEATURE_ARTIFICER_SPELLCASTING: [{ type: "Grants", id: "ID_INTERNAL_GRANTS_SPELLCASTING_FEATURE" }],
  ID_WOTC_PHB24_CLASS_DRUID: [{ type: "Proficiency", id: "ID_PROFICIENCY_TOOL_PROFICIENCY_HERBALISM_KIT", requirements: "!ID_WOTC_PHB24_MULTICLASS_DRUID" }],
};

/** Linter findings that are right as they are (a requirement ruling out content that is not part of AuroraLegacy). */
export const LINT_ACCEPTED = [
  "ID_KBP_DMBD_CLASS_FEATURE_ANTIPALADIN_UNHOLY_SMITE", // homebrew Antipaladin, ruled out by Divine Smite
  "ID_KBP_DMBD_CLASS_FEATURE_ANTIPALADIN_IMPROVED_UNHOLY_SMITE",
  "ID_WOTC_PHB_CLASS_FEATURE_ELDRITCH_INVOCATION_ELDRITCH_SPEAR", // the 2024 Eldritch Spear rules out a 2014 one
];

const fixReq = (req: string | undefined) => (req ? req.replace(/ID_[A-Z0-9_]+/g, (id) => ID_TYPOS[id] ?? id) : req);

/** Applies the corrections to one element, in place. */
export function applyContentFixes(el: AElement): void {
  el.requirements = fixReq(el.requirements);
  // Mistyped IDs in grants too (a damage vulnerability spelled "VULNERAILITY").
  if (el.rules.some((r) => r.kind === "grant" && ID_TYPOS[r.id])) el.rules = el.rules.map((r) => (r.kind === "grant" && ID_TYPOS[r.id] ? { ...r, id: ID_TYPOS[r.id] } : r));
  if (REQUIREMENTS_SET[el.id]) el.requirements = REQUIREMENTS_SET[el.id];
  for (const [from, to] of TEXT_FIXES[el.id] ?? []) el.description = el.description.split(from).join(to);
  for (const g of GRANTS_ADD[el.id] ?? []) if (!el.rules.some((r) => r.kind === "grant" && r.id === g.id)) el.rules = [...el.rules, { kind: "grant", ...g }];
  const add = SPELL_LIST_ADD[el.id];
  if (add) el.supports = [...el.supports, ...add.filter((c) => !el.supports.includes(c))];
  el.rules = el.rules.map((r) => ("requirements" in r && r.requirements ? { ...r, requirements: fixReq(r.requirements) } : r));
}
