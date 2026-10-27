# Every sheet (A3.2)

How each sheet Soul Forge fills is described, checked and filled. Run the check with
`SOULFORGE_RULES=$HOME/.soulforge-test npx vitest run src/sheets/sheetCoverage.test.ts`; it writes
`<cache>/sheets/coverage.md`.

## The profiles

A sheet's profile is its layout (src/sheets/layouts/*.json: every field's name, kind, page and place, taken from the
fillable version) and its mapper (src/sheets/forms.ts for the official 2014 and 2024 sheets, automap.ts for the
others, alt2.ts, dldm.ts for DLDM 5E24 and its companion pages): which character value goes in which field, how long
text is split or continued, and the sheet's quirks (fields the PDF names twice are drawn onto the page; DLDM's values
above their labels and swapped spell field names are handled in dldm.ts).

## Coverage (2026-10-27, the fully loaded test character)

| Sheet | Fields filled |
|---|---|
| WotC 2024 (printed) | 260 of 260 |
| WotC 2014: standard, alternative, 3 pages, details, spellcasting (fillable and printed) | all |
| WotC Tyranny of Dragons (adventurers) | 87 of 87 |
| WotC 2014 Alternative 2 | 112 of 123: spell attack damage, equipment notes and gems have no data in Soul Forge |
| DLDM 5E24, five pages | checked by src/sheets/dldm.test.ts (every page, nothing missing) |

## Printed sheets without fields

A printed copy (no form) now gets the fillable version's fields at the layout's places, transparent and without
borders, so the page looks the same and every value can be changed afterwards (src/sheets/official.ts
`addFormFields`). If that fails, the text is written onto the page as before.

## Licences

WotC and DLDM sheets are not bundled: the app downloads them from their publishers (one button) and fills them by
their profile.
