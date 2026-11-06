# betterR20: what it does and what we took from it (read 2026-11-06)

Source: DeathStalker471/betterR20, branch Jumpgate-Importer (722e168), release v1.36.1.8. Read only, kept in `~/.soulforge-test/betterr20-src`, nothing run. `package.json` and the userscript headers say MIT, but the repository has no licence file, so it is treated like Plutonium: we read how it works, and no code is copied.

## How it works with Roll20

It is a Tampermonkey script that runs inside the Roll20 editor page and works on Roll20's own objects (`d20.Campaign.characters`, `character.attribs`). There is no server or file step, except its JSON character import and export.

| Part | File | What it does |
|---|---|---|
| Character JSON in and out | `base-character-io.js` | `{schema_version: 1, character: {attributes, attribs, abilities, blobBio, blobGmNotes, blobDefaultToken}}`, or `characters: [...]`. Import resets the character's attribs and pushes the file's |
| Old sheet (OGL) | `5etools-importer.js`, `5etools-*.js` | One attribute per field, rows as `repeating_<section>_<id>_<field>` |
| 2024 sheet | `5etools-2024-import.js` | One attribute, `store`: JSON with `integrants.integrants`, a map of typed records (Class, Class Level, Species, Features, Spell, Item, Ability Score, Proficiency...) joined by `parentID` and `childIDs`, plus display orders and `currencies`, `hitpoints`, `classLevel` |
| Charactermancer add-on | `betteR20-charactermancer.user.js` (release only) | Intercepts Roll20's compendium GraphQL calls and answers with 5e.tools classes, species, backgrounds, feats and spells as builder records |
| Sheet detection | `5etools-2024-import.js` | Reads which sheets a game has, and picks the format |
| D&D Beyond import | `5etools-importer.js` | Reads a D&D Beyond character PDF's fields, looks names up in 5e.tools, writes the sheet |

**Plutonium:** neither the wiki nor the code mentions it. It reads 5e.tools data directly, plus 5e.tools' `roll20.json` for spell details. So there is no Plutonium route to learn from here; ours stays docs/PLUTONIUM.md.

## What changed in Soul Forge

Import:
- **The 2024 sheet's `store` is read** (`src/aurora/roll20Store.ts`). Before, such a character came in with almost nothing.
- **betterR20's own file** is read: name in `attributes`, bio in `blobBio`, a `characters` list (the first is imported, and the import says so).
- **Levels:** `level` is the total and `base_level` the first class alone. They were read the other way round, which gave a multiclass too few levels. A class whose box is off on the sheet no longer counts.

Export, for the OGL sheet, in field names and values checked against Chris's real saved files:
- Skills were written with a formula the sheet does not use, so they would not have worked. They now read `(@{pb}*@{x_type})`.
- A multiclass now sets its flag, and the first class's level is its own.
- Spells carry school, time, range, components, duration, concentration, ritual, text and prepared. Before: name and level.
- Items carry weight, text, properties and the modifier line. Weapons also get attack rows with this app's numbers.
- All features go across, not only feats, with their source. Languages, armor, weapons and tools are rows.
- The file also has betterR20's fields, so both VTTES and betterR20 can bring it in.

## Not verified

- **No file saved by Roll20's own 2024 builder has been tried.** The store reader follows what betterR20 writes and what its Charactermancer feeds Roll20, so a native character may hold record types it skips. Background is the likeliest gap. A real export from a 2024-sheet character would settle it.
- The export has not been loaded into a real Roll20 game. Its field names were compared with real saved files only: the only names not in them are ones a sheet leaves out until changed (`character_name`, empty `cp`, `ep`, `pp`, `gender`, `xp`). `version` 4.21 is the value in those files.
- No real multiclass Roll20 file exists in the imports cache; the reading of `base_level` and `level` comes from how the sheet's numbers relate in single-class files and from knowledge of the sheet.
- There is no export for the 2024 sheet: writing a `store` without a real one to compare would be guesswork.
