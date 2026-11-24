# The full check without Aurora (stage D5)

Chris, 2026-11-23: run it every few days, or when it is needed, and at least once a week. D5 asks for five clean
runs in a row (and two weeks of his own testing with "5e.tools only" on).

The run: `caffeinate -i node scripts/full-check.mjs --no-aurora` (10,000 random characters on 5e.tools, the SRD
share, pairwise and the sweep, the rules check on both sets; nothing that builds on Aurora's content or compares with
it). Its summary is in `~/.soulforge-test/runs/full-no-aurora-<date>/summary.md`.

"Needed" means: main has commits that touch `src/` or `public/srd/` since the last run. With none, a run is still
made once seven days have passed.

One line per run, newest first. A failed run breaks the row of clean ones.

| Date | Commit | Seed | Result | Clean in a row | Notes |
| --- | --- | --- | --- | --- | --- |
| 2026-11-24 | 7fdfd59 | 214019780 | FAILED | 0 | Run in the spare worktree. The unit tests passed this time (58.6 min), so the time limits hold. The 10,000 random characters found two real faults, both in multiclass characters (2 of 10,000 with findings). Character 1708, Fighter 3 (Eldritch Knight) / Monk 5 (Warrior of the Mystic Arts, homebrew): 4/2 shared slots for 3, because the Eldritch Knight's stated share was counted beside the Fighter's own third. Character 8232, 2024 Rogue 6 (Soulknife) / 2014 Fighter 4 (Tasha's Psi Warrior): 8 Psionic Energy dice on the Soulknife for 6, because two features named Psionic Power shared one count. Both fixed with tests the same day. Every other step passed. |
| 2026-11-24 | 8c7f308 | 184458388 | FAILED | 0 | Only the unit tests failed (5 of 769), all on time: cache.test "reuses kept levels" and srdRandom "srd-5.1: 80 characters" timed out at 300 s, sanitize.test "2,000 damaged characters" timed out at 120 s, contentFuzz "content of the wrong shape" took 421 s against a 20 s limit, importFuzz "150 damaged files" took 421 s against a 15 s limit. All five ran at the same time, about 7 minutes each, so the machine likely stalled; no wrong result was reported. Every other step passed (loader, edition, SRD, sources, pairwise, every element, both rules checks, 10,000 + 1,000 random characters). |
