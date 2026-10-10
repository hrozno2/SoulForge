# Changelog

What changed in each release. Newest first.

## v0.8.0 (2026-10-10)

- DeepL translation service (desktop app), glossary of fixed term translations with starter lists
- Translation: retry a failed batch one string at a time, say how many stayed in English on every export
- Sheet links in one file, weekly link check, search fallback in the panel
- Link the DLDM sheets folder with credit
- New default sheet with its own layout, bold feature names on the fillable sheets, Build badge says what is left, level up text readable in dark themes
- Condition icons with rules on hover, official sheet recognised fillable or print, translations keep names of spells, items and features
- Spell school icons (game-icons.net, CC BY), Cast rolls the spell's dice, compact spell rows, favorites row with drag and star, collapsible session log
- Play sheet: boxes keep their proportions, D&D Beyond style rounded ability and stat boxes
- Dice bag button, tab icons, card dividers and a faint d20 in the corner
- Portrait source link stays after the mouse leaves
- Two hands limit, stacking and marked gear, plain labels for focus items and storage, dark helper window, roll for HP, dice tray resets after a roll
- Starting equipment: class and background fold one at a time
- Global content filters, repeated choices merged into one, spell school works as a filter word (fixes Evocation Savant)
- Fix level-up test after the section Done button
- Spell rows keep their columns when an option is unavailable; reasons are neutral and in hover text
- Owned options show a locked check with what grants them; finished choices fold away
- Only offer the Recommended sort where it means something
- Full source name on hover
- Point buy house rules: budget, lowest and highest score, cost of every score
- Party slots as pips, random character asks for a level, version chips switch the pick in list view
- Homebrew cask: use postflight_steps

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
