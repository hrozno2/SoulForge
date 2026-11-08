# Stage D: 5e.tools as the only source (Aurora for testing only)

Chris, 2026-10-30: 5e.tools becomes the app's primary and, in the end, only content source. Aurora's files and
importer stay, but only in the test app, as a source of comparisons that find bugs. The SRD API
(https://www.dnd5eapi.co/) joins as a third, independent check, and SRD content is bundled with the app. The released
app eventually loads 5e.tools content only and has no Aurora importer at all.

Three sources, three jobs:

| Source | Final app | Test app | Job |
| --- | --- | --- | --- |
| 5e.tools data | yes, the only one | yes | The content players build with |
| SRD (bundled, checked against the SRD API) | yes, bundled, works with no import | yes | Free core rules out of the box; a licensed baseline |
| Aurora elements | no (no importer, nothing loaded) | yes | Comparison source: parity gates, twin checks, bug hunting |
| Plutonium | no | read only, as now | Reference for behaviour, never data (unlicensed) |
| Other SRD sources (SRD PDFs, SRD API, Open5e) | no | cached copies | Rules and bug checks for SRD content (D3b) |

## Where we start (measured, 2026-10-29 full check)

- 26,471 elements: Aurora 13,421, 5e.tools 13,362, 312 merged.
- Parity, Aurora against 5e.tools: the 5e.tools copies borrow Aurora's mechanics for **350 features**. Twins differ in
  their **choices 89** times, their **grants 10** and their **numbers 1**. These counts are this stage's progress
  measure. Every one must reach 0 before Aurora leaves the final app.
- The engine's internal model (elements with select, grant and stat rules, supports and requirement strings) is
  Aurora's format. It stays: the 5e.tools converter writes into it. Only Aurora's content and importer go.
- 5e.tools marks SRD content itself: `srd` (SRD 5.1) and `srd52` (SRD 5.2) on about 320 to 340 spells, 12 classes
  and 12 subclasses, 9 species, about 450 to 490 items, 250 to 280 class features, and more. The SRD API confirms these
  flags; it does not have to produce them.

## Licenses (checked 2026-10-30; not legal advice, re-check before shipping)

- **SRD 5.1**: Wizards of the Coast, released under both the OGL 1.0a and **CC-BY-4.0**. The attribution must be the
  statement in the SRD 5.1 preamble, verbatim.
- **SRD 5.2 / 5.2.1** (2024 rules): **CC-BY-4.0**. The attribution is the SRD 5.2 legal page's statement, verbatim;
  Wizards asks for no other attribution to them beyond it. "Compatible with fifth edition" / "5E compatible" may be said.
  Some names were changed in 5.2 to avoid trademarks (Strahd, Orcus and Tiamat are not in it).
- **SRD API (5e-bits)**: code MIT; its data "released using the Open Gaming License Version 1.0a" (README of
  5e-bits/5e-database, now moved to 5e-bits/5e-srd-api). We use the API only as a check in the test app. The SRD text
  we bundle comes from the SRD itself under CC-BY-4.0, not from the API's database.
- **5e.tools data**: not openly licensed; the user loads it, as now. Its `srd`/`srd52` marks say an entry is in the SRD,
  **not that its text is the SRD's** (found 2026-11-05, below). 5e.tools' own markup and non-SRD entries are not bundled.
- Trademarks: no "D&D" branding in the app's name or icons beyond the compatibility statement.

D0 (first step) settles this: copy the exact attribution statements from the official SRD 5.1 and 5.2.1 PDFs into
`docs/LICENSES.md` and the app's About box; list what the SRD bundle contains; have Chris confirm.

## The steps

### D0. Licenses and the attribution (before anything ships)
Done 2026-11-06: PDFs downloaded, statements copied into docs/LICENSES.md, Settings (About) and each bundle file. Chris confirmed: it may ship as long as it stays matched in content to the SRD entries, and where we differ we follow the SRD.
1. Fetch the official SRD 5.1 and SRD 5.2.1 PDFs (ask Chris before the download), copy their attribution statements
   verbatim into `docs/LICENSES.md`, the About box and the bundle's header.
2. Decide the SRD edition per element: an entry flagged `srd52` is bundled as SRD 5.2 (2024), `srd` as 5.1 (2014).
   Where the SRD names a thing differently, 5e.tools gives the SRD name in the flag (`"srd": "Other Name"`): the
   bundle uses that name.

### D1. Two apps, two databases
1. The test app gets its own identity: bundle id `app.charforge.test`, its own WebKit storage, its own IndexedDB. Today
   the release app and Soul Forge Test share `app.charforge.desktop`, which is why they overwrote each other's caches.
   A one-off copy moves the test library and content across.
2. A build flavour: `VITE_FLAVOR=release | test`. The Aurora importer, the Aurora-only gates and the test bar are
   compiled into the test flavour only (dead code removed from the release build). `scripts/test-app.sh` builds `test`,
   the release workflow builds `release`.
3. Check: the release bundle has no test controls (e2e/flavor.spec.ts); the test app still loads Aurora and passes every
   gate.
4. Order changed in the doing (2026-11-05): the release app still loads Aurora, because 5e.tools borrows 350 features'
   mechanics from it until D4 closes that gap. So the Aurora importer leaves the release flavour at D7, with the "no Aurora
   parser in the release bundle" check; D1 builds the flavour and moves the test bar behind it.

### D2. The SRD bundle, ready with no import

State 2026-11-06: **built and loaded, not released.** Chris chose official SRD text and approved the downloads. `RULES_TIER=srd-bundle
npx vitest run src/aurora/srdBundle.test.ts` writes `public/srd/srd-5.1.json` and `srd-5.2.json` only if it passes: all 12 classes and
9 species each, nothing naming a term in NOT_IN_SRD, 0 findings over 100 random characters each. Every description sentence is
looked up in the official PDF's text (src/aurora/srdText.ts, <cache>/srd/pdf); what is not there is dropped (626 and 529 sentences,
listed in <cache>/srd/srd-*.dropped.txt). The app reads the bundle first, so the user's own copy replaces it by id (addSrdBundle in
content.ts). A new install says the free rules are ready; e2e/firstrun.spec.ts builds a character with nothing imported. Licences:
docs/LICENSES.md, with one open point for Chris's review before a release. The check also found live display bugs for every 5e.tools
user, fixed in ecbad37: upcast dice, "25 percent", difficult terrain, nested tags, 121 items with raw templates.

