# Engine master plan: a deterministic rules engine (2026-10-20)

This plan merges the user's architecture plan (charforge-reliability-architecture-plan.md, kept in Downloads) with
what the audit found, and fixes where that plan would still guess. It replaces the engine parts of
RELIABILITY-PLAN.md. PLAN-audit.md stays the test and coverage plan around it.

## 1. Critique of the architecture plan

### Confirmed in the code (2026-10-20)

- `resolve()` re-walks the whole character up to 6 times and stops (engine.ts:425).
- `[character:X]` is evaluated as `[level:X]` against the owner's class level (requirements.ts:126).
- Requirements read the final stats, so an ASI from level 8 can satisfy a feat at level 4 (engine.ts:438 uses
  `pass.stats`).
- Choices are keyed `elementId|ruleIndex`.
- `mergeSlots` hands picks to merged slots in order, not by level (Slots.tsx:78).
- 5e.tools classes offer two independent optional choices per ASI level (fivetools.ts:604–605), so a character
  can take both.
- 5e.tools content uses its own vocabulary (`ID_5ET_PROF_*`, `ID_5ET_SAVE_*`, `ID_5ET_SKILL_*`, `category O`),
  separate from Aurora's (`ID_PROFICIENCY_*`, `Origin`).
- The lineage name on the sheet is dead code (sheet.ts:539 ends in `&& false`).
- The sheet and the rules check compute the same things twice, in different code (sheet.ts and rulesCheck.ts).

### What the plan gets right, and is kept

- A canonical vocabulary shared by every content source.
- Stable choice keys.
- Separate character level, class level and the level a choice was made at.
- One calculation kernel for the sheet and the checker.
- AC and attack pipelines.
- ASI or feat as one choice.
- A constraint solver for imports.
- Metamorphic tests (order independence, level up and down).

### Where it would still guess, and the fix

1. **"20 passes plus cycle detection" is still a fixpoint guess.** More passes only move the cliff. A character is
   built in order (origin, then level 1, 2, 3...), so the engine should build it that way.
   - **Fix: a timeline resolver.** Each step applies only what that step grants, opens its choices, and judges
     them against the state *at that step*.
   - Only elements granted at the same step can depend on each other. That set is small, closed and checked to
     terminate.
   - This removes both the pass limit and the future-stat bleed by construction, not by more iterations.
2. **Alias grants ("grant every sibling alias") double-count.** Two copies of a proficiency are harmless in a
   set, but two copies of a stat bonus, a resistance or a spell are not.
   - **Fix: canonicalize at load time.** Each concept (skill, save, armor or weapon training, language, size,
     sense, damage type, condition, feat category) gets one canonical key, and every reference is rewritten to
     it.
   - Same content from two sources (Fireball from Aurora and from 5e.tools) becomes one entry with two sources
     and one chosen primary, never two entries.
3. **MPMB's eval/removeeval is not needed.** It exists because MPMB mutates a PDF. The new engine is a pure
   function of the character's recorded choices: every change recomputes. Removing a level or a choice removes
   everything that came from it, automatically. Provenance is still recorded, as output (what came from where),
   for the UI and the importer.
4. **AC and attack hooks keyed to element ids** (`ID_CLASS_BARBARIAN_UNARMORED_DEFENSE`) break for the next book,
   the 2014 version, or a 5e.tools copy.
   - **Fix: typed effects carried by the content.** Examples: `ac-formula {base: 10, add: [dex, con], noArmor:
     true}`, `attack-ability {weapons: "bound", ability: cha}`.
   - Aurora already expresses most of these as stats, and the loader translates them.
   - Features whose mechanics exist only in prose (most of 5e.tools) get them from a small curated **mechanics
     table** keyed by canonical feature key, never by source id. Plutonium's foundry effects can seed it where
     they exist.
5. **"Close the 22 unread fields"** is a moving target. The atlas already lists more, and the count changes with
   every 5e.tools release.
   - **Fix: a lossless-load gate.** Every field of every source either maps to the canonical model or is listed
     as display-only with a reason. The load fails the test on any field that is neither.
