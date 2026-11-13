# Soul Forge: where the engine stands

Updated 2026-11-13, end of the day's session (v0.26.0 released; main is seven fixes ahead). Every number here was measured on this date unless
marked otherwise, and each comes from a command anyone can run again (last column). Update this page at the end of
each working session, so the trend shows.

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
| Characters are legal | Random characters with no rules finding, 5e.tools / SRD / both | 300/300 · 300/300 · 300/300 (seed 20261113); after today's last fix 200/200 · 200/200 (seed 20261116) | stays at 100% | `RULES_TIER` big batch, see CODE-GUIDE |
| Every subclass works | Coverage run: every subclass, species, background and feat built and checked (5e.tools) | clean (2026-11-12) | clean on every set | `RULES_TIER=full` coverage |
| 5e.tools stands without Aurora | Same sheet with and without Aurora (parity effect) | 500/500 | 500/500 | `RULES_TIER=parity-effect` |
| Nothing dropped engine to paper | Characters whose every feature, spell, training and item reaches the sheet and the print data | 5e.tools 300/300, SRD 300/300, both 297/300 | 100% everywhere | `RULES_TIER=conserve`; 80 SRD characters in every CI run |
| Nothing dropped data to engine | Features whose text promises a choice or gift no rule gives | 52 candidates of 4,023 (to triage) | 0 unexplained | `RULES_TIER=prose` |
| Old characters move intact | Fresh, legal characters moved from Aurora to 5e.tools ids | 26 of 60 unchanged (17 this morning); 24 change (spells 14, feats 5, skills 4); 11 lose something; 19 get a rules finding (27) | 0 unexplained changes | `RULES_TIER=migrate MIGRATE_FRESH=60` |
| Outside check | fastcharacter.com characters imported and compared | 92 characters; the differences found to be ours are fixed; the rest are the site's own slips, not yet in an explained list | gate on the unexplained | `RULES_TIER=fastchar` |
| Tests | Unit tests / end-to-end tests | 391 / 59, all passing; CI green (an end-to-end test that failed three times on GitHub is fixed: a card covered what it clicked) | | `npm run gates` |

## The plans, item by item

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
| D6: old characters move to 5e.tools | In progress: 26 of 60 move unchanged; nothing is thrown away (unplaceable picks are kept and listed); differences where 5e.tools is right (a spell a feature grants) are listed as explained |
| D7: release app drops Aurora | Waits for D5 and D6, and your go-ahead |

### Audit (AUDIT-2026-11-10.md)

| Part | Done | Open |
|---|---|---|
| Data safety S1 to S9 | S1 to S7 | S8 (two copies running at once: a new dependency, your call); S9 with D7 |
| Rules and play R1 to R25 | 20 fixed or found sound | R6 guarded, not rewritten; R7, R8 to verify; R19 replaced by the fresh migration measure |
| Engine shape E1 to E6 | none | all six; none blocks legality |
| Tooling H1 to H6 | H4, H5 partly | linter (needs an install), stricter types, silent catches |

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

1. D6, the move: the biggest open number. One case to decide with you: Aurora let a 2024 Cleric take the 2014
   Knowledge Domain; the move gives it the 2024 version (Heroes of Faerûn), as the edition rule says, so its domain
   spells change. Keep the 2014 subclass on a moved character, or follow the rule? Spells first (14 of the 24 changes): a 2014 Knowledge Domain becomes the
   2024 domain spell list; the Strixhaven Initiate's college is picked again instead of matched. Then feats: Aurora's
   2024 backgrounds give Magic Initiate as a feature, so the old sheet does not list it as a feat (4 characters).
2. W5: the checker judges ability scores by source and feature uses by level from the reference.
3. W3: prove every statistic has an effect.
4. W10 triage: decide each of the 52.
5. A release with the three fixes on main.

## Open things you reported, not engine

- The PDF preview on Export slows the app (not measured yet).
