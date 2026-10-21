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

## Progress

### 2026-10-20

- **E1 (canonical content) started:** src/engine/concepts.ts, ir.ts and load.ts, with the test load.test.ts. On
  the real content (Aurora and 5e.tools):
  - 21,876 elements load;
  - 241 merge into shared concepts, and 139 concepts are shared by both sources;
  - 0 unmapped concepts and 0 dangling references.
- **E2 (timeline) started:** src/engine/timeline.ts is the level-by-level resolver. It returns the same
  `Resolved`, so it can be compared with the old one. Fixes that come with it:
  - requirements separate character level from class level;
  - provenance chains in the walk, so "!X" means "X from elsewhere";
  - src/engine/replace.ts lists the choices that may change on level-up.
- **Differential run** (`RULES_TIER=diff`, src/engine/timeline.diff.test.ts), on 300 saved characters:
  - every element and every sheet number agree (HP, AC, abilities, skills, speed, initiative);
  - the only differences are 43 picks the timeline rejects. All are Epic Boons taken before level 19, which the
    old engine allowed because it judged everything at the final level. These are old bugs; the random builder
    made them and the rules check could not see them.
  - Requirement loops: 4 found by the timeline, then 0 once provenance was added. The old engine stopped these
    after 6 passes, so their state depended on pass parity.
- **Speed:** settled levels are cached by the rest of the character, the previous level's state and the choices
  that level read.
  - A Wizard 20 resolves in 71 ms cold.
  - After one change it takes 8.8 ms, against 5.3 ms for the old resolver, which is fine for the UI.
- **Open:**
  - The random builder and autofill must judge picks against the timeline. They now produce the Boon errors
    above.

### 2026-10-20 (evening)

- **Speed:** makeCtx rebuilt the element-type set and worn-item facts for every rule; now once per walk. A resolve
  went from about 50 ms to 4 ms (one change: 2 ms). The rules check had timed out at 4 hours because of this.
- **E2 classes closed:**
  - mutual exclusions ("A unless B", "B unless A": the DMG and PHB 2024 Pistol) settle within one walk;
  - changeable choices (spells known, invocations) take their options from the current level;
  - requirements are judged by concept as well as id (an Aurora training requirement is met by 5e.tools' and
    the reverse), and each option of a choice is judged as itself (`ReqCtx.as`);
  - a choice offers one option per element of one book, the primary provider's (as the lists do).
- **E1 / content (5e.tools converter):**
  - `bookKey()`: one identity per book across providers; lists showed species twice;
  - `resolveCopies()`: every `_copy` (311 entries) resolved with the full `_mod` set;
  - one training reader for every proficiency field; lists of several entries are a choice of one set;
    "other" languages are the ones the text names;
  - subraces required ("<species> (standard)" for the nameless one); table cells with links read as numbers
    (the 2014 warlock had no pact slots); standard tools always exist; sidekick classes hidden;
  - `castingRules()` shared by classes and subclasses (Eldritch Knight, Arcane Trickster).
- **E3 started:**
  - `src/engine/mechanics.ts`: the mechanics table, built from data. A 5e.tools feature takes the mechanics of
    its Aurora twin (same kind, name, edition, owner by name; same book for playtests). Only what the copy and
    its owner lack; only portable rules. 394 features. Effects on all 18 skills also reach initiative.
  - `StatBook.parts()`; the checker verifies table base plus attributable parts. No feature-name lists remain
    in rulesCheck.ts.
- **Audits:**
  - `RULES_TIER=parity` (src/engine/parity.test.ts): every listed entry once; required choices with nothing to
    pick 308 -> 0; Aurora vs 5e.tools twins: grants 167 -> 12, numbers 9 -> 1. The rest are model differences.
  - `RULES_TIER=fastchar` (src/aurora/fastchar.test.ts): 40 random 2024 characters from fastcharacter.com.
- **Next:**
  - E3: typed effects for the remaining prose-only features (feature attacks such as Psychic Blades), the
    calculators as one module the sheet reads;
  - E4: autofill and random with lookahead; the importer's assignment solver;
  - E5: stable choice keys and migration, the old resolver removed, PDF read-back.

### 2026-10-21

- **E3:**
  - `src/engine/effects.ts`: typed effects for mechanics no content states as rules (Dueling, Crossbow Expert,
    Tavern Brawler, Empowered Strikes, Psychic Blades, natural weapons), keyed by canonical name and kind. No
    feature-name rule remains in sheet.ts or rulesCheck.ts.
  - Feature attacks on the sheet; magic weapons listed per bonus.
  - Exit test: 1,000 random characters, 999 clean; the one finding was the checker's (fixed: the multiclass table
    counts only classes that cast at their level).
- **E4:**
  - Importer: an assignment solver for stated trainings (augmenting paths over every open choice).
  - Autofill: skips what the character has under any provider's id; prepares spells up to the limit, by the
    class's own spell level (multiclass bug found by the 1,000 run).
- **E5:**
  - Stable choice keys: owner id + fingerprint (kind, name, level). Old position keys are read only when every pick
    fits the choice's kind. 300 saved characters resolve unchanged.
  - The old resolver is removed. `RULES_TIER=diff` is now a sheet snapshot of 400 saved characters, plus the
    determinism contract (choice order, resolving twice, level down and up).
- **E1:**
  - The lossless-load gate (`src/engine/fields.ts`, load.test.ts): every 5e.tools field is read or decided.
    0 undecided, 20 planned (`<cache>/engine/fields-planned.txt`).
  - Converter: weapon masteries, class feat progression, repeatable feats, subrace overwrite, multiclass
    requirements (2014 "or", 2024 primary ability), item DC/speed/attack/proficiency/check bonuses, blindsight,
    starting gear.
- **Not done, by decision:**
  - The resolver still reads Aurora-shaped elements rather than the IR. Concepts are applied where they matter
    (requirements, choices, lists, the importer), so moving the resolver onto the IR would change no result.
  - The 20 planned fields are features (resources, item spells and charges, creature type, cantrip scaling).
  - E5's "14 clean nightly runs" needs a nightly job on this Mac; not set up.
- **E4 exit met:** 10,000 random characters (seed 424242, `RULES_BIG=10000 RULES_NOPDF=1`), 0 with findings. The
  run before found 3 repeated expertise picks; the cause was Aurora's 2014 expertise options being Class Features
  outside the concept vocabulary (fixed in e092f1c).
