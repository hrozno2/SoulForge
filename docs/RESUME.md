# Where we left off (2026-10-17)

Released: v0.17.0. Since then on main (not released yet), commit 8688551: prepared spells on the sheets, Divine
Order shown, "++" text fix, Crossbow Expert loading, Origin Feat not a feat, versatile repeat, notes on DLDM page 2A,
5e.tools size ids, duplicate gear across books. The test app is built from 8688551.

Next, in order (details in docs/PLAN-windows.md):
1. Section 9: the 2024-only filter hides shared basics (skills, tools, languages), so choices can't be completed.
2. Section 11: Aurora and 5e.tools mixed give double ability increases (background marker).
3. The rest of section 12: 173 duplicate ids in the 5e.tools conversion; the random builder should prepare
   spells so the tests catch prepared-spell bugs.
4. Section 8: test against all of 5e.tools (the pinned data folder; ~/.soulforge-test/5etools-data has a first copy).
5. Then the window work (sections 2-7, 10).
6. Release after 1-3 (the full check runs only Monday to Thursday, 9 to 17).

To check a player's exported sheet with another AI: docs/PROMPT-sheet-check.md.