6. **Slot paths built from category and name slugs** change when content renames a feature.
   - **Fix: key = owner's canonical key + a fingerprint of the choice** (kind, filter, level, count).
   - Old `id|index` keys migrate by matching the fingerprint, and anything ambiguous is reported, never guessed.
7. **Missing from the plan:**
   - a determinism contract;
   - edition handling (2014 and 2024 side by side, 2024 replacing 2014 features);
   - choices whose options depend on the character (`$(spellcasting:list)`);
   - the full spellcasting model (known, prepared, spellbook, pact, rituals, always-prepared, feat and species
     casting);
   - companions and wild shapes;
   - content fixes as a data layer;
   - the random builder needing the same solver as the importer;
   - performance (the UI resolves on every click).

## 2. Determinism contract

The engine is `resolve(content, character) -> CharacterState`.

- **Pure:** no clock, no randomness, no I/O, no global state.
- **Total:**
  - every input produces a state;
  - illegal or incomplete input produces a state *with findings*, never a silent fix;
  - the engine never chooses on the player's behalf.
- **Order-free:**
  - the order of choices, classes in the file, or content files does not change the result;
  - every list in the output has a stable sort.
- **Explained:**
  - every number in the state carries its parts (where each contribution came from);
  - every element carries its provenance (which step, which choice);
  - every option a choice rejects carries the reason.
- **Strict:** an unknown rule, an unknown stat name or a reference to missing content is a finding, never ignored.

Autofill, the random builder and the importer are separate **solvers**. They propose choices, the engine judges
them, and they never change the engine's answer.

## 3. Architecture

```
Aurora XML ─► Aurora loader ─┐
5e.tools JSON ─► 5e.tools loader ─┼─► Canonical content (IR) ─► Timeline resolver ─► Effects ─► Calculators ─► CharacterState
Content fixes (data) ────────┘        concept keys, merged         per-step state      typed       AC, attacks,     │
                                      duplicates, typed effects,   and choices                     spellcasting,    ├─► Sheet renderers
                                      lossless report                                              HP, skills...    ├─► Rules checker
                                                                                                                    └─► UI (choices, reasons)
```

### 3.1 Canonical content (IR)

- **Concept keys:** `skill:perception`, `save:str`, `armor:heavy`, `weapon:martial`, `weapon:longsword`,
  `tool:thieves-tools`, `language:elvish`, `size:medium`, `sense:darkvision`, `damage:fire`, `condition:charmed`,
  `feat-category:origin`. One registry maps every source id and tag to a key.
- **Elements:** each has:
  - a key, a kind (class, subclass, species, lineage, background, feat, feature, spell, item...), an edition
    (2014 or 2024), sources and text;
  - its **effects**, typed (below);
  - its **choices**, typed (below);
  - its **requirements**, as a parsed tree, not a string.
- **Duplicates across sources** merge by (kind, normalized name, edition), with the sources listed. One primary
  provides the mechanics, chosen by a fixed priority (official Aurora core, then 5e.tools, then the rest) and
  recorded.
