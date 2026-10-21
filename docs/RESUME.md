# Where we left off (2026-10-17, usage running out)

The big picture: docs/PLAN-audit.md (the full audit of character creation, phases A-I; partly Slovak, the user now
prefers English). Older plan: docs/PLAN-windows.md (windows, filters, lore). Decisions on scope are at the end of
PLAN-audit.md.

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
