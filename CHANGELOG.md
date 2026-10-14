# Changelog

What changed in each release. Newest first.

## v0.12.0 (2026-10-14)

- Storage: open a database a newer build raised the version of, instead of failing
- Build board: portrait and name at the top of the scores; thickening spellbook and pocket-filling backpack; Magic and Equipment tabs folded into the board
- Build board: book versions chosen on the card, not in the lists; species, class and background arrive with a card flight
- Build board: a spellbook that grows and a backpack that fills; every space as a full gold-framed card; tabs on narrow windows
- Build board (test app): lists on the left, the character filling in on a board in the middle, scores worked in place on the right
- Rules suite: apply the time limit to every test
- Rules suite: one generous time limit per test, so a busy machine is not reported as a failure
- Full spell list prints with blank prepared boxes; on-request big rules run; step layout for Build (test app); slate and amber default theme
- Plan: progress section
- Full spell list to prepare from, and continuation pages on every standard sheet
- Import by source; granted spells everywhere; defenses and unarmed strikes on every sheet
- Import compared with the file's own numbers; item and typed-in bonuses; two engine fixes
- Feat prerequisites probed against 5e.tools; missing ones added
- Spell lists cross-checked against 5e.tools; Frostbite on the Artificer list
- Content layer: one edition rule, pinned content, content linter and fixes
- Rules check in the app: Build bar, import report and export warning; reference downloaded, never bundled
- Import leaves unsettled choices open as a to-do list; import snapshots
- Plan: decisions recorded; features-later list for the freeze

## v0.11.0 (2026-10-13)