Then 2026-11-06, Chris: follow the SRD wherever we differ. src/aurora/srdPdf.ts reads the PDFs as structure and src/aurora/srdFollow.ts applies them: exact spell lists, spell facts and text, item rarity, gear tables, the text of items, features, species, feats and backgrounds. The build fails if a spell or listed entry is missing or extra, or a class table has a feature we lack. docs/SRD-DIFF.md has the state. Live bugs for every 5e.tools user found on the way: "8 hour", "10 minute" and "1 miles" in spell facts. Also: a feat's prerequisite list was read as "all of these" where it means "any of these" (2024 Grappler needed both Strength and Dexterity 13), and only ability and level were read (now also feats, species, backgrounds, features, armor and weapon training, casting); a weapon property with a note was lost (2024 Lance); weapons had no range (a Longbow read 5 ft) and two-handed ones filled one hand; the 2024 Monk's tool or instrument was missing; the 2024 Cleric started with 70 GP.

1. A build step (`src/aurora/srdBundle.ts` and the `srd-bundle` tier) takes the 5e.tools entries flagged `srd`/`srd52`, runs them through the
   converter and writes `public/srd/srd-5.1.json` and `srd-5.2.json`: elements in the engine's format, with the CC-BY
   attribution in the header.
2. The app loads the bundle when no user content is loaded, and alongside it otherwise. User 5e.tools content takes
   precedence where both have an element: same id, so no duplicates.
