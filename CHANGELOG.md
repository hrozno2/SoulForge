# Changelog

What changed in each release. Newest first.

## v0.9.0 (2026-10-12)

- Locked options stay visible with the reason; level up and multiclass as cards; dice show the sum; readable rules tables; stat blocks keep the printed look; play sheet fits; favorites drag in the desktop app; sheet downloads in Manage sheets; tutorial step for finding your way; filled sheets: text fits its box, short casting times and ranges, centred numbers
- Chosen species, class and background shown as cards; list view version chips pick that version; Learn more follows the theme
- Premium pick cards: gilded notched frames, class emblems and role tags, serif headings, segmented filter bar; settings follow the dark themes
- Sheet panel: pick, preview and fill first; downloads tucked away; sheet manager with thumbnails, rename and remove
- Bug fixes from a review: form text redrawn in the production build, translated group and notes no longer break sheet filling, passive perception from the sheet, preview refreshes on any change, large characters survive a reload
- Main navigation in four groups with rollout menus: Home, Build, Manage, Sheet
- One-click downloads for the DLDM 2024 fillable sheet and companion sheets, with credit
- Smarter matching of unknown sheets (printed labels, word order, named check boxes), aliases for wrongly named official fields
- Sheet preview with page buttons, file list copied before the input resets, layouts and tests for the whole official set
- Official sheets: layouts for every sheet in the WotC set, plain and fillable, duplicate merge, one-click download of the whole 2014 set
- Compendium search, character badge and action strip in the top bar, Slate and amber theme after Aurora Builder
- Tutorial progress bar uses the same markup as the Content tab
- Tutorial does the setup itself (Aurora download, character import, official sheets) and minimizes instead of closing
- Script to build a test copy of the app next to the released one
- Warn before filling a sheet that is not a form, with a Proceed button
- First-run tutorial for new and updated installs, skippable, with never show again
- Fill the official 2024 fillable and classic 2014 sheets by field, automatic matching for other fillable sheets, one-click official sheet download, Magic tab badge

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
