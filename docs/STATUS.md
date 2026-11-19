# Soul Forge: where the engine stands

Updated 2026-11-19 (v0.26.3 is the release; everything below it is unreleased). Every number here was measured on this date unless
marked otherwise, and each comes from a command anyone can run again (last column of the scoreboard). Update this page
at the end of each working session, so the trend shows.

## 19 November: training judged by source

The rules check now counts skills, tools and languages by where they come from (class at first level, class by
multiclassing, background) against the reference. It found four faults, all fixed: a 5e.tools Monk had two tools for
one; a Knight, Spy, Gladiator or Guild Merchant was never asked its gaming set, instrument or language; Aurora's 2024
Rogue offered a multiclass the 2014 skill list; Aurora's Witherbloom Student had no language. The bundled SRD was
rebuilt with the Monk fix. Measured after: gates pass; 2,400 random characters, pairwise, the move of 400 and the
sweep (5e.tools, SRD) clean. Unreleased.

Same day: the Psi Warrior's and Soulknife's Psionic Energy dice now show their count and rest (they showed none, or
"1/Short Rest"), and the check judges them. Full validation clean after it.

## What is open, in plain words

Everything still to do, in one list. Items move off it when done; nothing open lives anywhere else.

**Waiting on you**
1. Two weeks of testing Soul Forge Test with "5e.tools only" switched on (stage D5's exit). Nothing else replaces it.
2. When to drop Aurora from the release app (D7): after 1.
3. Fartister's Guiding Hand (a 2017 Unearthed Arcana spell 5e.tools does not carry): kept in the file, its text in
   the move note, and the moved character now says "content 5e.tools does not have". Homebrew it, or leave it?
4. Your characters the rules check flags (they were like this before; the app now says so on Build):
   - Talaan Istodaewl, Indigo Bones, Waldrom Brahms (and Drago in the production app): a 2024 species with a 2014
     background and its "2024 rules" option not taken, so no ability score increases at all.
   - Carl Sneakers: Shape Water and Spare the Dying as Bard cantrips (not on the Bard list; Aurora's data let Magical
     Secrets widen the cantrips, fixed today).
   - Xarthian: more held than two hands can hold.

**Night of 17 to 18 November (Chris asleep, the plan run on its own)**
- The move (E1.2): 400 saved characters now change 22 (42 at the start of the night, 44 on the committed code),
  drop nothing the move could keep (31 lose an Unearthed Arcana spell 5e.tools does not carry, kept with its text and
  now counted apart as "unavailable"), and carry 4 findings the move brings (8 on the committed code).
  Fixed: a spell's near name made another spell (Circle of Death became Spirit of Death, Suggestion became Mass
  Suggestion); a 2nd-level spell took a 6th-level Mystic Arcanum; the auto-fill took a cantrip a later level already
  held; a pick made twice was left as an open place; Giant Power, Clan Crafter and Cult of the Dragon Initiate offered
  a free language where the book gives the named one unless the character knows it.
- A move screen for players (E1.3): "Move to 5e.tools" on a character built on Aurora's content shows what would
  change, then makes a 5e.tools copy; the original stays. It found that the move code crashed in the app ("process is
  not defined"), now guarded by a test.
- Recently deleted (E3.4): deleting a character keeps it on Home for 30 days to restore.
- Importers (E3.3): your Eleanor files (Roll20, Foundry, both from v0.26.3 and from this version) all import as the
  saved character. Fixed: the Roll20 import added the 2024 Acolyte's Magic Initiate a second time; the Foundry export
  had no languages, size, defenses, armor, weapons, tools, senses or casting ability.
- Later in the night: the move brings no rules finding on any of the 400 (8 on the committed code): a playtest
  subclass's place is left open for the player instead of filled with another subclass; the auto-fill never repeats a
  skill or language a later level holds; picks the original made twice are recognised across the two providers' names.
- Fix-it buttons (E3.1): a repeated pick, a pick its choice does not offer or that fails its requirements gets "Take X
  out"; a choice holding too many gets "Keep the first N".
- Picks with no place (W2): "Earlier choices with no place now" with "Clear them". On your test-app library it lists
  leftovers on 11 characters, and 11 in the production app (picks from a species, class or increase option you later changed, such as Elvish
  Prunesley's Dhampir languages and Maine Dockers' Artificer skills); nothing is cleared unless you click.
- FastCharacter (W9): every one of the 160 differences from FastCharacter's own numbers is now explained, each by
  its evidence, and the run is gated at zero. Five were Soul Forge bugs, all fixed: a Pact of the Blade warlock's
  light crossbow attacked with Charisma; a magic weapon's +1 counted twice on import; a skill line with a note after
  its mark ("* (Disadv.)") was not read; a 2024 Sorcerer named "Aberrant Mind" got Tasha's 2014 subclass instead of
  the 2024 Aberrant Sorcery (the importer now knows the subclasses 2024 renamed); and a list of options was read as a
  feature. A carried Cloak or Ring of Protection is worn when the sheet's armor class counts it, and a "Martial Arts"
  attack is the Unarmed Strike.
- The auto-fill (random characters and the move): a repeat it must take back is taken from the choice that has
  another option (a Wizard whose every skill was held elsewhere kept Arcana twice, while Skilled could take any
  skill); what later choices hold is judged by concept and only from choices the character has.
- Every combination pairwise (W8, `RULES_TIER=pairwise`, also in the full check): each class at the levels where the
  rules turn, with every kind of species and background, and every pair of caster kinds: clean on all four content
  sets. It found the auto-fill giving a 2014 background switched to the 2024 rules an origin feat a later level
  already held (Savage Attacker twice); fixed.
- Concepts everywhere (W6): a repeated pick across the two providers' ids is now seen (Aurora's Insight picked where
  a 5e.tools background grants Insight), by the rules check, the auto-fill and the build's "you already have this".
