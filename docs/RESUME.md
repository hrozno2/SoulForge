# Where we left off

## 2026-10-28 night: C6 fixes and v0.22.0 (Chris: fixes, engine and stability first; up to 80% weekly usage tonight)

Done: C6.1 resize no longer selects text, "i" opens floating entries; C6.2 ability boxes (+1 columns only, doubled =
+2), fixed choices go to "things you get"; C6.3 window frame (Done, double-click shrink, Focus with blur, partly off
screen with the bar kept, drop on the bag); C6.5 always-prepared marks with the source (grantSource) on cards and in
brackets on sheets; C6.7 themed spell scrolls with a token guard (themeTokens.test). Engine: spellChoicePools (one
spell list per class), selling one to one, settlePending/choosePending (open items picked in the gear box).
v0.22.0 released after a full check (first run caught an importer regression from the spell pools: fixed with a
one-step relocation in place(), import baseline rewritten for Zanna's improvement). After it, the rest of C6: the one
print setting (SpellScope), fold slide (Fold), sticky spellbook (no second scroll box in a window, e2e guard), window
flights and the leather bag, spell pages and gear flying in (flyInto). C6 is complete; next release v0.23.0.

## 2026-10-28 morning: v0.20.0 and v0.21.0

v0.20.0 (08:54): everything up to the class-improvement feat list. v0.21.0: C4 floating cards and the Bag of Holding
(Chris's answers in docs/C4-DESIGN.md), C5.7 system specs and the NVIDIA fast-drawing switch (CachyOS, NVIDIA driver:
ask Chris to try it and send a bug report's system part), C5.8 library export on Home, and Plutonium cross-checks
(languages from a list, standard subrace by default, proficiencies from feature text, signed Foundry values). Both
releases after a full check with every gate passed. C1.7: keep watching the launch animation and fix what turns up.
Lesson: a git worktree with a symlinked node_modules commits the link unless .gitignore says "node_modules" (now so).

## Night of 2026-10-27 to 28 (Chris: "keep going with the plan into the night as far as you can get")

New standing rule: a Plutonium analysis is the first step of every feature (memory soulforge-plutonium-reference);
copy its behaviour and rules facts, never its code (UNLICENSED). Decisions: shop multiplier per character; Drakim keeps
Soul Forge's Orc (both builds are rules legal); older-build characters get a notice when something no longer lines up.

Done, each committed and pushed (last: see git log), Soul Forge Test rebuilt after each:
- A2.3 shop money (src/aurora/shop.ts) and C3 the shop on the backpack card; rarity prices and Plutonium's coin rule.
- A2.13 older-build notice (src/aurora/olderBuild.ts, `checkedWith`).
- C1.0 typing lag (src/ui/TextField.tsx), C1.0b character cards, C1.1 See options on narrow windows, C1.2 deselect
  never folds, C1.3 Kind switch for mixed proficiency choices, C1.4 personality switch on the list layout, C1.5
  spellbook and backpack switches, C1.6 cards drawn once content is in.
- C2 navigation clean-up, all seven steps. C5.1 tutorial and settings text, C5.2 checked, C5.3 form cards in Play.
- Full check (run on the evening's code): two gates failed and are fixed: old-key saves lost a +1 (upgradePlusTwo now
  reads "<id>|<index>" keys), and the edition gate missed the Origin Feat bridge (one predicate,
  `offeredAcrossEditions`). Both gates pass now.

Later the same night: C5.3's PDF form cards, C5.5 (every creation path tested; the browser run, docs/BROWSER-RUN.md;
it found repeated spells in the test content: rules check now flags a spell learned twice), C5.6 measured (8 to 15 ms,
left for Linux numbers), the C4 design pass (docs/C4-DESIGN.md).
Then A0.1 (Plutonium cross-checks): 2014 classes roll for starting gold; Magic Initiate's spell-list versions choose
their casting ability; a field sweep of the 5e.tools converter (docs/PLUTONIUM.md); features that spend another's uses
get a Use button in Play (Turn Undead spends Channel Divinity), and a sheet entry with uses but no text kept its uses.
FastCharacter import: cantrips named only in attack lines or species traits are read; a pick that repeats what the
character has from elsewhere is taken back and left open (the suite now fails on any). The machine was under heavy load
from macOS services around 04:00 (load average 37): suites that normally take a minute took ten.
Later: the rules check no longer reports a spell count short only by open picks twice; summoned companions follow
Plutonium's summon activities (5e.tools' Battle Smith gets a Steel Defender, the 2024 Beast Master chooses a beast).
Companion cards now show worked-out numbers (the Steel Defender's AC 15 and HP 2 + Int + 5 per level; formulas such as
"5 + five times your Ranger level" are read). The older-build notice groups stale picks by choice (checked on Chris's 17
saved characters: most have nothing, Waldrom's went from 29 lines to 4). Jev (TypeSafe's System One model): Chris said
skip it for now (2026-10-28).
**For the next release notes:** v0.19.0 shipped an A2.12 regression: 5e.tools subclasses lost the features their
header features refer to (e.g. the Battle Smith's Steel Defender and Battle Ready). Fixed in dc94305.
Lesson: chain test, build and commit with && (one commit, 15e5fc0, went in with a failing unit test; fixed in 045aff3).
Open, needing Chris: C4's four questions (docs/C4-DESIGN.md), C1.7 (launch animation details), C5.4 (Linux flicker
facts), UA2 (playtest article).
No release cut (none asked; releases only Mon to Thu, 9 to 17, with the full check).
An e2e run under heavy load (the preview loading all content) once took 13 minutes and failed a narrow-window test;
alone and rerun it passes. Avoid running e2e while the preview loads content.

