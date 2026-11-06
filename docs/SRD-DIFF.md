# The built-in rules against the SRD API (2026-11-06)

`RULES_TIER=srd-api`, full list in `<cache>/engine/srd-api.md`. Each kind was sampled against the official PDFs; the PDF decides. The gate fails if a kind rises.

| Edition | Kind | Count | Verdict |
|---|---|---|---|
| Both | Equipment cost and weight | 4, 4, 14, 15 | API wrong. PDF 5.2.1: Alchemist's Fire 50 GP, Bedroll 1 GP and 7 lb., Chain Shirt 20 lb. The 2014 ammunition rows differ because the API prices a bundle of 20 and we price one. |
| 2014 | Spell school | 3 | API wrong. PDF 5.1: Mass Cure Wounds and Mass Heal are evocation. Revivify is expected to be necromancy as in the PDF's text; not confirmed from its heading. |
| 2014 | Spell class list | 5 | API counts subclass lists or is wrong. PDF 5.1's Bard list has Faerie Fire. The other four were not read individually. |
| 2014 | Spell duration | 3 | Find the Path, Forbiddance, Project Image: 24 hours against 1 day; same length, wording not read in the PDF. |
| 2024 | Cantrips | 2 | API wrong. PDF 5.2.1's Druid table: 3 at level 7. Level 16 is the same pattern, not read individually. |
| 2024 | Spell components | 6, 9 | API misprint: "Component:" in its source text was not parsed (Guidance, Contagion and Find Steed read in the PDF). |
| 2024 | Weapon damage and type | 1, 1 | API wrong. PDF 5.2.1: Trident 1d8, Sling Bludgeoning. |
| 2024 | Protection from Evil and Good, concentration | 1 | Not settled: the PDF excerpt read stopped before its duration line. |
| 2024 | **Book and SRD differ** | 3 | The bundle follows 5e.tools' 2024 book values, and the SRD differs: Flaming Sphere is Conjuration in the PDF (here Evocation), Commune with Nature is Instantaneous (here 1 minute), Dream's range is Special (here Self). Goodberry's range also differs from the API; the PDF's entry was not found by the search used. Glyph of Warding and Symbol differ only by "or triggered". **Worth fixing with a PDF override before release.** |
| 2024 | Plant Growth casting time | 1 | We show Action; the PDF has "Action (Overgrowth) or 8 hours (Enrichment)". A real simplification. |
| Both | Equipment missing here | 53, 23 | Mostly naming ("Clothes, fine" against "Fine Clothes") and pack contents the API lists as items (Alms box, Censer). Barding and some mounts were not checked. |
