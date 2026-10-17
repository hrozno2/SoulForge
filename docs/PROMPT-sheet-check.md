# Prompt: check a Soul Forge character against the rules, fix it, return the PDF

Copy everything below the line into the other AI, then attach the character's exported **PDF** and **JSON**.

---

You are checking a D&D 5e character made in **Soul Forge** (a desktop character builder) against the rules. I
give you two files exported from the app for the same character:

- the **character JSON** (Soul Forge's own save file), and
- the **character sheet PDF** (usually "DLDM 5E24 CHARACTER SHEET - 5pg - Updated Form Fields", a fillable form,
  sometimes with extra pages: "Spells, continued", spell cards, "Tips and tricks for play").

Your job:
1. Read both files completely.
2. Check every number and choice against the rules.
3. List what is wrong or missing. Say for each item whether it is a mistake on the **sheet** (the PDF shows
   something the JSON does not say) or in the **character** (the JSON itself breaks a rule).
4. **Ask me before any judgment call** (see "Ask first" below). Do not guess.
5. Fix what I approve, and give me back a **fixed PDF** and a **fixed JSON**, plus a short list of every change.

Write plainly. Say what you checked and could not check. Never claim something is correct without having
calculated it.

## 1. Reading the files

### The PDF
Read the **form fields**, not only the visible text:
- With Python: `pypdf` (`PdfReader(f).get_fields()`, the `/V` value of each field).
- With Node: `pdf-lib`. `getText()` throws on rich-text fields. For those, read the raw `/V` entry of the field's
  dictionary instead.
- Also run `pdftotext -layout` (poppler). Some long fields are rich text, and the feature text is easiest to read
  there.
- Render the pages to images (`pdftoppm -r 75 -png`) and look at them. On this sheet, **field names do not always
  match the label printed next to them**:
  - The spellcasting block: the field named `SPELL ATTK BONUS23` holds the **spellcasting modifier**,
    `SPELLCASTING MOD24` holds the **save DC**, and `SPELL SAVE DC25` holds the **attack bonus**. On the page they
    sit correctly under "Spellcasting Modifier / Spell Save DC / Spell Attack Bonus". This is **not** an error.
  - Hit points: the sheet prints each value **above** its label, so the max HP number sits between "TEMP" and
    "MAX". This is **not** an error.
  - Fields ending in `__p4`, `__p1` etc. are copies of the same field on another page.
- Check the PDF's date against the JSON's. If the PDF is older, its differences may only be choices made after it
  was exported. Ask for a fresh export rather than reporting them as bugs.

### The JSON (Soul Forge format)
- `classes`: `[{classId, level}]`. Ids like `ID_WOTC_PHB24_CLASS_CLERIC`. `PHB24`/`XPHB` means 2024 rules,
  `PHB` means 2014.
- `race`, `background`: element ids. `ID_5ET_...` ids come from 5e.tools content the player imported.
- `abilityBase`: the scores **before** any increases. `abilityMethod`: "pointbuy", "standard", "roll" or "manual".
  `pointBuy` (when present) holds **custom rules**: `budget` (for example 30 instead of 27), `min`, `max`, `costs`.
  Always check point buy against these, not against the default 27.
- `selections`: every choice, keyed `"<element id>|<rule index>"`, valued with the chosen element ids. For
  example `"ID_WOTC_PHB24_CLASS_CLERIC|6": [skill ids]` is the Cleric's skill choice. List choices (background
  traits) hold numbers as strings.
- `prepared`: `{ "<casting line name, e.g. Cleric>": [spell ids] }`. These are the prepared spells of a class that
  prepares from its whole list. Spells a subclass or feat grants are always prepared and are **not** in this
  list.
- `inventory`: `[{uid, id, qty, equipped, attuned}]`. An empty `id` means a written-in item.
- `equipmentAdded` / `equipmentLedger`: which starting-equipment option was taken, the items it gave, and its
  gold.
- `coins`: `{cp, sp, ep, gp, pp}`. `hpMode`: "average" or "roll" (with `hpRolls`). `notes`, `info`: text.
- `portrait`: a base64 image. Ignore it, but keep it when you write the JSON back.

## 2. What to check (2024 rules unless the class/species/background ids say 2014)

Work it out yourself and show the numbers.

