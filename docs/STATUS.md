# Soul Forge: where the engine stands

Updated 2026-11-17 (v0.26.2 released at the start of the day). Every number here was measured on this date unless
marked otherwise, and each comes from a command anyone can run again (last column of the scoreboard). Update this page
at the end of each working session, so the trend shows.

## What is open, in plain words

Everything still to do, in one list. Items move off it when done; nothing open lives anywhere else.

**Waiting on you**
1. Two weeks of testing Soul Forge Test with "5e.tools only" switched on (stage D5's exit). Nothing else replaces it.
2. When to drop Aurora from the release app (D7): after 1, and when the move is ready (below).
3. One spell in your library (Fartister's Guiding Hand) is from a 2017 Unearthed Arcana article 5e.tools does not
   carry. The move keeps it in the file and writes its text into the move note; to keep it on the sheet too, it would
   become a homebrew spell. Your call whether that is worth building.

**Is the move ready? Not yet.** Where it stands:
- 60 characters made fresh on Aurora content: 0 change.
- Your library (26 characters, today's backup): 0 change apart from Guiding Hand above; 2 repeats you had (Stealth
  twice, Arcana twice) are kept and offered as a decision on Build.
- The 400 saved test characters: 70 change (96 this morning). Of those, 41 were already against the rules before the
  move (older builds made them); 29 were legal and still change. Those 29 are the work left; most of them are faults
  in the 5e.tools content itself (the Scout, Defense, Jack of All Trades, Harengon, Tortle were all found this way
  today), so each fix helps every character, not only moved ones.
- Ready means: the 29 explained or fixed, and the 400's accepted count reset to the new low. Then D7 is your call.

**The engine, in this order**
1. The 29 saved characters above (D6).
2. The rules check works out ability scores by source by itself (W5's second half; feature uses are done today and
   found two real faults on their first run).
3. Prove every content statistic does something (W3); the 52 feature texts that promise more than their rules give
   (W10); concepts compared everywhere two providers meet (W6); each rules decision's source written beside it (W7);
   every combination pairwise (W8).

**Interface**
1. Linux drawing lag: needs a measurement on your machine (CachyOS, NVIDIA?) before anything can be changed.
2. Stat blocks for the Echo and the Steel Defender in Play: the content has no creature for them.

Done today and off the list: the linter (oxlint, type aware) and formatting in CI; one running copy of the app and the
two-tabs guard (S8); light themes (cards, windows, icons, the bag); the card windows' last parts (C6.3 was already
built: Done button, shrink, focus, drag into the bag, every "i" in a window).

## The verdict

**The engine builds legal characters and the paper shows everything they have.** On the content the release app
uses (5e.tools and the free SRD rules), the random-character checks, the every-subclass coverage run and the new
"nothing dropped" check all come back clean.

**What keeps it from being finished is not the engine's core but three edges:**
1. **Moving old characters to 5e.tools content** (needed before Aurora can leave the release app): the fresh sample and
   your library are clean; 29 of the 400 saved test characters still change. This is the largest open item.
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
| Old characters move intact | Characters moved from Aurora to 5e.tools ids: fresh / your library / 400 saved | 0 of 60 change; 0 of 26 change (1 old UA spell kept as text); 70 of 400 change (96 this morning), 29 of them legal before the move | 0 unexplained changes | `RULES_TIER=migrate MIGRATE_FRESH=60`; `MIGRATE_LIBRARY=<backup>`; `RULES_TIER=migrate` |
| Outside check | fastcharacter.com characters imported and compared | 92 characters; the differences found to be ours are fixed; the rest are the site's own slips, not yet in an explained list | gate on the unexplained | `RULES_TIER=fastchar` |
| Tests | Unit tests / end-to-end tests | 391 / 59, all passing; CI green (an end-to-end test that failed three times on GitHub is fixed: a card covered what it clicked) | | `npm run gates` |

## The plans, item by item

### Master plan (MASTER-PLAN.md), stage by stage

| Stage | What | State |
|---|---|---|
| A. Engine fixes and buildout | A1 wrong results on real characters (10), A2 missing engine features (13), A3 audits (3), A4 Unearthed Arcana | **Done** (A1 to A4, all 26 items). A0.1, cross-checking every engine area with Plutonium, is a standing rule, not an item to finish |
| B. Tests | Unit tests, the full check, Chris's own data and characters, then a release | **Done as a practice**: every change runs the gates; full checks run before releases. Chris's library went through the move on 17 November (clean apart from one UA spell) |
| C1 to C4. Builder, navigation, backpack and shop, floating cards and the Bag of Holding | | **Done** |
| C5. Other interface work | 15 items | 12 done. Open: C5.3 stat blocks for the Echo and the Steel Defender (the rest done), C5.4 and C5.6 Linux drawing lag (needs a measurement on Chris's machine) |
| C6. Finish (Chris's test of the release, 2026-10-28) | 7 items | **Done** (C6.3 checked 17 November: every part built) |
| C7. Chris's test of v0.23.0 | 20 items | **Done** |
| D0 to D4. Licenses, two apps, free rules bundled, SRD API check, 5e.tools standing on its own | | **Done** (parity 500 of 500) |
| D5. Testing without Aurora | Exit: five clean full checks without Aurora, and two weeks of Chris testing the test app in 5e.tools-only mode | Running in every check; the five full checks and Chris's two weeks have not been done |
| D6. Old characters move to 5e.tools | Exit: 400 saved characters and Chris's library, no unexplained sheet change | Fresh 60: 0 change. Chris's library: 0 apart from one UA spell. 400 saved: 70 change, 29 of them legal before; work left |
| D7. The release app drops Aurora | Exit: Chris's go-ahead after D5 and D6 | Waiting |

So: the builder itself (stages A to C) is finished apart from two small interface items. What remains is stage D,
the switch to 5e.tools only, and that is what the engine plan below works towards.

Outside the master plan, done 17 November: light themes; the linter and formatter (H1); S8 (one running copy, the
two-tabs guard). Still open from the audit: stricter types, the engine-shape items E1 to E6 (none blocks legality).

### Engine plan: legal and drop free (ENGINE-LEGAL-PLAN.md)

| Item | What | State |
|---|---|---|
| W1 | A pick its choice does not offer is a finding | **Done** (and fixed for spellbooks the same day) |
| W2 | Picks with no place now are shown, not ignored | Open |
| W3 | Every content statistic proved by its effect | Open. Would have caught the scores-past-20 bug |
| W4 | Nothing dropped from engine to sheet to print | **Done**: measurement, CI gate, and the fix it found (invocations, metamagic, maneuvers missing from every sheet on 5e.tools content) |
| W5 | The rules check judges everything itself | **Partly**: skills, saves, weapon attack and damage, training, slots, hit points, AC, class features, and since 17 November feature uses by level from the class table (it found the 2024 Second Wind and Wild Shape stuck at 2). Open: ability scores by source, initiative, speed, languages and tools by count, species and background features present |
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
| D6: old characters move to 5e.tools | Fresh sample and Chris's library clean; 29 of the 400 saved characters still to explain or fix |
| D7: release app drops Aurora | Waits for D5 and D6, and your go-ahead |

### Audit (AUDIT-2026-11-10.md)

| Part | Done | Open |
|---|---|---|
| Data safety S1 to S9 | S1 to S8 | S9 with D7 |
| Rules and play R1 to R25 | 20 fixed or found sound | R6 guarded, not rewritten; R7, R8 to verify; R19 replaced by the fresh migration measure |
| Engine shape E1 to E6 | none | all six; none blocks legality |
| Tooling H1 to H6 | H1 (oxlint and Prettier in CI), H4, H5 partly | stricter types; the lint's style rules, now warnings |

## Fixed on 17 November

Rules faults on 5e.tools content, each for every character (found by moving characters and by the new uses check):
- Tortles of Monsters of the Multiverse had AC 10 + Dexterity, not 17.
- The 2014 Defense fighting style gave nothing; the 2024 one gave +1 even without armor.
- The 2024 Circle of the Moon added Wisdom to Constitution saves at all times (only in Wild Shape); the same for the
  Swiftstride Shifter's speed and Stride of the Elements.
- The 2024 Jack of All Trades added to initiative (it is for checks that use a skill), on both content sets.
- Harengons lacked Hare-Trigger; the 2014 Scout's Survivalist gave expertise without the proficiency.
- The 2024 Fighter's Second Wind and the 2024 Druid's Wild Shape stayed at 2 uses at every level.
- Initiate of High Sorcery asked no moon spells; spell sets offered both editions' copies of a spell.
- The Feylost gave two languages (its text: one); adventure books had no names or editions (adventures.json).
- Tasha's Customized Language option exists on 5e.tools content.
- Aurora's Ki, Monk's Focus and Font of Magic had no use count on the sheet (test app).

The move: a feat's spell list named like a class, class improvements, Resilient's score, repeats the original had,
the Dark Elf, gear 5e.tools lacks (kept as custom items).

Tools and interface: oxlint and Prettier in CI and the release; one running copy of the desktop app and the two-tabs
guard; light themes.

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

1. D6: the 29 saved characters that were legal and still change.
2. W5: the checker judges ability scores by source.
3. W3: prove every statistic has an effect.
4. W10 triage: decide each of the 52.
5. A release with today's fixes on your word.

## Open things you reported, not engine

- Done 2026-11-13: the Export tab's sheet preview is drawn on request ("Show a preview of the filled sheet"), and
  offers a redraw when the character changes, instead of redrawing on its own and holding the app up.
- Light themes: some icons become unreadable and the cards stay dark (noted 2026-11-13; THEMES-REVIEW, last section).
