# Rules read from prose (audit E2)

Written by `RULES_TIER=text-rules` (src/engine/textRules.test.ts) from the 5e.tools data: 13752 elements converted.
Each reader of a feature's text, how many elements its reading went into ("from the text"), and how many
already held the same fact from data, 5e.tools' own fields or its Foundry side data ("the data had it").

| Reader (src/aurora/textMechanics.ts) | From the text | The data had it | Examples |
| --- | ---: | ---: | --- |
| limited uses and their rest | 713 | 35 | Aberrant Dragonmark (Feat); Aberrant Dragonmark (Feat); Adept of the Black Robes (Feat); Adept of the Red Robes (Feat) |
| a feature's save DC | 18 | 33 | Actor (Feat); Boon of Terror (Feat); Cult of the Dragon Initiate (Feat); Greater Mark of Handling (Feat) |
| skill training | 38 | 4 | Beguiling Influence (Optional Feature); Menacing (Racial Trait); Keen Senses (Racial Trait); Hawkeyed (Racial Trait) |
| speeds | 32 | 0 | Athlete (Feat); Mark of Passage (Feat); Transmuted Anatomy (Feat); Gift of the Depths (Optional Feature) |
| a pool the text sizes elsewhere (default use taken back) | 30 | 0 |  |
| armor training | 1 | 24 | Dwarven Armor Training (Racial Trait) |
| an attack of the feature's own | 24 | 0 | Dragon Hide (Feat); Talons (Racial Trait); Talons (Racial Trait); Hooves (Racial Trait) |
| an armor class formula | 19 | 0 | Armored Casing (Racial Trait); Grit (Racial Trait); Natural Armor (Racial Trait); Natural Armor (Racial Trait) |
| tool training | 4 | 10 | Tuktuk Cunning (Racial Trait); Water Creed Navigation (Racial Trait); Poison Affinity (Racial Trait); Implements of Mercy (Archetype Feature) |
| weapon training | 0 | 13 |  |
| score maximums and other limits | 12 | 0 | Medium Armor Master (Feat); Medium Armor Master (Feat); Magic Item Adept (Class Feature); Magic Item Savant (Class Feature) |
| initiative bonuses | 10 | 0 | Alert (Feat); Alert (Feat); Hare-Trigger (Racial Trait); Hare-Trigger (Racial Trait) |
| languages | 1 | 6 | Primal Lore (Archetype Feature) |
| saving throw proficiency | 3 | 2 | Keldon Resilience (Racial Trait); Diamond Soul (Class Feature); Disciplined Survivor (Class Feature) |
| uses a later feature adds to an earlier one | 5 | 0 |  |
| half proficiency on checks | 4 | 0 | Kefnet's Blessing (Racial Trait); Jack of All Trades (Class Feature); Jack of All Trades (Class Feature); Remarkable Athlete (Archetype Feature) |
| a bonus to armor class under a condition | 3 | 0 |  |
| bonuses to checks | 2 | 1 | Elegant Courtier (Archetype Feature); Otherworldly Glamour (Archetype Feature) |
| a companion's armor class bonus | 1 | 0 |  |

## Readers elsewhere, not counted yet

| What is read | Where | The same fact as data |
| --- | --- | --- |
| a spell's casting ability from a feature's text | `src/aurora/sheet.ts`, `buildCasting` | 5e.tools `additionalSpells.ability` |
| which ability a weapon may use (Hexblade, Pact of the Blade, Battle Smith) | `src/aurora/sheet.ts`, `weaponAbilityOptions` | none |
| senses worded in a feature | `src/aurora/sheet.ts`, `withSenses` | 5e.tools `senses`, `darkvision` |
| an item's attunement | `src/aurora/engine.ts`, `needsAttune` | 5e.tools `reqAttune` |
| armor a feature rules out (Unarmored Defense) | `src/aurora/rulesCheck.ts`, `noBodyArmor` | none |
| feats that may be taken more than once | `src/aurora/rulesCheck.ts`, `featRepeatable` | 5e.tools `repeatable` |
| a school limit on a subclass's spells | `src/aurora/fivetools.ts`, `schoolLimit` | none |
| proficiencies worded in entries | `src/aurora/fivetools.ts`, `textProficiencies` | 5e.tools `skillProficiencies` and its kin |
| spells a feature lets the character cast | `src/aurora/fivetools.ts`, `castableSpells` | 5e.tools `additionalSpells` |
| skill and expertise choices worded in a feature | `src/aurora/fivetools.ts`, `applyTextSkillChoices`, `applyTextExpertiseOnChoices` | Foundry side data |
| starting equipment | `src/aurora/startingEquipment.ts`, `equipmentText`, `parseItems` | 5e.tools `startingEquipment` (already the source; the text is the converter's own) |

Open (the rest of E2): reader by reader, data first and text as the fallback, with a gate that lists every element
where the two disagree; counts for the readers elsewhere.
