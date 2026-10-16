# Where we left off (2026-10-16)

## Done and pushed (main, 38e30d9)
- Hornless head icon, species symbols on cards, Linux fixes (issues #1-#3), Report a bug (#4).
- DeepSeek translation kept; no AI images or portraits.
- Unarmed Strike back on printed sheets (it was dropped when weapons came from the pack).
- Rules suite: seeds 2101, 3202, 4303 all pass. Unit tests 152 pass. Browser tests 23 pass.

## Release v0.17.0: NOT cut yet
`node scripts/release.mjs minor` stopped at the full rules check (seed 1129829434,
report in ~/.soulforge-test/runs/2026-10-16T06-13-11-032Z/report.md). Only one pattern:

- "A choice repeats something the character already has": autofill gives the Weapon Master
  feat Club and Dagger, which the character already has through Simple Melee Weapons.
  Seen on a Ranger 19, Cavalier, Ancestral Guardian and Hexblade.

Fix (universal): when filling a Weapon Proficiency slot, treat a weapon as already known
if a group proficiency (Simple/Martial, Melee/Ranged) covers it. Do it in the shared
blocked/known check behind `stillToChoose`, so the UI and importer get it too. Then check
the rules check itself counts group coverage the same way.

## Then
1. Rerun `node scripts/release.mjs minor` (do not pipe it through tail: that hides the exit code).
2. Rebuild the test app: `npm run test-app`.
3. Close GitHub issues #1-#4 with notes (#3 point 6, DLDM HP: the sheet prints values above
   labels, not a bug; #4: writing the log to a file on disk is still to do).
4. Minor, open: autofill sometimes picks firearm masteries.
