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
| A1.1 | 2014 backgrounds: offer the standard 2024 background options (ability increases, two skills, a tool, an origin feat, starting equipment). A 2014 background without increases gets an optional feature that gives them and satisfies the rules check ("Origin editions mixed: Orc (2024) gives no ability score increase and Outlander (2014) gives none either"). | RESUME #9 | Engine and content pass, like `optionalFeatures.ts`. Interface part (the checkbox look) is in C. |
| A1.2 | Personality traits, ideals, bonds and flaws: one switch on the background turns all four off and they stop counting as open choices (gone in 2024). | RESUME #8 | Builds on `Character.declined`; the box itself is C. |
| ~~A1.3~~ | ~~Optional and variant features start not taken (unchecked) by default; not taken never counts as open.~~ | RESUME #4 | Done 2026-10-26: not taken until ticked (`Character.taken`) or something is picked in it (older saves keep their picks); saved sheets unchanged. |
| A1.4 | Generic items in packs ("a musical instrument", a gaming set, artisan's tools) become an open choice instead of literal text. | Linux plan 0.3 | `startingEquipment.ts`; tests per category and for "same as above" lines. |
| ~~A1.5~~ | ~~Backpack "Kept in" offers a staff and other non-containers.~~ | RESUME #13 | Done 2026-10-26: Aurora's "container" setter names a focus group (Staff: Arcane Focus), not a container; containers are now known by 5e.tools' capacity or a volume in their text (src/aurora/containers.ts). |
| A1.6 | Telekinetic (and any feat with a feature of the same text) printed twice on the sheet. | Plan H | Sheet data: find the cause (feat plus its feat feature) and guard the class. |
| A1.7 | FastCharacter imports leave 91 required choices open. | Plan H, full check | Import logic (`foreign.ts`): sort by cause, fix the classes of cause. |
| A1.8 | Three statistics nothing reads (Unearthed Arcana Artificer: infusions count and vanish, an armor equipment stat). | Plan H, stat gate | Wire or decide them. |

### A2. Missing engine features

| # | Item | Where it comes from | Notes |
|---|---|---|---|
| A2.1 | Prepared casters: import the whole spellbook (every spell the class can prepare) into the character. | RESUME #1 | Engine and sheet data; a button for it is C. |
| A2.2 | Export option on every sheet: spell cards for prepared spells only. | RESUME #2 | PDF export option; the switch in Export is C. |
| A2.3 | Shop logic: buying and selling change coins; a price multiplier; change made in the largest coins that fit; selling price (half at 1.0 is the usual table rule). | RESUME #12, Linux plan Stage 2 | Pure functions plus `normalizeCharacter` for old saves. **Decide first:** multiplier per character (Linux plan suggestion: DMs set it per table) or an app setting (Chris said "a setting" on 2026-10-23), and how it affects selling. |
| A2.4 | Foundry import and export improved with what Plutonium does (matching by name, source, class and level; effects, activities, uses, scale values; magic variants). | RESUME #6, docs/PLUTONIUM.md | Importer and exporter logic. |
| A2.5 | Plutonium leftovers: dice-type scale values inside damage text (the Monk's Martial Arts die in an attack). | docs/PLUTONIUM.md | Optional tidy-up: match side data by fields instead of ids (everything already matches). |
| A2.6 | Wild Shape, Polymorph and companion forms with the stats adjusted for the character (Moon's AC 13 + Wisdom, temporary hit points, own Intelligence, Wisdom and Charisma, own saves and skills, the improved forms' Constitution saves), and a rules check of the forms picked. | Plan G | The cards and the Play transform are C. |
| A2.7 | Report a bug writes its log to a file on disk. | FEATURES-LATER, issue #4 | |
| A2.8 | Lag: `resolve` runs on every keystroke in the name field (and other text fields). | Linux plan 0.1 | **Unverified:** profile first. If `resolve` is the cause, keep text-only fields out of its inputs or debounce them, with a timing guard. If the cause is rendering or CSS, the fix moves to C. |

### A3. Audits that find engine mistakes (run inside Stage A, fix what they find)

| # | Item | Where it comes from |
|---|---|---|
| A3.1 | Class by class, level by level, both editions, against the rules: Bladesinging, Wild Shape and Moon, Echo Knight, Battle Smith and Steel Defender, Hexblade and Pact of the Blade, firearms, Monk unarmored defense, Jack of All Trades, expanded spell lists. One report per class in `docs/audit/`. | Plan D |
| A3.2 | Every sheet: a stored profile per sheet (WotC 2014 and 2024, DLDM 5E24 and companions, the layouts, the kids' sheet), a test that fills every field from a fully loaded character, fillable fields for printed sheets without them. | Plan F |
| A3.3 | Every element against its 5e.tools counterpart: one report per element type with a coverage figure (the comparison already runs as a test). | Plan I |

Not built, by decision (docs/ENGINE-PLAN.md): the resolver on the internal format, merging the two sources' copies,
a general effects model. Revisit only for maintainability.

---

## Stage B: tests

After Stage A, before any interface work:
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
