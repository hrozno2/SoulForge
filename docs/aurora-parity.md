# Aurora Builder feature check

Aurora Builder's installer was inspected for its screens, controls and rule types, and its public documentation was read. This is the checklist of what it offers and where Soul Forge stands. No Aurora code or assets are used.

## Content format

| Aurora | Soul Forge |
| --- | --- |
| Elements with `name`, `type`, `source`, `id`; later files override earlier ones | Supported |
| `description`, `sheet` (display, alt, action, usage, per-level text), `setters`, `supports`, `requirements` | Supported |
| `grant`, `select`, `stat` rules with `level`, `requirements`, `number`, `default`, `optional`, `bonus`, `equipped`, `inline` | Supported |
| Requirement expressions: `,` `&&` `||` `!` parentheses, `[str:13]`, `[level:5]`, `[type:spell]`, element ids, stat keys | Supported |
| Supports expressions: `A,B`, `A||B`, `A|B`, parentheses, spell levels | Supported |
| `$(spellcasting:list)`, `$(spellcasting:slots)`; `{{stat}}` placeholders | Supported |
| `spellcasting` (name, ability, list, extend, prepare), `multiclass`, `append`, `extract`, `compendium display=false` | Supported |
| `List` selections with `<item>` text choices | Supported |
| Bonus types (highest of a group wins), `base`, `double`, armor class calculation and unarmored defenses, `ac:armored:*`, `innate speed:*` | Supported |
| Index files with nested indexes and versions, content links | Supported with automatic updates |
| Custom user content files | Supported (editor on the Content tab, file import) |

## Screens

| Aurora | Soul Forge |
| --- | --- |
| Start: new character, character list, update notices | Start tab: list, new, random, open, duplicate, delete, export |
| Build: species, class, background, ability scores, languages, proficiencies, feats | Build tab, same sub-tabs |
| Magic: spellcasting by class, spell lists, prepared spells, slots, spell filter, spell compendium | Magic tab; content browser on the Content tab |
| Equipment: equipped slots, inventory, storage containers, coins, extract packs, custom items | Equipment tab (containers, attunement, two-handed use, packs, custom items) |
| Manage: level up, options, attacks, sources, coinage, conditions | Manage tab |
| Character sheet and PDF | Sheet tab and PDF export, plus printable cards |
| Companions | Companions on the Manage tab and the sheet |
| Experience progress, advancement | XP and level on the Manage tab |
| Dice service and quick bar | Dice panel; click bonuses on the sheet to roll |
| Themes and accent colours | Light, dark, auto and five accents |
| Portrait gallery | One portrait per character |

## Not done

- Opening Aurora `.dnd5e` character files.
- Campaigns (sets of sources shared between characters), character groups.
- Symbol and companion image galleries; sheet layout customisation.
- Spell replacement rules (`allowReplace`) when levelling up.

## Added after the first release

- Starting equipment buttons for class and background, adventuring packs and common gear.
- Fillable character sheet PDFs (DLDM 5E24 and companion sheets), filled from your own copy of the file.
- A play screen modelled on D&D Beyond, and a restyle toward D&D Beyond and the WotC books.
