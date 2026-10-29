# Master plan

Written 2026-10-25. The one list of open work, in the order Chris set:

1. **Stage A: engine.** Finish every engine fix and the remaining buildout first. "Engine" means everything under
   the interface: the rules engine, the converters and importers, content data, the sheet data and PDF export, saved
   character data, and the logic the interface calls (money math, starting equipment, hit points).
2. **Stage B: tests.** Prove the engine is still right before touching the interface.
3. **Stage C: interface.** Then the interface, layout and everything else.

It gathers the open items from every note: docs/RESUME.md (the list of 2026-10-23), docs/PLAN-linux-testing-and-ui.md
(Chris's CachyOS findings and interface rework, uploaded 2026-10-25), docs/PLAN-audit.md (phases D to I),
docs/PLUTONIUM.md, docs/ENGINE-PLAN.md and docs/FEATURES-LATER.md. Those files keep the detail; each item below says
where. When an item is done, strike it here and note the commit.

Working rules (unchanged): fix causes, not symptoms, and guard the whole class with a test (docs/CODE-GUIDE.md,
memory "macro fixes"); rebuild Soul Forge Test after every change (`scripts/test-app.sh`); stop and save progress near
70% of the weekly usage; the full check runs only on request; releases cut the full coverage rules check only Monday
to Thursday, 9 to 17.

**Plutonium is the base (Chris, 2026-10-27).** Chris creates characters correctly with Plutonium in Foundry in almost
every case, so it is the reference for the engine: before writing or changing how anything is routed (classes,
subclasses, features, choices, spells, items, imports, exports), read how Plutonium does it, and use it to double-check
the engine's results (a character built in both, compared field by field, as with Drakim). The module is kept on file
in ~/.soulforge-test/plutonium/mod/plutonium (source github.com/TheGiddyLimit/plutonium-next); its licence is
UNLICENSED, so it is read for behaviour and never copied. Findings go to docs/PLUTONIUM.md.

| # | Item | Source | Notes |
|---|---|---|---|
| A0.1 | Plutonium cross-check, standing: for every engine area, compare with Plutonium's routing and record differences in docs/PLUTONIUM.md; more characters built in both (like Drakim) as tests. | Chris 2026-10-27 | Ongoing; a Plutonium analysis is the first step of every feature (Chris 2026-10-27). Done so far: subclass feature references (A2.12), the shop (A2.3). Its behaviour is copied, never its code (UNLICENSED). |

---

## Stage A: engine fixes and buildout

Order inside the stage: first what makes characters wrong today, then what is missing, then the larger builds.

### A1. Wrong results on real characters (fix first)

| # | Item | Where it comes from | Notes |
|---|---|---|---|
| ~~A1.1~~ | ~~2014 backgrounds: offer the standard 2024 background options (ability increases, two skills, a tool, an origin feat, starting equipment). A 2014 background without increases gets an optional feature that gives them and satisfies the rules check ("Origin editions mixed: Orc (2024) gives no ability score increase and Outlander (2014) gives none either").~~ | RESUME #9 | Done 2026-10-26: every 2014 background has an optional "2024 rules: ability scores and origin feat" choice (src/engine/backgroundOptions.ts), off until ticked: any three abilities as +2/+1 or +1/+1/+1 and an origin feat, as the DMG 2024 Custom Background; a 2014 species then drops its own increases; the background then chooses under the 2024 rules; the rules check accepts it. The background keeps its own skills, tool or languages and equipment (they already fill those parts). Ticking an optional choice with one option takes it. |
| ~~A1.2~~ | ~~Personality traits, ideals, bonds and flaws: one switch on the background turns all four off and they stop counting as open choices (gone in 2024).~~ | RESUME #8 | Done 2026-10-26: declined tables are dropped by the engine; the switch sits at the top of the background card (shown only when it has the tables). |
| ~~A1.3~~ | ~~Optional and variant features start not taken (unchecked) by default; not taken never counts as open.~~ | RESUME #4 | Done 2026-10-26: not taken until ticked (`Character.taken`) or something is picked in it (older saves keep their picks); saved sheets unchanged. |
| ~~A1.4~~ | ~~Generic items in packs ("a musical instrument", a gaming set, artisan's tools) become an open choice instead of literal text.~~ | Linux plan 0.3 | Done 2026-10-26: unsettled kinds stay as a pending item (`InventoryItem.pending`) with a picker in the inventory (22 instruments, 4 gaming sets, 17 artisan's tools), and count as unfinished equipment. |
| ~~A1.5~~ | ~~Backpack "Kept in" offers a staff and other non-containers.~~ | RESUME #13 | Done 2026-10-26: Aurora's "container" setter names a focus group (Staff: Arcane Focus), not a container; containers are now known by 5e.tools' capacity or a volume in their text (src/aurora/containers.ts). |
| ~~A1.6~~ | ~~Telekinetic (and any feat with a feature of the same text) printed twice on the sheet.~~ | Plan H | Done 2026-10-26: a feat and the feature it grants share the name (the feat's benefits, then its shove); the sheet data merges same-named entries in a group, keeping both texts. |
| ~~A1.7~~ | ~~FastCharacter imports leave 91 required choices open.~~ | Plan H, full check | Done 2026-10-26: 91 to 72. Fixed by class of cause: "Feature: Option" bullets read (Divine Order, Blessed Strikes, Improved Elemental Fury); FastCharacter's spellings (Thamaturge, Heighten/Quicken/Extend Spell); apostrophes dropped when matching names (Melfs Acid Arrow); spells a feat names in its text (Magic Initiate); a feat the file never names is not taken to explain a spell (decision D1); the 2024 Fighter's Insight (missing from Aurora's list). Guards so these do not come back: one name key for every matcher (`nameKey`, src/engine/concepts.ts); every class's skill list aligned with 5e.tools when the registry is built; and a standing gate, every class at level 1 against its 5e.tools twin by concept (saves, armor, weapons, tools, skills, the skill choice; src/engine/classSkills.ts, CLASS_PROFICIENCY_ACCEPTED for known differences). The gate found two converter bugs, fixed: the 2024 Monk's and Rogue's "martial weapons that have the Light property" became one fake weapon instead of those weapons, and the Artificer's optional firearms were granted. The 72 left are what the file does not say: 32 wizard spellbook spells (it lists only the prepared ones), about 27 spells and trainings it lists fewer of than the rules give, 6 languages (one fewer than the 2024 rules give, every time), 3 "A or B" lines, 4 never mentioned. Its Thaumaturge sheets leave out the Wisdom bonus to Arcana and Religion (a FastCharacter mistake; 6 new differences). Left: a Lore bard's Magical Discoveries (Cantrip or Leveled Spell) is not worked out from the spells the file lists, so its Shield is added by hand and the two choices stay open (fc09); before, an Arcana Unleashed feat took it. Tests: src/aurora/fastcharImport.test.ts. |
| ~~A1.8~~ | ~~Three statistics nothing reads (Unearthed Arcana Artificer: infusions count and vanish, an armor equipment stat).~~ | Plan H, stat gate | Done 2026-10-26: listed in docs/UA-UNSUPPORTED.md (UA1 to UA3) and marked "playtest, not supported yet" so the stat gate reports 0 unknown; wired in A4. |
| ~~A1.9~~ | ~~Ability Score Improvement must allow +2 to one ability; today the same ability cannot be picked twice. Picked with Foundry's check-box grid (abilities as rows, +2 and +1 as columns), for every increase: species, backgrounds, class improvements, feats.~~ | Chris 2026-10-26 | Done 2026-10-27: a choice of two +1s whose text says "by 2, or ... by 1" (the 2024 Ability Score Improvement feat; Aurora marks its +1s "allow duplicate") becomes "+2 to one ability" / "+1 to two abilities" (registry.ts plusTwoChoices); saved two +1s move inside (engine.ts upgradePlusTwo). Every increase is drawn as Foundry's check-box grid (src/aurora/improvements.ts, src/ui/ImprovementGrid.tsx): single-ability choices of one owner, packages, fixed packages, and sets as a dropdown. Within one improvement the +2 and +1 go to different abilities (timeline.ts). Tests: plusTwo.test.ts, improvements.test.ts. |
| ~~A1.10~~ | ~~5e.tools names capitalised after an apostrophe ("Alchemist'S Supplies").~~ | Chris 2026-10-26, screenshot | Done 2026-10-27 (overnight session): the converter's title-casing no longer starts a word after an apostrophe; gate in fivetools.test.ts. |

### A2. Missing engine features

| # | Item | Where it comes from | Notes |
|---|---|---|---|
| ~~A2.1~~ | ~~Prepared casters: import the whole spellbook (every spell the class can prepare) into the character.~~ | RESUME #1 | Done 2026-10-26: the sheet's "List every spell I can prepare" already put the whole list on the spell table; the spell cards now follow too (Export: "Cards for: every spell I can prepare"). One rule for both, `readySpells` and `everySpellOf` (src/aurora/sheet.ts). |
| ~~A2.2~~ | ~~Export option on every sheet: spell cards for prepared spells only.~~ | RESUME #2 | Done 2026-10-26: spell cards for prepared spells only is the default (`spellCardScope`). Found and fixed: a caster with nothing marked prepared (a 2024 cleric's chosen spells) had them on the sheet but got no cards. Guard: src/pdf/spellScope.test.ts (table and cards name the same spells, both scopes, both editions). |
| ~~A2.3~~ | ~~Shop logic: buying and selling change coins; a price multiplier; change made in the largest coins that fit; selling price.~~ | RESUME #12, Linux plan Stage 2 | Done 2026-10-27 (src/aurora/shop.ts, shop.test.ts), checked against Plutonium's equipment shop first: the multiplier is per character (Chris: "shop multiplier per character"; Plutonium has one global setting), selling pays half the price times the multiplier (Plutonium only buys), coins are paid smallest first and change comes in the largest coins that fit (so the purse never gains a larger coin than it gave, as Plutonium keeps the coin mix). From Plutonium: magic items without a price can cost their rarity's value (2024 DMG table, base item's price on top, half for consumables), per character (`rarityPrices`); the converter now keeps a magic item's base price apart ("base cost") instead of showing a +1 Longsword at 15 gp. |
| ~~A2.4~~ | ~~Foundry import and export improved with what Plutonium does (matching by name, source, class and level; effects, activities, uses, scale values; magic variants).~~ | RESUME #6, docs/PLUTONIUM.md | Done 2026-10-27: Foundry export and import by identity. Exported items carry flags.soulforge (id, a feat's own choices, every pick in a class's, the species' and the background's choices, lineages), spells carry dnd5e's sourceItem and preparation (a spell held in a choice is ready), dnd5e school keys, class identifiers, features and optional features (invocations) with uses. The import places flagged elements exactly; prepared spells on a whole-list class are not added by hand, those over the limit are kept, spells held in choices do not count against it, two books' copies count once. Guard: foundryRoundTrip.test.ts (24 random characters, nothing lost, nothing added). |
| ~~A2.5~~ | ~~Plutonium leftovers: dice-type scale values inside damage text (the Monk's Martial Arts die in an attack).~~ | docs/PLUTONIUM.md | Done 2026-10-27: an attack whose damage is a scale-value die ("@scale.monk.die + @mod", "2@scale.monk.die", "(@scale.x.y)d8") keeps the die's count and size as level formulas (foundry.ts scaleDie), worked out on the sheet; 9 features get it (Flurry of Blows, Deflect Missiles, Empowered Strikes, Elemental Attunement, Bardic Damage, Archer). Test: scaleDice.test.ts. Matching side data by fields stays optional (everything matches). |
| ~~A2.6~~ | ~~Wild Shape, Polymorph and companion forms with the stats adjusted for the character (Moon's AC 13 + Wisdom, temporary hit points, own Intelligence, Wisdom and Charisma, own saves and skills, the improved forms' Constitution saves), and a rules check of the forms picked.~~ | Plan G | Done 2026-10-27: src/aurora/forms.ts `formStats` works out a beast form for the character: Wild Shape 2014 (beast's body, hit points and AC; own Intelligence, Wisdom, Charisma; the better skill and save bonus where proficient), Wild Shape 2024 (own hit points, temporary hit points equal to the druid level; Circle of the Moon three times that and AC at least 13 + Wisdom), Polymorph (the beast entirely), companions (the beast plus companion:ac). The forms picked are checked by the existing rule for picks that no longer meet their choice's filter (CR cap, fly, swim). Test: forms.test.ts. The cards and the Play transform are Stage C. |
| ~~A2.7~~ | ~~Report a bug writes its log to a file on disk.~~ | FEATURES-LATER, issue #4 | Done 2026-10-27: on the desktop the app's errors and warnings go to soul-forge.log in the app log folder a few seconds after they happen (src/logbook.ts); at start the last session's file becomes soul-forge.previous.log, which Report a bug offers as its own part. Capability: app log folder read, write, meta. |
| ~~A2.8~~ | ~~Lag: `resolve` runs on every keystroke in the name field (and other text fields).~~ | Linux plan 0.1 | Measured 2026-10-27: not the engine. `resolve` takes 1 to 8 ms per keystroke (random characters, levels 1 to 20; the timeline reuses earlier levels) and the sheet about 1 ms, so the lag is rendering: moved to Stage C (profile the React renders while typing in the name field; likely every tab and card re-rendering on each change). |
| ~~A2.9~~ | ~~A global filter for modern technology that is not science fiction (firearms, the DMG's renaissance and modern items, modern vehicles).~~ | Chris 2026-10-26 | Done 2026-10-27 (overnight session): 5e.tools item ages "renaissance" and "modern" give the tag "modern", "futuristic" stays "scifi"; shared with Aurora's same-named items; a Modern technology switch in Settings and the tutorial (hidden by default, as before under sci-fi). |
| ~~A2.10~~ | ~~Drakim, made by hand in Soul Forge and in Foundry: the import must give the same character and the export must carry what Foundry's actor has.~~ | Chris 2026-10-26, three files in ~/.soulforge-test/drakim | Done 2026-10-27: the export now matches Foundry's own actor for Drakim: items typed as dnd5e does (exportForeign.ts foundryItemType: weapons by category and base item, armour by weight, gear as consumable, equipment, tool, container or loot, kept in their container), every feature including those the sheet hides, Foundry's names ("Fighting Style: Interception", "Runes: Fire Rune", "Dragonborn (Blue)", straight apostrophes), senses as species features, the Unarmed Strike. The engine agrees on every number. The test is strict (src/aurora/drakim.test.ts); accepted: Chris's two builds differ in a language (Orc) and an item (Oil, 5 flasks), and 5e.tools calls Draconic Resistance "Damage Resistance". |
| ~~A2.11~~ | ~~Logs in the app for errors, rules issues and build issues, light enough not to slow it down (Chris 2026-10-27).~~ | Chris | Done 2026-10-27: src/logbook.ts `logEvent(area, message)` and `timed(area, label, fn, slowMs)` (logs only slow work); short lines in the same memory buffer as the errors (400 lines), written to soul-forge.log a few seconds later. Logged: content loading (sources, files, times, unreadable files, skill list fixes), slow character resolves (over 50 ms, with the classes), the engine's references to missing content and the rules check's findings (only when they change), rules check failures (were silent), imports (matched, not found, left open), exports (Soul Forge PDF with time and size, official sheets with their layout, Foundry actors). Test: src/logbook.test.ts. |
| ~~A2.12~~ | ~~Random characters with all content (found by the playtest audit's random run): 12 subclass features missing on published 2014 subclasses taken by 2024 classes (5e.tools copies, e.g. School of Necromancy's Undead Thralls on a 2024 Wizard), 3 spell slot counts off in mixed builds. Not playtest-specific.~~ | A4 random run, <cache>/engine/ua-random.md | Done 2026-10-27, checked against Plutonium (docs/PLUTONIUM.md): subclass features now follow the subclass's own references, as Plutonium reads them, so a 2014 subclass on a 2024 class keeps its PHB features (a feature two copies share is granted by both); only classes' spellcasting shares the multiclass slot table (a playtest Eladrin's spells made an Arcane Trickster a multiclass caster). The playtest random run has no findings left. Also from Plutonium: \"inherit\" is the ability the feature raised; XUA sources are playtest. The class proficiency gate now pairs classes by book (UA4 withdrawn: it compared the 2017 Artificer with Tasha's). |
| ~~A2.13~~ | ~~Characters from older builds: when something no longer lines up, Soul Forge says so.~~ | Chris 2026-10-27 | Done 2026-10-27 (src/aurora/olderBuild.ts, the notice in src/ui/RulesCheck.tsx): a character records the version it was last checked in (`checkedWith`); opened in another version, picks a choice no longer offers and the rules check's findings are listed once, with "Got it"; a character with nothing to report is marked silently. New, random and imported characters start checked (imports have their own report). Drakim: both builds are rules legal, so Soul Forge's (with Orc) stays as it is (Chris 2026-10-27). |

### A3. Audits that find engine mistakes (run inside Stage A, fix what they find)

| # | Item | Where it comes from |
|---|---|---|
| ~~A3.1~~ | ~~Class by class, level by level, both editions, against the rules: Bladesinging, Wild Shape and Moon, Echo Knight, Battle Smith and Steel Defender, Hexblade and Pact of the Blade, firearms, Monk unarmored defense, Jack of All Trades, expanded spell lists. One report per class in `docs/audit/`.~~ | Plan D | | Done 2026-10-27: docs/audit/class-features.md, checks in src/aurora/classAudit.test.ts. Found and fixed: Hex Warrior, Pact of the Blade and Battle Ready never changed the attack ability (now read from every feature's text, with its conditions); Gunner gave no firearms proficiency (content fix). Right already: Monk Unarmored Defense, Jack of All Trades, Bladesong (only while active), expanded spell lists. Open, with the companion cards (Stage C): the Echo Knight's echo and the Steel Defender. |
| ~~A3.2~~ | ~~Every sheet: a stored profile per sheet (WotC 2014 and 2024, DLDM 5E24 and companions, the layouts, the kids' sheet), a test that fills every field from a fully loaded character, fillable fields for printed sheets without them.~~ | Plan F | | Done 2026-10-27: docs/audit/sheets.md. Profiles are the layouts (every field, kind, page and place) with their mappers; src/sheets/sheetCoverage.test.ts fills every known sheet from the fully loaded test character and fails on an empty field with data behind it: all WotC sheets 100% (Alternative 2: 91%, the rest has no data in Soul Forge), DLDM by its own test. Fixed: the player name was never filled on the 2014 sheets; Alternative 2's next level XP and unarmored AC. Printed sheets now get the fillable version's fields (transparent), so every value stays editable. Not bundled: WotC and DLDM sheets (downloaded); the kids' sheet is personal-use only. |
| ~~A3.3~~ | ~~Every element against its 5e.tools counterpart: one report per element type with a coverage figure (the comparison already runs as a test).~~ | Plan I | | Done 2026-10-27: the parity audit writes one report per element type with a coverage figure (<cache>/engine/parity/*.md; Race 73%, Sub Race 100%, Background 75%, Class 100%, Archetype 65%, Feat 90%). Fixed what it found: 183 Foundry effects with a duration were applied permanently (Slasher's -10 speed, Bait and Switch's AC); a statistic and its ":misc" part were counted twice (Boon of Speed 60, Speedy 20); 5e.tools option progressions on feats, subclasses and options were lost (Martial Adept's maneuvers, Metamagic Adept, Fighting Initiate; test optionProgression.test.ts). Left: most "choices" differences are the providers splitting one decision into different steps (not visible on a character); the "grants" ones are 5e.tools stating in text what Aurora's copy (the one the lists show) has as data. |

### A4. Unearthed Arcana support (last engine block, before Stage B) (done 2026-10-27, see the note below)

Scope changed 2026-10-26: playtest content is in scope (it was out by the audit decision of 2026-10-17).

1. Collect every playtest file and element: Aurora's (Unearthed Arcana sources) and 5e.tools' (UA books and
   `prerelease` groups, plus their Foundry side data).
2. For each kind of element, compare how Aurora encodes it and how Plutonium imports it (docs/PLUTONIUM.md: side
   data matched by fields, mechanics read from the text), and take what each gets right, as for official content.
3. Make the checks cover it: the rules check, the edition gate (playtest has its own edition and release dates), the
   Aurora and 5e.tools comparisons, random characters with playtest content switched on.
4. Work through docs/UA-UNSUPPORTED.md (starting with UA1 to UA3) until it is empty or every item left has a reason.

Until then, anything playtest-only that a check reports goes into docs/UA-UNSUPPORTED.md instead of being hidden.

Done 2026-10-27: (1) 1,553 playtest elements from 56 Aurora books; 5e.tools' only playtest source (The Mystic Class) is now named and marked as playtest ("UA..." codes become "Unearthed Arcana: ..."). (2) Compared: the published rules reference is no longer used for playtest classes and subclasses (it matched the 2017 Artificer to Tasha's and "The Undying Light" to "The Undying"). (3) Checks cover it: the playtest audit (src/engine/uaAudit.test.ts, RULES_TIER=ua) builds all 254 playtest entries (239 clean; the 15 left need feat chains the audit does not build) and 150 random characters with playtest content (no playtest-specific findings; the rest is A2.12). Fixed on the way: 5e.tools' "inherit" spellcasting ability; the rules check no longer crashes on an unknown casting ability. (4) docs/UA-UNSUPPORTED.md: UA1 and UA3 done (granted items now go into the inventory, for any content), UA2 and UA4 need the playtest articles; "Coming soon" lifted from the 2019 Artificer and the 2018 School of Invention.

Not built, by decision (docs/ENGINE-PLAN.md): the resolver on the internal format, merging the two sources' copies,
a general effects model. Revisit only for maintainability.

---

## Stage B: tests

After Stage A (A4, playtest support, included), before any interface work:
1. `npm test`, `npx tsc --noEmit`, `npm run build`.
2. The full check on request: `node scripts/full-check.mjs [seed]` (unit tests, loader gates, the rules check,
   10,000 random characters, the edition gate, Soul Forge against Aurora, Aurora against 5e.tools, saved characters
   and determinism, FastCharacter).
3. A check on Chris's own 5e.tools data (extract it from the app's storage as on 2026-10-22) and his saved
   characters.
4. Fix anything found in Stage A terms before going on; a release can be cut here (`node scripts/release.mjs`).

---

## Stage C: interface, layout and the rest

### C1. Builder and cards

| # | Item | Where it comes from |
|---|---|---|
| ~~C1.0~~ | ~~Typing lag in the name field (A2.8 measured: the engine takes under 10 ms): profile the React renders and stop every tab and card re-rendering on each keystroke.~~ | Linux plan 0.1, A2.8 | Done 2026-10-27: measured 40 ms of main thread a keystroke (dev build), of which the engine, sheet and rules check take 3.5 ms; the rest is the board re-drawing. Every character text field (name, player, details, personality, backstory, notes, resource and companion names) is now src/ui/TextField.tsx: it keeps its own text and hands it on after 300 ms without typing, on leaving the field and when it closes, so a word costs one re-draw. Re-draws for picks themselves stay C5.6. |
| ~~C1.0b~~ | ~~Character cards on Home (Chris 2026-10-27, screenshot): first row an actual HP bar (current of max), then a small shield with the AC, then the walking speed; second row the three best ability scores (score and modifier) with a small "+" box after them; hovering the "+" brings in the other three. Replaces today's row of HP, AC, Speed and five ability boxes.~~ | Chris 2026-10-27 | Done 2026-10-27 (src/ui/StartTab.tsx CharCard): HP bar of current (as Play keeps it) over maximum, red under a quarter; AC in a small shield; speed; the three best scores with a "+" that brings in the other three over the first row on hover (the card is too narrow beside them). |
| ~~C1.1~~ | ~~"See options" opens the list and never closes it on a second click.~~ | RESUME #3 | Done 2026-10-27: on a wide window it already toggled; on a narrow one the second click closed the list but left its floating panel out, empty, over the cards. Now the panel goes with the list (BuildBoard.tsx toggleList; e2e/board.spec.ts). |
| ~~C1.2~~ | ~~Deselecting never folds a choice; it folds only when every pick is made.~~ | RESUME #10 | Done 2026-10-27: a one-pick choice folded after every click, the deselecting one too (Slots.tsx toggle); now only a click that picks folds it. Guarded by e2e/choices.spec.ts (fails on the old code). |
| ~~C1.3~~ | ~~A type filter in choices that mix skills, tools, languages and the rest.~~ | RESUME #7 | Done 2026-10-27, after Plutonium (it sorts a mixed skill, tool or language choice into its kinds): a "Kind" switch (All, Skills, Tools, Weapons, Armor, Saving throws) on the list bar of any choice whose options are of more than one kind (src/aurora/facets.ts proficiencyKind, facets marked inline; src/ui/Browse.tsx). Languages are their own choice in Soul Forge, so they never mix. Every proficiency in the test content has a kind (src/aurora/proficiencyKind.test.ts). |
| ~~C1.4~~ | ~~The take/not-take box shows unchecked by default (engine default in A1.3); the background's personality switch (A1.2); the 2014 background options (A1.1).~~ | RESUME #4, #8, #9 | Done 2026-10-27, checked on a 2014 Acolyte: the variant feature and the "2024 rules" option show unticked and "not taken"; the personality switch was only on the board's background card and is now on the list layout's Background tab too (moved to src/ui/Slots.tsx). |
| ~~C1.5~~ | ~~Backpack and spellbook on the board: clicking the icon shows or hides the inventory or prepare-spells picker, labelled "Inventory" and "Prepare spells".~~ | RESUME #11 | Done 2026-10-28: on their card backs the spellbook and the backpack are switches labelled "Prepare spells" and "Inventory": clicked, the back shows only the prepare-spells picker (src/ui/MagicTab.tsx PrepareSpells) or only the inventory, clicked again everything; the book is a switch only for characters who prepare spells. e2e/board.spec.ts covers the backpack. |
| ~~C1.6~~ | ~~Yellow placeholder cards on load: gate card drawing and the pack opening on the registry holding each card's class and species; e2e check that no card changes after landing.~~ | Linux plan 0.2, RESUME (launch intro flagged) | Done 2026-10-28: the content and its registry arrive together (useContent), so the gold cards were the ones Home drew before that, with an empty registry (no class: the default hue); seen whenever the intro was skipped or behind the pack. Home now draws the cards only once the content is in ("Loading your characters..." until then), and the pack drops them then. src/ui/StartTab.test.tsx (fails on the old code) and e2e/smoke.spec.ts (no card changes after landing). |
| C1.7 | Launch animation: sometimes slow (Chris 2026-10-29). Measured from the log: 1.3 s normally, 10 s when the 5e.tools data is converted again (8.2 s), which happened after every update and whenever the release app and Soul Forge Test took turns (the cache was keyed to the build). Now keyed to a hash of the converter's code; a rebuild says so at once on the launch screen and that later launches are faster. Done. | Chris |

### C2. Navigation and Manage clean-up (Linux plan Stage 1)

Manage and Content as two top-level tabs; Sources moves to Content; "Level and hit points" leaves Manage after a
parity check against Level up, the HP window and Play; Conditions move to a Play tab; character details move to
Build (a "Details" button by the portrait; blank details never count as an open choice); the right-hand lore panel
in Manage becomes "i" icons; favorites reorder in Play with a drop marker and move buttons.

**Done 2026-10-28** (all seven steps of the Linux plan's Stage 1): Manage and Content are two tabs; the character's
books are on Content; Manage's "Level and hit points" left after a parity check (XP editing and the hit point dialog
added to Play; the table is in commit 8f43acb); Conditions are a Play tab; character details are a dialog opened from
the board's "Details" button, Play's description, the character badge and "Open notes", and blank details never count
as a choice (the board says they are at their defaults); Manage's rows have an "i" instead of the lore panel;
favorites reorder by dragging within the row (a gold marker shows where) or with move buttons (src/ui/favOrder.ts).
Covered by e2e/smoke.spec.ts and e2e/board.spec.ts.

### C3. Backpack card with Inventory and Shop tabs (Linux plan Stage 2)

The interface on top of A2.3: Inventory (sell, custom items, quantities) and Shop (search, categories, prices with
the multiplier, buying blocked or warned when coins are short). The multiplier setting's place follows the A2.3
decision.

**Done 2026-10-28** (src/ui/Shop.tsx): the backpack's card back has a purse switch, "Shop", beside "Inventory": every
item with its price for this character (book price times the character's multiplier) at the end of its row, the
search and filters of every list, the purse, and an item locked with "Not enough coins: 25 gp" or "No price". The
inventory sells one at a time for half ("Sell · 12 gp 5 sp"). The price multiplier and "Price magic items by rarity"
sit with the coins (per character). The list layout's Equipment tab has the shop under the coins. Prices and totals
read in gold, silver and copper, and change and sale money never add platinum the purse did not have (Plutonium's
rule). e2e/board.spec.ts buys and sells.

### C4. Multiple floating cards and the Bag of Holding (Linux plan Stage 3)

Up to 10 cards open as draggable windows, minimized into a Bag of Holding (desaturated), removed one by one or
cleared with the wormhole effect; window state kept out of the character and out of `resolve`; Reduce motion
respected. **Design pass first**, shown to Chris, with his open questions answered: does "card" include the lists,
what two cards of one kind mean (multiclass or browsing), whether the layout survives a restart, touch and trackpad
dragging on Mac and Linux.

**Design pass written 2026-10-28: docs/C4-DESIGN.md** (state model, behaviour, tests, and the four questions with a
suggested answer each). Answered by Chris 2026-10-28 (docs/C4-DESIGN.md, "Chris's answers"): only board cards float, the compendium opens floating windows like 5e.tools, a second class card compares classes, a multiclass is a tab on the class card with its own style, layouts kept per character, Tidy up and Put everything in the bag. **Built 2026-10-28** (src/ui/Floating.tsx): floating windows dragged by the title bar and resized from the corner (pointer events: mouse, trackpad, touch); at most 10 open and bagged, with a message at the cap; the Bag of Holding bottom left (take out, remove one, Empty the bag with the wormhole), Tidy up, Put everything in the bag. A filled board card opens as a window (a new pick still lands through its card back, with Done and Put it back); compendium entries open as windows (the search's "⧉", Shift+Enter, or "Keep open" in an entry), which is also how classes are compared side by side; the class card has a tab per class, each multiclass a violet "Multiclass" tab. Layouts are kept per character on this computer and travel in the library file. Covered by e2e/floating.spec.ts, e2e/paths.spec.ts (multiclass tabs), e2e/board.spec.ts.

### C5. Other interface work

| # | Item | Where it comes from |
|---|---|---|
| ~~C5.1~~ | ~~Tutorial: new users load all of 5e.tools and all of Aurora; Settings explains the global filters.~~ | RESUME #5 | Done 2026-10-28: the tutorial's Aurora step adds the whole AuroraLegacy collection and says to keep every book (the filters decide what shows); its 5e.tools step asks for the whole data folder, says why, and shows whether 5e.tools data is loaded. Settings explains the filters: where they apply, that they only hide, and that a choice always keeps enough options. |
| ~~C5.2~~ | ~~Spellbook import button (A2.1) and the prepared-only spell cards switch in Export (A2.2).~~ | RESUME #1, #2 | Done (checked 2026-10-28): Export has "List every spell I can prepare" for the sheet's spell table and "Cards for: Prepared spells only / Every spell I can prepare" for the cards, both only for casters who prepare. |
| C5.3 | Wild Shape, Polymorph and companion cards like spell cards, and the transform, temporary hit points and revert in Play (on top of A2.6). | Plan G | Mostly done 2026-10-28, after Plutonium (its polymorpher picks a creature from a filtered list and applies dnd5e's transformation presets): Play's Extras shows the form worked out for the character as a card (src/ui/FormsPanel.tsx FormCard on A2.6's formStats) when a creature is picked and while the form is on: AC, hit points, temporary hit points, speed, the scores (yours for Intelligence, Wisdom and Charisma in Wild Shape), saves and skills with yours where better, and how each came about. 2024 Wild Shape keeps the character's own hit points and adds the temporary ones (no form pool, so damage never reverts it; `ownHp` in src/ui/hpModel.ts); 2014 Wild Shape and Polymorph take the form's hit points. The PDF export now prints a card for each picked Wild Shape form and each companion with the same worked-out numbers ("Wild Shape form and companion cards" in Export; src/pdf/formCards.test.ts). **Open:** stat blocks for the Echo and the Steel Defender, which the content does not give as creatures (Stage C with C4). |
| C5.4 | Window frame flicker on Linux: collect the facts (desktop, X11 or Wayland, when it happens), then a fixed window theme, or an in-app title bar only if that fails. | Linux plan 0.4 | Chris 2026-10-28: CachyOS, KDE Plasma; the flicker seems gone, but drawing lagged in places. Done the same day: (1) the DMA-BUF renderer was turned off on every Linux machine for the NVIDIA crash (#1), which puts WebKitGTK on its slow path; now only where NVIDIA's driver is loaded (src-tauri/src/main.rs); (2) the spellbook's and backpack's drop-shadow over parts that animate forever was redrawn every frame; the shadow is a still gradient now; (3) no backdrop blur behind card backs. **Open:** whether Chris's machine has NVIDIA (then (1) does not apply); re-measure on it. |
| ~~C5.5~~ | ~~Interface tests (Playwright) for every creation path: pick, edit and undo on a card; level up and multiclass; preparing spells; equipment and buying; import and export; every setting. Plus the on-request browser run (random characters, every card screenshotted and checked); write its procedure.~~ | Plan E, earlier request | Done 2026-10-28: e2e/paths.spec.ts adds multiclass by level up, preparing spells on the spellbook, the Foundry export and re-import round trip, and the settings (compact, reduce motion, build layout); with the earlier tests every listed path is covered (pick and undo on a card, level up, equipment and buying, import and export). The on-request browser run is e2e/browserRun.spec.ts (BROWSER_RUN=<count>), procedure in docs/BROWSER-RUN.md. Its first run found the test Spellsinger learning one spell in several choices: the test content now has enough spells, and the rules check flags a spell learned again while another was free (repeatedPicks). The C1.2 test no longer depends on the random species. |
| ~~C5.7~~ | ~~System specs collected automatically into the log and the bug report (CPU, memory, GPU and driver, display server, screen and scale, WebKit version), so a lag report says what machine it is (Chris 2026-10-28: CachyOS, NVIDIA driver, a strong PC).~~ | Chris 2026-10-28 | Done 2026-10-28: the desktop diagnostics add CPU and threads, memory and the graphics drivers in use (Linux: from /sys/class/drm; macOS: sysctl), and say whether NVIDIA's fast drawing is on; the log gets them with the screen and WebKit version at every start (src/system.ts), and the bug report includes them. Settings has "Fast drawing on NVIDIA" (Linux with NVIDIA only): it keeps WebKit's GPU path from the next start, and a start that never draws turns it off again (src-tauri/src/main.rs). |
| ~~C5.8~~ | ~~Library export and import on Home (they exist in Settings as backup and restore); include the card layouts once C4 is built.~~ | Chris 2026-10-28 | Done 2026-10-28: Home has "Export library" (every character in one file) and its "Open file" restores a library file next to the characters here (a newer copy wins); Settings uses the same code (src/ui/library.ts). Card layouts join the file with C4. |
| C6.1 | Bugs from Chris's test of the release (2026-10-28): resizing a window selects page text; clicking a compendium search result does nothing; the ability score grid shows twice; the starting equipment is gone from the backpack card (only inventory and shop); an "i" popup opens behind a card window. Done (v0.22.0 / v0.23.0). | Chris 2026-10-28 |
| C6.2 | Ability scores: no "+2/+1" vs "+1/+1/+1" buttons, only the boxes and a line saying the options; the grid collapses like every choice. Done (v0.22.0 / v0.23.0). | Chris 2026-10-28 |
| C6.3 | Card windows: "Done" instead of ×, more prominent; double-click the title bar to shrink to the bar (as 5e.tools); a full-screen focus button (everything behind blurred); dragged partly out of the window, the title bar always reachable; dragged onto the Bag of Holding goes into it; every "i" opens in a floating window, not the popup. | Chris 2026-10-28 |
| C6.4 | Card animations, fast, switchable off in Settings: opening flips the card up out of its slot (the slot stays empty while it is open), closing puts it back into the slot (every time), into the bag it shoots in, out of the bag it shoots out; the Bag of Holding drawn as a leather bag; a choice folding or unfolding animates quickly, the list moving up with it, so finishing the cantrips visibly hands over to the level 1 spells. Done (v0.22.0 / v0.23.0). | Chris 2026-10-28 |
| C6.5 | Spells: always-prepared spells marked, the mark's hover says where from; exported sheets say it briefly in brackets (subclass, background...). One switch next to the spellbook: print the whole spellbook or only prepared spells, for sheets and spell cards alike. Done (v0.22.0 / v0.23.0). | Chris 2026-10-28 |
| C6.6 | Spellbook and backpack: the spellbook stays in view while scrolling the spells; a chosen spell flies as a page into the book, a grey outline stays where its scroll was, and clicking it flies the page back out (unchosen); items added fly into the backpack. Done (v0.22.0 / v0.23.0). | Chris 2026-10-28 |
| C6.7 | Spell scrolls redesigned: dark vellum on gilt rods instead of bright parchment, built only from theme tokens. Engine-level guard: src/ui/themeTokens.test.ts fails on any fixed colour in themed components (scrolls, windows, bag, class tabs); the bag and multiclass colours became the tokens --arcane and --leather. Done. | Chris 2026-10-28 |
| C5.6 | Lag, if profiling (A2.8) shows rendering or CSS: memoize the board's spaces, animate only transform and opacity. | Linux plan 0.1 | Measured 2026-10-28 in the production build (vite preview, Chromium, level 8 character, board): one change to the character costs 8 to 15 ms of main thread, spread over React's re-render with no single hot spot; under one frame on this Mac, so nothing memoized yet. Reopen with numbers from the Linux machine (WebKitGTK is slower): measure there first. |

### C6. Finish

The full check, `npm run test:e2e`, Soul Forge Test, then a release.

### C7. Chris's test of v0.23.0 (2026-10-29): bugs first, then the rest

| # | What | From |
| --- | --- | --- |
| C7.1 | Bug: spell choices from separate features stay separate lists (Magic Initiate and every feature like it); only a class's own spells are one pool. Done. | Chris 2026-10-29 |
| C7.2 | Bug: a window taken out of the Bag of Holding comes back fully on screen. Done. | Chris |
| C7.3 | Bug: items could be put "in" a waterskin (any item offered as a container); only real containers hold things. Done. | Chris |
| C7.4 | Bug: the background shows the origin feat twice (the "variant feature" origin feat and the 2024-rules origin feat). Done. | Chris |
| C7.5 | Bug: every optional feature really optional (Artificer's Armor Model is required); audit what is marked optional. Done. | Chris |
| C7.6 | Bug: Manage's Options view puts the "i" on its own line; it belongs in the option's line. Done. | Chris |
| C7.7 | Bug: starting gear choices all appear in the starting gear box (an arcane focus or a component pouch, a druidic focus, a holy symbol: open kinds get a picker). Rules checked. Done. | Chris |
| C7.8 | Bug: the Export tab's sheet preview is slow to load. Done. | Chris |
| C7.9 | Spellbook printing moves to the export settings: a "Print the entire spellbook" box; ticked, the sheet lists every spell with blank prepared boxes and says how many can be prepared; unticked, prepared spells only (the switch by the spellbook goes). Done. | Chris |
| C7.10 | HP: until the player picks fixed or rolled, the hit point bar is gold and says "Configure" (a button opening the HP dialog); the choice checker lists it and opens the dialog. Afterwards red as now. Done. | Chris |
| C7.11 | Ability increase choices (origin feats, ASI): no dropdown of combinations; every applicable ability in the boxes, the boxes refusing what the rules do not allow. Done. | Chris |
| C7.12 | Spell scrolls: narrow and vertical, like real scrolls (rolled ends top and bottom), more like a page; concentration shown. Done. | Chris |
| C7.13 | Starting gear gets its own icon (a few items, simple), not the backpack; things fly into the Inventory's backpack. Done. | Chris |
| C7.14 | Equipment: Remove becomes an × button, so narrow rows do not clump. Done. | Chris |
| C7.16 | Bug: the card windows lost the Source picker (which book's version) the card back had; one source strip for both. Done. | Chris |
| C7.17 | Card windows keep the card back's flair: gold frame with its dark inner edge, the card's colour from the top, a small label over the name. Done. | Chris |
| C7.18 | Bug: a Wizard whose Intelligence goes up gets more spell choices it cannot fill; find what the engine does wrong. Done. | Chris |
| C7.19 | Audit: multiclass spell slots and spells known. src/aurora/multiclassAudit.test.ts builds every pair of caster classes (2014 and 2024, EK and AT included) at three level splits against the class tables: all agree. Done. | Chris |
| C7.20 | Each class's prepared spells fold to one line once all are picked (Maine Dockers: the Cleric's list sat unseen under the Artificer's); Learned and Prepared tabs under the book; the shop icon a market stall; Home's characters can be compact (a switch, and on their own below 560 px). Done. | Chris |
| C7.15 | Tutorial: updated for everything since (board, floating cards, bag, spellbook, export). Done. | Chris |

---

## Budget

Model and order suggestions from the Linux plan still hold: well-bounded edits (most of A1, C1, C2) suit Sonnet;
profiling (A2.8), the shop money math (A2.3), the forms' stats (A2.6) and the floating cards (C4) suit Opus. Stage A
is the largest; check the weekly meter after each block (A1, A2, A3) and stop near 70%.
