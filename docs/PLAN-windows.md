# Plan: floating windows, cross-referencing, and content sources (2026-10-16)

Planning only. Nothing here is built yet.

## 1. Are the Aurora files redundant if we import all of 5e.tools?

No. They do different jobs.

- **Aurora files are rules data.** Besides the text, each element says what it does to the character: 5,279 stat
  changes, 7,135 grants and 2,900 choices across the content. Jack of All Trades, for example, is written as
  "add half proficiency to initiative and to every skill you are not proficient in". The engine reads that, and
  that is how the sheet's numbers, the choices on the cards and the rules check work.
- **5e.tools data is mostly text with some structured fields.** It has structured proficiencies, speeds, ability
  bonuses, spell tables, granted spells and optional feature counts (fighting styles, invocations). Most class
  and subclass features (Unarmored Defense, Jack of All Trades, Draconic Resilience, Remarkable Athlete) are prose
  only. Our converter (src/aurora/fivetools.ts) turns the structured parts into 17 kinds of choices and 25 kinds of
  stat changes; everything else stays description text the engine cannot act on.

Replacing Aurora with 5e.tools would mean writing the mechanics of every feature by hand, which amounts to rebuilding
the Aurora files.

Recommendation: keep Aurora as the rules source, and keep 5e.tools for what it is good at:
- checking the rules (already done: class features, spell lists, feat prerequisites);
- reading text;
- adding content Aurora does not have, marked "rules not automated" where only text came across.

A deeper 5e.tools import (resistances, more granted spells, more choices) is possible later, but it adds to Aurora
rather than replacing it.

**Plutonium as a base (checked 2026-10-16): no.** Plutonium's mechanics live in the foundry*.json files next to the
5e.tools data. They are patches for Foundry's D&D 5e system, not a rules model of their own:
- Effects (rules that change numbers) on 50 of 171 class features, 101 of 442 subclass features, 51 of 84 feats
  (5e.tools has 305 feats) and none of the 11 species listed.
- Many effects are only a switch for logic in Foundry's own code, for example `flags.dnd5e.jackOfAllTrades: true`.
  Unarmored Defense has no effect at all: it relies on Foundry's built-in version.
- "Activities" (attacks, saves, uses per rest) cover more ground (297 subclass features), but they are for play at
  the table, not for building a character.

Using it as the base would mean rebuilding the logic of Foundry's 5e system behind every switch. That is the same
work as writing the mechanics ourselves, with Aurora's 5,279 stat rules left behind.

Worth taking from it later: activities, to fill the Play tab's attacks, saves and uses for 5e.tools entries.

## 2. Tooltips inside a card show behind the open card

Cause: the open card sits in its own layer (it is transformed and flipped), and the tooltip is drawn inside the
lists, underneath it.

Fix: draw every tooltip in one layer above everything else (a portal at the end of the page), placed from the
line it belongs to. This fixes every tooltip at once, not just the ones on cards.

## 3. Several cards open at once (up to 5), minimizable

Goal: cross-referencing, for example two classes, or a class, a species and a background open side by side.

- A card opens as a window on the board. Opening another one does not close the first.
- Each card has minimize and close. Minimized cards sit in a tray along the bottom edge (name and emblem) and
  open again with a click.
- At most 5 open (minimized ones count). A 6th asks which one to close, or closes the oldest minimized one.
- Positions and minimized state are kept for the session.

Decision needed: **can more than one card be in edit mode at once?** Edit mode has its own undo (the × that puts
things back). Recommendation: any number of cards can be open for reading, but only one is edited at a time;
starting an edit on another card asks you to finish or undo the first.

## 4. Skills show the ability they use

Wherever a skill is listed: "Athletics (STR)", "Stealth (DEX)". That covers the choices on the cards, the stats
panel, the Build lists, Play and the sheet preview. The printed sheets already show it.

Custom skills and tools that use a set ability get the same treatment. A tool shows no ability, since the
ability depends on the check.

## 5. Floating info windows for compendium results and every tooltip

Bug: clicking a compendium search result does nothing. Likely cause: the results list closes on mouse-down
before the click lands. To be confirmed when fixing.

New behavior, like 5e.tools:
- Clicking a search result, or any "i" or tooltip link, opens the entry in a **floating window**.
- Windows can be **dragged**, **minimized**, **closed**, and **added to the tabs** (pinned into the window tray, so
  you can come back to it).
- Any number of info windows can be open. They stack, with the last clicked on top.
- Links inside a window (a spell named in a feature, a condition) open their own window.

