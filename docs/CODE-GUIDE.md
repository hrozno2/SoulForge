# Soul Forge: a guide to the code

This is for people reading or auditing the code. It explains what the app does, how the parts fit together, where
to start reading, and how the code is tested. File references are relative to the repository root.

## 1. What the app is

Soul Forge is a D&D 5e character builder (2014 and 2024 rules) that runs as a desktop app and as a web page. It:

- **builds characters** from rules content the user adds (Soul Forge ships no rules text of its own),
- **imports characters** from Foundry VTT and Roll20 exports,
- **checks characters against the rules** with an independent reference,
- **fills character sheets**: the official Wizards of the Coast PDFs, the community DLtheDM sheets, any fillable
  PDF, and its own drawn sheet,
- has a **Play** screen (rolls, hit points, conditions, spell slots) for use at the table.

Stack: React 19, TypeScript, Vite. The desktop shell is Tauri v2 (Rust, `src-tauri/`). PDFs are filled with
pdf-lib. Tests use Vitest and Playwright.

Nothing copyrighted is bundled. Rules content, the 5e.tools class data used by the rules check, and the official
sheets are all downloaded by the user's copy of the app from their public sources and kept locally.

## 2. Repository map

```
src/
  main.tsx            entry point: renders <App/>
  aurora/             the rules model: content, engine, importers, checks (no React)
  sheets/             filling existing PDF sheets (official, DLDM, any fillable PDF)
  pdf/                the Soul Forge sheet drawn from scratch, PDF translation, previews
  ui/                 React components, one file per screen or widget
  net.ts, store.ts    network and file access that work both in Tauri and in a browser
  updater.ts          self-update (Tauri updater plugin)
  selftest.ts         a start-up self check used by CI on the packaged app
src-tauri/            the Rust shell: window, plugins (http, fs, dialog, opener, updater, process), CSP
e2e/                  Playwright tests against the production build
scripts/              release, test-app build, rules-check runners, content cache
docs/                 this guide, the user guide, the reliability plan, parked feature ideas
public/               icons, stock portraits, the favicon
```

## 3. The main idea: content in, character out

Everything the app knows about the rules comes from **content**: XML element files in the Aurora format
(AuroraLegacy on GitHub is the usual source) or 5e.tools JSON converted to the same model. A character is a
small record of the user's *choices*. Everything else (scores, proficiencies, spells, hit points, attacks) is
**computed** from the choices and the content every time.

```
content files ──parse──> registry (all elements by id)
                                │
character (choices) ──────> engine.resolve() ──> Resolved (active elements, open choices, stats)
                                                     │
                                       sheet.buildSheet() ──> SheetData (numbers for display)
                                                     │
                     rulesCheck ◄────────────────────┤────────────► sheets/ and pdf/ (exports)
```

### 3.1 Content (`src/aurora/`)

| File | What it does |
|---|---|
| `types.ts` | The element model: an element has an id, type, name, source, description, `setters` (named values such as `level`, `hd`) and `rules` (grant, select, stat). |
| `parse.ts` | Parses Aurora XML into elements. Works with the browser's DOMParser and with xmldom in tests. |
| `sources.ts`, `content.ts`, `uploads.ts` | Following index files to element files, downloading, caching, ZIP and loose-file uploads. |
| `fivetools.ts`, `fiveToolsPicker.ts` | Converting 5e.tools / Plutonium JSON into the same element model. |
| `registry.ts` | `ARegistry`: all elements by id and type, plus `find(type, supports)` which evaluates Aurora's `supports` filter language (`A,B` and, `A||B` or, `!A` not). |
| `contentFixes.ts` | Corrections applied when the registry is built: misspelt ids, missing grants, wrong requirements. Each has a comment saying why. |
| `contentLint.ts` | Finds problems in content (grants of ids that do not exist, empty choices) once, when it loads. |
| `requirements.ts` | Evaluates requirement strings (`[level:5]`, `ID_X,!ID_Y`) against a character. |
| `books.ts`, `edition.ts` | Facts about source books (release dates, official or playtest) and whether an element is 2014 or 2024 rules. |

### 3.2 The character (`src/aurora/character.ts`)

