# Changelog

What changed in each release. Newest first.

## v0.7.0 (2026-10-10)

- Release script: handle inherited output; changelog header
- Make the e2e tab helper wait for the tab bar to settle
- Docs and changelog refresh
- Smoke test for wild shape, journal and language
- Interface language setting for the app shell, live region for hit points
- Export characters for Foundry and Roll20
- Party overview on Home
- Session log for notes
- Wild shape and companion hit point tracking
- Update picker link test
- 5etools: optional features, additional spells for species/feats/subclasses, class picker
- Guided level up with undo, hit point roll, new features, spell choices and swaps
- Homebrew builder, tab bar no longer flickers near a width threshold
- CI: keep Playwright specs out of the unit test run; desktop self-check builds without updater signing
- Conditions and exhaustion change rolls, concentration tracker with save prompt, ammunition counts, release script and notes, e2e test for conditions
- Content security policy tested in a real build, original test ruleset for CI, lazy-loaded tabs and split bundle, Playwright smoke tests, backup and restore, desktop self-check
- Fix HTML sanitizer letting content run code, hit die roll mismatch, pact slots on short rest; accessibility labels and contrast; old saves are normalised
- Refresh screenshots for v0.6.5

## Highlights since 0.6.5

- Content security policy, checked in a real desktop build.
- Original test ruleset in `fixtures/` so engine tests run in CI; Playwright smoke tests; smaller start-up bundle.
- Backup and restore.
- Conditions, exhaustion, concentration checks and ammunition.
- Homebrew builder.
- Guided level up with undo.
- Wild shape and companion hit points, session log, party overview.
- Export for Foundry VTT and Roll20.
- 5etools: optional features and spells granted by species, feats and subclasses; class picker.
- Interface language (English, German, Spanish, French, Portuguese).
- Fixes: sanitizer hole in rendered descriptions, hit dice and pact slots, tab bar flicker, readable level up window in dark themes.

## 0.6.x

See the GitHub Releases page.
