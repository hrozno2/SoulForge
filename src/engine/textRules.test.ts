/**
 * Audit E2: one list of every rule read from prose (RULES_TIER=text-rules). Converts the 5e.tools data with the
 * readers' tally on and writes docs/audit/text-rules.md: each reader, how many elements its reading went into, and
 * how many already held the same fact from data. A reader that fires on nothing can go; one the data mostly covers
 * is a candidate for "data first".
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, it } from "vitest";
import { convertFiveTools } from "../aurora/fivetools";
import { textTally } from "../aurora/textMechanics";
import { walkDir } from "./testContent";

const C = process.env.SOULFORGE_RULES;

/** Disagreements between data and text that have been looked at (docs/audit/text-rules.md lists them). */
const DISAGREEMENTS = 0;

/** Readers of prose outside the converter's text passes, listed by hand: where each lives and what it decides. */
const ELSEWHERE: [string, string, string][] = [
  ["a spell's casting ability from a feature's text", "`src/aurora/sheet.ts`, `buildCasting`", "5e.tools `additionalSpells.ability`"],
  ["which ability a weapon may use (Hexblade, Pact of the Blade, Battle Smith)", "`src/aurora/sheet.ts`, `weaponAbilityOptions`", "none"],
  ["senses worded in a feature", "`src/aurora/sheet.ts`, `withSenses`", "5e.tools `senses`, `darkvision`"],
  ["an item's attunement", "`src/aurora/engine.ts`, `needsAttune`", "5e.tools `reqAttune`"],
  ["armor a feature rules out (Unarmored Defense)", "`src/aurora/rulesCheck.ts`, `noBodyArmor`", "none"],
  ["feats that may be taken more than once", "`src/aurora/rulesCheck.ts`, `featRepeatable`", "5e.tools `repeatable`"],
  ["a school limit on a subclass's spells", "`src/aurora/fivetools.ts`, `schoolLimit`", "none"],
  ["proficiencies worded in entries", "`src/aurora/fivetools.ts`, `textProficiencies`", "5e.tools `skillProficiencies` and its kin"],
  ["spells a feature lets the character cast", "`src/aurora/fivetools.ts`, `castableSpells`", "5e.tools `additionalSpells`"],
  [
    "skill and expertise choices worded in a feature",
    "`src/aurora/fivetools.ts`, `applyTextSkillChoices`, `applyTextExpertiseOnChoices`",
    "Foundry side data",
  ],
  [
    "starting equipment",
    "`src/aurora/startingEquipment.ts`, `equipmentText`, `parseItems`",
    "5e.tools `startingEquipment` (already the source; the text is the converter's own)",
  ],
];

it.skipIf(!C || process.env.RULES_TIER !== "text-rules")(
  "lists every rule read from prose with how often it fires",
  () => {
    const dir = join(C!, "5etools-data");
    const json: Record<string, unknown> = {};
    for (const f of walkDir(dir, ".json")) {
      const rel = relative(dir, f);
      if (!/index\.json$/.test(rel) && !rel.startsWith("bestiary")) json[rel] = JSON.parse(readFileSync(f, "utf8"));
    }
    textTally.rows.clear();
    textTally.differs.length = 0;
    textTally.on = true;
    let total = 0;
    try {
      total = convertFiveTools({ files: json as never }).length;
    } finally {
      textTally.on = false;
    }
    const differs = [...new Set(textTally.differs)].sort();
    const rows = [...textTally.rows].sort((a, b) => b[1].kept + b[1].had - (a[1].kept + a[1].had));
    const out = [
      "# Rules read from prose (audit E2)",
      "",
      `Written by \`RULES_TIER=text-rules\` (src/engine/textRules.test.ts) from the 5e.tools data: ${total} elements converted.`,
      'Each reader of a feature\'s text, how many elements its reading went into ("from the text"), and how many',
      'already held the same fact from data, 5e.tools\' own fields or its Foundry side data ("the data had it").',
      "",
      "| Reader (src/aurora/textMechanics.ts) | From the text | The data had it | Examples |",
      "| --- | ---: | ---: | --- |",
      ...rows.map(([name, r]) => `| ${name} | ${r.kept} | ${r.had} | ${r.samples.join("; ")} |`),
      "",
      "## Readers elsewhere, not counted yet",
      "",
      "| What is read | Where | The same fact as data |",
      "| --- | --- | --- |",
      ...ELSEWHERE.map((r) => `| ${r.join(" | ")} |`),
      "",
      "## Where the data and the text disagree",
      "",
      "Every reader takes the data first and the text only where the data is silent. Where both speak and say",
      "different things, the data stays and the element is listed here for a person to judge. The gate holds the",
      `count at ${DISAGREEMENTS}: a new one fails the run until it is judged (fixed at its cause, or the count raised with a reason).`,
      "",
      "| Reader | Element | The text says | The data says |",
      "| --- | --- | --- | --- |",
      ...differs.map((d) => {
        const [reader, el, text, data] = d.split(" | ");
        return `| ${reader} | ${el} | ${text.replace(/^text: /, "")} | ${data.replace(/^data: /, "")} |`;
      }),
      "",
      "Open (the rest of E2): counts for the readers elsewhere.",
      "",
    ];
    writeFileSync(join("docs", "audit", "text-rules.md"), out.join("\n"));
    expect(rows.length).toBeGreaterThan(8);
    // The gate: no disagreement between the data and the text that nobody has looked at.
    expect(differs.length, differs.slice(0, 20).join("\n")).toBeLessThanOrEqual(DISAGREEMENTS);
  },
  600000,
);