3. The SRD API marks and confirms: for every SRD class, subclass, species, background, feat, spell, item, condition and
   rule, the API's index has an entry of that name, and every 5e.tools entry flagged SRD is in the API. Disagreements
   are listed (`docs/SRD-DIFF.md`) and decided by the SRD PDF.
4. A new character can be built from the bundle alone: one class, species, background and spell list per edition, the
   rules check clean. A first-run test covers it.

### D3. The SRD API as a third check (test app and CI only)
Steps 1 and 4 done 2026-11-06 (`scripts/srd-api-cache.mjs`, 4.3 MB in <cache>/srd-api, monsters left out). `RULES_TIER=srd-api` (src/engine/srdApi.test.ts, in the
full check) compares spells, equipment, hit dice, saves, slots, cantrips, species speed and names. It found one real bug (an area spell's range read "15 feet", not "Self
(15-foot cone)"); the rest were settled against the PDFs in docs/SRD-DIFF.md, nearly all API mistakes, and a kind's count may only fall. Not yet compared: spells known, features
by level, subclass levels, species traits, feat prerequisites, conditions against the API: features by level are now checked against the PDFs' class tables instead (better source), and species traits and feats follow the PDFs' text. Step 3 (the API in the rules check) is still to do.
1. `scripts/srd-api-cache.mjs` downloads the API's data once into `~/.soulforge-test/srd-api/` (2014 and 2024
   endpoints), so tests run offline and stay deterministic.
2. New gate "against the SRD", in the full check: for SRD content, our engine's results agree with the API on
   - class tables: hit die, proficiencies, saving throws, spell slots by level, cantrips and spells known, features by
     level, subclass levels;
   - spells: level, school, casting time, range, components, duration, concentration, ritual, class lists;
   - species traits, sizes and speeds; backgrounds; feats and their prerequisites;
   - equipment: cost, weight, damage, properties, armor class; conditions.
3. The rules check gains the API's facts as a reference where Aurora's and 5e.tools' disagree: three sources, two must
   agree, the third is a finding.
4. The full check's summary reports "against the SRD" counts. Every finding is fixed at the cause and guarded (the macro
   rule).

### D3b. Every source compared (Chris 2026-10-30)

