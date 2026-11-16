# Soul Forge: where the engine stands

Updated 2026-11-16, evening (v0.26.1 released with everything up to the morning of 16 November). Every number here was measured on this date unless marked otherwise, and each comes from a command anyone can run again (last column). Update this page at the end of each working session, so the trend shows.
marked otherwise, and each comes from a command anyone can run again (last column). Update this page at the end of
each working session, so the trend shows.

## What is open, in plain words

Everything still to do, in one list. Items move off it when done; nothing open lives anywhere else.

**Waiting on you (decisions or your time)**
1. Two weeks of testing Soul Forge Test with "5e.tools only" switched on (stage D5's exit). Nothing else replaces it.
2. Whether to install two new tools: a code linter (audit H1) and protection against two app windows writing at once
   (audit S8). Both are new dependencies, so your yes is needed.
3. When to drop Aurora from the release app (D7). Only after 1, and after the move check on your library (below).

**The engine, which I am working through (in order)**
1. The move to 5e.tools: one Druid still changes (Frostbite from two lists shifts its other cantrips).
2. The move on your own library and the 400 saved test characters: stage D6's exit check.
3. The rules check works out ability scores and feature uses by itself (engine plan W5).
4. Prove every content statistic does something (W3); look through the 52 feature texts that promise more than their
   rules give (W10); compare everything two providers can disagree on by concept (W6); write every rules decision's
   source next to it (W7); every combination pairwise (W8).

**Interface, smaller, not started**
1. Light themes: some icons unreadable, cards stay dark.
2. Wild Shape and companion cards in Play (mostly done), the last card-window polish, Linux drawing lag.

## The verdict

**The engine builds legal characters and the paper shows everything they have.** On the content the release app
uses (5e.tools and the free SRD rules), the random-character checks, the every-subclass coverage run and the new
"nothing dropped" check all come back clean.

**What keeps it from being finished is not the engine's core but three edges:**
1. **Moving old characters to 5e.tools content** (needed before Aurora can leave the release app): 24 of 60 moved
   test characters still come out different from the original (33 this morning). This is the largest open item.
2. **The rules check still trusts the sheet for some numbers** (ability score sources, feature uses, languages and
   tools by count). Until it judges those itself, a wrong number there can pass unseen, as two did this week.
3. **New books state some choices only in their text.** About 50 of 4,023 features are candidates; each needs a
   look.

The endless-fixing feeling has a cause: until this week most checks measured "is the character legal", not "did
anything get lost or changed". Losses were found by you, one at a time. The new measurements below turn each kind of
loss into a number that can only go down.

## Scoreboard

| Promise | Measure | Today | Goal | How to rerun |
|---|---|---|---|---|
| Characters are legal | Random characters with no rules finding, 5e.tools / SRD / both | 200/200 · 200/200 · 200/200 (seeds 20261117, 20261118) | stays at 100% | `RULES_TIER` big batch, see CODE-GUIDE |
| Every subclass works | Coverage run: every subclass, species, background and feat built and checked (5e.tools) | clean (2026-11-12) | clean on every set | `RULES_TIER=full` coverage |
| 5e.tools stands without Aurora | Same sheet with and without Aurora (parity effect) | 500/500 | 500/500 | `RULES_TIER=parity-effect` |
| Nothing dropped engine to paper | Characters whose every feature, spell, training and item reaches the sheet and the print data | 5e.tools 300/300, SRD 300/300, both 297/300 | 100% everywhere | `RULES_TIER=conserve`; 80 SRD characters in every CI run |
| Nothing dropped data to engine | Features whose text promises a choice or gift no rule gives | 52 candidates of 4,023 (to triage) | 0 unexplained | `RULES_TIER=prose` |
| Old characters move intact | Fresh, legal characters moved from Aurora to 5e.tools ids | 43 of 60 unchanged and within the rules (17 on 13 Nov), of which 9 lose only content 5e.tools does not have; 1 changes; 5 wait for the player's decision (a subclass or a repeated pick, kept as built); no rules finding brought by the move (16 are the original's own picks against rules 5e.tools states) | 0 unexplained changes | `RULES_TIER=migrate MIGRATE_FRESH=60` |
| Outside check | fastcharacter.com characters imported and compared | 92 characters; the differences found to be ours are fixed; the rest are the site's own slips, not yet in an explained list | gate on the unexplained | `RULES_TIER=fastchar` |
| Tests | Unit tests / end-to-end tests | 391 / 59, all passing; CI green (an end-to-end test that failed three times on GitHub is fixed: a card covered what it clicked) | | `npm run gates` |