- With both providers loaded, a 5e.tools feature whose own set choice gives a training ("smith's tools, or another
  artisan's tool") also borrowed Aurora's choice of it, so Battle Smiths got Smith's Tools twice; the concept-based
  repeat check found it. Fixed in the borrowing (src/engine/mechanics.ts).
- A list of options is not a feature: the SRD 5.2 Warlock's "Eldritch Invocation Options" holds Pact of the Blade's
  text, and a Sorcerer/Warlock who never took it attacked with Charisma. The sheet and the rules check now share one
  rule for which weapons another ability reaches, so they cannot drift apart again.

**Is the move ready?** Close. Measured tonight:
- 60 characters made fresh on Aurora content: 1 changes (a Ranger's "Minion" language 5e.tools lacks; kept with its
  text, like Guiding Hand).
- Your libraries, test app (26) and production app (25): unchanged apart from Guiding Hand.
- The 400 saved test characters: 42 change (96 yesterday morning); 4 carry a finding the move brings, all on synthetic
  characters whose originals were already against the rules (a doubled cantrip, a 2014 Resilient on a 2024 Paladin,
  a Sea Elf's Draconic, a Druid/Wizard's doubled Guidance).

**From the big test round (17 November, night)**: what the new tests still find, to fix next:
1. The move, Zendikar elves: Aurora files the Joraga Elf as a sub race of the Player's Handbook Elf, 5e.tools under its
   own "Elf (Zendikar)"; the move finds no place and fills another sub race. It should change the species.
2. The move, three fresh characters to probe: a Wizard's initiative (5 to 2), a Ranger's Charisma skills (each 3 lower),
   a Fighter's Persuasion; an Artificer's and a Monk's +1s land on another score; Auran lost by a Kenku and a Tabaxi.
3. The move's laws hold on 450 Aurora-made and 450 5e.tools-made characters, apart from those above.
4. The full check (`node scripts/full-check.mjs 31415 --count 2000`): 2,000 random characters, every source, saved
   characters, FastCharacter, parity, the SRD: passed. Fixed from it: the SRD bundle naming a book it has no content
   from, the loader gate's adventure fields, Chronurgy's Temporal Awareness missing from initiative on 5e.tools, the
   content linter misreading the Epic Boons' lower-case ids, coverage counting internal markers as missing. The
   community builds on 5e.tools content alone: all 20 clean (2026-11-18).

**The engine**
1. W5's last parts: increases by source and count, languages, tools and skills by count per source, species and
   background features present, starting equipment.
2. W6 (concepts everywhere two providers meet), W8 (every combination pairwise), W2 (picks with no place shown).
3. The statistic-effect measurement on combined content (Aurora with 5e.tools) lists 50 names Aurora's own copies
   write and nothing reads (template numbers such as "aura of protection:range", companion statistics). The 5e.tools
   and SRD sets are clean, so this matters only while Aurora ships.

**Interface**
1. Linux drawing lag: needs a measurement on your machine (CachyOS, NVIDIA?) before anything can be changed.

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
| Nothing dropped data to engine | Features whose text promises a choice or gift no rule gives | 0 unexplained of 4,023 (gate); 15 gaps built as Soul Forge additions | 0 unexplained | `RULES_TIER=prose` |
| Old characters move intact | Characters moved from Aurora to 5e.tools ids: fresh / your libraries / 400 saved | 1 of 60 (a language 5e.tools lacks, kept as text); test 26 and production 25: 0 apart from Guiding Hand; 42 of 400 | 0 unexplained changes | `RULES_TIER=migrate MIGRATE_FRESH=60`; `MIGRATE_LIBRARY=<backup>`; `RULES_TIER=migrate` |
| Outside check | fastcharacter.com characters imported and compared | 92 characters; the differences found to be ours are fixed; the rest are the site's own slips, not yet in an explained list | gate on the unexplained | `RULES_TIER=fastchar` |
| Tests | Unit tests / end-to-end tests | 391 / 59, all passing; CI green (an end-to-end test that failed three times on GitHub is fixed: a card covered what it clicked) | | `npm run gates` |

## The plans, item by item

### Master plan (MASTER-PLAN.md), stage by stage

| Stage | What | State |
|---|---|---|
| A. Engine fixes and buildout | A1 wrong results on real characters (10), A2 missing engine features (13), A3 audits (3), A4 Unearthed Arcana | **Done** (A1 to A4, all 26 items). A0.1, cross-checking every engine area with Plutonium, is a standing rule, not an item to finish |
| B. Tests | Unit tests, the full check, Chris's own data and characters, then a release | **Done as a practice**: every change runs the gates; full checks run before releases. Chris's library went through the move on 17 November (clean apart from one UA spell) |
| C1 to C4. Builder, navigation, backpack and shop, floating cards and the Bag of Holding | | **Done** |
| C5. Other interface work | 15 items | 13 done (C5.3 on 17 November: the Echo and every summoned creature, worked-out numbers in Play). Open: C5.4 and C5.6 Linux drawing lag (needs a measurement on Chris's machine) |
| C6. Finish (Chris's test of the release, 2026-10-28) | 7 items | **Done** (C6.3 checked 17 November: every part built) |
| C7. Chris's test of v0.23.0 | 20 items | **Done** |
| D0 to D4. Licenses, two apps, free rules bundled, SRD API check, 5e.tools standing on its own | | **Done** (parity 500 of 500) |
| D5. Testing without Aurora | Exit: five clean full checks without Aurora, and two weeks of Chris testing the test app in 5e.tools-only mode | Running in every check; the five full checks and Chris's two weeks have not been done |
| D6. Old characters move to 5e.tools | Exit: 400 saved characters and Chris's library, no unexplained sheet change | Fresh 60: 0 change. Chris's library: 0 apart from one UA spell. 400 saved: 44 change, 17 of them legal before; work left |
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
| W3 | Every content statistic proved by its effect | **Measured and gated** on 5e.tools and SRD (`RULES_TIER=stateffect`): 0 without effect; found the Ki DC and sense ranges unread. Combined content: 50 Aurora-only names open |
| W4 | Nothing dropped from engine to sheet to print | **Done**: measurement, CI gate, and the fix it found (invocations, metamagic, maneuvers missing from every sheet on 5e.tools content) |
| W5 | The rules check judges everything itself | **Mostly**: skills, saves, weapon attack and damage, training, slots, hit points, AC, class features, feature uses by level, and since the evening of 17 November initiative, base scores by method and subclass spells (it found Remarkable Athlete missing from initiative, half-proficiency bonuses stacking, and the Watchers' aura). Open: increases by source, languages and tools by count, species and background features present |
| W6 | Two providers compared by concept everywhere | **Partly**: requirements and weapon training. The rest of the sweep is open |
| W7 | Every rules decision in the code names its source | **Started**: docs/RULES-DECISIONS.md, 14 decisions with book, place and test; older ones as the sweep reaches them |
| W8 | Every combination, pairwise | Open (the coverage run reaches every subclass, species, background and feat once) |
| W9 | Outside references with an explained list | **Partly**: FastCharacter runs; no explained list yet |
| W10 | A feature's text promises no more than its rules give | **Done and gated**: every candidate read; real gaps built as Soul Forge additions (src/aurora/additions.ts), the rest decided with reasons |

### 5e.tools plan (PLAN-5ETOOLS.md)

| Stage | State |
|---|---|
| D0 to D3: licenses, two apps, free rules bundled, SRD API check | Done |
| D4: 5e.tools stands on its own | Done (500/500) |
| D5: testing without Aurora | Running in every check. Exit needs five clean full checks without Aurora and two weeks of your testing |
| D6: old characters move to 5e.tools | Fresh sample and Chris's library clean; 17 of the 400 saved characters still to explain or fix |
| D7: release app drops Aurora | Waits for D5 and D6, and your go-ahead |

### Audit (AUDIT-2026-11-10.md)

| Part | Done | Open |
|---|---|---|
| Data safety S1 to S9 | S1 to S8 | S9 with D7 |
| Rules and play R1 to R25 | 20 fixed or found sound | R6 guarded, not rewritten; R7, R8 to verify; R19 replaced by the fresh migration measure |
| Engine shape E1 to E6 | none | all six; none blocks legality |
| Tooling H1 to H6 | H1 (oxlint and Prettier in CI), H4, H5 partly | stricter types; the lint's style rules, now warnings |

## Fixed on 17 November, evening

Rules, for every character on the content named:
- Aurora content: the 2024 Bard's Magical Secrets widened its cantrip choices to every Cleric, Druid and Wizard
  cantrip (it covers prepared spells only). The rules check now flags such cantrips.
- 5e.tools content: a species' "not with this sub race" gates never held (the Sword Coast half-elves got their two
  skills and every variant feature; a Mark half-elf both sets of increases). Engine fix, for every such gate.
- The 2014 Remarkable Athlete never reached initiative; half-proficiency bonuses stacked with each other and with a
  full proficiency bonus (Jack of All Trades with Remarkable Athlete, or with Alert).
- The Oath of the Watchers' Aura of the Sentinel did not add to initiative (both content sets).
- The 2014 Battle Smith's Improved Defender (+2 AC) was missing on 5e.tools content; a companion's AC bonus replaced
  its armor class instead of adding to it.
- The Monk's Ki save DC was never shown; senses other than darkvision ignored their range.
- The Lunar Sorcerer had no Sacred Flame on 5e.tools content.
- Plane Shift books and seven others had no names (a Zendikar goblin moved to the Dungeon Master's Guide's goblin).
- Kor and Kalashtar got a free language pick where the book names their own language (Kor, Quori).

Soul Forge additions, a new source: what a book's text gives and 5e.tools' data lacks, built and marked (Sword Coast
half-elf descents, Dhampir and Reborn skills, Khoravar, Vahadar, Githyanki, Knowledge Domain of Amonkhet, Knightly
Envoy, Cavalier and Samurai, the Expert sidekick, two Mystic orders, the Echo Knight's echo, Kor and Quori).

Companions: the bestiary keeps every creature a class feature or spell calls (Steel Defender, Homunculus Servant,
Wildfire Spirit, Drake Companion, the summon spells' spirits); 5e.tools imports are asked to import again (format 4).
Play's companion card and its hit-point tracker show the worked-out numbers ("AC 16 (14 + PB)", "76 / 76").

The move: spells stay in a choice that offers them (a 2024 Evoker's Evocation Savant), subclass spells wait for
their subclass, the 2014 Spell Sniper's version by its cantrip, a language 5e.tools lacks kept with its text, the
2014 Resilient's saving throw from its ability.

The rules check: initiative, base scores by method, subclass always-prepared spells (its first release run found the
2024 Moon Druid's Fount of Moonlight at level 9 in Aurora's data, fixed, every subclass swept); a choice saved with
more picks than it allows is reported, not silently cut. The prose lint and the statistic-effect measurement are
gates. A 5e.tools Divine Soul could learn no Cleric spell (its list is a filter in the data); fixed.

Found by the big test round the same night and fixed: two whole proficiency bonuses to initiative (Alert and
Hare-Trigger, Alert and Aura of the Sentinel) counted once; 5e.tools' Path of the Giant gave no Giant language; the
2024 Keen Mind and Observant gave proficiency but never Expertise in a skill the character had (both built as Soul
Forge additions); a second move re-guessed the 2024 Ability Score Improvement's pairs; the 2024 Bards' initiative
still had Jack of All Trades in Aurora's content; the 2024 Shadow Monk's Body and Mind stopped at 20.

New kinds of test: the move's laws (moving twice changes nothing more; a 5e.tools character moves to itself; a moved
character saves and opens to the same sheet; the move brings no finding of its own), `RULES_TIER=move-props`; and
known breaks the rules check must notice (a changed standard array, an extra pick, a missing pick, a cantrip from
another list, heavy armor untrained), `RULES_TIER=mutations`. Their first runs found the Divine Soul and the extra
pick. Random Echo Knights and Battle Smiths on every content set, legal and with
the book's companion numbers (src/aurora/companionRandom.test.ts); built in the app by hand too (Play shows the same).

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

1. Your two weeks of 5e.tools-only testing (D5), then D7 on your word.
2. W5's last parts; W6; W8 pairwise; W2.
3. The Aurora-only statistics without effect (only while Aurora ships).

## Open things you reported, not engine

- Done 2026-11-13: the Export tab's sheet preview is drawn on request ("Show a preview of the filled sheet"), and
  offers a redraw when the character changes, instead of redrawing on its own and holding the app up.
- Light themes: some icons become unreadable and the cards stay dark (noted 2026-11-13; THEMES-REVIEW, last section).
