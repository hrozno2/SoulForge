# Soul Forge user guide

Soul Forge builds and plays D&D 5e (2024) characters. It runs on macOS, Windows and Linux, keeps everything on your computer, and ships without rules content: you load that yourself.

## 1. First run

1. Open the **Content** tab.
2. The AuroraLegacy link is listed. Press **Add** (or paste your own `.index` link). Soul Forge downloads the elements and checks for updates every hour.
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

- **Conditions** (Play → Extras) change d20 rolls and say why in the roll. Exhaustion takes 2 off each d20 test and 5 feet off speed per level. Taking damage while concentrating asks for the Constitution save.
- **Wild Shape** (Play → Extras): enter the form and its hit points. Damage hits the form first and the rest carries over to you. Companions track their own hit points there too.
- **Notes** keeps general notes and a session log with dates you can search.
- **Level up** (Play or Manage) walks through the hit point roll, new features and spell choices, and can be undone.
- **Party** on the Home tab shows the characters you tick side by side, with a button to roll initiative for all of them.

## 5. PDF export

Open **Sheet** and press **Export PDF**.

### Official 2024 sheet (default)

1. Download the free 2024 character sheet from Wizards of the Coast (search "D&D 2024 character sheet PDF" on dndbeyond.com).
2. Press **Add sheet PDF** and pick it. Soul Forge recognises it and keeps a copy on your computer only.
3. Choose pages and press **Fill and save**.

The official sheet has no form fields, so text is placed on it as printed. Long feature text shrinks to fit; if something is cut off, Soul Forge says so.

### Other sheets

- **DLDM 5E24** fillable sheets (five-page file or single pages): filled in and left editable.
- **DLDM companion sheets** (mount, beastmaster): filled from the companion you pick.

### Add-ons

Under any sheet you can tick **Spell cards**, **Item cards**, **Feature cards** and **Tips and tricks for play**. They are appended after the sheet pages.

### Soul Forge style PDF

A sheet in Soul Forge's own layout. It has the same add-ons. Cards are poker size, nine to a page.

### Getting a sheet

Next to **Add sheet PDF** there are links to the free official 2024 sheet and the fillable 5th edition sheet from Wizards of the Coast. They open in your browser; save the PDF, then add it.

### Translating the PDF

Pick **DeepL** under Translation service for the best quality in most European languages: paste a key from deepl.com/pro-api (a key ending in `:fx` is the free plan). It works in the desktop app only. **Terms with fixed translations** holds names that machines get wrong, one `English = translation` per line; those are used as written, and with DeepL they are also sent as its glossary. German, French and Spanish have a short starter list built in.


Choose **Translate to** in the export panel. Soul Forge sends only the text that will be printed (feature and spell text, card text, play tips, labels) to the service you pick. Your character file is never sent, and your character's own names are kept as typed. Answers are cached on your computer.

Pick a service under **Translation service**:

| Service | Cost | Notes |
|---|---|---|
| LibreTranslate | free if you host it, or a paid key for the public server | open source; quality is fair |
| Google Cloud Translation | you create an API key; the first 500,000 characters a month are free | best coverage |

DeepL gives the best quality for European languages, but its API refuses requests from apps like this one. Support for it needs a desktop-only helper and is not in yet.

Languages offered are those the PDF font can print: Latin, Cyrillic and Greek scripts. The official and fillable sheets keep their printed English labels; the translation covers the Soul Forge style PDF, the cards and the tips page.

## 6. Importing from 5e.tools and Plutonium

Soul Forge cannot read 5e.tools directly (the site blocks apps). It reads the same JSON data files that Plutonium uses.

Under **Content → 5etools data**:

1. Press **Use the public 5etools copy on GitHub**, or enter the **address** of a 5etools `data` folder you have access to (for example a copy you host). Plutonium uses the same kind of data source in Foundry.
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

Content → the **Homebrew builder** makes a spell, item, feat, species, background or class feature from a form and saves it as a content source. **Write your own content** takes Aurora element XML directly. See `docs/aurora-parity.md` for what the engine supports.

## 10. Updating, backups and removing

The app checks for updates and offers to install them. Content sources can be removed on the Content tab. All data lives in storage inside the app. Settings → **Back up everything** saves characters, sources and templates to one file, and **Restore** puts them back. A rolling set of automatic copies is kept inside the app too, but a file you keep elsewhere is the real backup.

## Settings

Interface size (also Ctrl or Cmd with + and −), compact mode, reduced motion, paper size for PDFs, automatic backups, and the interface language.

Foundry and Roll20: **Export for Foundry** and **Export for Roll20** on the Sheet tab write files in those tools' character formats. They come across by name without compendium links, and were checked by reading them back into Soul Forge, not inside Foundry or Roll20 themselves.

## 11. Help and contributing

Soul Forge is free and open source under the MIT license. Report problems or send changes at https://github.com/hrozno2/SoulForge. Third-party material is listed in `NOTICE.md`.