`Character` holds only choices and play state: species, background, classes with levels, base ability scores and
the method, `selections` (the answer to each choice, keyed by the choice's slot key), inventory, coins, prepared
spells, custom bonuses, play state (hit points, slots used, conditions), info and notes. `normalizeCharacter`
upgrades older saved files. Characters are stored in IndexedDB (`storage.ts`) and exported as JSON.

### 3.3 The engine (`src/aurora/engine.ts`)

`resolve(character, registry)` walks the content from the roots (species, background, each class) and applies
rules:

- **grant** adds an element (a feature, a proficiency, a spell),
- **select** opens a choice (a *slot*); the character's `selections` say what was picked, and the picks are walked
  in turn,
- **stat** adds to a named statistic (`stats.ts` evaluates them, including stats that refer to other stats).

Because a stat can change what a requirement allows (and so what is granted), `resolve` repeats the walk until the
result stops changing. The result, `Resolved`, has the active elements, every slot (open or filled, with its
options and the reason any option is blocked), the stats, spell picks, class levels and the multiclass caster
level.

Related: `autofill.ts` fills open choices (random characters and tests), `randomCharacter.ts` and
`randomBatch.ts` make varied test characters, `pointBuy.ts` holds the point buy rules, `hands.ts` checks what is
held, `startingEquipment.ts` reads class and background starting equipment.

### 3.4 Numbers for display (`src/aurora/sheet.ts`)

`buildSheet(resolved)` turns the resolved character into `SheetData`: ability scores and saves, skills, AC with its
parts, hit points, speed, initiative, attacks (including an unarmed strike for everyone, monk-aware), casting lines
(DC, attack, slots, prepared limit, spells), features, proficiencies and damage defenses. Every screen and every
export reads `SheetData`, so a number is computed in one place.

### 3.5 Importing (`src/aurora/foreign.ts`)

`importForeignCharacter(json, registry)` reads a Foundry VTT actor (including Plutonium) or a Roll20 character and rebuilds
it as choices: it matches names against the loaded content, fills each slot from what the file says its source
picked, and leaves a choice open (a to-do) when the file does not settle it rather than guessing. The result has
the character, what matched, what is missing, the to-do list, and **differences**: the file's own numbers (AC, hit
points, saves, skills, spell DC) compared with the rebuilt character's. `src/ui/ImportReport.tsx` shows the report
and saves it to the character's notes. `exportForeign.ts` writes Foundry and Roll20 files back out.

### 3.6 The rules check (`src/aurora/rulesCheck.ts`)

An independent check, so the builder cannot pass its own mistakes. It compares a built character with the 5e.tools
class data (`rulesRef.ts` condenses it to numbers: hit dice, saves, slots, cantrips and prepared counts, feature
levels, multiclass requirements, starting training) plus hand-written rules (AC formulas, ability score limits,
feat prerequisites). The 5e.tools data is downloaded when needed (`rulesRefStore.ts`), never bundled. The check
runs live in the app (the Rules check bar on Build) and in the test suites.

## 4. Sheets and PDFs

| File | What it does |
|---|---|
| `src/sheets/data.ts` | `buildFillData(resolved, sheetData)`: the flat set of values every sheet filler uses (names, numbers, short lines for features, spell rows). |
| `src/sheets/forms.ts`, `official.ts` | The official 2024 and 2014 sheets, filled by field name. `official.ts` knows each official file's layout. |
| `src/sheets/dldm.ts` | The DLtheDM 5E24 sheets. Their field names do not always match their boxes, so some values are placed by position. Every check box is cleared first, because the blank sheet ships some ticked. |
| `src/sheets/automap.ts` | Fills a fillable sheet Soul Forge has never seen, by reading each field's name and position. |
| `src/sheets/continuation.ts` | Adds pages for spells that do not fit a sheet's spell table. |
| `src/sheets/templates.ts`, `links.ts` | Where sheets come from (downloaded from their makers) and storing them. |
| `src/pdf/sheetSF.ts`, `exportPdf.ts` | The Soul Forge sheet, drawn from scratch with pdf-lib. |
| `src/pdf/translate.ts` | Optional translation of exported text through a service the user picks. |

## 5. The interface (`src/ui/`)

`App.tsx` holds the current character, the loaded content (`useContent.ts`), the top bar (`TopBar.tsx`) and the
tab being shown. Characters are saved as they change.