Done 2026-11-06 for spell facts and gear: `RULES_TIER=sources` (src/engine/sources.test.ts, in the full check). The three-source idea of D3 step 3 lives here rather than in the rules check: the PDF decides, and who disagrees says whose mistake it is. It found a real conversion bug: a spell with two casting times read only the first. Not done: Open5e (needs its licence read and a download; Chris's call). Plutonium stays a read-only reference for routing, not a gate.

All sources are used for bug finding and rules checking, in the test app and the full check (never in the release
app). Which sources are compared depends on the content:

| Content | Sources compared | Which decides a disagreement |
| --- | --- | --- |
| SRD content (5e.tools entries flagged `srd`/`srd52`) | the official SRD PDFs (5.1, 5.2.1), the SRD API (dnd5eapi.co), Open5e's SRD documents (if its license checks out, D0), 5e.tools, Aurora, and Plutonium's handling | The official SRD text; the others are findings |
| Non-SRD content | 5e.tools, Aurora, and Plutonium's handling | Two of three agreeing; a three-way split goes to Chris with the book reference |

1. **SRD sources compared with each other first.** The SRD API and Open5e are compared against the official SRD text
   (names, numbers, class tables, spell facts). Their own errors are noted in `docs/SRD-DIFF.md` and not used as facts.
2. **Then our engine against them.** For SRD content, the engine's results (built from 5e.tools) must match the SRD.
   Aurora's twin and Plutonium's handling are compared too: a mismatch there is a bug in that source's conversion or
   in our reading of it.
3. **Plutonium as behaviour, not data.** It stays read only and unlicensed: we compare how it routes a mechanic (choices,
   prepared spells, multiclass tables, starting gear) with ours, as written up in docs/PLUTONIUM.md, and never copy
   its code.
4. **Non-SRD content**: 5e.tools against Aurora (the parity gate) and against Plutonium's handling. A finding where two
   agree against our engine is a bug; where the sources disagree with each other it goes into a list for Chris.
5. **In the full check** these become gates with counts in the summary ("SRD sources agree", "engine against the SRD",
   "5e.tools against Aurora", "against Plutonium's handling"). Counts may only go down; every finding is fixed at the
   cause and guarded.

### D4. Close the parity gap (5e.tools stands on its own)

Measure changed 2026-11-05: most of the 350 borrowed mechanics are stats only Aurora's own description text reads, so they
need no port. What matters is the sheet: `RULES_TIER=parity-effect` builds 500 random characters with 5e.tools alone and
with Aurora too, and compares them (<cache>/engine/parity-effect.md). It went from 224 to 436 identical, by reading from
text and class tables: half proficiency, armor class formulas, saves, speeds, initiative, trainings, languages, attunement,
score caps, the Martial Arts die, Rage damage and table uses (src/aurora/textMechanics.ts, applyTableMechanics). The floor
is in the test and may only rise. Left: DC hints shown beside features (59 of the differences, display only), and a
Barbarian's climb speed where Aurora's side double-counts Fast Movement (50, should be 40). Borrowed 309 and choices 90,
grants 10, numbers 1 are still to do. The 2026-10-29 count of 89 choices was on older data: the unchanged code gave 90, and
67 after the species language fix, leaving defaulted choices out of the count, and reading "options" blocks properly (with a
count: a choice whose features are made on the spot, so 2014 Hunter's Prey and Totem Spirit can be chosen; with no count: the
character has them all, as a Psi Warrior's powers). Then 2026-11-05: 5e.tools' class/foundry.json states many of the prose choices as data in "entryData" (Blessings of Knowledge:
two languages, two of four skills), and it was wrongly filed as bookkeeping. Plutonium copies it onto the entity and reads it
like the entity's own fields, and so does applyFoundry now. A fixed training followed by a choice is a fallback with a
default (Tools of the Trade, Iron Mind). Naming the choices in the parity report showed a real bug: counted optional features
in a feature's text were offered on top of the owner's progression (a Battle Master picked 3 + 3 maneuvers at 3rd level;
also Runes, Elemental Disciplines, Arcane Shots). And a Barbarian's climb speed no longer doubles Fast Movement with Aurora
loaded. Choices 52, grants 9, numbers 1; sheets 436 of 500, the rest only DC hints beside features. parity.md now names each
side's choices. A narrow reader then took the lasting choices worded only in prose (proseChoiceRules: 2024 Hunter's Prey and Defensive
Tactics, Aspect of the Wilds, Elemental Affinity, Elemental Adept, Dragon Ancestor, Additional Fighting Style, Kensei weapons);
choices 45. Most "choose one" wording is a choice made in play and is left alone on purpose. Of the 45, many are the same
decision filed differently: 2024 Eldritch Knight and Arcane Trickster prepare their spells where Aurora counts picks (13 vs 0 is
not a gap). Left to look at: Rune Shaper, Strike of the Giants, Planar Wanderer, Armor Model, Wildfire Spirit, companions.

State 2026-11-06: **500 of 500 sheets agree with and without Aurora**; 64 differ only in a DC note Aurora adds beside a feature, which changes no number. The twins' 44 remaining differences are each judged in src/engine/parity.test.ts: 38 explained (5e.tools right, one decision filed differently, or a choice made in play), 6 open, and a new one fails the gate. Open: Simic Hybrid's Animal Enhancement, Rune Shaper's rune count (2 rows), Beast Master's companion (2 rows, the builder holds no creatures), Storm Herald's three picks. Reading them found live bugs for 5e.tools-only characters: the 2024 Human and Variant Human had no feat; Dragonborn, Tiefling and Kobold asked a damage type, skill or cantrip that their lineage already sets; Custom Lineage got darkvision and the skill; a merged twin doubled Squat Nimbleness's speed; Weapon Master had no mastery; Strike of the Giants had no choice. Borrowed mechanics stand at 296 and matter only as far as sheets show them, which is now nothing: they go when Aurora leaves (D7).

1. List the 350 features whose mechanics are borrowed from Aurora, grouped by kind of mechanic (choice from a list,
   school or list limits, grants by level, numbers from text, companions, resources). Each group becomes one converter
   capability, as the Eldritch Knight's school limits did (read from 5e.tools' structured data first, its text second).
