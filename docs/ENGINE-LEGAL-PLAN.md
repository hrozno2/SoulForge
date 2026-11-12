# Engine plan: every character within the rules, nothing dropped (2026-11-12)

Chris, 2026-11-12: "make an engine plan to make the character engine 100 percent rules legal and drop free so you
can consistently make characters that are rules legal and have all features and spells and equipment and
everything." This plan sits beside ENGINE-PLAN.md (the engine's shape) and AUDIT-2026-11-10.md (the work list). It
says what "legal" and "drop free" mean as things a test can fail, walks the path every part of a character takes,
names where that path can lose or bend something today, and orders the work.

## 1. The two promises, as tests can state them

**Legal.** Every number on the sheet and every pick on the character follows from a rule in the loaded content,
and a second reading of the rules that shares no code with the first agrees. Three parts:

- L1. Every pick is one its choice offers, at the level it was made, by its choice's own rules.
- L2. Every number is what the rules give (scores, saves, skills, AC, hit points, attacks, slots, uses, DCs).
- L3. Nothing is present that no rule gives (a proficiency, a spell, an increase).

**Drop free.** Nothing named at one stage is missing at the next. Four handovers:

- D1. Content to registry: every field of the source data is read or has a written decision.
- D2. Character file to resolved character: every id the file names is active, or the player is told which is not
  and why.
- D3. Resolved character to sheet: every feature, spell, item, training and counter the character has is on the
  sheet.
- D4. Sheet to export: everything on the sheet is in the print, the PDF and the foreign formats, or the export
  says what did not fit.
- D5. One content set to another (the move to 5e.tools): the moved character has what the old one had.

## 2. The path of every part, and who guards each step

