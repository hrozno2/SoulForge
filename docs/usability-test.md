# Usability test: rebuilding pregenerated characters

Goal: take real printed character sheets and check that everything on them can be produced by CharForge.

Sheets used: the five free pregenerated characters of the D&D Starter Set (Wizards of the Coast, 2022 PDF, 2014 rules). Four were rebuilt: Hill Dwarf Cleric (Life, Soldier), Wood Elf Fighter (Folk Hero), High Elf Wizard (Sage), Human Paladin (Noble). Content came from the AuroraLegacy elements (2014 Player's Handbook), loaded through the same code path as the app.

The test is automated: `src/aurora/pregen.test.ts`. It chooses the same options a player would (species, subspecies, domain, skills, cantrips, spells, languages), sets ability scores to the printed values (the test removes species bonuses to get the base), adds the equipment, then compares the builder's sheet with the printed one.

## Every field on the printed sheet

| Sheet field | Where in CharForge | Result |
| --- | --- | --- |
| Class, level, background, race and subrace, size, alignment | Sheet header | Matches. Subrace and size added to the header after the test showed they were missing |
| Proficiency bonus | Sheet | Matches |
| Six ability scores and modifiers | Build, Ability scores | Matches, including racial bonuses |
| Six saving throws, proficient or not | Sheet | Matches |
| 18 skills with bonuses and proficiency dots | Sheet | Matches, including Stealth with heavy armor (see below) and Alert style bonuses |
| Armor class | Sheet, Equipment | Matches: chain mail 16 plus shield, leather plus Dexterity, unarmored 10 plus Dexterity |
| Initiative, speed | Sheet | Matches, including Wood Elf 35 ft and Hill Dwarf 25 ft |
| Hit point maximum, hit dice | Sheet | Matches, including Dwarven Toughness |
| Current hit points, death saves | Sheet (play bar) | Present |
| Passive Wisdom (Perception) | Sheet | Matches |
| Coins | Equipment | Present |
| Equipment list | Equipment | Present. Four items are not in the content (sand, a small knife, a scroll of pedigree) and were added as custom items |
| Proficiencies: armor, weapons, tools | Sheet | Matches, including individual dwarf weapon training |
| Languages | Sheet | Matches, but see below |
| Attacks with attack bonus and damage | Sheet | Matches, including the Archery fighting style (+2 with the longbow) |
| Class features and species traits | Sheet | Present, with text |
| Spell save DC and spell attack | Sheet, Magic | Matches |
| Spell slots | Magic (tracker) | Matches |
| Cantrips known | Magic | Matches, including the High Elf bonus cantrip |
| Spellbook / known spells | Magic | Matches |
| Prepared spell count and always-prepared domain spells | Magic | Matches |

## What the test found, and what changed

1. Racial cantrips (High Elf) were not shown with the class spells. Spell choices that name no class are now matched to the class whose spell list they come from.
2. The Archery fighting style gave no attack bonus. Stat rules named `ranged:attack`, `melee:attack` and similar now apply to weapon attacks, and magic weapon bonuses too.
3. Background personality traits, ideals, bonds and flaws are text lists in the content and were counted as unfinished choices. They are now optional lists whose picks print on the sheet.
4. Subrace and alignment were missing from the sheet header.
5. The Wizard's spellbook did not print on the sheet, only the prepared list. Both print now.
6. Two languages on the Fighter pregen and others come from no rule (the pregen designers added them). The same goes for items that are not in the content. These are covered by Manage, Manual additions and by custom items, which were added for this reason.

## Not checked

- Printed text blocks: the test checks that features exist, not that the wording matches.
- The rogue pregen (Halfling Rogue) was not rebuilt.
- 2024 characters: the 2024 content is covered by separate engine tests, not by a printed sheet.
- Equipment list names: only items that exist in content were matched by name.