## The plans, item by item

### Master plan (MASTER-PLAN.md), stage by stage

| Stage | What | State |
|---|---|---|
| A. Engine fixes and buildout | A1 wrong results on real characters (10), A2 missing engine features (13), A3 audits (3), A4 Unearthed Arcana | **Done** (A1 to A4, all 26 items). A0.1, cross-checking every engine area with Plutonium, is a standing rule, not an item to finish |
| B. Tests | Unit tests, the full check, Chris's own data and characters, then a release | **Done as a practice**: every change runs the gates; full checks run before releases. Chris's own library has not been run through the move yet (part of D6) |
| C1 to C4. Builder, navigation, backpack and shop, floating cards and the Bag of Holding | | **Done** |
| C5. Other interface work | 15 items | 12 done. Open: C5.3 Wild Shape and companion cards in Play (mostly done), C5.4 Linux window flicker (seems gone, drawing lag in places), C5.6 lag work if profiling shows rendering costs |
| C6. Finish (Chris's test of the release, 2026-10-28) | 7 items | 6 done. Open: C6.3 card windows' remaining parts |
| C7. Chris's test of v0.23.0 | 20 items | **Done** |
| D0 to D4. Licenses, two apps, free rules bundled, SRD API check, 5e.tools standing on its own | | **Done** (parity 500 of 500) |
| D5. Testing without Aurora | Exit: five clean full checks without Aurora, and two weeks of Chris testing the test app in 5e.tools-only mode | Running in every check; the five full checks and Chris's two weeks have not been done |
| D6. Old characters move to 5e.tools | Exit: 400 saved characters and Chris's library, no unexplained sheet change | 42 of 60 fresh characters unchanged, 4 change; the 400 saved characters and Chris's library not run yet |
| D7. The release app drops Aurora | Exit: Chris's go-ahead after D5 and D6 | Waiting |

So: the builder itself (stages A to C) is finished apart from four small interface items. What remains is stage D,
the switch to 5e.tools only, and that is what the engine plan below works towards.

Open outside the master plan: light themes (unreadable icons, dark cards); the audit's tooling items (linter,
stricter types, silent catches), which need your yes for new installs; S8 (two copies of the app writing at once),
also a new dependency for your call.

### Engine plan: legal and drop free (ENGINE-LEGAL-PLAN.md)

| Item | What | State |
|---|---|---|
| W1 | A pick its choice does not offer is a finding | **Done** (and fixed for spellbooks the same day) |
| W2 | Picks with no place now are shown, not ignored | Open |
| W3 | Every content statistic proved by its effect | Open. Would have caught the scores-past-20 bug |
| W4 | Nothing dropped from engine to sheet to print | **Done**: measurement, CI gate, and the fix it found (invocations, metamagic, maneuvers missing from every sheet on 5e.tools content) |
| W5 | The rules check judges everything itself | **Partly**: skills, saves, weapon attack and damage, training, slots, hit points, AC, class features. Open: ability scores by source, initiative, speed, feature uses, languages and tools by count, species and background features present |
| W6 | Two providers compared by concept everywhere | **Partly**: requirements and weapon training. The rest of the sweep is open |
| W7 | Every rules decision in the code names its source | Open. Three wrong readings this week were undocumented decisions |
| W8 | Every combination, pairwise | Open (the coverage run reaches every subclass, species, background and feat once) |
| W9 | Outside references with an explained list | **Partly**: FastCharacter runs; no explained list yet |
| W10 | A feature's text promises no more than its rules give | **Measured**: 52 candidates, triage open |

