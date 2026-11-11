/**
 * Random characters on the bundled SRD rules, built and judged by the rules check, with no test cache: this runs in
 * CI and on every `npm test` (docs/AUDIT-2026-11-10.md, H4: until now CI ran none of the content checks). A fixed
 * seed, so a failure names a character that can be built again; and one fresh seed, printed when it fails.
 */
import { describe, expect, it } from "vitest";
import { loadContentSet, type ContentSet } from "../engine/testContent";
import { resolve, stillToChoose } from "./engine";
import { exportFoundry, exportRoll20 } from "./exportForeign";
import { importForeignCharacter } from "./foreign";
import { randomCharacter } from "./randomCharacter";
import { checkCharacter } from "./rulesCheck";
import { buildSheet } from "./sheet";

const filters = { legacy: true, playtest: false, unusual: true, scifi: false, modern: false };

function batch(set: ContentSet, count: number, start: number): string[] {
  const reg = loadContentSet("", set);
  let seed = start;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const findings: string[] = [];
  for (let i = 0; i < count; i++) {
    const level = 1 + (i % 20);
    const ch = randomCharacter(reg, level, filters, rng);
    const who = `${set} #${i} (seed ${start}, level ${level}, ${ch.classes.map((c) => reg.get(c.classId)?.name).join("/")})`;
    try {
      const r = resolve(ch, reg);
      const sheet = buildSheet(r);
      for (const s of r.slots.filter((x) => stillToChoose(x, r))) findings.push(`${who}: left open: ${s.rule.name}`);
      // Without the class reference (it is downloaded, not bundled) the check still judges everything written out in
      // it: hit points, armor class, attacks, damage, skills, saves, hands, choices and their requirements.
      for (const f of checkCharacter(r, sheet, [])) if (f.rule !== "Class not in the rules reference") findings.push(`${who}: ${f.rule}: ${f.detail}`);
      // Both exports are made and the Foundry one reads back as a character.
      exportRoll20(r);
      const back = importForeignCharacter(exportFoundry(r), reg);
      if (back.character.classes.reduce((n, c) => n + c.level, 0) !== level) findings.push(`${who}: the Foundry export read back at another level`);
    } catch (e) {
      findings.push(`${who}: threw ${(e as Error).message}`);
    }
  }
  return findings;
}

describe("random characters on the bundled SRD rules", () => {
  it.each(["srd-5.1", "srd-5.2", "srd"] as const)("%s: 80 characters, a fixed seed, nothing found", (set) => {
    expect(batch(set, 80, 20261111).slice(0, 12)).toEqual([]);
  }, 300_000);

  it("a fresh seed", () => {
    const seed = (Date.now() % 2147483646) + 1;
    expect(batch("srd", 60, seed).slice(0, 12)).toEqual([]);
  }, 300_000);
});
