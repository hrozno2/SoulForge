/**
 * W5 (audit R14's last open row): the Psi Warrior's and Soulknife's Psionic Energy dice. Tasha's gives "a number of
 * these dice equal to twice your proficiency bonus", all back on a long rest; the 2024 Player's Handbook a table by
 * class level inside the feature, one die back on a short rest and all on a long one. Before, the 2014 feature showed
 * no count, the 2024 one "1/Short Rest", and the 2024 Soulknife's pool sat on Psi-Bolstered Knack.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkCharacter, type RefClass } from "./rulesCheck";
import { recoveryFromText, tableUsesFromHtml, usesFromText } from "./textMechanics";
import { resolve } from "./engine";
import { buildSheet } from "./sheet";
import { autoFill } from "./autofill";
import { newCharacter } from "./character";
import { loadContentSet } from "../engine/testContent";

const TCE =
  "This energy is represented by your Psionic Energy dice, which are each a d6. You have a number of these dice equal to twice your proficiency bonus, and they fuel various psionic powers. You regain all your expended Psionic Energy dice when you finish a long rest. In addition, as a bonus action, you can regain one expended Psionic Energy die, but you can't do so again until you finish a short or long rest.";
const XPHB =
  "You regain one of your expended Psionic Energy Dice when you finish a Short Rest, and you regain all of them when you finish a Long Rest.";
const TABLE =
  "<p>The table shows the number.</p><table><caption>Soulknife Energy Dice</caption><thead><tr><th>Rogue Level</th><th>Die Size</th><th>Number</th></tr></thead><tbody><tr><td>3</td><td>D6</td><td>4</td></tr><tr><td>5</td><td>D8</td><td>6</td></tr><tr><td>9</td><td>D8</td><td>8</td></tr><tr><td>11</td><td>D10</td><td>8</td></tr><tr><td>13</td><td>D10</td><td>10</td></tr><tr><td>17</td><td>D12</td><td>12</td></tr></tbody></table>";

describe("a pool of dice in a feature's text", () => {
  it("is sized by twice the proficiency bonus", () => {
    expect(usesFromText(TCE)).toBe("{proficiency} * 2");
  });
  it("comes back on a long rest when the text says all dice do, whatever a bonus action returns", () => {
    expect(recoveryFromText(TCE)).toBe("Long Rest");
    expect(recoveryFromText(XPHB)).toBe("Long Rest (one on a Short Rest)");
  });
  it("is sized by the feature's own table of numbers by level", () => {
    expect(tableUsesFromHtml(TABLE)).toEqual([
      [3, 4],
      [5, 6],
      [9, 8],
      [13, 10],
      [17, 12],
    ]);
    expect(
      tableUsesFromHtml("<table><thead><tr><th>d6</th><th>Effect</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>"),
    ).toBe(undefined);
  });
});

const C = process.env.SOULFORGE_RULES;
describe.skipIf(!C)("Psionic Energy dice on the sheet", () => {
  it("are twice the proficiency bonus (Tasha's) or the table's number (2024), on Psionic Power alone", () => {
    const reg = loadContentSet(C!, "5etools");
    const ref: RefClass[] = JSON.parse(readFileSync(join(C!, "rules-ref.json"), "utf8"));
    const seen: string[] = [];
    for (const sub of reg.ofType("Archetype").filter((a) => /^(Psi Warrior|Soulknife)$/.test(a.name) && a.id.startsWith("ID_5ET_"))) {
      const cls = reg
        .ofType("Class")
        .find(
          (c) =>
            !c.compendiumHidden &&
            /2024/.test(c.source) === /2024/.test(sub.source) &&
            c.rules.some(
              (r) => r.kind === "select" && r.type === "Archetype" && reg.find("Archetype", r.supports).some((o) => o.id === sub.id),
            ),
        );
      if (!cls) continue;
      for (const [lv, want] of [
        [3, 4],
        [5, 6],
        [9, 8],
        [13, 10],
        [17, 12],
      ]) {
        let ch = { ...newCharacter(), classes: [{ classId: cls.id, level: lv }] };
        const slot = resolve(ch, reg).slots.find((s) => s.rule.type === "Archetype")!;
        ch = autoFill({ ...ch, selections: { ...ch.selections, [slot.key]: [sub.id] } }, reg);
        const sh = buildSheet(resolve(ch, reg));
        const usage = (n: string) => sh.features.find((f) => f.name === n)?.usage ?? null;
        const modern = /2024/.test(sub.source);
        expect(usage("Psionic Power"), `${sub.name} (${sub.source}) ${lv}`).toBe(
          `${want}/Long Rest${modern ? " (one on a Short Rest)" : ""}`,
        );
        if (sub.name === "Soulknife") expect(usage("Psi-Bolstered Knack"), `${sub.source} ${lv}`).toBe(null);
        // The rules check works the number out itself and agrees.
        expect(checkCharacter(resolve(ch, reg), sh, ref).filter((f) => f.rule === "Feature uses by level")).toEqual([]);
        seen.push(`${sub.name} ${sub.source}`);
      }
    }
    expect(new Set(seen).size).toBe(4);
  }, 600000);

  // Found by the Aurora-free full check of 2026-11-24 (seed 214019780, character 8232): a 2024 Rogue 6 (Soulknife) with
  // four levels of a 2014 Fighter (Tasha's Psi Warrior) showed 8 dice on both features. The two features share a name,
  // so they shared one count, and the higher (twice the proficiency bonus of a level-10 character) stood for both.
  it("are counted for each feature on its own when two classes give a feature of that name", () => {
    const reg = loadContentSet(C!, "5etools");
    const ref: RefClass[] = JSON.parse(readFileSync(join(C!, "rules-ref.json"), "utf8"));
    let ch = {
      ...newCharacter(),
      classes: [
        { classId: "ID_5ET_CLASS_XPHB_ROGUE", level: 6 },
        { classId: "ID_5ET_CLASS_PHB_FIGHTER", level: 4 },
      ],
    };
    for (const [cls, sub] of [
      ["ID_5ET_CLASS_XPHB_ROGUE", "ID_5ET_SUBCLASS_XPHB_ROGUE_SOULKNIFE"],
      ["ID_5ET_CLASS_PHB_FIGHTER", "ID_5ET_SUBCLASS_TCE_FIGHTER_PSI_WARRIOR_FOR_PHB"],
    ]) {
      const slot = resolve(ch, reg).slots.find((s) => s.rule.type === "Archetype" && s.key.startsWith(`${cls}#`))!;
      ch = { ...ch, selections: { ...ch.selections, [slot.key]: [sub] } };
    }
    ch = autoFill(ch, reg);
    const sh = buildSheet(resolve(ch, reg));
    expect(
      sh.features
        .filter((f) => f.name === "Psionic Power")
        .map((f) => f.usage)
        .sort(),
    ).toEqual(["6/Long Rest (one on a Short Rest)", "8/Long Rest"]);
    expect(checkCharacter(resolve(ch, reg), sh, ref).filter((f) => f.rule === "Feature uses by level")).toEqual([]);
  }, 600000);
});