### 5e.tools plan (PLAN-5ETOOLS.md)

| Stage | State |
|---|---|
| D0 to D3: licenses, two apps, free rules bundled, SRD API check | Done |
| D4: 5e.tools stands on its own | Done (500/500) |
| D5: testing without Aurora | Running in every check. Exit needs five clean full checks without Aurora and two weeks of your testing |
| D6: old characters move to 5e.tools | Nearly done on the fresh sample: 43 of 60 unchanged, 1 changes, nothing thrown away, the player decides where the newer rules differ. Next: Chris's own library and the 400 saved characters |
| D7: release app drops Aurora | Waits for D5 and D6, and your go-ahead |

### Audit (AUDIT-2026-11-10.md)

| Part | Done | Open |
|---|---|---|
| Data safety S1 to S9 | S1 to S7 | S8 (two copies running at once: a new dependency, your call); S9 with D7 |
| Rules and play R1 to R25 | 20 fixed or found sound | R6 guarded, not rewritten; R7, R8 to verify; R19 replaced by the fresh migration measure |
| Engine shape E1 to E6 | none | all six; none blocks legality |
| Tooling H1 to H6 | H4, H5 partly | linter (needs an install), stricter types, silent catches |

## Fixed on 16 November
- On 5e.tools content the 2014 Knowledge Domain's Blessings of Knowledge gave its two skills without the doubled
  proficiency its text gives. Its options now give skill and expertise; picks characters saved as the bare skill
  are read as the option that gives it, under the same key, so no saved pick breaks.

- A 2014 Warlock could not learn its patron's expanded spells (the Archfey's Sleep, the Fiend's Burning Hands) on
  5e.tools content or the bundled free rules.
- A 2014 Paladin prepared a spell at level 1 (it casts from level 2), on every content set.
- The move: Strixhaven colleges and their cantrip sets, versioned 2014 feats (Magic Initiate, Ritual Caster), the
  class chosen inside a feat taking a feat choice, and the player's own repeats kept as built with a decision.

## Fixed this week because of the measurements

- Scores could not pass 20 even where a rule allows it (Primal Champion, every Epic Boon), on every content set.
- With a 2024 background, an older species' increases counted instead of the background's.
- The level-19 Epic Boon offered boons only; Lessons of the First Ones gave no feat.
- Eldritch Invocations, Metamagic, Maneuvers and Fighting Styles were missing from every printed sheet and from
  the feature cards on 5e.tools content.
- With "Print the entire spellbook", fillable sheets got cards for prepared spells only.
- A Wizard's spellbook picks were marked against the rules by a new check (fixed the same day).
- Defensive Duelist put the Proficiency Bonus on armor class permanently on 5e.tools content (it is a reaction):
  every effect a feature applies only when used was treated as always on. 254 such effects in the data.
- Instruments beyond the Player's Handbook's ten (birdpipes, glaur, longhorn...) had no training on 5e.tools
  content.

## Next, in order

1. D6, the move: 1 of 60 still changes (a Druid with Frostbite from two lists). Then the move on Chris's library and
   the 400 saved characters.
2. W5: the checker judges ability scores by source and feature uses by level from the reference.
3. W3: prove every statistic has an effect.
4. W10 triage: decide each of the 52.
5. A release with the three fixes on main.

## Open things you reported, not engine

- Done 2026-11-13: the Export tab's sheet preview is drawn on request ("Show a preview of the filled sheet"), and
  offers a redraw when the character changes, instead of redrawing on its own and holding the app up.
- Light themes: some icons become unreadable and the cards stay dark (noted 2026-11-13; THEMES-REVIEW, last section).