| Step | Where | What happens | Guard today | Gap |
|---|---|---|---|---|
| Source data becomes elements | fivetools.ts, parse.ts (Aurora), srdBundle.ts | Classes, subclasses, features, species, backgrounds, feats, spells, items become elements with rules: `stat`, `grant`, `select` | Field gate (src/engine/load.test.ts): every 5e.tools field read or decided; SRD bundle checks every word against the SRD text | A field can be "read" and still have no effect (the Epic Boons' `max: 30` was read for nothing). See W3 |
| Elements are found | registry.ts | By id, type, `supports` filter; twins of two providers merged | Parity gate: 500 sheets the same with and without Aurora | One concept under two ids (training, languages) is matched by concept only where code asks for it. See W6 |
| The character file | character.ts | Roots (species, background, classes), `selections` by `owner|rule index`, options, extras, prepared, inventory, play state | `sanitizeCharacter` and the repair report; 2,000 damaged files | Picks under a key that no longer exists are silently unused. See W2 |
| Resolve | engine.ts `walk`, timeline.ts | Level by level: grants and picks activate elements; `stat` rules go to the StatBook; requirements judged against the level's state | Determinism, cache and cycle tests; timeline diff | A pick a choice does not offer is active and nobody says so. See W1 |
| Numbers | stats.ts | Sums by bonus kind, caps, set scores, class tables | statDictionary: every stat name has a reader | The dictionary says who reads a name; nothing proves the reading has an effect (`strength:max:extra` was listed, and read under another name). See W3 |
| Sheet | sheet.ts `buildSheet` | Abilities, skills, AC, attacks, casting lines, slots, features, trainings, defenses | The rules check compares most numbers | No test that every active thing is on the sheet. See W4 |
| Rules check | rulesCheck.ts with the downloaded reference | 50 findings: choices, class tables, feats, slots, hit points, AC, attacks, skills, saves | Random characters on three content sets, coverage of every subclass, imports, FastCharacter | Not yet judged independently: ability scores by source, initiative, speed, passive scores, uses of features, languages and tools by count, species and background features present. See W5 |
| Export | SheetTab, SheetExport, forms, exportForeign.ts | Print layout, fillable PDFs, Foundry and Roll20 files | Export repeat test; import snapshots | No test that the export holds everything the sheet holds. See W4 |
| Move between content sets | src/engine/migrate.ts | Roots mapped by twin; picks replayed; scores matched | `RULES_TIER=migrate` report | See section 4 |

## 3. What this review found (2026-11-12), and what each fault says about the guards

Each was fixed with a failing test first; the last column is the class of gap, which the work items below close.

| Fault | Where it showed | Class |
|---|---|---|
| Primal Champion's +4 and every Epic Boon's +1 stopped at 20, on every content set | A FastCharacter Barbarian 20 | A stat written under a name nothing reads (W3); a number the checker did not judge independently (W5) |
| With a 2024 background, an older species kept its own increases and the background's were skipped: the reverse of the 2024 Player's Handbook | A Kobold Merchant moved from Aurora's content | A rule decided once without the book's text beside it; no second reading (W5, W7) |
| The 2024 level-19 Epic Boon offered boons only; the rule is "an Epic Boon feat or another feat" | Moved characters lost Alert, Athlete, Healer | Converter narrower than the text (W7) |
| "Any standard language" offered a setting's languages (Aarakocra, Abanasinian) as standard, and never an exotic one | Moved characters lost Undercommon and gained Aarakocra | A data default ("no type means standard") nobody checked (W7) |
| A 5e.tools magic weapon in the hands of an Aurora class counted as untrained | FastCharacter imports | One concept, two ids (W6) |
| Moving a character: scores off by one or two, feats swapped for their other edition's version, picks dropped, spells added | The migrate report | Section 4 |

## 4. The move to 5e.tools (D5): state and rules

Measured on 60 characters made new on Aurora's content, each legal before the move (`MIGRATE_FRESH=60`), since
the saved runs hold many characters older builds made that were never legal.

Rules the move now follows (migrate.ts):

1. Nothing the player picked is dropped. A pick no 5e.tools choice offers goes to a choice of its own kind with
   room, else it is kept as a manual addition; the notes say which.
2. An ability increase is carried as itself: the same score, the same size, from the same owner or level.
3. A feat is the very same feat (name and book) or it is kept as it was; never its other edition's version.
4. A pick is never matched to an option of another concept (a skill is not its expertise).
5. Prepared spells stay the player's; the auto-fill does not prepare more.
6. What 5e.tools asks and Aurora did not is filled legally and listed for the player to change.

Open, in the order of how many of the 60 they touch (each is a probe with `MIGRATE_DETAIL=<n>`, then a fix in the
matcher or the converter, then a line in the report's "explained" list if it is a true rules difference):

- Spells gained through a choice 5e.tools asks and Aurora grants or words otherwise (Druid's Find Familiar, a
  species' cantrip, Strixhaven Initiate's spell set): match by owner and spell first; where 5e.tools asks more
  than Aurora did, leave the place open rather than fill it, when leaving it open is legal.
- Skills gained or lost where one provider grants and the other asks (Human's Skillful, backgrounds from
  adventure books that 5e.tools does not hold).
- Feats: Strike of the Giants, Fighting Initiate, Ritual Caster and Spell Sniper have requirements 5e.tools states
  and Aurora's copy did not; decide each by the book and fix whichever side is wrong.
- Content with no 5e.tools version (Find Vehicle, Wooden Stake, a few backgrounds): kept by name as a custom entry
  instead of dropped.
- The gate: counts by share of the sample, on the fresh set, with an "explained" list like parity's. Zero
  unexplained drops and changes is the bar for D7.

## 5. Work, in order

Each item: a failing test first, the fix at the cause, a sweep of the content for the same pattern, the counts of
the random batches, parity and imports unchanged or explained.

**W1. A pick outside its choice is a finding (L1).** The engine activates whatever a selection names. Add the
finding "A pick its choice does not offer" for a chosen id that is not among the choice's options (file edits,
content that changed, the move). Random batches must stay at zero.

**W2. Picks with no place are shown, not ignored (D2).** After resolve, list `selections` keys that matched no
choice and inventory, extras and prepared ids not in the registry. Show them where the missing-content notice is
and in the repair report ("3 earlier choices have no place now: ..."), with a button to clear them. E1 of the
audit (upgrade legacy keys once, at the door) belongs here.

**W3. Every content stat is proved by its effect (D1, L2).** For each stat name any element writes, a test adds a
contribution and expects some sheet value, check finding or play counter to change. A name with no effect fails.
This replaces the dictionary's "read by" column, which is a claim, with a measurement. The same for converter
fields: a field marked "read" must change the element built from it (mutate the field, expect a different
element).

**W4. Conservation tests (D3, D4).** For every random character:
- every active element of a sheet type is in `features` or is hidden by a rule that names why;
- every chosen or granted spell is in a casting line;
- every inventory entry is on the equipment list;
- every training by concept is in the proficiency lists;
- the print text, each fillable PDF and each foreign export contain every name the sheet holds, or the export's
  own overflow list does. Where a PDF field is too small, the rest goes to a continuation page.

**W5. The checker judges the rest by itself (L2, L3).** In rulesCheck.ts, from the reference and the rules text,
never from the sheet's own parts:
- ability scores: base by method (point buy cost, standard array), increases by source and count (origin: three
  points; each improvement: two; each feat: what its text says), maximum by named raise;
- initiative, speed, passive scores, hit dice by class;
- uses of each counted feature at its level (rage, channel divinity, ki, sorcery points, superiority dice, wild
  shape, bardic inspiration, lay on hands, second wind, action surge): from the class tables in the reference;
- languages, tools and skills by count per source;
- species, background and feat features present (as "Class feature missing" does for classes);
- always-prepared spells of each subclass present at the right levels;
- starting equipment within what the class and background give, when taken from them.
Open from the audit and folded in here: the Psi Warrior's and Soulknife's energy dice.

**W6. Concepts everywhere two providers can meet (L2).** Training, languages, senses and sizes are compared by
concept in the requirement context; the sheet's weapon line now does too. Sweep sheet.ts, rulesCheck.ts and
PlayTab for every `r.ids.has(` on a proficiency, save, skill or language id and route it through one
`hasConcept(r, id)`.

**W7. Rules decisions carry their text (L1, L2).** Every place the converter or the engine decides a rule that the
data does not state (edition mixing, what "standard" means, who steps aside for whom) gets the book, chapter and
sentence in its comment and a test named for the rule. docs/RULES-DECISIONS.md lists them in one table: rule,
source, where decided, test. The three reversed or narrowed readings found today were all undocumented decisions.

**W8. Every combination, on a schedule (L1 to L3).** The coverage tier builds every subclass, species, background
and feat once per content set. Extend it by a pairwise table: each class with each species kind (2014 fixed
increases, lineage, 2024), each background kind (2014, 2014 under the 2024 rules, 2024), each caster kind in a
multiclass pair, levels 1, 4, 5, 11, 17 and 20. About 600 characters per content set; part of the full check.

**W9. Outside references keep running.** FastCharacter: one character per class and subclass fetched
(2026-11-12: 52 new, 92 in all); most differences are that site's own slips (2024 Bards trained with rapiers,
skills beyond what the rules give, Thaumaturge's bonus stated and not added), so its report needs an "explained"
list like parity's and a gate on the unexplained rest. Importer faults it showed, still open: "+1 magical
chainmail" kept as a custom item instead of Chain Mail +1; a worn Cloak or Ring of Protection not attuned, so the
armor class is one short; an attack line for "Martial Arts" not matched to Unarmed Strike.

## 6. Done means

- Random batches, coverage and the pairwise table: zero findings on all content sets, with W1 and W5 in.
- W3 and W4: zero stats without effect, zero things missing from sheet or export.
- The move (section 4): zero unexplained drops or changes on 400 fresh characters and on Chris's own library.
- docs/RULES-DECISIONS.md complete for every decision the sweep in W7 finds.
