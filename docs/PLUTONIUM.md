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

Soul Forge guesses ids instead (foundry.ts targetIds), which leaves 48 entries unmatched (23 species traits, 25 generic
magic variants). **Next:** the converter keeps each element's 5e.tools identity fields, and foundry.ts and lore.ts
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

**Next:** a text pass that gives every feature without side data its uses (the phrases above) and its attack, save
and damage lines from the tags. It replaces the hand-made name list in src/engine/effects.ts with a rule that works
for all content, the macro fix this project prefers.

## 3. Foundry's level-up data (advancement)

ScaleValue advancements are used now (foundry.ts SCALES: @scale formulas, class `scales`, Wild Shape). The other
advancement types (ItemGrant, ItemChoice, Trait, AbilityScoreImprovement) mostly repeat what the 5e.tools entries give;
worth a check against our choices once the matching above is by fields.
