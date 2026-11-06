# The built-in rules against the SRD (2026-11-06)

Chris, 2026-11-06: the bundle ships as long as it matches the SRD entries; where we differ, follow the SRD. So the official PDFs decide, not 5e.tools and not the API.

## Against the PDFs (`RULES_TIER=srd-bundle`, reports in `<cache>/srd/srd-*.follow.txt`, `srd-*.class-tables.txt`, `srd-*.dropped.txt`)

The PDFs are read as structure (`src/aurora/srdPdf.ts`, using poppler's `pdftohtml`), and `src/aurora/srdFollow.ts` applies them before anything is bundled.

| What | State |
|---|---|
| Which spells | Exact: 319 and 339, the build fails if one is missing or extra |
| Spell facts | Level, school, casting time, range, duration, ritual, concentration, components, material and class lists come from the PDF where they differ. Example: Flaming Sphere is Conjuration, Commune with Nature Instantaneous, Dream's range Special, Power Word Heal has no somatic component, most 2024 area spells read "Self" |
| Spell text | From the PDF where it differs: 5.2.1's Reincarnate table has "Roll again." instead of Aasimar, Polymorph has its saving throw back |
| Other text | Magic items, features, species and their traits, feats, backgrounds, subclasses: found by heading or bold lead-in, the section whose words overlap most; the PDF's text is used where it differs |
| Gear | Cost, weight, damage and armor class from the PDF's tables where a row is found (Burglar's Pack is 42 lb., here 47.5 before). Gear the SRD does not name leaves (Dulcimer) |
| Magic items | Rarity and attunement from the line under the heading (2024 Plate Armor of Etherealness needs no attunement). Items the SRD gives once appear once per variant with that text |
| Features by level | All 12 classes in both editions agree with the class tables. Left: sub-features we list by name under a parent (Flurry of Blows), and Wizard 20 "Signature Spells" against the SRD's singular |
| What was not checked | Variants with no section (+1 Longsword, Ring of Acid Resistance) keep the converter's short facts; they pass the word check. Gear with no table row keeps 5e.tools' numbers (`gear row` in the follow report, 94 and 39, mostly name forms such as "Arrow") |
| Not bundled | Bestiary. Weapon properties, skill lists and starting equipment were not compared with the PDF yet |

The 2024 SRD also contains names that the plan assumed it did not: Tiamat in Dragon Orb. Text from the PDF is the SRD's own, so it stays.

The conditions on the Play tab (`src/ui/conditions.ts`) are short reminders in the app's own words, not SRD text, and are not checked here.

## Against the SRD API (`RULES_TIER=srd-api`, full list in `<cache>/engine/srd-api.md`)

Each kind was sampled against the official PDFs; the PDF decides. The gate fails if a kind rises. All 2024 differences between book and SRD are gone from this list; what is left is the API's own.

| Edition | Kind | Count | Verdict |
|---|---|---|---|
| Both | Equipment cost and weight | 4, 4, 14, 15 | API wrong. PDF 5.2.1: Alchemist's Fire 50 GP, Bedroll 1 GP and 7 lb., Chain Shirt 20 lb. The 2014 ammunition rows differ because the API prices a bundle of 20 and we price one. |
| 2014 | Spell school | 3 | API wrong, the PDF decides here by construction. |
| 2014 | Spell class list | 5 | API counts subclass lists; the PDF's class lists decide here by construction. |
| 2014 | Spell duration, casting time | 6, 1 | The PDF's wording: "24 hours" against "1 day", "or triggered", "one minute", Plant Growth's "action or 8 hours". |
| 2024 | Cantrips | 2 | API wrong. PDF 5.2.1's Druid table: 3 at level 7. Level 16 is the same pattern, not read individually. |
| 2024 | Spell components | 5, 9 | API misprint: "Component:" in its source text was not parsed. The PDF decides here by construction. |
| 2024 | Weapon damage and type | 1, 1 | API wrong. PDF 5.2.1: Trident 1d8, Sling Bludgeoning. |
| 2024 | Protection from Evil and Good, concentration | 1 | The PDF has concentration. |
| Both | Equipment missing here | 53, 24 | Mostly naming ("Clothes, fine" against "Fine Clothes") and pack contents the API lists as items (Alms box, Censer). |
