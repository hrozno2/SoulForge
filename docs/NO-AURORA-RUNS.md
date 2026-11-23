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
