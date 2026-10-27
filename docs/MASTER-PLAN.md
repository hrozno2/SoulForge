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
| A2.3 | Shop logic: buying and selling change coins; a price multiplier; change made in the largest coins that fit; selling price (half at 1.0 is the usual table rule). | RESUME #12, Linux plan Stage 2 | Pure functions plus `normalizeCharacter` for old saves. **Decide first:** multiplier per character (Linux plan suggestion: DMs set it per table) or an app setting (Chris said "a setting" on 2026-10-23), and how it affects selling. |
| ~~A2.4~~ | ~~Foundry import and export improved with what Plutonium does (matching by name, source, class and level; effects, activities, uses, scale values; magic variants).~~ | RESUME #6, docs/PLUTONIUM.md | Done 2026-10-27: Foundry export and import by identity. Exported items carry flags.soulforge (id, a feat's own choices, every pick in a class's, the species' and the background's choices, lineages), spells carry dnd5e's sourceItem and preparation (a spell held in a choice is ready), dnd5e school keys, class identifiers, features and optional features (invocations) with uses. The import places flagged elements exactly; prepared spells on a whole-list class are not added by hand, those over the limit are kept, spells held in choices do not count against it, two books' copies count once. Guard: foundryRoundTrip.test.ts (24 random characters, nothing lost, nothing added). |
| ~~A2.5~~ | ~~Plutonium leftovers: dice-type scale values inside damage text (the Monk's Martial Arts die in an attack).~~ | docs/PLUTONIUM.md | Done 2026-10-27: an attack whose damage is a scale-value die ("@scale.monk.die + @mod", "2@scale.monk.die", "(@scale.x.y)d8") keeps the die's count and size as level formulas (foundry.ts scaleDie), worked out on the sheet; 9 features get it (Flurry of Blows, Deflect Missiles, Empowered Strikes, Elemental Attunement, Bardic Damage, Archer). Test: scaleDice.test.ts. Matching side data by fields stays optional (everything matches). |
| ~~A2.6~~ | ~~Wild Shape, Polymorph and companion forms with the stats adjusted for the character (Moon's AC 13 + Wisdom, temporary hit points, own Intelligence, Wisdom and Charisma, own saves and skills, the improved forms' Constitution saves), and a rules check of the forms picked.~~ | Plan G | Done 2026-10-27: src/aurora/forms.ts `formStats` works out a beast form for the character: Wild Shape 2014 (beast's body, hit points and AC; own Intelligence, Wisdom, Charisma; the better skill and save bonus where proficient), Wild Shape 2024 (own hit points, temporary hit points equal to the druid level; Circle of the Moon three times that and AC at least 13 + Wisdom), Polymorph (the beast entirely), companions (the beast plus companion:ac). The forms picked are checked by the existing rule for picks that no longer meet their choice's filter (CR cap, fly, swim). Test: forms.test.ts. The cards and the Play transform are Stage C. |
| ~~A2.7~~ | ~~Report a bug writes its log to a file on disk.~~ | FEATURES-LATER, issue #4 | Done 2026-10-27: on the desktop the app's errors and warnings go to soul-forge.log in the app log folder a few seconds after they happen (src/logbook.ts); at start the last session's file becomes soul-forge.previous.log, which Report a bug offers as its own part. Capability: app log folder read, write, meta. |
| ~~A2.8~~ | ~~Lag: `resolve` runs on every keystroke in the name field (and other text fields).~~ | Linux plan 0.1 | Measured 2026-10-27: not the engine. `resolve` takes 1 to 8 ms per keystroke (random characters, levels 1 to 20; the timeline reuses earlier levels) and the sheet about 1 ms, so the lag is rendering: moved to Stage C (profile the React renders while typing in the name field; likely every tab and card re-rendering on each change). |
| ~~A2.9~~ | ~~A global filter for modern technology that is not science fiction (firearms, the DMG's renaissance and modern items, modern vehicles).~~ | Chris 2026-10-26 | Done 2026-10-27 (overnight session): 5e.tools item ages "renaissance" and "modern" give the tag "modern", "futuristic" stays "scifi"; shared with Aurora's same-named items; a Modern technology switch in Settings and the tutorial (hidden by default, as before under sci-fi). |
| ~~A2.10~~ | ~~Drakim, made by hand in Soul Forge and in Foundry: the import must give the same character and the export must carry what Foundry's actor has.~~ | Chris 2026-10-26, three files in ~/.soulforge-test/drakim | Done 2026-10-27: the export now matches Foundry's own actor for Drakim: items typed as dnd5e does (exportForeign.ts foundryItemType: weapons by category and base item, armour by weight, gear as consumable, equipment, tool, container or loot, kept in their container), every feature including those the sheet hides, Foundry's names ("Fighting Style: Interception", "Runes: Fire Rune", "Dragonborn (Blue)", straight apostrophes), senses as species features, the Unarmed Strike. The engine agrees on every number. The test is strict (src/aurora/drakim.test.ts); accepted: Chris's two builds differ in a language (Orc) and an item (Oil, 5 flasks), and 5e.tools calls Draconic Resistance "Damage Resistance". |

### A3. Audits that find engine mistakes (run inside Stage A, fix what they find)

| # | Item | Where it comes from |
|---|---|---|
| ~~A3.1~~ | ~~Class by class, level by level, both editions, against the rules: Bladesinging, Wild Shape and Moon, Echo Knight, Battle Smith and Steel Defender, Hexblade and Pact of the Blade, firearms, Monk unarmored defense, Jack of All Trades, expanded spell lists. One report per class in `docs/audit/`.~~ | Plan D | | Done 2026-10-27: docs/audit/class-features.md, checks in src/aurora/classAudit.test.ts. Found and fixed: Hex Warrior, Pact of the Blade and Battle Ready never changed the attack ability (now read from every feature's text, with its conditions); Gunner gave no firearms proficiency (content fix). Right already: Monk Unarmored Defense, Jack of All Trades, Bladesong (only while active), expanded spell lists. Open, with the companion cards (Stage C): the Echo Knight's echo and the Steel Defender. |
| ~~A3.2~~ | ~~Every sheet: a stored profile per sheet (WotC 2014 and 2024, DLDM 5E24 and companions, the layouts, the kids' sheet), a test that fills every field from a fully loaded character, fillable fields for printed sheets without them.~~ | Plan F | | Done 2026-10-27: docs/audit/sheets.md. Profiles are the layouts (every field, kind, page and place) with their mappers; src/sheets/sheetCoverage.test.ts fills every known sheet from the fully loaded test character and fails on an empty field with data behind it: all WotC sheets 100% (Alternative 2: 91%, the rest has no data in Soul Forge), DLDM by its own test. Fixed: the player name was never filled on the 2014 sheets; Alternative 2's next level XP and unarmored AC. Printed sheets now get the fillable version's fields (transparent), so every value stays editable. Not bundled: WotC and DLDM sheets (downloaded); the kids' sheet is personal-use only. |
| ~~A3.3~~ | ~~Every element against its 5e.tools counterpart: one report per element type with a coverage figure (the comparison already runs as a test).~~ | Plan I | | Done 2026-10-27: the parity audit writes one report per element type with a coverage figure (<cache>/engine/parity/*.md; Race 73%, Sub Race 100%, Background 75%, Class 100%, Archetype 65%, Feat 90%). Fixed what it found: 183 Foundry effects with a duration were applied permanently (Slasher's -10 speed, Bait and Switch's AC); a statistic and its ":misc" part were counted twice (Boon of Speed 60, Speedy 20); 5e.tools option progressions on feats, subclasses and options were lost (Martial Adept's maneuvers, Metamagic Adept, Fighting Initiate; test optionProgression.test.ts). Left: most "choices" differences are the providers splitting one decision into different steps (not visible on a character); the "grants" ones are 5e.tools stating in text what Aurora's copy (the one the lists show) has as data. |

### A4. Unearthed Arcana support (last engine block, before Stage B)

Scope changed 2026-10-26: playtest content is in scope (it was out by the audit decision of 2026-10-17).

1. Collect every playtest file and element: Aurora's (Unearthed Arcana sources) and 5e.tools' (UA books and
   `prerelease` groups, plus their Foundry side data).
2. For each kind of element, compare how Aurora encodes it and how Plutonium imports it (docs/PLUTONIUM.md: side
   data matched by fields, mechanics read from the text), and take what each gets right, as for official content.
3. Make the checks cover it: the rules check, the edition gate (playtest has its own edition and release dates), the
   Aurora and 5e.tools comparisons, random characters with playtest content switched on.
4. Work through docs/UA-UNSUPPORTED.md (starting with UA1 to UA3) until it is empty or every item left has a reason.

Until then, anything playtest-only that a check reports goes into docs/UA-UNSUPPORTED.md instead of being hidden.

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
| C1.0 | Typing lag in the name field (A2.8 measured: the engine takes under 10 ms): profile the React renders and stop every tab and card re-rendering on each keystroke. | Linux plan 0.1, A2.8 |
| C1.0b | Character cards on Home (Chris 2026-10-27, screenshot): first row an actual HP bar (current of max), then a small shield with the AC, then the walking speed; second row the three best ability scores (score and modifier) with a small "+" box after them; hovering the "+" brings in the other three. Replaces today's row of HP, AC, Speed and five ability boxes. | Chris 2026-10-27 |
| C1.1 | "See options" opens the list and never closes it on a second click. | RESUME #3 |
| C1.2 | Deselecting never folds a choice; it folds only when every pick is made. | RESUME #10 |
| C1.3 | A type filter in choices that mix skills, tools, languages and the rest. | RESUME #7 |
| C1.4 | The take/not-take box shows unchecked by default (engine default in A1.3); the background's personality switch (A1.2); the 2014 background options (A1.1). | RESUME #4, #8, #9 |
| C1.5 | Backpack and spellbook on the board: clicking the icon shows or hides the inventory or prepare-spells picker, labelled "Inventory" and "Prepare spells". | RESUME #11 |
| C1.6 | Yellow placeholder cards on load: gate card drawing and the pack opening on the registry holding each card's class and species; e2e check that no card changes after landing. | Linux plan 0.2, RESUME (launch intro flagged) |
| C1.7 | Launch animation: the remaining issues Chris saw (details still to collect). | RESUME, flagged for later |

### C2. Navigation and Manage clean-up (Linux plan Stage 1)

Manage and Content as two top-level tabs; Sources moves to Content; "Level and hit points" leaves Manage after a
parity check against Level up, the HP window and Play; Conditions move to a Play tab; character details move to
Build (a "Details" button by the portrait; blank details never count as an open choice); the right-hand lore panel
in Manage becomes "i" icons; favorites reorder in Play with a drop marker and move buttons.

### C3. Backpack card with Inventory and Shop tabs (Linux plan Stage 2)

The interface on top of A2.3: Inventory (sell, custom items, quantities) and Shop (search, categories, prices with
the multiplier, buying blocked or warned when coins are short). The multiplier setting's place follows the A2.3
decision.

### C4. Multiple floating cards and the Bag of Holding (Linux plan Stage 3)

Up to 10 cards open as draggable windows, minimized into a Bag of Holding (desaturated), removed one by one or
cleared with the wormhole effect; window state kept out of the character and out of `resolve`; Reduce motion
respected. **Design pass first**, shown to Chris, with his open questions answered: does "card" include the lists,
what two cards of one kind mean (multiclass or browsing), whether the layout survives a restart, touch and trackpad
dragging on Mac and Linux.

### C5. Other interface work

| # | Item | Where it comes from |
|---|---|---|
| C5.1 | Tutorial: new users load all of 5e.tools and all of Aurora; Settings explains the global filters. | RESUME #5 |
| C5.2 | Spellbook import button (A2.1) and the prepared-only spell cards switch in Export (A2.2). | RESUME #1, #2 |
| C5.3 | Wild Shape, Polymorph and companion cards like spell cards, and the transform, temporary hit points and revert in Play (on top of A2.6). | Plan G |
| C5.4 | Window frame flicker on Linux: collect the facts (desktop, X11 or Wayland, when it happens), then a fixed window theme, or an in-app title bar only if that fails. | Linux plan 0.4 |
| C5.5 | Interface tests (Playwright) for every creation path: pick, edit and undo on a card; level up and multiclass; preparing spells; equipment and buying; import and export; every setting. Plus the on-request browser run (random characters, every card screenshotted and checked); write its procedure. | Plan E, earlier request |
| C5.6 | Lag, if profiling (A2.8) shows rendering or CSS: memoize the board's spaces, animate only transform and opacity. | Linux plan 0.1 |

### C6. Finish

The full check, `npm run test:e2e`, Soul Forge Test, then a release.

---

## Budget

Model and order suggestions from the Linux plan still hold: well-bounded edits (most of A1, C1, C2) suit Sonnet;
profiling (A2.8), the shop money math (A2.3), the forms' stats (A2.6) and the floating cards (C4) suit Opus. Stage A
is the largest; check the weekly meter after each block (A1, A2, A3) and stop near 70%.