- **Ability scores.**
  - Base costs within the point-buy budget, min and max from `pointBuy`, or a valid standard array or roll.
  - Then the increases:
    - 2024: the **background** gives +2/+1 or +1/+1/+1 among its three listed abilities, and a 2024 species gives
      none. With an older (2014) background on a 2024 character, the increase comes from the species or the
      older-background rule instead. Either way, **only one** source gives the origin increase.
    - Ability Score Improvements and feats (most 2024 feats give +1).
  - No score above 20 without a rule allowing it. Flag increases that come from both species and background.
- **Proficiency bonus:** +2 at levels 1–4, +3 at 5–8, +4 at 9–12, +5 at 13–16, +6 at 17–20.
- **Hit points.**
  - Level 1: max hit die + Con modifier. Each level after: average (half the die + 1) + Con modifier, or the
    rolls in `hpRolls`.
  - Add Tough, Dwarven Toughness, Draconic Resilience, Boon of Fortitude and similar.
  - Hit dice count = level.
- **AC.**
  - Light armor: base + Dex.
  - Medium: base + Dex, Dex counting at most +2.
  - Heavy: base only. Dex never counts, not even a negative one.
  - +2 for a shield.
  - Or an unarmored defense: Barbarian 10 + Dex + Con, Monk 10 + Dex + Wis, Draconic Resilience, and similar.
  - Check that the character is trained in the armor worn.
- **Saving throws:** the first class's two saves only (not a multiclass's). Bonus = mod + proficiency where
  proficient.
- **Skills.**
  - Count every source: class choices (the number the class gives), background (2 fixed in 2024), species,
    feats (Skilled = 3), and features.
  - A skill picked twice is a wasted pick, which the rules say to replace.
  - Expertise: Rogue 2 at level 1 and 2 more at 6; Bard at 2 and 9; and similar.
  - Check every skill bonus: mod + proficiency, or 2× for expertise, plus features such as Jack of All Trades or
    the 2024 Cleric's Thaumaturge (Wis mod, minimum +1, added to Arcana and Religion).
  - Passive Perception = 10 + Perception.
