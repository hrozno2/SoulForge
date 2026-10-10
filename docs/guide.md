# CharForge user guide

CharForge builds and plays D&D 5e (2024) characters. It runs on macOS, Windows and Linux, keeps everything on your computer, and ships without rules content: you load that yourself.

## 1. First run

1. Open the **Content** tab.
2. The AuroraLegacy link is listed. Press **Add** (or paste your own `.index` link). CharForge downloads the elements and checks for updates every hour.
3. Go to **Home** and press **New character**.

Content links work like Aurora's: add as many as you like, switch parts of them off in the tree, and use **Check for updates** to refresh by hand.

## 2. Tabs

| Tab | What it does |
|---|---|
| Home | Your characters. New, random, duplicate, export, delete, import from file, import from Foundry, Roll20 or Plutonium. Portraits show here. |
| Build | Species, class, background, ability scores, languages, proficiencies, feats. The number on a tab counts choices left; hover it to see which. |
| Magic | Spell lists, prepared and known spells, slots. Filters follow 5e.tools: level, school, class, components, concentration, ritual, casting time, range. |
| Equipment | Inventory, equip, attune, coins. Buttons add starting equipment from your class and background, and gear packs. |
| Manage | Level and hit points, details (alignment, deity, portrait), custom bonuses, manual additions, attacks, companions, conditions, sources. |
| Play | The table view: ability boxes, vitals, rests, rolls, actions, spells, inventory, features. |
| Sheet | Printable character sheet and PDF export. |
| Content | Content links, 5etools import, files, your own homebrew XML, compendium. |

Press the **?** in the top bar for a short list of tips on the tab you are in. Small grey hints can be dismissed with ×.

## 3. Choosing things

- **Filters** on every list. Sort by name, recommended, newest or level.
- **Badges or List** view. Badges are the large cards; List is the compact Aurora style.
- **Versions**: the same species or class from several books is one card. Pick the book from the chips. Each chip shows the book and release date, and the newest is marked.
- **Learn more** opens the full text in a window.
- **Choose 3** style counters sit to the right of each selection, for example `2/3`.
- **Custom bonuses** (Manage tab) and the **Custom** column under Ability Scores add your own modifiers.

## 4. Playing

- Click a modifier to roll it. The roll appears large in the dice panel at the bottom right.
- The **Disadvantage / Normal / Advantage** switch at the top of Play applies to every d20 roll from the sheet.
- The dice panel has every die as a shape, a free-text roller (`2d6+3`) and a roll log you can open. Closing the panel clears the log.
- **Heal, Damage, Temp** take the number in the box beside them. At 0 HP, death saves appear.
- Features with limited uses show pips. A filled pip is a use left. The text beside it says how many are left and when they return, for example `1 of 2 left · back after long rest`.
- **Short rest** spends hit dice and refreshes short-rest features. **Long rest** restores hit points, slots, features and half your hit dice.

## 5. PDF export

Open **Sheet** and press **Export PDF**.

### Official 2024 sheet (default)

1. Download the free 2024 character sheet from Wizards of the Coast (search "D&D 2024 character sheet PDF" on dndbeyond.com).
2. Press **Add sheet PDF** and pick it. CharForge recognises it and keeps a copy on your computer only.
3. Choose pages and press **Fill and save**.

The official sheet has no form fields, so text is placed on it as printed. Long feature text shrinks to fit; if something is cut off, CharForge says so.

### Other sheets

- **DLDM 5E24** fillable sheets (five-page file or single pages): filled in and left editable.
- **DLDM companion sheets** (mount, beastmaster): filled from the companion you pick.

### Add-ons

Under any sheet you can tick **Spell cards**, **Item cards**, **Feature cards** and **Tips and tricks for play**. They are appended after the sheet pages.

### CharForge style PDF

A sheet in CharForge's own layout. It has the same add-ons. Cards are poker size, nine to a page.

## 6. Importing from 5e.tools and Plutonium

CharForge cannot read 5e.tools directly (the site blocks apps). It reads the same JSON data files that Plutonium uses.

Under **Content → 5etools data**:

1. Enter the **address** of a 5etools `data` folder you have access to (for example a copy you host). Plutonium uses the same kind of data source in Foundry.
2. **Paste links**: copy a link from 5e.tools such as `https://5e.tools/spells.html#hunter%20sense_grimhollowpg24,flstlevel:0=1` and press **Import links**. Filters in the link are ignored; the name and book are used. One link per line.
3. **Search**: pick spells, items, feats, species, backgrounds or creatures, load the list, search by name, tick entries, **Import selected**.

Picked entries land in a source called *Picked from 5etools*. Everything you pick stays; later picks add to it.

Whole data folders, ZIPs and loose `.json` files can also be imported from disk. Classes come in through that route (they need many linked files).

You can also import character files from Foundry, Roll20 and Plutonium on the Home tab.

## 7. Themes

The theme picker in the top bar switches between Obsidian (black and red, default), Leather (brown and gold), Tools blue, Daylight and Printed book. The choice is remembered.

## 8. Portraits

Manage → Details has **Choose a stock portrait** (public domain and CC0 art, credited in `public/portraits/CREDITS.md`) or upload your own image. It is scaled down and stored with the character.

## 9. Writing your own content

Content → **Write your own content** takes Aurora element XML. See `docs/aurora-parity.md` for what the engine supports.

## 10. Updating and removing

The app checks for updates and offers to install them. Content sources can be removed on the Content tab. All data lives in your browser storage inside the app; export characters to keep copies.

## 11. Help and contributing

CharForge is free and open source under the MIT license. Report problems or send changes at https://github.com/hrozno2/charforge. Third-party material is listed in `NOTICE.md`.
