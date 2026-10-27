# Class features against the rules (A3.1)

The features the master plan names, each checked on a built character in `src/aurora/classAudit.test.ts` (and the
beast forms in `src/aurora/forms.test.ts`). A check builds the smallest character that has the feature and reads the
sheet. Run with `SOULFORGE_RULES=$HOME/.soulforge-test npx vitest run src/aurora/classAudit.test.ts`.

| Feature | Rule | Result (2026-10-27) |
|---|---|---|
| Monk Unarmored Defense, 2014 and 2024 | AC 10 + Dexterity + Wisdom without armor | Right |
| Jack of All Trades, 2014 and 2024 | Half proficiency on checks without proficiency | Right |
| Hexblade, Hex Warrior (XGtE) | Charisma for attacks with a weapon that lacks the two-handed property | **Was wrong** (Strength used). Fixed: the sheet reads "use your X modifier instead of Strength or Dexterity" from every active feature's text, with the conditions its sentences set (src/aurora/sheet.ts `weaponAbilityOptions`). |
| Pact of the Blade, 2024 | Charisma for the bonded weapon | Fixed by the same rule. The bonded weapon's proficiency needs the weapon marked as bonded (Stage C). |
| Battle Smith, Battle Ready (ERLW, TCE, EFA) | Intelligence for attacks with a magic weapon | **Was wrong**. Fixed by the same rule (magic weapons only). |
| Bladesinging, Bladesong | +Intelligence to AC only while Bladesong is active | Right: the base AC has no Intelligence. The 2024 Bladesong's Intelligence for attacks is also only while active, and is left out. |
| The Fiend's expanded spells | On the Warlock's spell list | Right |
| Firearms, Gunner (TCE) | Proficiency with firearms | **Was wrong**: the content granted the DMG firearms group, which needs the DMG's optional Firearms rule. Fixed in src/aurora/contentFixes.ts (GRANTS_ADD). |
| Wild Shape and Circle of the Moon, 2014 and 2024 | The form's statistics with the character's own | Built in A2.6 (src/aurora/forms.ts). |
| Echo Knight's echo, Battle Smith's Steel Defender | The creature's statistics for the character | Open: they are companions; their stat blocks follow with the companion cards (Stage C) on top of src/aurora/forms.ts. |

Limits kept on purpose: Hex Warrior and Pact of the Blade apply to one weapon at a time; the sheet uses the better
ability for every weapon that qualifies until a weapon can be marked (Stage C).
