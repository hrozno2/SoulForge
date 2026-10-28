# How Plutonium reads 5e.tools (analysis, 2026-10-22)

Read from the Plutonium module (v2.19.7, foundry14 build) to learn its approach. Its license is UNLICENSED: nothing
of its code is copied into Soul Forge; the rules below are re-implemented from what the data and behaviour show.
The unpacked module is in the session scratchpad, not in the repo.

## What it ships

- The same 5e.tools data, plus the same side files we already load (foundry-*.json, class/foundry.json,
  spells/foundry.json are byte-identical). Extra side files it has and we do not: bestiary/foundry.json (creature
  features), foundry-vehicles, foundry-rewards, foundry-backgrounds and foundry-psionics (both empty).
- So what Plutonium adds is logic, in three layers.

## 1. Matching side data: by fields, not ids

Each kind lists the fields that must match, compared case-insensitively (numbers as numbers):

| Kind | Fields |
|---|---|
| most kinds | source, name |
| raceFeature | raceSource, raceName, source, name; then again with the base species (a subrace's or version's trait falls back to the species' own) |
| classFeature | classSource, className, level, source, name |
| subclassFeature | classSource, className, subclassSource, subclassShortName, level, source, name |

Soul Forge matches by its converter's ids (foundry.ts targetIds). Species traits now follow Plutonium's fallback
("Goblin (Zendikar; Grotag Tribe)", then "Goblin (Zendikar)", then "Goblin", in the trait's book): all match. Left
unmatched: 25 generic magic variants, because magicvariants.json is not loaded yet (5e.tools builds "+1 Longsword"
and the rest from it at run time; Plutonium does the same). **Next:** the converter keeps each element's 5e.tools identity fields, and foundry.ts and lore.ts
match by those fields with the base-species fallback. Magic variants: the side data of a generic variant
("+1 Weapon") applies to every specific item made from it.

## 2. Mechanics read from the text when no side data exists

- **Uses** (`_pGetDocumentData_mutUses`): reads phrases such as "a number of times equal to your Wisdom modifier
  (minimum of once)" and "a number of times equal to (twice) your proficiency bonus", and "when you finish a short or
  long rest" for recovery.
- **Activities** (EntryParseState*, ActivityBuilder*, DiceTagParser*): attacks, saves, damage and healing from the
  5e.tools tags in the text ({@damage}, {@dice}, {@dc}, {@hit}, {@actSave}, {@atk}), with player and creature
  variants.
- **Character builder** (Charactermancer_*): each structured 5e.tools field has its own chooser: additionalSpells,
  expertise, item masteries, armor/weapon/tool/language/skill proficiencies, senses, damage and condition
  immunities, resistances and vulnerabilities, resources, feature options (option blocks). Soul Forge's converter
  already reads these same fields; the comparison worth doing is the edge cases each chooser handles.
  Done for additionalSpells (2026-10-22): alternative sets are one choice (they were all granted: the 2024 Elf got
  8 spells, Circle of the Land 64), a choice of spellcasting ability is offered (111 features; it was fixed to the
  first), and "ritual" conditions in spell choices are kept. Damage defenses offered as a choice ("resist": [{"choose":
  ...}], 12 feats and species: Boon of Energy Resistance, Dragonborn, Tiefling) are a choice now; they were dropped.
  The other fields (expertise, senses, tools, languages, weapons, feats) use only shapes the converter reads.

**Done (src/aurora/textMechanics.ts):** limited uses from the text (712 features; 97% agree with Aurora's copy on
the rest that restores them) and save DCs stated as "8 plus your X modifier and proficiency bonus" (15 features).
Attacks from the text too: natural weapons ("1d6 + your Strength modifier slashing damage", or the 2014 "slashing
damage equal to 1d4 + your Strength modifier") and a feature's own spell attack; extra damage on a hit and save
effects are not attacks, and text with several damage rolls (a choice of options) gives none. Aurora's copy of a
feature takes the attacks (and lore) of the 5e.tools copy, and the hand-made list in src/engine/effects.ts only adds
an attack for a feature with none from data. **Next:** It replaces the hand-made name list in src/engine/effects.ts with a rule that works
for all content, the macro fix this project prefers.

## 3. Foundry's level-up data (advancement)

ScaleValue advancements are used now (foundry.ts SCALES: @scale formulas, class `scales`, Wild Shape). The other
advancement types (ItemGrant, ItemChoice, Trait, AbilityScoreImprovement) mostly repeat what the 5e.tools entries give;
worth a check against our choices once the matching above is by fields.

## Checked against Plutonium, 2026-10-27 (module on file in ~/.soulforge-test/plutonium)

- **Subclass features by reference.** A subclass lists its features as references
  (`name|class|classSource|subclassShortName|subclassSource|level|source`). Plutonium reads an empty class or subclass
  source as the PHB and an empty feature source as the subclass's. A 2014 subclass copied onto a 2024 class (the
  XPHB copy of the School of Necromancy) keeps its PHB features this way. Soul Forge filtered features by the class's
  source and lost them; it now follows the references the same way (fivetools.ts, convertClass).
- **"inherit" spellcasting ability.** For additional spells, Plutonium uses the parent's ability: the ability the
  feature itself raised (the largest of its own ability score increases). Soul Forge does the same (engine.ts, after
  the walk), falling back to a class's spellcasting ability, then the best of Intelligence, Wisdom and Charisma.
- **Playtest sources.** Plutonium counts a source as prerelease (playtest) when its code starts with "UA" or "XUA" (the
  One D&D playtest), and names it "Unearthed Arcana: ...". Soul Forge names 5e.tools' playtest codes the same way, so
  they count as playtest and meet Aurora's copy (fivetools.ts, srcName).

## Equipment shop (A2.3, 2026-10-27)

- One global "Price Multiplier" (config equipmentShop.priceMultiplier, default 1); Soul Forge keeps it per character.
- Optional "Magic Item Values by Rarity" (2024 DMG p. 217): common 100 gp, uncommon 400, rare 4,000, very rare 40,000,
  legendary 200,000, artifact none; the base item's value is added and consumables cost half. Used only when the item
  has no value of its own. Soul Forge: `rarityPrices` per character.
- Spending works on a copper total; the remaining coins are rebuilt to look like the purse before (never more of the
  largest coin than it held, change capped by what the next coin up could give). Soul Forge pays smallest coins first
  and gives change in the largest coins, which keeps the same property.
- No selling. A class's starting gold can be rolled ("goldAlternative" dice) or set to a fixed amount in the config.

## Mixed proficiency choices (C1.3, 2026-10-27)

Charactermancer_OtherProficiencySelect sorts every option of a "skillToolLanguageProficiencies" choice into its kind
(skill, tool, language, weapon, armor, saving throw) by checking it against each kind's list, and summarises and
renders each kind on its own. Soul Forge does the same with a "Kind" switch on the list (src/aurora/facets.ts).

## Starting gold (A0.1, 2026-10-28)

EquipmentCurrencyManager reads a 2014 class's `startingEquipment.goldAlternative` ("{@dice 5d4 × 10|...}") and offers
the roll instead of the gear. Soul Forge now does the same: the 5e.tools converter keeps it as the class's
"starting gold", Aurora's 2014 classes take the PHB's starting wealth table, and the starting equipment offers
"Starting gold instead" with a roll button (src/aurora/startingEquipment.ts, src/aurora/goldRoll.test.ts). The 2024
classes have their gold option already (option B). Plutonium can also set a fixed starting gold in its config; not
copied (a DM can type the coins).

## Chosen spellcasting ability (A0.1, 2026-10-28)

When `additionalSpells[].ability` is `{"choose": [...]}`, Plutonium asks the player which ability to cast with.
Soul Forge's converter did so for species, feats and optional features, but not for feats split by spell list (the
2024 Magic Initiate's Cleric, Druid and Wizard versions), which always cast with Intelligence. One helper now serves
every owner (`castingAbilityChoice` in src/aurora/fivetools.ts); src/aurora/castingAbility.test.ts.

## Field sweep of the 5e.tools converter (A0.1, 2026-10-28)

Every field the 5e.tools data uses on feats, species, classes, subclasses and their features was checked against what
src/aurora/fivetools.ts and src/aurora/foundry.ts read. Not read, and why it is left:
- feats `repeatableHidden`, species `sizeEntry` and `alias`: display only.
- classes `itemMasteries`: a flag; the counts come from `itemMasteriesProgression`, which is read.
- classes and subclasses `preparedSpellsChange` ("restLong", "level"): when prepared spells may change; display only.
- classes `spellsKnownProgressionFixedAllowLowerLevel`: a Wizard's spellbook may take lower-level spells; the spell
  choices already allow every level up to the highest the class can cast.
- class and subclass features `consumes` (139): which resource a feature uses up (Plutonium links a feature's activity
  to the resource it spends). Worth doing for Play's resource tracking: **open** (A0.1 follow-up).
