# What the tests cover (Chris, 2026-11-06: all our content)

Until now the big rules check loaded Aurora's content only, so 5e.tools and the built-in rules were never put through it. Now every test in `src/aurora/rules.suite.test.ts` runs on any content set (`RULES_CONTENT`), and `RULES_TIER=sweep` goes through every element of a set rather than sampling.

| Content set (`RULES_CONTENT`) | What it is | In the release? |
|---|---|---|
| `srd-5.1`, `srd-5.2`, `srd` | The built-in rules | Yes, from a new install |
| `5etools` | The user's 5e.tools data, as the app loads it (beasts only from the bestiary) | Yes, what the release moves to |
| `both` | Aurora and 5e.tools merged | Test app |
| `aurora` | Aurora alone | Test app |

| Test | SRD | 5e.tools | both | Aurora |
|---|---|---|---|---|
| Every element swept (`RULES_TIER=sweep`) | full | full | full | full |
| Every option of every choice taken once (in the sweep; spells and items by their own pass) | full | full | full | full |
| Rules check groups (`scripts/rules-check.mjs`) | full check | full check | no | full check |
| Big random batch | 1,000 | 10,000 | no | 10,000 |
| Sheets filled as PDFs | 2 per group | 2 per group | no | all |
| Spell lists and feat prerequisites against 5e.tools | PDFs instead (`srd-bundle`) | full check | no | full check |
| Saved characters, determinism (`diff`) | no | no | yes | no |
| Twins compared (`parity`, `parity-effect`) | no | yes | yes | yes |
| Against the PDFs (`srd-bundle`, `sources`) | yes | spells and gear | no | spells and gear |
| Against the SRD API (`srd-api`) | yes | no | no | no |
| Real files imported | no | full check | no | full check |
| Browser (e2e) | first run only | no | no | fixtures only |

## What the sweep does

For each set: every element's text for raw markup and broken values, and its grants for what is missing (5e.tools and SRD; Aurora has its linter). Every class at 20, every subclass, species, subrace, background and feat held by a character with its choices filled and the rules check run. Every option any choice offers is then taken once, which may open more. Every spell's facts and rolls. Every item carried and equipped. Every creature listed.

The report, `<cache>/engine/coverage.md`, says per type how many elements were reached, and names what was not. Each kind of finding has a ceiling and may only fall.

## Left out on purpose

- **Never reached in 5e.tools** (110): sidekick classes and NPC species, hidden from the builder; older copies of subclasses a reprint replaces on the list; four Eberron house marks with no route to them in the builder. They still get the text and link checks.
- **Never reached in the SRD** (6 and 7): languages no choice offers.
- **Aurora's and the merged set's findings** are listed, not gated, except crashes and broken numbers. Most are its helpers and text-only entries (grants, deities, sources), and requirements the sweep's characters do not build. Aurora leaves the release, and the rules suite still gates it as before.
- **Saved characters:** `diff` runs on the merged set only, because the saved test characters use Aurora's ids. They move at D6.
- **Browser tests** run on small fixtures, not real content. They test the app, and the sweep tests the content.
- **Not covered by anything:** Roll20 and Foundry export for 5e.tools characters beyond a round trip; PDFs for all but a sample outside Aurora, since one character's sheets take minutes.