- **Initiative:** Dex mod plus features (Alert adds proficiency; the 2024 Gloom Stalker adds Wis).
- **Speed and size:** from the species (the 2024 Goliath has speed 35).
- **Languages.**
  - 2024: Common plus 2 languages from the origin, plus class extras (2024 Rogue: Thieves' Cant and one more).
  - 2014: per species and background.
- **Tools, armor and weapon training:** per class and background.
- **Class and subclass features:** everything up to the character's level is listed, with correct numbers. For
  example Sneak Attack (level ÷ 2, rounded up, d6), Channel Divinity uses, Divine Spark dice, and uses per rest.
  Flag text that reads wrong, such as "1d8++4".
- **Feats:** every feat from the origin, ASI levels and features. Each meets its prerequisites. A feat's effects
  are applied, for example 2024 Crossbow Expert removes **Loading** from crossbows.
- **Species traits:** darkvision range, resistances, uses per rest (often = proficiency bonus), spells granted
  and their ability.
- **Spellcasting.**
  - Ability, save DC = 8 + prof + mod, attack = prof + mod.
  - Slots by the class table (or the multiclass table).
  - Number of cantrips.
  - Number of prepared spells against the class table:
    - 2024 Cleric/Druid: 4, 5, 6, 7, 9, 10, 11, 12, 14, 15 for levels 1–10.
    - Use the class's own table for the others.
  - Every spell is on the class's list and of a level the character can cast.
  - Domain, oath, subclass, feat and species spells are **always prepared** and don't count against the limit.
  - **The prepared spells in the JSON's `prepared` must appear on the sheet.**
- **Attacks.**
  - Each carried weapon: attack bonus = ability mod + proficiency (if trained) + magic + fighting style (Archery
    +2 ranged).
  - Damage = die + ability mod (+ Dueling 2 and similar).
  - The ability is Str for melee, Dex for ranged, the better of the two for Finesse.
  - Properties are listed once.
  - **Weapon mastery** properties appear only for weapons the character has mastered (the mastery choices in
    `selections`).
  - Unarmed Strike: 1 + Str mod (or a Monk die).
- **Equipment and gold.**
  - The starting-equipment option matches the class's and background's lists.
  - No item twice by mistake. The same item can come from two content books, for example "Clothes, Traveler's"
    and "Traveler's Clothes".
  - Gold = the options' gold minus anything bought.
  - Flag gear that was added without being paid for.
- **Sheet versus JSON:** every value on the sheet matches what the JSON gives when you work it out. Anything
  chosen in the JSON but missing from the sheet is a sheet bug.

## 3. Known Soul Forge bugs (as of 2026-10-17)

Check for these first, and say when you find one.

Fixed in Soul Forge commit 8688551 (sheets exported before it may still show them):
- Prepared spells of whole-list casters (Cleric, Druid, Paladin, every 2024 class) missing from the sheets.
- A chosen class option hidden by the content not shown (2024 Cleric's Divine Order).
- "1d8++4"-style double signs in feature text.
- Crossbow Expert not removing Loading.
- The 2024 background option "Origin Feat" listed in the Feats box.
- "versatile, versatile (1d8)".
- Notes not printed on DLDM page 2 style A.
- With 5e.tools content loaded: the 2024 Aasimar's size choice has no options, and Traveler's Clothes is added
  twice from a background's gear.

Still open:
- With the content filter on "2024 only", choices that need skills, tools or languages can show no options. Look
  for skill, tool or language choices left empty.
- With Aurora and 5e.tools content mixed, a species and a background can **both** give an ability increase.
- Generated characters never prepare spells, so the app's own tests do not catch prepared-spell problems.

## 4. Ask first

Ask me, with short options, before deciding any of these:
- Gold versus gear: deduct purchases? If the gold doesn't cover them, which gear to drop, or should a debt be
  noted?
- Which skill, spell, feat, mastery or language to pick when a choice is missing or must be replaced.
- Changing anything I chose on purpose (ability scores, feats, gear), even if it looks suboptimal. Report it; do
  not change it unasked.
- Anything where the 2014 and 2024 rules differ and the files don't make clear which applies.
- House rules you notice (a point-buy budget other than 27 is a house rule and is fine).

## 5. Fixing and returning the files

**Fix the JSON first, then the PDF**, so they agree. Keep every field you don't change, including `portrait`.
Then pick one of these routes.

### Route A: you can run code from the Soul Forge repository (github.com/hrozno2/SoulForge)
Regenerate the sheet exactly as the app does:
1. Build a registry from the player's content:
   - The Aurora XML files: `parseElementsXml` + `ARegistry.addFile`; see `src/aurora/fixture.ts`.
   - Plus the 5e.tools data if the character uses `ID_5ET_` ids: `convertFiveTools({ files })` +
     `reg.addElements`.
   - Then `reg.build()`.
2. Load the character: `normalizeCharacter(json)`, `resolve(ch, reg)`, `buildSheet(r)`.
3. Check it: `checkCharacter(r, sh, ref)` (from `src/aurora/rulesCheck.ts`), and report its findings too.
4. Fill the sheet: `buildFillData(r, sh, { allSpells })`, then
   `fillDldm(template, data, { pages: ["p1a","p2a","spells"], font })`.
5. Add the extras the original had (spell cards, tips):
   `buildPdf(r, sh, { ...DEFAULT_PDF_OPTIONS, paper: "letter", sheet: false, spellCards, tips }, font)`. Append
   its pages with pdf-lib.
6. Fonts: `node_modules/dejavu-fonts-ttf/ttf/DejaVuSansCondensed(-Bold).ttf`. The DLDM template:
   `~/.soulforge-test/sheets/dldm-2024.pdf` (made by `node scripts/rules-check.mjs`).

If a problem is a bug in Soul Forge itself, fix the code for **every** character, not just this one. Add a test,
run `npx vitest run`, and say which file you changed.

### Route B: you cannot run Soul Forge
Edit the PDF's form fields directly with pdf-lib or pypdf:
- Keep the form fillable. Write the same value into each copy of a field (`NAME`, `NAME__p1`, `NAME__p4`).
- Regenerate the field appearances, so the new values show in every viewer.
- For checkboxes (proficiency `CB-...`, spell components), set the checked state.
- If a list doesn't fit (more spells than rows), add a plain extra page at the end, titled
  "<Name>: Spells, continued", rather than dropping anything.

Render the fixed PDF to images and look at every page before returning it.

### Return
- The fixed PDF, named `<Name> - DLDM - 5E24 CHARACTER SHEET (fixed).pdf`.
- The fixed JSON, so I can import it into Soul Forge.
- A list of changes:
  - what was wrong;
  - what it is now;
  - where on the sheet it is;
  - whether it was a sheet bug, a character mistake, or my decision.
- Anything you could not check.
