/**
 * Every statistic the engine understands (docs/ENGINE-PLAN.md, 2 "Strict"). Content may also set its own feature
 * numbers (a breath weapon's DC, rage uses) as long as something reads them: a feature text or usage
 * ("{{breath weapon:dc}}"), another stat, or a requirement. A stat that is neither is a finding: the content means
 * something the app does not do.
 */
const AB = "(?:strength|dexterity|constitution|intelligence|wisdom|charisma)";
const SKILL = "(?:acrobatics|animal handling|arcana|athletics|deception|history|insight|intimidation|investigation|medicine|nature|perception|performance|persuasion|religion|sleight of hand|stealth|survival)";

export interface StatKind {
  kind: string;
  pattern: RegExp;
  /** What computes from it. */
  readBy: string;
}

export const STAT_DICTIONARY: StatKind[] = [
  { kind: "weapon-specific attack or damage", pattern: /^[a-z][a-z' -]*:(?:attack|damage)$/, readBy: "sheet attack lines (Bracers of Archery: longbow:damage; Fell Handed: handaxe:attack) and feature values" },
  { kind: "tool expertise", pattern: /^[a-z][a-z’' -]*(?:tools?|supplies|utensils|kit):proficiency$/, readBy: "sheet proficiency list (marked expertise)" },
  { kind: "companion", pattern: /^companion:.+$/, readBy: "companion bonuses on the Sheet and Play tabs" },
  // Unearthed Arcana content not supported yet (docs/UA-UNSUPPORTED.md, UA1 to UA3; support is master plan A4): the
  // 2019 playtest Artificer's infusion count and vanishing, the 2015 School of Invention's arcanomechanical armor.
  { kind: "playtest, not supported yet", pattern: /^(?:infusions:(?:count|vanish)|equipment:id_wotc_ua_armor_light_arcanomechanical)$/, readBy: "nothing yet: listed in docs/UA-UNSUPPORTED.md" },
  { kind: "feature DC", pattern: /^[a-z][a-z' ()-]*(?::[a-z ]+)?:dc$/, readBy: "feature values on the sheet (Psionic Power: DC 14)" },
  { kind: "ability", pattern: new RegExp(`^${AB}(?::(?:score:set|max|max:extra|modifier|score))?$`), readBy: "stats.ts (scores, caps, set scores)" },
  { kind: "save", pattern: new RegExp(`^(?:${AB}:save(?::misc|:proficiency)?|saves?(?::misc)?)$`), readBy: "stats.ts, sheet.ts" },
  { kind: "skill", pattern: new RegExp(`^(?:${SKILL}(?::misc|:proficiency|:passive)?|skills?(?::misc)?|passive (?:perception|investigation|insight))$`), readBy: "stats.ts, sheet.ts" },
  { kind: "proficiency", pattern: /^proficiency(?::half(?::up)?)?$/, readBy: "stats.ts" },
  { kind: "ac", pattern: /^ac(?::(?:misc|calculation|shield|armored:(?:armor|enhancement|misc|dexterity:cap)|unarmored(?::misc)?))?$/, readBy: "sheet.ts buildAc" },
  { kind: "hp", pattern: /^hp(?::max|:misc|:temp)?$/, readBy: "stats.ts, sheet.ts" },
  { kind: "initiative", pattern: /^initiative(?::misc)?$/, readBy: "stats.ts, sheet.ts" },
  { kind: "speed", pattern: /^(?:innate speed(?::(?:walk|fly|swim|climb|burrow))?(?::misc)?|speed(?::(?:walk|fly|swim|climb|burrow))?(?::misc)?)$/, readBy: "stats.ts, sheet.ts" },
  { kind: "sense", pattern: /^(?:darkvision|blindsight|truesight|tremorsense)(?::range)?$/, readBy: "sheet.ts senses" },
  { kind: "spellcasting", pattern: /^(?:[a-z][a-z' ()-]*:)?spellcasting:(?:slots:\d|slots:count|slot|level|prepare|dc|attack|ability|known|cantrips)$/, readBy: "sheet.ts casting, engine.ts multiclass" },
  { kind: "chosen spellcasting ability", pattern: /^[^:]+:spellcasting:ability:(?:strength|dexterity|constitution|intelligence|wisdom|charisma)$/, readBy: "engine.ts (the entry's ability), stats.ts (its DC and attack)" },
  { kind: "attack", pattern: /^(?:attack|damage|(?:melee|ranged)(?: weapon)?:(?:attack|damage)|extra attack:count|unarmed strike:(?:damage|dice|attack))$/, readBy: "sheet.ts attacks" },
  { kind: "carrying", pattern: /^(?:carrying capacity|attunement:max|encumbrance:.+)$/, readBy: "sheet.ts" },
  { kind: "companion", pattern: new RegExp(`^companion:(?:hp:max|ac|speed(?::(?:fly|swim|climb|burrow))?|initiative|proficiency|${SKILL}:proficiency|${AB}(?::save:proficiency)?)$`), readBy: "companion stat blocks (to wire: atlas finds companion:ac and speeds unread)" },
];

/**
 * Stats the content sets with a clear meaning that no calculator reads yet. They are listed, not unknown: each is
 * work for the calculators (docs/ENGINE-PLAN.md, E3), named here so it cannot be forgotten.
 */
export const TO_WIRE: StatKind[] = [
];

export function statKind(name: string): StatKind | undefined {
  const n = name.toLowerCase().trim();
  return STAT_DICTIONARY.find((k) => k.pattern.test(n));
}
