# Reliability plan: import, build, export

Soul Forge has to do three things without mistakes. Everything else is secondary.

1. **Import** any character file (Foundry, Roll20, and later others) into a character that follows the rules.
2. **Build** any character by hand or at random, and keep it within the rules at every level.
3. **Export** that character to the standard sheets (official 2024, classic 2014 three-page, DLtheDM, Soul Forge),
   filled completely and readably.

This plan explains why mistakes keep turning up, what changes so they stop, how we prove it, and in what order
to build it. Each phase has an exit test.

---

## 1. Why we keep finding mistakes

Evidence from the last two weeks (128 commits; the rules suite; 32 imported files; the sheet exports):

| Where the mistake came from | Examples | Share |
|---|---|---|
| **The content data** (AuroraLegacy XML is community-made) | Duplicate 2014/2024/UA versions under one name; generated elements the original app made on the fly (ASI options); repeatable feats stored as copies (`SKILLED_2`, `_3`); infusion copies with chained requirements; renamed 2024 spells; features named differently from the books ("Level 3: Draconic Resilience") | Largest single cause |
| **Name matching** (importer, starting gear, checker) | Curly vs straight apostrophes; "Clothes, Traveler's"; "Elf, Wood"; "Grave" vs "Grave Domain"; "Tiny Hut" vs "Leomund's Tiny Hut"; typos in files | Large |
| **Greedy, order-dependent choice filling** | Cantrips placed before Magic Initiate's list existed; Eldritch Blast after invocations; class skills taken by a background; Skilled filling every feat slot; 2014 and 2024 Alert both taken | Large |
| **Rules the engine or checker did not model** | Choices judged at the final level instead of the level they were made; Dazzling Footwork; 2024 Draconic Resilience; multiclass "or" requirements; prepare list for a spellbook-less caster | Medium |
| **Sheet filling** | Fields one box off (DLtheDM); shared field names overlapping; long text clipped; feat spellcasting DC not shown | Medium |
| **The files themselves** | Skills listed twice (class and background); subclass before its level; more prepared spells than allowed; homebrew items, feats, backgrounds | Cannot be fixed, only reported |

The pattern: **every fix so far was local**. A test found a symptom and we patched the place it showed. Nothing
stopped the same kind of mistake from appearing somewhere else. The plan below fixes the causes in layers, so each
kind of mistake has exactly one place where it is handled and one test that guards it.

---

## 2. Principles (the rules for the rules)

These hold for every change from now on. A change that breaks one is not merged.

- **P1. Nothing silent.** Every fact in an imported file ends in exactly one bucket: *matched by ID*, *matched by
  name*, *not in the content*, *against the rules*, or *ambiguous, you choose*. No choice is filled without
  saying so.
- **P2. One question, two answers.** The engine builds the character; an independent checker judges it. They are
  written separately and must agree. A disagreement is a bug in one of them, never "close enough".
- **P3. Fix data in data.** A wrong or missing piece of content is fixed in a content override file, not by a
  special case in code. Code stays general.
- **P4. Identity before names.** Match by stable IDs (Foundry identifiers and compendium IDs, Aurora IDs). Names
  are the fallback, through one shared alias index. Fuzzy matching is the last resort and is always reported.
- **P5. Check against an answer key.** Wherever a file or a reference states a number (Roll20 stores AC, hit
  points, every save and skill bonus, spell DC; 5e.tools states class tables and spell lists), we compute ours and
  compare. Any difference is explained in the report.
- **P6. Read back what we write.** Every sheet export is read back field by field. What does not fit goes on a
  continuation page; nothing is cut off silently.
- **P7. Every bug becomes a test before it is fixed.** A reported character joins the test corpus; a sheet problem
  becomes a read-back check; a rules mistake becomes a checker rule.
- **P8. Determinism.** The same input always gives the same character: no dependence on file order, choice order
  or timing.

---

## 3. The layers (macro architecture)

```
 Character files ─► Adapters ─► Interchange ─► Resolver ─► Placement ─► Character
                                                   │             │           │
 AuroraLegacy XML ─► Content linter + overrides ─► Canonical content (IDs, editions, aliases)
                                                                             │
                              Engine (builds)  ◄──────────────►  Checker (judges)
                                                                             │
                                                 Fill data ─► Sheet maps ─► Read-back ─► PDF
```

### 3.1 Content layer: make the data trustworthy once