| Screen | Files |
|---|---|
| Home | `StartTab.tsx` (new, random, open, import) |
| Build (default layout) | `BuildBoard.tsx`: lists on the left (`Browse.tsx` with search and filters), the board in the middle (species, class, background, spellbook, backpack), scores, portrait and training on the right. Choices are `Slots.tsx`. |
| Build (older tabs layout, a choice in Settings) | `BuildTab.tsx`, `MagicTab.tsx`, `EquipmentTab.tsx` |
| Manage | `ManageTab.tsx` (details, notes, portrait, manual additions, custom bonuses), `ContentTab.tsx` |
| Play | `PlayTab.tsx`, `Dice.tsx`, `ConditionsPanel.tsx`, `Journal.tsx` |
| Export | `SheetTab.tsx`, `SheetExport.tsx`, `SheetManager.tsx`, `SheetPreview.tsx` |
| Other | `LevelUp.tsx`, `Tutorial.tsx`, `Settings.tsx`, `RulesCheck.tsx`, `ImportReport.tsx`, `Learn.tsx` (the Learn more popup) |

`Html.tsx` renders content descriptions from an allow-list of tags, building a fresh tree, so markup in content
files cannot run scripts. `TestTools.tsx` only exists in the test build.

## 6. Security and data

- **No server.** Everything runs on the user's machine; data stays in the app's IndexedDB (`src/aurora/storage.ts`).
  The database only ever gains stores between versions, and an older build opens a newer database at its current
  version instead of failing.
- **Content security policy** (`src-tauri/tauri.conf.json`): scripts only from the app itself, no inline scripts.
  CI runs the packaged app's self test (`src/selftest.ts`) to catch policy violations.
- **Network**: content, the 5e.tools data, official sheets and updates are fetched over HTTPS. Requests a web page
  could not make (cross-origin) go through Tauri's HTTP plugin (`src/net.ts`).
- **Untrusted input**: content files, imported character files and PDFs are treated as data. Descriptions pass
  through `Html.tsx`; imports are matched by name against loaded content, never executed.
- **Updates**: signed by the release workflow; the Tauri updater checks the signature.

## 7. Tests

| Command | What runs |
|---|---|
| `npm test` | Unit tests (Vitest). Tests that need real content or sheets skip unless their folders are set (`AURORA_FIXTURES_2014`, `SHEET_FIXTURES`). |
| `npm run test:e2e` | Playwright against the production build under the app's CSP: tabs, content loading, building, importing, exporting, the build board (`e2e/board.spec.ts`). |
| `npm run rules-check` | The rules suite (`src/aurora/rules.suite.test.ts`) on a fresh random seed: a varied batch, level 20 in every class, level-ups, multiclasses, companions, community builds, a local corpus of real imported character files compared with snapshots (kept outside the repository, since they are people's characters), the content linter, spell lists and feat prerequisites against 5e.tools, and every export read back with pdftotext. `RULES_TIER=full` adds every subclass, species, background and feat. |
| `npm run rules-big [count] [seed]` | On request only: many random characters (1,000 by default), each checked and exported; the report counts findings by rule. |

The rules suites download and cache what they need in `~/.soulforge-test` (pinned content version in
`scripts/content-pin.json`). Each run writes a report and the files of any character with findings.

## 8. Building and releasing

- `npm run dev`: the web version on Vite's dev server.
- `npm run test-app`: a debug desktop build installed as "Soul Forge Test" (it shares data with the released app).
- `node scripts/release.mjs minor`: type check, tests, build, a full rules check on a fresh seed (aborts on any
  finding), version bump, changelog, tag and push. `.github/workflows/release.yml` builds and signs the installers
  for every platform and publishes the GitHub release.

## 9. Conventions

- Fixes go to the cause, so every character with the same pattern is covered, and a test or check is added that
  would catch the whole class of mistake. Content mistakes are fixed in `contentFixes.ts` with a comment, not worked
  around in the engine.
- Comments say why, not what. Names are spelled out.
- Choices a file or the rules do not settle are left open for the user, never guessed.
- `docs/RELIABILITY-PLAN.md` explains the approach to correctness in depth; `docs/FEATURES-LATER.md` lists ideas
  parked until import, build and export are reliable.

## 10. Where to start reading

1. `src/aurora/types.ts` and `character.ts` for the data model.
2. `src/aurora/engine.ts`, `resolve()`, for how a character is built.
3. `src/aurora/sheet.ts`, `buildSheet()`, for how numbers are computed.
4. `src/aurora/rulesCheck.ts` for what "follows the rules" means.
5. `src/ui/App.tsx` and `BuildBoard.tsx` for the interface.
6. `src/aurora/rules.suite.test.ts` for how all of it is tested together.