One window system serves both info windows and cards (point 3), so they behave the same. Cards keep their limit
of 5; info windows have none.

Decision needed: **what "add to the tabs" means.** My reading is a tray of pinned windows along the bottom edge,
which survive closing and reopening the app. The other option is a tab inside the main tab bar (Build, Play...).

## 6. Finished sections stay in place, folded

Today a finished choice list moves to the bottom of the card, which is confusing.

New behavior: the order never changes. A finished section folds to its title line with a ✓ and its pick ("Fighting
Style ✓ Archery"); click to unfold. Open sections stay unfolded.

## 7. The 5e.tools import brings lore and the info panel too

Decided 2026-10-16: keep the Aurora files as the rules source, and make the 5e.tools import fuller.

Today the import reads only the rules files (races.json, feats.json, backgrounds.json, the class and spell
folders). It skips the fluff files, where the lore lives, and gives a class a one-line description ("Fighter, from
Player's Handbook. Hit die d10.").

What changes:
- **Lore.** The import also reads the matching fluff files (fluff-races.json, fluff-backgrounds.json,
  fluff-feats.json, class/fluff-class-*.json, fluff-items.json, spells/fluff-spells-*.json and the others). Their
  text and pictures go with the entry, in a Lore section of its own.
- **The info panel.** Each entry gets the summary block 5e.tools shows at the top: source and page, prerequisites,
  ability scores, size, speed, creature type, hit die, saving throws, proficiencies, spellcasting ability, and
  casting time, range, components and duration for a spell. It is built from the structured fields, so it is
  correct even where the rules text is prose.
- **Where it shows.** Both appear in the info windows (point 5) and on the card fronts: the info panel at the top,
  the rules text, then Lore folded underneath.
- **Lore for Aurora entries.** When a 5e.tools address is set up, an Aurora entry with the same name and book gets
  the 5e.tools lore and pictures too. Only these are added; Aurora's rules and rules text stay as they are.
- **Nothing is bundled.** Lore and pictures are read from the address or files the player supplies, the same as
  today. Pictures are fetched when an entry is first shown and kept in the local cache, and a setting turns them off.

Tests: the converter tests gain fluff cases (text, pictures, a missing fluff file, an entry that only has fluff),
and the info panel is checked against a few known entries (Fighter, Elf, Fireball, Sage).

## 8. Test against all of 5e.tools

Gap: the rules tests build characters from the Aurora files only. From 5e.tools the test cache holds only reference
data (class features, spell lists, feat prerequisites) used to check Aurora characters. Content imported from
5e.tools is covered by 12 converter unit tests on small samples, and has never been built into characters at scale.

What changes:
- **The cache gets the whole 5e.tools data folder** (5etools-mirror-3/5etools-src, data/), pinned to one commit
  in scripts/content-pin.json like the Aurora files, so a change upstream never changes a test result on its own.
  It goes to the test cache only and is never bundled.
- **A conversion check:** every entry of every kind converts without an error, no {@tag} is left unread in the
  text, every choice has options, every reference points at something that exists, and no two entries share an
  id. The report also counts the entries that came across as text only (no rules the engine can act on), by kind,
  so the gaps are visible.
- **Characters from 5e.tools content:** the same rules runs as for Aurora, with a registry built from 5e.tools
  alone:
  - a random batch;
  - level 20 in every class;
  - every element on its own;
  - level-ups and second classes;
  - the coverage and never-picked options tiers;
  - every sheet export.
- **Mixed content:** Aurora and 5e.tools loaded together, which is what a player who adds both gets. This checks
  that duplicates (the same Fireball from both) do not double up spells, feats or choices.
- **The import path itself:** the picker and the importer, run against the pinned folder from local files, the
  way a player's address would be read.
- **Known gaps don't fail the run at first.** Class features that are prose only in 5e.tools will show up as
  "class feature missing" and similar. These go into a baseline file (like the imported-characters baseline). A
  run fails on anything new, and each fix to the converter shrinks the baseline.
- **Its own group in rules-check.mjs,** so it runs side by side with the others and shows its progress.

**Two ways to get the content, both used** (the user loaded all of 5e.tools into the app on 2026-10-16, so the
earlier test results only hold for Aurora-only content and testing has to be redone):
- **Pinned copy in the test cache**, as above. Repeatable, and what the release check uses.
- **What the player actually loaded**, through the app's self-test hook (SOULFORGE_SELFTEST, src/selftest.ts): a
  script starts the real app, which runs the rules checks on its own content and writes the report, then quits.
  Content imported into the app lives in its WebKit storage and cannot be read from outside, so this is the way to
  test exactly that mix. The self-test builds its characters in memory and saves nothing, so the player's own
  characters and settings are untouched. Script: `npm run selftest-rules`, report in the test cache's runs folder.

What gets redone with 5e.tools in:
- the standard groups;
- the full coverage tier;
- the never-picked options tier;
- the 300-character random batch;
- every sheet export.

Each is run on 5e.tools alone, on Aurora with 5e.tools, and on the player's own content through the self-test.

This should come first: it tests a part players can already use, and steps 4 (lore) and 7 change the importer, so
they need these tests in place.

## 9. Bug: the 2024-only filter hides options that choices need

Seen 2026-10-16: with the content filter on "2024", some choices could not be completed (skills and others).

Cause: the filter (`hiddenBy` and `ruleSetOf` in src/aurora/books.ts) hides every entry whose book is not a 2024
book. The basic entries all choices point to (every skill, tool, weapon proficiency and language: 155 proficiencies
and 41 languages, plus alignments and vision) come from "Aurora Legacy Essentials". That book is not a 2024 book,
so it counts as 2014 and is hidden. The Build lists (Browse.tsx) and the board (BuildBoard.tsx) use the same filter.

Fix (universal):
- A third kind of book besides 2024 and 2014: **shared** basics that belong to both rule sets (Aurora Legacy
  Essentials, Internal, and the same kinds of entries from 5e.tools). The filter never hides these.
- A safety net in every choice: if the filter would leave fewer options than the choice needs, the hidden ones show
  anyway, marked as from a hidden book. A filter can then never make a choice impossible, whatever book an option
  comes from.
- Tests: a 2024-only run of the random batch and of every element on its own, with the UI's filter applied to the
  options, checking every choice can still be completed. And a unit test that skills, tools and languages stay
  visible on 2024.

Workaround until then: set the filter to "All" while making those choices. Picks stay visible after switching back.

## 10. Filter backgrounds by what they give

Requested 2026-10-16. The background list gets filters for its bonuses, so you can find one that fits the build:
- **Ability scores** (2024 backgrounds): pick one or more abilities, for example Intelligence. The list shows the
  backgrounds that can raise all of them. Sage, for instance, raises Constitution, Intelligence and Wisdom.
- **Origin feat** (2024): pick a feat, for example Magic Initiate or Alert.
- **Skills:** pick one or more; the list shows backgrounds that give all of them.
- **Tool and language:** the same, for backgrounds that give a tool or a language. A background that lets you
  choose one ("one musical instrument", "one language") counts for every option it allows.

How:
- The filters read the background's grants, not its text: the content stores them as structured entries
  (the ability combination, for example `ABILITY_SCORE_IMPROVEMENT_COMBINATION_CON_INT_WIS`, plus the feat, skill
  and tool grants), and the 5e.tools import has the same as structured fields.
- 2014 backgrounds raise no ability scores, so the ability and feat filters leave them out when they are set. The
  skill and tool filters apply to both rule sets.
- Filters combine (Intelligence + Magic Initiate + Arcana), sit above the list beside the search and the
  2024/All switch, and show their count ("4 backgrounds"). A clear button resets them.
- Each background's mini card shows the same facts as small tags (INT CON WIS · Magic Initiate · Arcana,
  History), so you can see the match without opening it.
- This works with the shared-basics fix (9): the filters must not hide the basic entries either.

Tests: unit tests on a few known backgrounds (Sage, Soldier, Criminal 2024; Sage 2014) for every filter, and a
browser test that sets two filters and checks the list.

The same filter bar could later serve species (size, speed, darkvision, a granted spell) and feats (prerequisite,
ability raised). Not part of this step.

## 11. Bug: double ability increases when Aurora and 5e.tools content mix

Seen 2026-10-16: a Goliath got ability score increases it should not have. Likely cause, not yet confirmed on the
player's character:
- Aurora species (all three Goliaths: 2024, Monsters of the Multiverse, Volo's) give their increase only when the
  background does not. They check Aurora's marker `ID_INTERNAL_GRANTS_BACKGROUND_ASI`.
- 5e.tools backgrounds with ability increases do not set that marker. The converter (src/aurora/fivetools.ts)
  uses its own marker in the other direction: the background drops its increase when the species has one
  (`MARK_SPECIES_ASI`), and only 5e.tools species set it.
- So an Aurora species with a 5e.tools 2024 background gets both. Under the 2024 rules the background's increase
  replaces the species' one.

Fix (universal, one rule for both sources): the background's increase wins.
- 5e.tools backgrounds with ability increases grant `ID_INTERNAL_GRANTS_BACKGROUND_ASI`.
- 5e.tools species' increases get the requirement `!ID_INTERNAL_GRANTS_BACKGROUND_ASI`, like Aurora's.
- `MARK_SPECIES_ASI` is retired. Saved characters that relied on it lose nothing, because the background's
  increase takes the species' place.
- The rules check gains "Ability scores raised by both species and background", so any other pair that slips
  through is caught.
- Tests: every Aurora species with every 5e.tools background and the other way round, and all-5e.tools, each
  raising ability scores exactly once (part of the mixed-content run in 8).

## 12. Bugs found on Henka and Indigo Bones (2026-10-17)

From the player's own characters and sheets (point buy, 30-point custom budget, Aurora plus all of 5e.tools):
- **Prepared spells never reach the sheets.** For a class that prepares from its whole list (Cleric, Druid,
  Paladin, every 2024 class), the spells chosen in the app are stored in `character.prepared` and only used to
  mark spells already in the picks (src/aurora/sheet.ts). Such a class has no picks, so Henka's 10 prepared spells
  are missing from every sheet; in the "every spell" listing they show as unmarked rows. The rules tests missed it:
  generated characters never prepare spells. Fix: prepared spells join the casting line as prepared, the "every
  spell" listing marks them, and the rules check counts them against the class's limit. The random builder
  prepares spells too, so the tests cover it.
- **5e.tools content replaces Aurora's size entries.** The converter reuses Aurora's ids
  `ID_INTERNAL_RACIAL_TRAIT_SMALL` and `_MEDIUM` for its own "Size" entries. Loaded after Aurora, they replace
  Aurora's "Racial Trait" ones, so the 2024 Aasimar's size choice has no options. These are the only 2 colliding
  ids. Fix: the converter keeps its own ids. As a safety net, an entry the converter only makes as a stand-in never
  replaces one from other content.
- **173 ids appear twice within the 5e.tools conversion** (8,723 entries). Each one needs checking; part of the
  conversion check in 8.
- **Mixed starting equipment.** Henka's Hermit gear has Traveler's Clothes twice (one Aurora, one 5e.tools item for
  the same line), and the Scroll Case was not matched to any item. Fix: one item per line, preferring the item from
  the same book as the background or class.
- **"1d8++4" in Divine Spark.** A signed modifier is put after a "+" in the text. Sweep all texts for "++" and
  "+-".
- **Divine Order is not listed among the features.** The content hides it (`sheet display="false"`), so the
  chosen order (Thaumaturge) never shows. Fix: a chosen option of a hidden feature shows under its own name.
- **Crossbow Expert:** the Hand Crossbow still lists "loading"; the 2024 feat removes it.
- **"Origin Feat" shows as a feat.** The background option that swaps the background feature for an origin feat
  is listed in the Feats box. Only the chosen feat should show (Skilled).
- **Gear without gold.** Indigo took the Rogue's 100 GP option and also has about 150 GP of gear (Studded
  Leather, Hand Crossbow, Whip, bolts, Thieves' Tools) with nothing deducted. Decision needed: should adding gear
  after taking the gold option offer to pay for it?

Checked and correct: both characters' ability scores with the 30-point budget, HP, AC, saves, skills and expertise
on the re-exported sheets, attacks and masteries, spell DC and attack, slots, species traits. The first Henka
sheet (Strength 10, no History or Insight) was exported before those choices were made; the re-export is right.

## Order of work

0. The 2024 filter bug (9), the double ability increases (11), and the bugs from the player's characters (12),
   prepared spells first. About a day together. All affect play now.
0. Tests against all of 5e.tools (8), one to two days, plus fixes to whatever they find in the converter.
1. Quick fixes, about a day: the compendium click, the tooltip layer (2), skill abilities (4), and folding finished
   sections (6).
1. Background filters (10), about a day.
2. The window system, a few days: dragging, stacking, minimize, the tray, and info windows for search results and
   tooltips (5).
3. Multiple cards on top of the window system (3), with the edit rule above.
4. Lore and the info panel from 5e.tools (7), about two days. It can run alongside steps 2 and 3, since it only
   changes the importer and what a window shows.

Each step ends with the unit and browser tests, plus new browser tests for opening, minimizing and dragging.

## Questions for you

1. Edit more than one card at once, or read many and edit one?
2. "Add to the tabs": a tray of pinned windows that is kept between sessions, or tabs in the main tab bar?
3. When a 6th card opens: ask which to close, or close the oldest minimized one?
4. Should Aurora entries also show 5e.tools lore and pictures when the names match, or only entries imported from 5e.tools?