**Content linter** (runs in tests, and on loading content in the app, quietly):
- Broken references: a grant or select pointing to an ID that does not exist.
- Choices with no options, or whose every option fails its own requirements at the level the choice is made.
- Duplicate IDs; the same name in the same edition from two sources without a clear winner.
- Edition of every element (2014, 2024, Unearthed Arcana, setting book, homebrew), worked out once and stored, so
  no code guesses from IDs or source names again.
- **Cross-check against 5e.tools** (reference data, used only in tests): class tables (slots, cantrips, prepared
  and known spells, feature levels, subclass level), spell lists per class, feat prerequisites, species traits,
  subclass spell lists. Every difference is either fixed by an override or listed as accepted.

The linter also runs on content you add yourself (5e.tools picks, homebrew, custom items), so a broken homebrew
element is reported when it is loaded, not when a character trips over it.

**Pinned content version:** the tests run against a recorded AuroraLegacy commit. When the content updates, the
linter and the full suite run on the new version before the app uses it, and differences are reviewed.

**Content overrides** (`content-fixes`): a small, versioned file of corrections applied after loading (a missing
option, a wrong level, a missing spell-list tag). Each entry says what it fixes and why, and has a test.

**Canonical alias index** (one module, used by the importer, starting equipment, search and the checker):
apostrophes and punctuation, plurals, "X, Y" flips, "X (Y)" and "X of Y", 2024 renames (Tiny Hut, Arcane Hand),
possessive prefixes, Foundry and 5e.tools identifiers. Built once when content loads.

*Exit test:* linter has zero unexplained findings on the full AuroraLegacy content; 5e.tools cross-check has zero
unexplained differences for the 2014 and 2024 core classes, species, feats and spell lists.

### 3.2 Rules layer: the engine and the checker

**Engine guarantees** (some done this week, all made explicit and tested):
- Every choice is judged at the level it is made.
- Repeatable feats are limited by what the rules allow (and by the file, on import).
- Edition consistency: when both versions exist, the character's edition wins, everywhere (spell lists, items,
  feats), through the stored edition from 3.1.
- Manual additions are allowed, but the checker marks them as outside the rules, so they are never mistaken
  for legal choices.

**Checker as a product, not only a test tool:**
- Split into rule modules (hit points, saves, skills, spell slots, prepared and known spells, armor class,
  attacks, feats and prerequisites, multiclassing, equipment training, hands, attunement limit, carrying
  capacity, companions and familiars, species traits). Each module names the rule and the
  book it comes from.
- Runs **live in the app**: a "Rules check" panel on Build shows "Follows the rules" or each problem with a fix
  link. It also runs on import (in the report) and before export (a warning, not a block).
- Reference numbers: the class tables are game mechanics (numbers only, no text). See decision D2 on whether to
  ship them in the app or keep them test-only.

**Differential testing:** for every generated or imported character, engine and checker must agree on every
number on the sheet (AC, HP, saves, skills, DC, attack, slots, prepared count). On Roll20 imports the file's own
numbers are a third opinion.

*Exit test:* 1,000+ random characters per night with zero findings for 14 nights in a row; every checker module
has table-driven unit tests from 5e.tools.

### 3.3 Import layer: deterministic, explained, no guessing

Rebuilt as a pipeline with five stages, each testable on its own:

1. **Adapters** (one per format and version): Foundry dnd5e 3.x to 6.x (with and without Plutonium), Roll20 5e OGL
   sheet (and the VTTES export wrapper), and later the original Aurora `.dnd5e` files (they use the same IDs we do,
   so they can import exactly) and D&D Beyond if wanted. An adapter only *reads*; it never decides.
2. **Interchange model**: the character as facts, each with where it came from: "skill Stealth, chosen in Rogue
   level 1", "feat Alert, from the background", "spell True Strike, from Magic Initiate", "ability increase +2
   Intelligence at Wizard 4". Foundry gives most of this directly (advancement records, `sourceItem`,
   identifiers); Roll20 gives it through trait sources and spell tags.
   Adapters and ID maps are keyed by the file's system version (Foundry dnd5e 3.x, 4.x, 5.x and 6.x differ: for
   example "prepared" became 0/1/2 in 5.x). The corpus keeps files from several versions so a format change is
   caught.
3. **Resolver**: each fact to a content ID, in order: (a) **ID maps**: a generated, reviewed table from the
   Foundry dnd5e compendium IDs and identifiers (classes24, spells24, feats24, origins24, equipment24, and the 2014
   packs) to Aurora IDs; in our 32 test files, 96% of Foundry items carry an identifier and 59% a compendium ID;
   (b) the alias index; (c) fuzzy, reported.
