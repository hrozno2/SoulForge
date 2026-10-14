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
  // "WOCT": the Initiate background's dissenter variant.
  ID_WOCT_PSA_BACKGROUND_FEATURE_DISSENTER_SHELTER_OF_DISSENTERS: "ID_WOTC_PSA_BACKGROUND_FEATURE_DISSENTER_SHELTER_OF_DISSENTERS",
};

/** Class spell lists missing a class the rules give (found by the 5e.tools spell list cross-check). */
export const SPELL_LIST_ADD: Record<string, string[]> = {
  // Tasha's artificer spell list includes Frostbite (Xanathar's); the other Xanathar's cantrips already have it.
  ID_XGTE_SPELL_FROSTBITE: ["Artificer"],
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
  const add = SPELL_LIST_ADD[el.id];
  if (add) el.supports = [...el.supports, ...add.filter((c) => !el.supports.includes(c))];
  el.rules = el.rules.map((r) => ("requirements" in r && r.requirements ? { ...r, requirements: fixReq(r.requirements) } : r));
}