- Feat spellcasting DC on every sheet even when spells overflow
- Multiclass slots with an artificer; no dead-end picks in automatic filling; checker knows Dragon Hide
- Reliability plan for import, build and export
- Sheets show the DC of feat spellcasting; rules suite reads the filled sheets back
- Prepare list for clerics and druids with a picked spell; importer reads repeatable feats, spell origins and 2024 names
- Import report saved in the character's notes, with a notice on where to find it
- Test build: show the commit and build time in the test strip
- Importer: Foundry features stored as feats, always-prepared spells, clearer subclass note
- Rules suite: type fix for the import check
- Importer reads much more of Roll20 and Foundry files; prepare list per edition; cleaner sheet item names
- Test build: test buttons in a visible strip under the top bar
- Autofill skips picks that make an earlier choice illegal; checker knows 2024 Draconic Resilience and Mariner
- Checker: or-groups in multiclass requirements, College of Dance unarmored defense
- Choices are judged at the level they are made: a feature the same class gains later no longer makes an earlier choice illegal (Resilient at 4 and a Monk's Disciplined Survivor at 14)
- Test fixture: the cleric is trained in shields
- Rules check fixes: no untrained armor put on automatically; checker knows feature replacements, Channel Divinity naming, whole-word subclass matching and Elegant Courtier
- Rules tests: a checker against the rules (5e.tools class data for hit dice, saves, slots, cantrips, prepared and known spells, feat levels, multiclass requirements and features by level; armor, attack, hit point and hand rules from the handbooks), varied random batches, level 20 in every class, level-ups, multiclasses, companions and optional rules, community builds, coverage of every subclass, species, background and feat, every element on its own, and export checks; release runs it on a fresh seed. Fixes it found: multiclass spell choices limited to each class's own level, ability score improvements no longer block each other across levels, two-handed property spelled without a hyphen, Ritual Caster and Beast Master choices, Artificer and species ability increases the original app generated; drop area for favorites; test app buttons for 10 random characters and a test export
- Feat and species spells without class spellcasting get their own spellcasting line (Magic Initiate on a Fighter); starting gear 'gaming set, same as above' becomes the chosen set; import report after importing; Build, Magic and Equipment in the main menu; Equipment shows when starting gear is not chosen; finishing Build moves on to Magic or Equipment, finishing Magic to Equipment; search as an icon that opens; temp HP as its own pill; compact favorites that can be removed; resources above the tabs; advantage shows the other roll beside the main one

## v0.10.0 (2026-10-12)

- Printouts checked for five imported characters on three sheets: one line per spell when both editions are on a character, shared form fields emptied before drawing, generated ability improvement choices kept off the sheet; Dueling adds its +2 damage; tests follow the sheet's misnamed spellcasting fields and leave unfilled spell choices to the player; lint fixes
- Roll20 import (including VTTES exports): the 2014 or 2024 class and the species version from the features the sheet lists, species with a kind in parentheses (Genasi (Earth)), prepared spells, hit point maximum, scores Roll20 leaves at the default; Foundry prepared spells; playtest versions only when nothing else matches
- Visual pass: play header readable in light themes, Escape closes level up, random prepared casters prepare spells, inventory and feature rows aligned, no '+ 0' in dice sums
- Test: drag into favorites in steps, like a person
- Starting equipment: inline (a)/(b) options in older class text, 'a martial weapon' as a weapon choice, 'wooden shield' as a shield; random characters pick real weapons for those choices
- Foundry import checked against 21 real characters: 2014 or 2024 rules from the file, species and subraces from item or text (Hill Dwarf, Halfling (Lotusden), Elf; Wood Elf Lineage), backgrounds from text, hit points matched to the file, spell choices the file leaves out stay open instead of guessed, class features never added on top of the content, Resilient and ability choices from the file's saves and scores, quantities in names; base scores above 20 stay
- Test: six ability boxes besides initiative
- Play sheet in a Tidy-style layout with the D&D Beyond look: header with portrait, hit points and hit dice, ability hexes with their saves, icon buttons for inspiration, level up and rests; sidebar switching favorites and skills; actions as grouped tables with uses, roll, formula, range and target
- Random characters follow the content filters, put scores where the class needs them and start with gear; '!' in supports filters (Mark of Detection); 2014 sheet lists the whole spellbook with prepared bubbles; required choices are never emptied by content filters; Spelljammer and Adventurers League books count as other settings
- Importer: subclasses and lineages before spells, item names and +N bonuses (Foundry base items, Roll20 modifiers), equipped gear from Roll20, magic item effects kept out of base scores, mastery and other guesses from the character's own books and weapons; Improvement Option choices for 2014 classes (ability scores or a feat); item labels and magic bonuses in AC and attacks
- Sheet fixes from real characters: multiclass spell slots, DLDM spellcasting boxes by position, 2014 slots expended, personality split into ideals/bonds/flaws, carried weapons when none equipped, single-weapon training in the weapons line, aligned spell rows, overflow note for spells, shorter ranges; compact compendium search

## v0.9.0 (2026-10-12)

- Locked options stay visible with the reason; level up and multiclass as cards; dice show the sum; readable rules tables; stat blocks keep the printed look; play sheet fits; favorites drag in the desktop app; sheet downloads in Manage sheets; tutorial step for finding your way; filled sheets: text fits its box, short casting times and ranges, centred numbers
- Chosen species, class and background shown as cards; list view version chips pick that version; Learn more follows the theme
- Premium pick cards: gilded notched frames, class emblems and role tags, serif headings, segmented filter bar; settings follow the dark themes
- Sheet panel: pick, preview and fill first; downloads tucked away; sheet manager with thumbnails, rename and remove
- Bug fixes from a review: form text redrawn in the production build, translated group and notes no longer break sheet filling, passive perception from the sheet, preview refreshes on any change, large characters survive a reload
- Main navigation in four groups with rollout menus: Home, Build, Manage, Sheet
- One-click downloads for the DLDM 2024 fillable sheet and companion sheets, with credit
- Smarter matching of unknown sheets (printed labels, word order, named check boxes), aliases for wrongly named official fields
- Sheet preview with page buttons, file list copied before the input resets, layouts and tests for the whole official set
- Official sheets: layouts for every sheet in the WotC set, plain and fillable, duplicate merge, one-click download of the whole 2014 set
- Compendium search, character badge and action strip in the top bar, Slate and amber theme after Aurora Builder
- Tutorial progress bar uses the same markup as the Content tab
- Tutorial does the setup itself (Aurora download, character import, official sheets) and minimizes instead of closing
- Script to build a test copy of the app next to the released one
- Warn before filling a sheet that is not a form, with a Proceed button
- First-run tutorial for new and updated installs, skippable, with never show again
- Fill the official 2024 fillable and classic 2014 sheets by field, automatic matching for other fillable sheets, one-click official sheet download, Magic tab badge

## v0.8.0 (2026-10-10)

- DeepL translation service (desktop app), glossary of fixed term translations with starter lists
- Translation: retry a failed batch one string at a time, say how many stayed in English on every export
- Sheet links in one file, weekly link check, search fallback in the panel
- Link the DLDM sheets folder with credit
- New default sheet with its own layout, bold feature names on the fillable sheets, Build badge says what is left, level up text readable in dark themes
- Condition icons with rules on hover, official sheet recognised fillable or print, translations keep names of spells, items and features
- Spell school icons (game-icons.net, CC BY), Cast rolls the spell's dice, compact spell rows, favorites row with drag and star, collapsible session log
- Play sheet: boxes keep their proportions, D&D Beyond style rounded ability and stat boxes
- Dice bag button, tab icons, card dividers and a faint d20 in the corner
- Portrait source link stays after the mouse leaves
- Two hands limit, stacking and marked gear, plain labels for focus items and storage, dark helper window, roll for HP, dice tray resets after a roll
- Starting equipment: class and background fold one at a time
- Global content filters, repeated choices merged into one, spell school works as a filter word (fixes Evocation Savant)
- Fix level-up test after the section Done button
- Spell rows keep their columns when an option is unavailable; reasons are neutral and in hover text
- Owned options show a locked check with what grants them; finished choices fold away
- Only offer the Recommended sort where it means something
- Full source name on hover
- Point buy house rules: budget, lowest and highest score, cost of every score
- Party slots as pips, random character asks for a level, version chips switch the pick in list view
- Homebrew cask: use postflight_steps

## v0.7.0 (2026-10-10)

- Release script: handle inherited output; changelog header
- Make the e2e tab helper wait for the tab bar to settle
- Docs and changelog refresh
- Smoke test for wild shape, journal and language
- Interface language setting for the app shell, live region for hit points
- Export characters for Foundry and Roll20
- Party overview on Home
- Session log for notes
- Wild shape and companion hit point tracking
- Update picker link test
- 5etools: optional features, additional spells for species/feats/subclasses, class picker
- Guided level up with undo, hit point roll, new features, spell choices and swaps
- Homebrew builder, tab bar no longer flickers near a width threshold
- CI: keep Playwright specs out of the unit test run; desktop self-check builds without updater signing
- Conditions and exhaustion change rolls, concentration tracker with save prompt, ammunition counts, release script and notes, e2e test for conditions
- Content security policy tested in a real build, original test ruleset for CI, lazy-loaded tabs and split bundle, Playwright smoke tests, backup and restore, desktop self-check
- Fix HTML sanitizer letting content run code, hit die roll mismatch, pact slots on short rest; accessibility labels and contrast; old saves are normalised
- Refresh screenshots for v0.6.5

## Highlights since 0.6.5

- Content security policy, checked in a real desktop build.
- Original test ruleset in `fixtures/` so engine tests run in CI; Playwright smoke tests; smaller start-up bundle.
- Backup and restore.
- Conditions, exhaustion, concentration checks and ammunition.
- Homebrew builder.
- Guided level up with undo.
- Wild shape and companion hit points, session log, party overview.
- Export for Foundry VTT and Roll20.
- 5etools: optional features and spells granted by species, feats and subclasses; class picker.
- Interface language (English, German, Spanish, French, Portuguese).
- Fixes: sanitizer hole in rendered descriptions, hit dice and pact slots, tab bar flicker, readable level up window in dark themes.

## 0.6.x

See the GitHub Releases page.
