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
- **5e.tools data**: not openly licensed; the user loads it, as now. SRD-flagged entries are SRD text, which is what
  we may bundle. 5e.tools' own markup and non-SRD entries are not bundled.
- Trademarks: no "D&D" branding in the app's name or icons beyond the compatibility statement.

D0 (first step) settles this: copy the exact attribution statements from the official SRD 5.1 and 5.2.1 PDFs into
`docs/LICENSES.md` and the app's About box; list what the SRD bundle contains; have Chris confirm.

## The steps

### D0. Licenses and the attribution (before anything ships)
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
3. Check: the release bundle contains no Aurora parser (a size and string test in CI); the test app still loads
   Aurora and passes every gate.

### D2. The SRD bundle, ready with no import
1. A build step (`scripts/srd-bundle.mjs`) takes the 5e.tools entries flagged `srd`/`srd52`, runs them through the
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
1. List the 350 features whose mechanics are borrowed from Aurora, grouped by kind of mechanic (choice from a list,
   school or list limits, grants by level, numbers from text, companions, resources). Each group becomes one converter
   capability, as the Eldritch Knight's school limits did (read from 5e.tools' structured data first, its text second).
2. Then the 89 choice differences, 10 grant differences and 1 number difference, each by its cause.
3. Progress gate: the parity numbers may only go down. The full check fails if one rises.
4. Plutonium first for each group (how it routes that mechanic), as for every feature.

### D5. Testing without Aurora
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