2. Then the 89 choice differences, 10 grant differences and 1 number difference, each by its cause.
3. Progress gate: the parity numbers may only go down. The full check fails if one rises.
4. Plutonium first for each group (how it routes that mechanic), as for every feature.

### D5. Testing without Aurora

Started 2026-11-06: `RULES_CONTENT=5etools` runs the whole rules suite without Aurora, and `RULES_TIER=sweep` reaches every element (docs/TEST-COVERAGE.md); both are in the full check, so no `--no-aurora` switch is needed. First runs found: 112 Xanathar's and Tasha's spells on no class list (`classVariant` unread), Enhanced Arcane Focus at +3 for every Artificer, 2014 Ritual Caster and Spell Sniper with no prerequisite, a feat's or small subclass's spells counting a class on the shared slot table, the same feat from two books, condition immunities with no element. The exit criteria below stand; none is met yet.
1. A full check variant, `full-check.mjs --no-aurora`: the engine with 5e.tools and the SRD bundle only, the same
   random characters, rules check, saved characters and importer tests, with the SRD API and Aurora parity as the
   checks. It runs alongside the normal one.
2. The exit criteria, all of them:
   - parity borrowed mechanics 0, choice/grant/number differences 0;
   - five consecutive `--no-aurora` full checks clean (10,000 random characters each);
   - two weeks of Chris testing the test app in 5e.tools-only mode (a switch in its test bar) with no finding that
     needs Aurora;
   - Chris's whole library migrated (D6) with no character changing its sheet unexpectedly.

### D6. Saved characters move to 5e.tools ids
Started 2026-11-08 (0740229): `migrateToFiveTools` (src/engine/migrate.ts) and the `RULES_TIER=migrate` report. Root ids map by twin key, concept, then name (gear by either provider's names); picks are replayed onto the rebuilt character (owner first, narrowest choice first, spells with their spellcasting, 2024 casters' spells prepared); ability increases are filled to the old scores. The report found a converter gap at once (2014 Magical Secrets). Not wired into loading.
1. A migration on load: every Aurora id in a character (race, classes, background, selections, options, extras,
   inventory, spells) maps to its 5e.tools twin, using the twin map the parity gate already builds; picks keep their
   choices (stable keys follow the twin's rules, the old-pick recovery helps). An id with no twin keeps working in the
   test app and is reported in the release app ("this character uses content no longer included: <names>").
2. Run it on the 400 saved test characters and Chris's library: sheets must not change, or each change is explained.
3. The older-build notice tells the player what moved.

### D7. The release app drops Aurora
1. Remove Aurora from the release flavour: no importer, no Aurora files, no Aurora-only settings or Content tab
   entries; the tutorial and README say "5e.tools content, with the SRD built in".
2. Launch faster: only 5e.tools (cached conversion) and the SRD bundle load.
3. The test app keeps everything: Aurora, the importer, the parity and SRD gates, the test bar.
4. Release notes explain the change; a release only after D5's criteria hold.

## Order and checkpoints

D0 → D1 → D2 → D3 can go in that order and each ships on its own (D1 first fixes the shared-storage problem now).
D4 is the long one, measured by the parity numbers. D5 and D6 only after D4. D7 last, and only with Chris's go-ahead.

Each step ends as every step does: tests, Soul Forge Test rebuilt, a full check before a release.
