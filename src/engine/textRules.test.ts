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
import { attunementFrom } from "../aurora/engine";
import { featRepeatFrom, unarmoredOnlyCalc } from "../aurora/rulesCheck";
import { castingAbilityInText, saysDarkvision, weaponAbilityOf } from "../aurora/sheet";
import { equipmentText } from "../aurora/startingEquipment";
import { textTally } from "../aurora/textMechanics";
import type { AElement } from "../aurora/types";
import { walkDir } from "./testContent";

const C = process.env.SOULFORGE_RULES;

/** Disagreements between data and text that have been looked at (docs/audit/text-rules.md lists them). */
const DISAGREEMENTS = 0;

type Count = { kept: number; had: number; samples: string[] };
/**
 * Readers of prose outside the converter's text passes: what each decides, where it lives, the same fact as data, and
 * how it is counted. A name is the reader's own row in the tally (it counts itself while converting); a function looks
 * at one converted element: "text" where only the text says it, "data" where the content's data does.
 */
const ELSEWHERE: [string, string, string, string | ((el: AElement) => "text" | "data" | undefined)][] = [
  [
    "a spell's casting ability from a feature's text",
    "`src/aurora/sheet.ts`, `castingAbilityInText` (`buildCasting`)",
    "5e.tools `additionalSpells.ability`, as an ability element under the giver, which is asked first",
    (el) =>
      castingAbilityInText(`${el.description ?? ""} ${el.sheet?.descriptions.map((d) => d.text).join(" ") ?? ""}`) ? "text" : undefined,
  ],
  [
    "which ability a weapon may use (Hexblade, Pact of the Blade, Battle Smith)",
    "`src/aurora/sheet.ts`, `weaponAbilityOf`",
    "none",
    (el) => (weaponAbilityOf(el).length ? "text" : undefined),
  ],
  [
    "darkvision a feature gives and its text does not state (the sheet adds the line)",
    "`src/aurora/sheet.ts`, `withSenses`",
    "5e.tools `senses`, `darkvision`: the data gives the sense, the text is only checked so the sheet says it once",
    (el) =>
      el.rules.some((x) => x.kind === "stat" && x.name === "darkvision:range") &&
      el.rules.some((x) => x.kind === "grant" && x.type === "Vision")
        ? saysDarkvision((el.description ?? "").replace(/<[^>]+>/g, " "))
          ? "data"
          : "text"
        : undefined,
  ],
  ["an item's attunement", "`src/aurora/engine.ts`, `attunementFrom`", "5e.tools `reqAttune`", attunementFrom],
  [
    "armor a feature rules out (Unarmored Defense)",
    "`src/aurora/rulesCheck.ts`, `unarmoredOnlyCalc` (`noBodyArmor`)",
    "none",
    (el) => (unarmoredOnlyCalc(el) ? "text" : undefined),
  ],
  [
    "feats that may be taken more than once",
    "`src/aurora/rulesCheck.ts`, `featRepeatFrom`",
    "5e.tools `repeatable`",
    (el) => (el.type === "Feat" ? featRepeatFrom(el) : undefined),
  ],
  ["a school limit on a subclass's spells", "`src/aurora/fivetools.ts`, `schoolLimit`", "none", "a school limit on a subclass's spells"],
  [
    "proficiencies worded in entries",
    "`src/aurora/fivetools.ts`, `textProficiencies`",
    "5e.tools `skillProficiencies` and its kin (not compared: the reader runs before the side data is in)",
    "proficiencies worded in entries",
  ],
  [
    "spells a feature lets the character cast",
    "`src/aurora/fivetools.ts`, `castableSpells`",
    "5e.tools `additionalSpells`",
    "spells a feature lets the character cast",
  ],
  [
    "skill and expertise choices worded in a feature",
    "`src/aurora/fivetools.ts`, `applyTextSkillChoices`, `applyTextExpertiseOnChoices`",
    "Foundry side data",
    "skill and expertise choices worded in a feature",
  ],
  [
    "starting equipment",
    "`src/aurora/startingEquipment.ts`, `equipmentText`, `parseItems`",
    "5e.tools `startingEquipment` (already the source; the text is the converter's own)",
    (el) => (/^(Class|Background)$/.test(el.type) && equipmentText(el.description ?? "") ? "data" : undefined),
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
    let all: AElement[] = [];
    try {
      all = convertFiveTools({ files: json as never });
    } finally {
      textTally.on = false;
    }
    const total = all.length;
    const differs = [...new Set(textTally.differs)].sort();
    const elsewhere = ELSEWHERE.map(([what, where, data, how]) => {
      let c: Count = { kept: 0, had: 0, samples: [] };
      if (typeof how === "string") c = textTally.rows.get(how) ?? c;
      else
        for (const el of all) {
          const from = how(el);
          if (from === "data") c.had++;
          else if (from === "text") {
            c.kept++;
            if (c.samples.length < 4) c.samples.push(`${el.name} (${el.type})`);
          }
        }
      return { what, where, data, c };
    });
    const own = new Set(ELSEWHERE.map((r) => r[3]).filter((x) => typeof x === "string"));
    const rows = [...textTally.rows].filter(([name]) => !own.has(name)).sort((a, b) => b[1].kept + b[1].had - (a[1].kept + a[1].had));
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
      "## Readers elsewhere",
      "",
      "Counted over the same converted elements, each by the function the app itself asks.",
      "",
      "| What is read | Where | From the text | The data had it | The same fact as data | Examples |",
      "| --- | --- | ---: | ---: | --- | --- |",
      ...elsewhere.map((r) => `| ${r.what} | ${r.where} | ${r.c.kept} | ${r.c.had} | ${r.data} | ${r.c.samples.join("; ")} |`),
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
    ];
    writeFileSync(join("docs", "audit", "text-rules.md"), out.join("\n"));
    expect(rows.length).toBeGreaterThan(8);
    // Every reader elsewhere is counted; one that fires on nothing is named, so it can go or be looked at.
    const silent = elsewhere.filter((r) => r.c.kept + r.c.had === 0).map((r) => r.what);
    expect(silent, "readers that fire on nothing").toEqual([]);
    // The gate: no disagreement between the data and the text that nobody has looked at.
    expect(differs.length, differs.slice(0, 20).join("\n")).toBeLessThanOrEqual(DISAGREEMENTS);
  },
  600000,
);
