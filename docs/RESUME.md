# Where we left off (2026-10-17, usage running out)

The big picture: docs/PLAN-audit.md (the full audit of character creation, phases A-I; partly Slovak, the user now
prefers English). Older plan: docs/PLAN-windows.md (windows, filters, lore). Decisions on scope are at the end of
PLAN-audit.md.

## Done today (all pushed to main)
- Atlas of the content: `RULES_TIER=atlas SOULFORGE_RULES=~/.soulforge-test npx vitest run src/aurora/atlas.test.ts`
  -> docs/atlas/summary.md and ~/.soulforge-test/atlas/atlas.json. Dead references 162 -> 0, duplicate ids 173 -> 0.
- 5e.tools conversion fixes: 2014 classes keep subclasses; optional features findable; spell-choice filters; category
  feat choices; feat variants; Auran/Terran -> Primordial; size choice; Common + 2 languages where none listed.
- Medium Armor Master Dex cap; 5e.tools spell attack bonus name.
- Card back on the build board: up to 860 x 900, 92% of the window height (checked in the preview).
- Kids' sheet in Slovak with wild shape cards for Xelinora, and Elisabeth (files were given to the user; the
  generators are in the session scratchpad, not the repo: slovak.py, make-sk.cjs, xelinora.html, style.css).

## In progress: species lineages from 5e.tools (`_versions`)
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
