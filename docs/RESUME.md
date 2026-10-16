# Where we left off (2026-10-16)

v0.17.0 is released (all builds, Homebrew, Arch). Issues #1-#3 closed; #4 open for one thing:

- Write the app log to a file on disk (Tauri log plugin, app log dir) so a startup crash leaves something to attach.

Smaller, open:
- Autofill sometimes picks firearm masteries.
- The main JS chunk is over 900 kB; split it properly.

Testing notes:
- `node scripts/rules-check.mjs` runs the groups side by side and prints progress every 30 s.
- `RULES_TIER=options node scripts/rules-check.mjs`: never-picked options, 5 parts, scan cached in
  ~/.soulforge-test/options-scan/<src/aurora tree hash>.
- The release runs the full coverage check only Monday to Thursday, 9 to 17 (RULES_TIER overrides).