4. **Placement as a solver, not a greedy pass**: all facts and all open choices form one assignment problem. Each
   fact can go into the choices the engine says are legal for it at that level; the solver finds the assignment
   that places the most facts, respects provenance (a Magic Initiate spell goes to Magic Initiate), and never
   exceeds what the file lists. This removes, structurally, the whole family of ordering bugs (cantrips before
   lists, narrowest choice first, repeat feats, backgrounds taking class skills). Characters have at most a few
   hundred facts and choices, so an exact search with a time limit is fast; if the limit is ever hit, the best
   assignment found so far is used and the report says so.
5. **Reconciliation**: build the character, compute the sheet, and compare with the file's own numbers (Roll20: AC,
   HP, proficiency, saves, skills, DC, attack; Foundry: hit points, skill proficiency levels, languages, tools,
   prepared counts). Each difference is explained in the report: *file breaks the rules*, *homebrew*, *content not
   loaded*, or *our mistake* (which fails the test suite).

**Choices the file does not settle are left open by default** and shown as a short to-do list ("Choose 1 cantrip
for Magic Initiate"), with a "fill with suggestions" button. See decision D1.

*Exit test:* every file in the corpus (32 now, growing with every file you send) imports with every fact in a
bucket, zero "our mistake" differences, and a reviewed expected result stored as a snapshot (class levels,
subclass, feats, spells, skills, tools, languages, numbers). Any change that alters a snapshot must be reviewed.

### 3.4 Export layer: every field, read back

- **Declarative sheet maps**: for each sheet (official 2024 fillable and print, classic 2014 three-page, DLtheDM,
  Soul Forge), a table of every field: what fills it, how it is formatted, how much fits. A generated coverage
  report lists every field of the PDF as *filled*, *left empty on purpose (why)*, or *not mapped* (must be zero).
- **Position audit**: field names in third-party sheets are sometimes wrong (DLtheDM's spell header). The audit
  places a marker in each field and reads back where it lands, so a wrong name is caught by position.
- **Read-back verification** after every export: form values for fillable sheets, extracted text for drawn ones.
  Started this week (name, AC, HP, scores, proficiency, each DC, first weapon); extended to every mapped field.
- **Overflow**: features, spells and inventory that do not fit continue on extra pages in the same style; the
  read-back confirms every spell and feature appears once somewhere.
- **Golden images**: three reference characters per sheet (a level 1 fighter, a level 11 multiclass caster, a
  level 20 wizard) rendered to images and approved by you once; any visual change shows as a difference to review.

*Exit test:* coverage report has zero unmapped fields on the three standard sheets; read-back passes for every
character in the nightly run; golden images approved.

---

## 4. Testing at scale (how we prove it)

| Test | What it catches | When |
|---|---|---|
| Unit tests per checker module, from 5e.tools tables | Wrong rule logic | Every commit |
| Content linter and 5e.tools cross-check | Bad or missing content | Every commit (cached) |
| Import corpus with reviewed snapshots | Importer regressions | Every commit |
| Engine vs checker vs file numbers | Disagreements anywhere | Every commit (corpus) and nightly |
| Random characters, coverage-guided (every class, subclass, species, background, feat at least N times), with level-ups, multiclass, companions, optional rules | Rules gaps | Nightly, 1,000+ characters, fresh seeds |
| Shrinking: a failing random character is reduced to the smallest one that still fails | Fast diagnosis | On failure |
| Metamorphic checks: the same choices in a different order give the same character; level up then undo gives the original; JSON save and load gives the same sheet | Order and state bugs | Nightly |
| Sheet read-back and coverage | Export mistakes | Every export in every test |
| Golden images | Visual regressions | Every commit |
| End-to-end app tests | Broken flows | Every commit |
| Release gate: all of the above on a fresh seed, zero unexplained findings | Everything | Every release |

The nightly run can be a scheduled job on this Mac (or in the cloud), writing a short report you can read in the
morning.

---

## 5. Roadmap

Each phase ends with its exit test passing. Until phase 3 is done, new features wait (decision D4).

| Phase | Work | Exit test |
|---|---|---|
| **0. Freeze and baseline** | Stop new features. Turn today's findings into tests. Snapshot current behaviour of the 32 import files. | Snapshots stored; current suite green. |
| **1. Content layer** | Linter, overrides file, stored editions, alias index used everywhere, 5e.tools cross-check. | Zero unexplained linter and cross-check findings. |
| **2. Checker in the app** | Split checker into modules; Rules check panel; checks on import and export; engine vs checker comparison everywhere. | 14 clean nightly runs of 1,000+ characters. |
| **3. Importer v2** | Adapters, interchange model, ID maps from the Foundry compendia, solver placement, reconciliation, open choices by default, Aurora `.dnd5e` import. | Every corpus file fully explained, zero "our mistake". |
| **4. Export v2** | Sheet maps and coverage, position audit, full read-back, continuation pages, golden images. | Zero unmapped fields; read-back green; goldens approved. |
| **5. Keep it that way** | Nightly runs, corpus grows with every file you send, release gate. | Ongoing. |

Phases 1 and 4 can run side by side; 3 depends on 1; 2 can start right away.

---

## 6. What "deterministic" can promise, and what it cannot

**Can promise:**
- The same file and content always give the same character and the same report.
- Every fact in a file is accounted for, and every difference from the file's numbers is explained.
- A character built in the app follows the rules, or the Rules check says exactly where and why it does not.
- Every field we fill is read back; nothing is cut off without a continuation page.

**Cannot promise, and will say so instead of guessing:**
- A file that breaks the rules (more prepared spells than allowed, a subclass too early) stays as the file says
  where possible and is marked, or is corrected with a note; never silently.
- What a file never recorded (Foundry does not store favored enemies; some files list no languages) stays open
  for you to choose.
- Homebrew and books that are not loaded are listed as such; they can be added as custom content.

---

## 7. Decisions for you

- **D1. Unknown choices on import:** leave them open as a to-do list (recommended), or keep filling them with
  marked suggestions?
- **D2. Rules reference numbers in the app:** ship the class tables (numbers only) so the live Rules check is
  complete, or keep them test-only and have the live check rely on the content alone?
- **D3. Standard sheets:** confirm the targets: official 2024 (fillable and print), classic 2014 three-page,
  DLtheDM 2024, Soul Forge. Any others?
- **D4. Feature freeze** until phase 3 passes?

---

## 8. Review notes (how this plan was checked)

Read against every problem found so far, to make sure each has a home:

- Alert taken twice (2014 + 2024) → engine edition rule (3.2) and checker feats module.
- Skilled filling every feat slot, Magic Initiate placed three times → solver placement with file counts (3.3.4).
- Cantrips before Magic Initiate's list, Eldritch Blast before invocations → solver (3.3.4).
- Background taking a class skill, duplicated skills in Foundry files → provenance in the interchange model
  (3.3.2) and reconciliation (3.3.5).
- "Tiny Hut", "Elf, Wood", "Clothes, Traveler's", curly apostrophes, typos → alias index (3.1) and ID maps (3.3.3).
- Prepare list limited to Tasha's (artificer) or to picked spells (cleric) → checker "too few spells to prepare
  from" (added this week) and edition rule (3.2).
- Choices judged at the final level → engine guarantee (3.2), unit-tested.
- Dazzling Footwork, 2024 Draconic Resilience, Mariner, multiclass "or" → checker modules with 5e.tools tables
  (3.2) and the cross-check (3.1).
- DLtheDM fields one box off → position audit (3.4).
- Feat spellcasting DC missing on sheets, clipped text → read-back and continuation pages (3.4).
- Running an old build by mistake → build commit shown in the test app (done this week).
- Arthorias's 11 prepared spells (subclass spells tagged "(SC)", "(A)") and Foundry's prepared = 2 → adapters
  read provenance (3.3.1, 3.3.2), versioned by format (3.3.1).
- Zanna's Magic Initiate counted twice (the Sage's own copy) → provenance plus file counts in the solver (3.3.4).
- Guessed Divine Order, Divine Soul affinity, Elemental Affinity → reconciliation against what the file states
  (training, spells, resistances) inside the solver's scoring (3.3.4, 3.3.5).
- Homebrew in your own loaded content → linter on user content (3.1).

Second pass, for things that have not gone wrong yet but would under this plan's goals:
- Upstream content updates breaking characters → pinned content version (3.1).
- A new Foundry or Roll20 sheet version → versioned adapters and a multi-version corpus (3.3.1).
- A character saved under an older Soul Forge version → JSON round trip and a migration test per format version
  (section 4, metamorphic checks).
- Too many attuned items or an over-encumbered character → checker modules (3.2).
- A sheet updated by its maker (new field names) → position audit fails loudly (3.4).
- Files that break rules or are homebrew → reconciliation buckets and section 6.
