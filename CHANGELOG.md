# Changelog

What changed in each release. Newest first.

## v0.20.0 (2026-10-28)

- C4 answers recorded; C5.7 system specs, C5.8 library export on Home added to the plan
- Class improvement choices: the usual feat list (search, filters, versions, locks), not a wall of buttons
- Linux lag (C5.4): DMA-BUF renderer off only on NVIDIA; no animated drop-shadows or backdrop blur. UA2: infusions' days after death
- RESUME: companion numbers, notice grouping, Jev skipped
- Older-build notice: one line per choice, and no second line for the same ruled-out pick
- Companion cards work out AC and hit point formulas ("5 + five times your Ranger level", "13 + your Wisdom modifier", "+ PB")
- Companion cards: the content's worked-out AC and hit points (Steel Defender AC 15, HP 2 + Int + 5/level), not added on top
- A summon with several creatures is an optional companion choice, never a required one
- RESUME: the A2.12 regression for the next release notes
- Summoned companions as Plutonium routes them; 5e.tools subclasses get the features their headers refer to again
- Rules check: a spell count short only by open picks is the open choice, not a second finding
- RESUME: FastCharacter import work
- FastCharacter import: cantrips from attack lines and species traits; picks that repeat are taken back
- RESUME: A0.1 cross-checks of the night
- Play: features that spend another's uses (Turn Undead, a Channel Divinity) have a Use button, as Plutonium links them (A0.1)
- Plutonium notes: field sweep of the 5e.tools converter; consumes left open for Play
- Magic Initiate's spell-list versions let the player choose the casting ability, as Plutonium asks (A0.1)
- Gold roll only for the older starting-equipment lists; lettered options have their own gold (fixes 15e5fc0's failing test)
- 2014 classes can roll for starting gold instead of their gear, as Plutonium offers (A0.1)
- C4 design pass for review: state model, behaviour, tests and four questions (docs/C4-DESIGN.md)
- Interface tests for every creation path and the on-request browser run (C5.5)
- PDF export: Wild Shape form and companion cards, worked out for the character (C5.3)
- C5.6 measured: 8 to 15 ms a change in the production build, no hot spot; left until Linux numbers
- RESUME: the night of 2026-10-27 to 28
- Favorites reorder by dragging within the row or with move buttons (C2 step 7; C2 done)
- Manage: no right-hand lore panel; each row has an i that opens the full description (C2 step 6)
- Character details move to Build: a Details dialog from the board, Play, the badge and Open notes; blank details never count as a choice (C2 step 5)
- Manage's "Level and hit points" leaves for Play, after a parity check (C2 step 3)
- Navigation: Manage and Content are two tabs; the character's books move to Content; Conditions get a Play tab (C2 steps 1, 2, 4)
- Play: forms worked out for the character as cards; 2024 Wild Shape keeps your hit points with temporary ones (C5.3)
- Tutorial asks for all of Aurora and all of 5e.tools; Settings explains the content filters (C5.1, C5.2 checked)
- Shop opens on what can be bought: unpriced and unaffordable items hidden until shown
- Shop on the backpack card: buy with the purse, sell at half, multiplier and rarity prices per character (C3)
- Home draws character cards only once the content is in, no gold placeholders (C1.6)
- Board: spellbook and backpack switch their card back to Prepare spells or Inventory (C1.5)
- Full check fixes: old-key saves keep both +1s; one cross-edition exception for policy, rules check and gate
- Personality switch on the list layout's Background tab too (C1.4)
- Mixed proficiency choices get a Kind switch (C1.3), as Plutonium sorts them
- Choices: deselecting never folds a one-pick choice (C1.2)
- See options: a second click closes the list and its panel on a narrow window (C1.1)
- Character cards: HP bar, AC shield, speed; best three scores with the rest on hover (C1.0b)
- Character text fields hand their text on after a pause (C1.0)
- Shop money (A2.3) and older-build notice (A2.13), checked against Plutonium
- Edition policy: Aurora's 2024 Origin Feat bridge for 2014 backgrounds; Stage B user data test
- A2.12 subclass features by reference (Plutonium), class-only multiclass slots, inherit ability as Plutonium, XUA sources, gate pairs by book; Plutonium as the base in the plan
- A4 playtest support (audit, naming, reference, granted items, inherit); A2.11 app logs
- Plan: C1.0b character card layout (HP bar, AC shield, speed; three best scores, the rest on hover)
- A3.2 every sheet: coverage test per field, printed sheets get fillable fields, player name, next level XP, unarmored AC
- A3.1 class audit: attack ability from feature text (Hex Warrior, Pact of the Blade, Battle Ready), Gunner firearms; A3.3 parity coverage and fixes (effects with a duration, :misc double count, option progressions)
- A2.5 scale dice in data attacks; A2.6 beast forms for the character; A2.7 log file on disk; A2.8 measured (render, Stage C); A3.3 coverage per element type
- A2.10 Foundry export matches Foundry's own actor (Drakim): dnd5e item types, every feature, Foundry names
- RESUME: v0.19.0 released

## v0.19.0 (2026-10-27)

- A1.9 ability score increases: +2 to one ability and Foundry's check-box grid; A1.10; A2.9 modern technology filter; A2.4 round trip clean
- RESUME: import recheck, two characters left
- Importer: keep spells over the prepared limit; Drakim comparison test; plan A2.10
- Plan: A1.9 check-box grid for increases, A1.10 apostrophe capitals, A2.9 modern technology filter
- Plan: A1.9 ability score improvement +2 to one ability, first item tonight
- A2.4 Foundry round trip clean: spell sources, a feat's own choices, exact placement by identity
- A2.1, A2.2 spell cards follow the sheet; A2.4 Foundry export/import by identity (in progress)
- RESUME: overnight run instructions
- A1.1 2024 rules for 2014 backgrounds; A1.7 FastCharacter imports; class proficiency gate against 5e.tools
- Unsupported playtest content: shown as Coming soon, never picked
- Plan: Unearthed Arcana in scope (A4), unsupported list
- Starting gear that names only a kind is a choice, not text
- Stat dictionary: the three playtest-only Artificer statistics decided; 0 unknown
- Sheet: a feat and its feature of the same name print once (Telekinetic)
- One switch turns a 2014 background's personality traits, ideals, bonds and flaws off
- Optional and variant choices start not taken
- Inventory: only real containers can hold items (a staff no longer could)
- Master plan: engine first, then tests, then the interface
- docs: plan for CachyOS test findings and interface rework
- Resume notes: the user's list of 2026-10-23, stopped at the weekly usage limit

## v0.18.0 (2026-10-23)

- Hit point rolls: a window from the HP bar, every roll kept with who made it, and a check of the app's rolls
- Soul Forge sheet laid out after the DLDM 5E24 sheet
- Filter species and backgrounds by the abilities they can raise
- Global sci-fi filter: modern and futuristic technology hidden by default
- Launch loading bar after 2 s; the lists move on only when a card is kept
- Sources: default to the newest official core book; every source marked Official, Setting, UA or Other
- Launch: the pack shimmers until the home cards are final, then bursts; content is cached so launch takes ~2.4 s
- Cards show what a species, background or class gives without a choice; dialogs open above the card
- Required optional features are given (Way of the Four Elements: Elemental Attunement)
- Ask users to import 5e.tools again when the importer has grown
- Foundry: dnd5e 5 speed paths; gate on unknown Foundry paths
- Engine plan: the Plutonium work in the progress log
- Damage resistance choices from 5e.tools (Boon of Energy Resistance, Dragonborn, Tiefling...)
- Spellcasting ability is a choice where 5e.tools offers one; ritual spell choices keep the condition
- Alternative spell sets are one choice, as 5e.tools and Plutonium read them
- Attacks from feature text; Aurora copies take the 5e.tools copy's attacks
- Magic variants, launch intro, stat-driven Wild Shape limits with Circle of the Moon
- Text mechanics (uses, save DCs), Plutonium's species trait fallback, Wild Shape forms optional
- Board cards show only their book again, the others unfold on hover; the strip stays in the open card
- Plutonium analysis and next steps
- Lore shared with Aurora's copies; fluff images decided
- Portrait cropper: drag the square, open above the portrait window
- Plutonium Foundry data (uses, scale values), 5e.tools lore, Wild Shape forms, optional-choice checkbox
- Source picker: a strip of buttons, oldest to newest, scrolling sideways when they do not fit
- Docs: full check on request, accuracy and stability fixes, decisions
- Repeats and alternatives counted right; full check on request; loose ends
- Blocked options say why; option lists cached per kind, filter and edition
- 2014 species keep their increases; editions from book dates; every content stat read
- Docs: editions, optional features, window checks
- Last 5e.tools fields mapped; Mystic Arcanum; autofill lookahead
- Repeat copies: the next copy stays available while a choice has room (an Artificer's several Replicate Magic Item infusions)
- Open card source picker; Soul Forge against Aurora audit
- Choice windows checked in every test; one repeat copy offered at a time
- Editions, optional class features, one ASI-or-feat choice; the test app says TESTING
- Lists: content filters never hide edition-neutral things (skills, languages, tools, Aurora core essentials) and never leave a choice unable to be completed
- Docs: E4 exit met (10,000 random characters clean)
- Concepts: 'Skill Expertise (X)' and 'Skill Proficiency (X)' are one concept whatever feature type carries them; autofill's last resort avoids repeats
- Fixes found reviewing the import snapshots
- Docs: engine plan progress for E1-E5; resume notes
- 5e.tools starting gear for classes and backgrounds, in the text the starting-equipment builder reads
- E2 exit tests: the determinism contract on saved characters (choice order, resolving twice, level down and up)
- E1: lossless-load gate; weapon masteries, class feats, multiclass requirements and more read from 5e.tools
- Checker: the multiclass slot table counts only classes that cast at their level (Paladin 19 / Ranger 1 uses the paladin's table)
- Spellcasting: a class prepares and learns by its own table, not the shared multiclass slots; RULES_NOPDF for big runs
- E5: old resolver removed; saved characters become a sheet regression snapshot
- E5: stable choice keys (owner + fingerprint of kind, name, level); old position keys read only when every pick fits
- E4: assignment solver for imported trainings; autofill prepares spells and skips what it has by concept
- E3: typed effects table for prose-only mechanics; feature attacks; magic weapons
- Docs: engine progress (E2 closed, E3 started), resume notes; twin keys cached
- E3: checker reads parts, not names; 5e.tools subclass casting; FastCharacter importer and run
- E3 start: mechanics table from Aurora twins; requirements judged by concept
- Content: one book identity across providers, 5e.tools _copy resolved, every proficiency field read, post-import audit
- Engine: settle mutual exclusions in one walk, changeable choices use the current filter, memoize per-walk lookups (10x faster)
- Every choice has a 'Show the whole list' override: every element of its kind, without the choice's filter or the book filters, offered prominently when nothing can be chosen (the 2024 filter case); the rules check still flags an illegal pick
- Timeline becomes the app's resolver (old one kept as resolveLegacy for the differential tests); autofill builds level by level against the character at each level (random level-20 build: 10.2 s -> 1.9 s); stat dictionary with a to-wire list (809 names: 3 unknown, all UA); 2014 Fast Movement and Unarmored Movement now add their speed (innate speed:misc was never read)
- Timeline: settled levels cached by the character apart from its choices, the previous level and the choices that level read (one change: 8.8 ms vs 5.3 ms old; cold 71 ms)
- E2 start: timeline resolver (level by level, choices judged at the level they open; changeable choices at the current level), provenance chains so '!X' means X from elsewhere (ends requirement loops), [character:X] uses the total level; differential test against the old resolver (300 characters: identical sheets, the only differences are Epic Boons the old engine let through before level 19)
- Engine plan (docs/ENGINE-PLAN.md): critique of the architecture plan and the master plan for a deterministic engine. E1 start: canonical concepts (skills, saves, armor, weapons, tools, languages, senses, sizes) shared by Aurora and 5e.tools, IR types, loader with stable choice keys; on the real content 0 dangling references, 0 unmapped concepts. 5e.tools names lose leftover markup.
- Finesse ranged weapons (darts) use the better of Strength and Dexterity; Second Wind's move is half your Speed (content fix, also applied to the sheet copies of the text)
- 5e.tools species: lineages, legacies and ancestries from _versions (template versions expanded), resistances and immunities, replaced traits left out of the base; atlas lists every 5e.tools field the converter never reads
- Resume note: lineages from 5e.tools in progress, filters next, then the audit plan
- Build board: the card back is bigger and taller (up to 860 x 900, 92% of the window height)
- Atlas of the content (phase A); 5e.tools conversion: 2014 classes keep their subclasses (distinct ids per class version), optional features findable (no element without setters), spell choice filters translated (;->||, school), category feat choices, feat variants, elemental languages to Primordial; Medium Armor Master's Dex cap; spell attack bonus name
- Audit plan: decisions on sheets, the Etsy kids sheet, content scope, cards
- Plan: full audit of character creation (every option, every sheet, wild shapes)
- 5e.tools species: a choice of size where the species allows several (Dhampir: Small or Medium); Common and two languages where the species lists none
- Prompt for checking an exported character against the rules; resume note
- Sheets: prepared spells of whole-list casters reach the sheets; chosen hidden class options (Divine Order) show; one sign in filled text (1d8+4, not 1d8++4); Crossbow Expert drops Loading; feat-offering background feature not listed as a feat; no repeated versatile; notes print on DLDM page 2A Content: 5e.tools sizes get their own ids and converted entries never replace other content (2024 Aasimar size choice); the same item from another book counts as already in the pack (one Traveler's Clothes) Plan: docs/PLAN-windows.md
- Options tier: the scan cache follows only the code that decides what is offered
- Options tier: picks a swap made illegal are picked again; clearer counts. Light Domain name alias matches
- Resume note: v0.17.0 out; what is left
- Options tier: scan results cached per saved character, and five parts side by side
- Rules check prints rough progress per group every 30 seconds

## v0.17.0 (2026-10-16)

- Rules check runs its test groups side by side; release runs the full coverage check only Monday to Thursday, 9 to 17
- Jotun Resilience adds sorcerer level to HP (content fix); AC check: heavy armor ignores a negative Dex
- Rules: a default already had elsewhere opens the choice (Battle Smith tools); Iron Mind Int/Cha saves; 2024 Improved Flare name; options tier keeps prerequisites
- Test build: a switch to hide the test controls (bar button, menu, Settings); options-never-picked rules tier
- Rules check: a repeated proficiency only counts when something new was left to pick (Weapon Master for a Fighter)
- Resume note: v0.17.0 blocked on Weapon Master repeat picks
- Sheets: Unarmed Strike stays on the weapons list when weapons are listed from the pack
- DeepSeek translation back in (allowed); Higgsfield portraits stay declined: no AI-generated images
- No generative AI in Soul Forge: DeepSeek translation removed; Higgsfield portraits declined
- Linux and GitHub issue fixes, Report a bug, species symbols, DeepSeek translation
- Species and backgrounds wear emblems like classes; the spellbook stays in view while choosing; finished choices slide to the bottom; arrow buttons keep their outline
- Deleting a character (and a homebrew or journal entry) asks first in the app's own dialog
- Cards: spell scrolls say Cantrip or Level N; items as small cards with a category badge (Weapon, Armor, Gear, Tool, Pack, Focus, or a magic item's rarity); other cards title with the full name, no lettered seal

## v0.16.0 (2026-10-15)

- Choices every option of which the rules rule out ask for nothing: never filled with a blocked option, never counted as left to do or as a mistake
- Lists as cards: small two-column cards for species, class and background; spell scrolls under level headings; type icons in the item list
- Home: saved characters as cards with the class emblem and colour, portrait, level, species, classes, background, HP, AC, speed and top scores

## v0.15.0 (2026-10-15)

- Background tables (2014 personality traits, ideals, bonds and flaws) can be rolled on, shown in the dice log
- Build board: search box never cut off in the lists; to-choose pill only on filled cards; one Done on a card's back
- Build board: picks turn over to their back for their choices; prepared spells on the spellbook's back; score methods keep their own numbers; main abilities outlined
- Build board: a redrawn spellbook and backpack
- Build board: quicker landings with a flash; choices left beside the title; counts on the cards; starting gear in the left list
- Build board on narrow windows: the lists and the scores wait at the window edges and open as floating panels over the cards
- Build board: Hearthstone-style landings, with a flourish of its own for each class
- Build board: cards size their title, art and buttons to their own width, so the narrow bottom row is shorter and nothing overflows its frame
- Build board: one source button per card that unfolds the other books on hover; source left and buttons right on every card; class Edit with a Change base class / Add multiclass switch; spellbook card shows only spells chosen; saving throws tagged SAVE
- Build board: a nicer backpack; the spellbook counts only spells picked and prepared; manual scores roll from the number; no sideways scroll in the scores
- Imports: the report stays with the character behind an Import notes button on Build, with Add to notes
- Build board: Learn more and Remove as icons in each card's corner; HP and hit dice bars beside the portrait; tutorial step for which rules to show
- Test build: never offers updates, so it is not replaced by the released app

## v0.14.0 (2026-10-15)

- Code guide for people reading or auditing the code (docs/CODE-GUIDE.md), linked from the README
- Build board is the default Build layout; the older tabs are a choice in Settings

## v0.13.0 (2026-10-14)

- Sheets: feats the content keeps off the sheet (Skilled and others) still appear by name in the feats list
- Build board: calmer, more arcane animations
- DLDM export: every check box starts clear, so boxes the blank sheet came with ticked (attunement 6 to 10) are not left ticked on pages that are not filled
- Build board: counts include every choice a species, class or background asks (languages too); the scores panel lists what is left, each a shortcut to it
- Build board: the class card can change or remove the starting class
- Build board: the flying card grows in size instead of stretching, so its name keeps its shape
- Top bar: Play and Export as their own tabs when the build board is on
- Build board: all three columns or the three tabs, no two-column step between (tabs below 1250 px)
- Tutorial: explains the build board when it is the layout in use
- Build board: a still-to-choose list under the closed lists; a shorter background card; a wider scores column

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