## Overnight run, 2026-10-26 to 27 (Chris: "continue with the plan without usage restrictions ... keep going all night")

Done today: A1.1 to A1.8 (all of A1), the "Coming soon" lock for unsupported playtest content, the class proficiency
gate. Last commit at hand-off: f104bf0. Work through docs/MASTER-PLAN.md Stage A in order, from the first item not
struck through: A2.1, A2.2, (A2.3 needs Chris's decision: skip it, leave it open), A2.4 to A2.8, A3.1 to A3.3, then A4
(playtest support, docs/UA-UNSUPPORTED.md). Do not start Stage B or C, and do not cut a release.
Rules for each item:
- Fix the cause for the whole class of bug, and add a guard (a test or gate) so it cannot come back.
- After each item: unit tests (npx vitest run), the saved-sheet comparison
  (SOULFORGE_RULES=$HOME/.soulforge-test RULES_TIER=diff npx vitest run src/aurora/rules.suite.test.ts) with no
  unexplained change, scripts/test-app.sh, then commit with the trailer
  "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" and push.
- Strike the item in MASTER-PLAN.md with a "Done <date>:" note, and add a line to the log below.
- A question only Chris can answer: write it under "Questions for Chris" below and move to the next item.
- No AI-generated images; Plutonium code is read only; ask before downloads (do not download overnight).

### Do first tonight (Chris, 2026-10-26 22:20)
- **A1.9 Ability Score Improvement: +2 to one ability.** Chris: "ability score improvements should allow a +2 to one
  ability. currently i cant pick the same ability twice." The rule (PHB 2014 and 2024): increase one score by 2, or
  two scores by 1 each. Find every place an improvement is offered (class ASI features in Aurora's and 5e.tools'
  content, the 2024 Ability Score Improvement feat, the generated improvement options in registry.ts
  `improvementOptions`/`classAsiChoices`, feats with a +1 choice) and how the choice of two is built; a choice of
  two that cannot take the same ability twice is the cause. Fix it for all of them (either the same ability twice
  counts as +2, or a "+2 to one / +1 to two" option first), keep the 20 cap, and add a test that every improvement
  in the content can give +2 to one ability. Check the saved-sheet comparison afterwards.
- **A1.9, how to pick (Chris, with a Foundry screenshot):** use Foundry's check-box grid for every ability score
  increase: a row per ability the source allows, columns "+2" and "+1" (and "+1" twice where it gives +1/+1/+1), one
  box per column, and a different ability in each column. Example: "From Dexterity, Constitution, and Wisdom choose
  one ability to increase by 2 and one other ability to increase by 1." Build the engine side so one improvement is
  one choice with these slots (ability for +2, ability for +1), and the grid as the way to fill it, for species,
  backgrounds (2014 and 2024, and the 2024-rules option of A1.1), class improvements and feats. The grid is the one
  interface piece done tonight, because the fix is unusable without it.
- **A1.10 Names capitalised after an apostrophe (Chris, screenshot):** 5e.tools tool names show as "Tool Proficiency
  (Alchemist'S Supplies)", "Cook'S Utensils". The title-casing in the converter (src/aurora/fivetools.ts, `cap` or
  the name builder) starts a new word after the apostrophe. Fix it for every name it makes, and add a gate that no
  element name has a capital right after an apostrophe ("'S", "’S").
- **A2.9 Modern technology filter (Chris):** a global content filter, like the sci-fi one, for things that are not
  science fiction but modern technology (firearms such as pistols, revolvers, rifles and shotguns; the Dungeon
  Master's Guide's renaissance and modern items; modern vehicles). Engine: a "modern" tag set when the registry is
  built, from 5e.tools' item ages (as `scifi`) and shared with Aurora's items of the same name; keep "scifi" and
  "modern" apart. The switch in Settings goes with the sci-fi one (Stage C, or tonight if it is one line).
- **A2.10 Drakim, one character made in both tools (Chris, 2026-10-26 21:51).** Files in ~/.soulforge-test/drakim:
  soulforge.json (Soul Forge's save), foundry.json (made by hand in Foundry), soulforge-to-foundry.json (Soul Forge's
  Foundry export, for Chris to import into Foundry). Test: src/aurora/drakim.test.ts writes drakim/report.md. First run
  (22:40): the rules engine agrees on every number (scores, saves, skills, HP, AC, proficiency, speed). To fix: the
  Dragonborn language (Soul Forge has Orc, Foundry's actor names none, so the import leaves the choice open: check
  whether Foundry stores it elsewhere, system.traits.languages); and the export, against Foundry's own actor:
  species named with its ancestry ("Dragonborn (Blue)"), species traits and the Fighting Style choice as features
  ("Darkvision", "Damage Resistance", "Fighting Style: Interception"), subclass choices named as Foundry does
  ("Runes: Fire Rune"), class features Foundry lists that the export misses (Bonus Proficiencies, Giant's Might,
  Extra Attack, Tactical Shift), item types as dnd5e has them (consumable, container, tool, equipment instead of
  loot) and the packs unpacked as Foundry does, the Unarmed Strike weapon. Then make the test strict (expect the
  report empty, with a short accepted list for real differences) so it guards the exporter and importer.
- Also open: the comparison run of 21:00 failed "levelling up five characters" (A2.1/A2.2 code). Rerun it on the
  current code first; if it still fails, find the cause before A1.9.

### Overnight log
- 2026-10-26 20:40: hand-off from the evening session; next item A2.1.
- 2026-10-26 21:30: A2.1 and A2.2 done (one rule for ready spells, card scope option, guard src/pdf/spellScope.test.ts).
- 2026-10-26 21:30: A2.4 in progress. New guard src/aurora/foundryRoundTrip.test.ts (24 random characters exported to
  Foundry and imported back; nothing lost, nothing added). Done: exported items carry flags.soulforge.id and the
  importer uses it for class, subclass, species (with lineages), background and feats; species named with the lineage;
  dnd5e school keys (transmutation "trs"); spell preparation; class identifiers; class/species/background features
  with uses. Importer fix: a prepared spell on a whole-list class (cleric, druid, paladin) is no longer added by hand.
  Left (the test still fails on these 4): two Artificers get an extra prepared spell added by hand (Dragon's Breath,
  Catapult: check whether the artificer line counts as a whole-list caster and the spell's list tags), and a
  Sorcerer 7 swaps Color Spray for Detect Magic. Then the saved-sheet comparison, strike A2.4, commit.
- 2026-10-26 22:15: the 4 round-trip differences fixed: a spell is on a class list by name across books (Princes of the
  Apocalypse's Catapult lacks the Artificer tag); exported spells carry dnd5e's sourceItem (the feature that chose
  them) and are placed first; a feat's own choices travel with it (flags.soulforge.choices: Magic Initiate's list);
  flagged elements are placed exactly (`exactId`). Round trip: 0 lost, 0 added. Full checks were started at 22:15;
  if this line is the last, rerun them (unit tests, RULES_TIER=diff, fastchar, the content tests), then strike A2.4.

- 2026-10-26 22:45: the full checks of 22:15 showed six imported characters losing spells. Two causes, both fixed
  but not yet confirmed by the comparison: spells a file prepares beyond the limit are kept as added by hand again
  (they were cut), and the "on the class list by name" rule applies only to spells the file marks prepared (Roll20
  sheets mark none). Rerun `-t "imported characters"` first: the six must match the baseline.

- 2026-10-26 23:00: recheck result: four of the six imports match the baseline again; two still lose spells
  (fvtt-Actor-aria, fvtt-Actor-mr.-smith, both Foundry paladins or half-casters with prepared spells). Round trip
  still 0. Start tonight with these two: compare their matched lists before and after commit f104bf0.

- 2026-10-27 02:59-06:00: the scheduled run started late (02:59) and worked without committing: A1.10, A2.9, the
  "levelling up five characters" fix (autofill treats a pick that makes an earlier one a repeat as a dead end), part of
  A1.9. At 06:00 Chris asked to continue here; the run was stopped and the schedule paused, its work checked and kept.
- 2026-10-27 07:00: A1.9 done with the check-box grid; A2.4 round trip clean again (Mystic Arcanum and Book of
  Ancient Secrets spells, every pick of a class's, species' and background's choices carried by id, prepared count);
  the two imports (Aria, Mr. Smith) fixed (one rule for which classes prepare; a prepared spell that lands nowhere is
  kept by hand). All imported characters match the saved sheets.

- 2026-10-27 07:45: released v0.19.0 (standard rules check passed; before 9:00 so no full coverage). Next: A2.10 export.

### Questions for Chris
- A2.3: shop price multiplier per character or an app setting, and the selling price rule (half at 1.0?).
- Drakim: Foundry's actor knows Giant (and Common), Soul Forge's also Orc. Which is right? (A difference between the two builds.)


**The open work is in docs/MASTER-PLAN.md (2026-10-25):** Stage A engine, Stage B tests, Stage C interface, in that
order. It merges the list below, docs/PLAN-linux-testing-and-ui.md and the open audit phases. The notes below keep
the detail and the history.


The big picture: docs/PLAN-audit.md (the full audit of character creation, phases A-I; partly Slovak, the user now
prefers English). Older plan: docs/PLAN-windows.md (windows, filters, lore). Decisions on scope are at the end of
PLAN-audit.md.

## Next: the user's list of 2026-10-23 (after v0.18.0), in order

Stopped before starting: the weekly usage reached 69% (stop rule at 70%). Do these, rebuilding Soul Forge Test after
each batch (scripts/test-app.sh), then continue with the plan, then the full check and a release.

1. Prepared casters: import the whole spellbook (every spell the class can prepare) into the character sheet.
2. Export option on every sheet: limit spell cards to prepared spells.
3. Builder: "See options" opens the list and never closes it on a second click.
4. Optional features (the take/not-take box): unchecked by default.
5. Tutorial: make sure new users load all of 5e.tools and all of Aurora; Settings explains the global filters.
6. Foundry import and export: improve them with what Plutonium does (docs/PLUTONIUM.md).
7. Mixed multi-choices (skills, tools, languages... in one choice): a type filter in the list.
8. 2014-style personality traits, ideals, bonds and flaws: one checkbox on the background that turns all four
   off and stops them counting as open choices (they are gone in 2024).
9. 2014 backgrounds: offer the standard 2024 background options (ability increases, two skills, a tool, an origin
   feat, starting equipment). A 2014 background without ability increases gets an optional feature that gives
   them and satisfies the rules check. Seen: "Origin editions mixed: Orc (2024) gives no ability score increase
   and Outlander (2014) gives none either; take the 2024 version of the background".
10. Choices: deselecting never folds a choice; it folds only when every pick is made.
11. Backpack and spellbook on the build board: clicking the icon shows or hides the inventory or the prepare-spells
    picker, with a label under each ("Inventory", "Prepare spells"); no scrolling and searching to find them.
12. Inventory changes cost or refund gold like a shop; a price multiplier setting for the shop.
13. Backpack: the "Kept in" section offers keeping items in a staff or other equipment: check whether that is a bug
    (containers only).

Then the plan (my recommendation, given 2026-10-23): H (fix list: Telekinetic printed twice, launch-animation
details, FastCharacter's 91 open choices, 3 unread UA Artificer stats), G (Wild Shape cards with adjusted stats,
Polymorph and companions, Play transform), D (class by class), E and F alongside, I (reports).

## Releases: asking users to import 5e.tools again

When the 5e.tools importer starts fetching new files, raise FIVETOOLS_IMPORT_FORMAT (src/aurora/content.ts) and add a
line to its list. On launch, a full 5e.tools import of an older format gets a popup ("Import your 5e.tools content
again", Go to Content / Later). Format 2 (this release): magic variants, lore, bestiary beasts, Foundry files.

## Flagged for later (2026-10-22)

- Launch intro (src/ui/LaunchIntro.tsx): the user sees issues with the animation, details still to collect. Known so
  far: it lagged at the burst (fixed: CSS timing, content loads after the intro); the cards fly before the rules are
  loaded, so they show plain gold until their class colours arrive; with several characters the last card lands a
  little after 2 s.

## Next (2026-10-22, stopped at 81% of the 5-hour limit)

Plutonium analysis in docs/PLUTONIUM.md. In order:
1. (Species traits done; magic variants done: 3,730 items, all Foundry entries match.) Side data and lore matched by 5e.tools fields (name, source, class, level, subclass, species with base-species
   fallback) instead of guessed ids; magic variants apply to the items made from them.
2. A text pass for features without side data: uses from "a number of times equal to..." and attack/save/damage
   from {@damage}/{@dc}/{@hit} tags, replacing the name list in src/engine/effects.ts.
3. ~~Circle of the Moon's higher Wild Shape CR~~ done: Wild Shape's limits are statistics read by the filter.

## 2026-10-22 later: Plutonium's Foundry data, lore, wild shape, card choices

- Foundry mechanics (src/aurora/foundry.ts): the 5e.tools foundry-*.json files (what Plutonium reads) add passive
  effects, attack and save activities, limited uses ("@prof"/long rest as the usage line) and scale values
  (@scale.monk.die and the rest, as level formulas; classes keep them as `scales`). The importer fetches these files.
- Lore (src/aurora/lore.ts): 5e.tools fluff files become `lore`, shown under "Lore" in the detail and Learn views. The
  importer fetches fluff-*.json and the class/spell fluff indexes. The test cache has no fluff files yet (needs a
  download, ask first), so it is untested against real data.
- Wild Shape (src/engine/wildShape.ts): every beast (both providers) is tagged by CR and fly/swim; each Druid gets form
  choices per Known Forms step (2024 required, 2014 optional). The importer fetches the bestiary trimmed to beasts.
  Not done: Circle of the Moon's higher CR.
- Cards: choices keep their order and fold when done; optional and variant choices have a box to not take them
  (`Character.declined`, the slot becomes optional).
- The saved-sheet snapshot keys include the run folder (same file names in every run collided).

## 2026-10-22: editions, optional class features, choice-window checks (docs/ENGINE-PLAN.md)

- Audits: `RULES_TIER=editions` (gate), `RULES_TIER=aurora`, `RULES_TIER=diff`, `parity`, `fastchar`; the window
  check runs inside every rules-check character.
- The test app's window says TESTING (scripts/test-app.sh).
- Open: a nightly run (the plan's last exit test) is not scheduled.

## 2026-10-21: engine plan E1-E5 done except the items in docs/ENGINE-PLAN.md "Not done, by decision"

- Test app rebuilt at 0092c2e (rebuild again for the later commits: scripts/test-app.sh).
- Big runs: `RULES_BIG=n RULES_NOPDF=1` (1,000 in about 90 s). 1,000: 999 clean (checker fixed).
- Audits: `RULES_TIER=diff` (sheet snapshot + determinism), `parity`, `fastchar`; the lossless gate runs with the
  loader test.
- Import snapshots: accept the 4 reviewed changes with `IMPORT_BASELINE=1` on the next builds run.

## 2026-10-20 evening: engine E2 closed, E3 started (see docs/ENGINE-PLAN.md, Progress)

- Pushed: e495404, a7fda37, 50b8f38, 4cb1c55 (and the twin-key cache in the next commit).
- Rules check (standard, seed 7777): reference, elements, random, level 20 pass. Builds fails only on 4 import
  snapshot changes, all reviewed as fine: 2 imports now fill their infusions, 2 lose an empty casting line.
  Accept them with `IMPORT_BASELINE=1` on the next run.
- Audits to rerun after content changes: `RULES_TIER=parity`, `RULES_TIER=fastchar`, `RULES_TIER=diff`.
- Next: E3 (feature attacks, one calculator module), E4 (solvers with lookahead), E5 (choice-key migration,
  old resolver removed). The test app has not been rebuilt since 8d67b4a.

## Done today (all pushed to main)
- Atlas of the content: `RULES_TIER=atlas SOULFORGE_RULES=~/.soulforge-test npx vitest run src/aurora/atlas.test.ts`
  -> docs/atlas/summary.md and ~/.soulforge-test/atlas/atlas.json. Dead references 162 -> 0, duplicate ids 173 -> 0.
- 5e.tools conversion fixes: 2014 classes keep subclasses; optional features findable; spell-choice filters; category
  feat choices; feat variants; Auran/Terran -> Primordial; size choice; Common + 2 languages where none listed.
- Medium Armor Master Dex cap; 5e.tools spell attack bonus name.
- Card back on the build board: up to 860 x 900, 92% of the window height (checked in the preview).
- Kids' sheet in Slovak with wild shape cards for Xelinora, and Elisabeth (files were given to the user; the
  generators are in the session scratchpad, not the repo: slovak.py, make-sk.cjs, xelinora.html, style.css).

## Done after the first note
- Lineages from 5e.tools `_versions`: every one of the 17 species gets a required choice, Dragonborn colours
  expanded from the template, and the base species no longer keeps the traits a lineage replaces.
- Species, subraces and lineages get their damage resistances and immunities, and condition immunities.
- The atlas has a new "5e.tools fields the converter never reads" section in docs/atlas/summary.md. This is the
  systemic guard for the whole class of "converter silently drops data" bugs.

## Next: close the field gaps the atlas lists, rules first
- Backgrounds: toolProficiencies, startingEquipment.
- Feats: savingThrowProficiencies (Resilient), toolProficiencies, armorProficiencies,
  skillToolLanguageProficiencies, bonusSenses.
- Classes: itemMasteries / itemMasteriesProgression (2024 weapon mastery), featProgression (fighting-style feats),
  startingEquipment, primaryAbility.
- Species and subraces: toolProficiencies, armorProficiencies, blindsight, `overwrite` (a subrace replaces base
  traits).
- Base items: mastery and firearm data.
- Items: bonusSpellSaveDc, modifySpeed, grantsProficiency, grantsLanguage, charges, attachedSpells.
- Spells: the tags (damageInflict, conditionInflict, savingThrow, areaTags, spellAttack, abilityCheck, miscTags,
  affectsCreatureType) feed the 5e.tools-style filters; scalingLevelDice.

Every field either gets converted or is marked display-only in the atlas's IGNORED list, with the reason.

## Earlier in progress: species lineages from 5e.tools (`_versions`) (now done)
17 species in 5e.tools keep their lineage choice in `_versions`, which the converter ignores, so there is no
choice at all:
- XPHB Elf (Drow, High Elf, Wood Elf), XPHB Gnome, XPHB Goliath (6 giant ancestries), XPHB Tiefling (3 legacies),
  XPHB Dragonborn;
- FTD Dragonborn (Chromatic, Gem, Metallic), MPMM Aasimar, Kobold and Shifter, EFA Shifter, TCE Custom Lineage;
- PSK Aetherborn; LFL Elf, Faerie and Kithkin.

Plan: in convertRace (src/aurora/fivetools.ts), for each version:
1. Merge the version into the base: plain fields override; `_mod.entries` uses replaceArr, appendArr, insertArr and
   removeArr.
2. Convert the merged object.
3. Keep, as a "Sub Race" option of the base (`supports: 5et version of <race id>`, required), only the rules and
   traits that differ from the base.

Then re-run the species audit (a probe that resolves every species and lists its subrace and lineage choices with
option counts; the 2014 5e.tools Elf's subrace is marked optional and should probably be required).

## Next, in order
1. Finish the lineages, re-run the atlas and the unit tests, push.
2. 5e.tools filters in our lists (the user asked: the filter sources are in
   scratchpad/5etf/*.js, from github.com/5etools-mirror-3/5etools-src/js/filter-*.js).
   - Our facets: src/aurora/facets.ts.
   - 5e.tools filter headers per page:
     - Species: Size, Ability Scores, Base Species, Speed, Traits, Damage, Languages, Creature Type, Adult Age, Misc.
     - Backgrounds: Ability Scores, Prerequisite, Other Benefits, Feats, Misc.
     - Feats: Category, Ability Bonus, Level, Prerequisite, Benefits, Damage, Misc.
     - Spells: Classes (incl. optional/variant), Subclass, Level, Species, Background, Feat, Other Option, Components
       & Misc, Group, School, Subschool, Damage Type, Conditions Inflicted, Spell Attack, Saving Throw, Ability
       Check, Cast Time, Duration, Range, Area Style, Affects Creature Types.
     - Items: Type, Property, Category, Weight, Spellcasting Focus, Weapon Damage Type and Dice, Armor Class,
       Range, Poison Type, Mastery, Tier, Attached Spells, Rarity, Attunement, Bonus, Recharge, Base Item, Damage.
     - Classes: Primary Ability, Feature Level.
     - Optional features: Feature Type, Pact Boon, Patron, Spell, Feature, Level, Prerequisite.
     - Bestiary (for wild shapes): CR, Size, Speeds, ability scores, AC, HP, Type, Senses, Skills, Saves,
       Environment, damage and conditions.

     Build the same facets from our elements' data (rules, setters, supports).
3. Then continue PLAN-audit.md: phase A (unreachable elements via character-dependent choices; companion stats
   the app never reads: companion:ac and speeds), B (rules check), C (every option built), D-I.
4. Still open from before: the 2024 filter hides shared basics (PLAN-windows 9); double ability increases with mixed
   content (11); random characters never prepare spells.

To check a player's sheet with another AI: docs/PROMPT-sheet-check.md.