- **Content fixes** (today's contentFixes.ts) become IR patches applied at load, each with a reason and a test.

### 3.2 Effects (typed; everything that changes a character is one of these)

- **Proficiency or expertise:** a skill, save, tool, armor, weapon, weapon group or language.
- **Ability score:** a change (with its stacking group), or a set (Gauntlets), or a raised maximum.
- **Stat:** a named number with a stacking rule (base, max-of, sum). The open-ended escape hatch, but only with
  names in the stat dictionary.
- **AC formula; attack modifier:** an attack modifier names the ability, the damage die, a property change or the
  crit range, and which weapons it applies to.
- **Speed, sense, resistance, immunity or vulnerability, size.**
- **Spells:**
  - a spellcasting source (list, ability, mode: known, prepared, spellbook or pact);
  - a granted spell (always prepared, uses per rest).
- **Resource:** uses, recharge and a scaling table.
- **Grant:** another element (a feature or a feat).
- **Replace:** this element replaces another (2024 features over 2014, subrace overwrites, lineage replacing the
  base trait).

### 3.3 Choices

A choice has:
- a stable key;
- a kind;
- a filter over IR elements (a query, not a string);
- a count;
- the step it belongs to;
- exclusivity groups (ASI *or* feat);
- a rule for duplicates (a repeat is replaced, not wasted).

Dynamic filters (the character's spell list, mastered weapons) are resolved from the state at that step.

### 3.4 The timeline resolver

- **Steps:** origin (species, lineage, background), then character level 1..N in the order the classes were taken
  (class history), then extras (items equipped, feats from items).
- **At each step:**
  1. Add the grants for this step.
  2. Close the same-step set (bounded by the elements present).
  3. Open the choices.
  4. Apply the recorded picks.
  5. Judge each pick and requirement against the state at this step: character level, class level and stats as
     of now.
- **Output:**
  - the final state;
  - each step's state (for level-up, the importer and the checker);
  - provenance;
  - findings.
- **Incremental:** a change at step k recomputes from k on. That's fast enough to run on every click.

### 3.5 Calculators (the one kernel)

AC, attacks, HP, saves, skills, initiative, speed, senses, spellcasting (slots, multiclass table, pact, DC and
attack, prepared limit, known counts), resources and carrying.

- **Each one is a pure function of the effects**, and each returns its value with its parts.
- **The sheet renderers and the rules checker both read these;** neither computes anything itself.
- **The checker keeps only rules checks:** completeness, legality at the step, budgets, and comparison with the
  5e.tools class tables.

### 3.6 Solvers

- **Autofill and random:** constraint search over the open choices with the engine as judge. It looks ahead so
  it never paints into a corner, and it is deterministic given a seed.
- **Importer:** facts with provenance, matched to slots by an assignment solver (the user's Pillar 4), then
  reconciled against the file's numbers.

## 4. Migration (the app keeps working throughout)

The new engine is built beside the old one (`src/engine/`), behind a setting, with **differential testing**:
- Every character in the test corpus (about 7,000 saved characters, the import corpus, the user's characters)
  runs through both engines.
- Every difference is classified: an old bug (new is right), a new bug (fix it), or a rules question.
- The switch happens when the remaining differences are all old bugs. The old engine is then deleted.

Saved characters migrate their choice keys on load, by fingerprint, with a report of anything that could not be
matched.

## 5. Phases and exit tests

1. **E1, canonical content.**
   - Aurora and 5e.tools loaders to IR: concepts, duplicate merging, typed effects from Aurora stats, the
     lossless-load report.
   - Exit:
     - every Aurora element (excluding UA) and every 5e.tools entry loads;
     - 0 unmapped fields or rule kinds outside the display-only list;
     - 0 dangling references;
     - every concept used by both sources maps to one key.
2. **E2, timeline resolver and choices.**
   - Stable keys, the step-scoped requirement context, exclusivity groups, dynamic filters.
   - Exit:
     - order-independence and level-up/level-down tests pass;
     - the differential run on the corpus is fully classified.
3. **E3, calculators.**
   - AC, attacks, spellcasting and the rest, with parts; the mechanics table for prose-only features (seeded from
     the 5e.tools class tables and Plutonium effects).
   - Exit:
     - the sheet and the checker read only the calculators;
     - the 1,000-character run is clean.
4. **E4, solvers.**
   - Autofill and random with lookahead; the importer assignment solver and reconciliation.
   - Exit:
     - no dead ends in 10,000 random builds;
     - the import corpus is green.
5. **E5, switch.**
   - The UI on the new engine, migration of saved characters, the old engine removed, PDF read-back on every
     sheet.
   - Exit: 14 clean nightly runs (the user's plan).

## 6. Start (E1, first steps)

1. Concept registry: skills, saves, armor, weapon categories and weapons, tools, languages, sizes, senses, damage
   types, conditions, feat categories. Aliases from both sources.
2. IR types for elements, effects, choices and requirements.
3. Aurora loader: the parsed XML (parse.ts output) to IR, every rule kind and stat name either mapped or reported.
4. 5e.tools loader: the 5e.tools JSON directly to IR, not through the Aurora shape. The converter becomes the
   loader.
5. The coverage test: the counts per kind, unmapped items, duplicate merges, and concepts shared across sources.
