# Licenses (Stage D0, checked against the PDFs 2026-11-06; not legal advice)

## The SRD bundle (`public/srd/`)

Soul Forge ships two free rule sets so a character can be built with nothing imported.

Attribution for SRD 5.1, word for word from `SRD_CC_v5.1.pdf`, Legal Information:

> This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.

Attribution for SRD 5.2.1, word for word from `SRD_CC_v5.2.1.pdf`, Legal Information:

> This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

Both PDFs say to include no other attribution to Wizards than this, and allow "compatible with fifth edition" or "5E compatible". Section 5 of CC-BY-4.0 has the disclaimer of warranties.

The statements appear in Settings (About) and in each bundle file's `attribution` field.

PDFs used (official links, kept in `~/.soulforge-test/srd/pdf/`, not shipped):

| File | From | SHA-256 |
|---|---|---|
| SRD_CC_v5.1.pdf | media.wizards.com/2023/downloads/dnd/ | 2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0 |
| SRD_CC_v5.2.1.pdf | media.dndbeyond.com/compendium-images/srd/5.2/ | 8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87 |

## What the bundle contains

Classes, subclasses, species, backgrounds, feats, spells, items and conditions that 5e.tools marks as being in the SRD, one file per edition, matched to the SRD: where 5e.tools' copy differs from the official PDF, the PDF decides (`src/aurora/srdFollow.ts`, `docs/SRD-DIFF.md`). Spell facts, spell text and the text of magic items, features, species, feats and backgrounds come from the PDF when they differ. What has no section in the PDF keeps only sentences found in it (`src/aurora/srdText.ts`): the same words, ignoring capitals, punctuation and line breaks, or for a sentence of 10 or more words at least 80% of its four-word runs. Short lines the app writes itself ("You have a +1 bonus to...", resistances, equipment lists) are facts in the app's words. Text not from the PDF that names a term in `NOT_IN_SRD` is removed (`src/aurora/srdBundle.ts`), and the build fails if one is left. What was dropped is listed in `~/.soulforge-test/srd/srd-*.dropped.txt`.

**Decided by Chris, 2026-11-06:** it is fine to ship the bundle built through 5e.tools' entries, as long as it stays matched in content to the SRD's entries, and it follows the SRD wherever they differ. The selection and structure are derived from 5e.tools data, which is not openly licensed; the entries, facts and words are checked against the official SRD at every build. This is Chris's call on the risk and is not legal advice.

## Other sources

- **5e.tools data:** not openly licensed, never shipped; the user loads it.
- **SRD API (5e-bits, dnd5eapi.co):** code MIT, data under the OGL 1.0a. A cached copy in `~/.soulforge-test/srd-api/` is used only as a test check, never shipped.
- **Plutonium:** UNLICENSED. Read to learn its approach; none of its code is copied.
- **Aurora content:** test app only; leaves the release at D7.
- **Trademarks:** no "D&D" branding in the app's name or icons.
