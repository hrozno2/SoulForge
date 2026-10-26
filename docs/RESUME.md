# Where we left off

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

### Questions for Chris
- A2.3: shop price multiplier per character or an app setting, and the selling price rule (half at 1.0?).


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
