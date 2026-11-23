/**
 * Hardening, the importers (Chris 2026-11-23). A Foundry or Roll20 file comes from somebody else's program: a module
 * that adds fields, an export cut short, a sheet edited by hand. Whatever such a file holds, importing it must end in
 * a character (with the import report saying what could not be read) or in the plain answer that it is not a
 * character file; never in a crash or a hang, and what comes out must resolve, build a sheet and pass the rules check
 * without a throw.
 *
 * Runs on the bundled SRD, so everywhere. IMPORT_FUZZ=<mutants> for a longer run (default 150; 4000 ran clean on 2026-11-24).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openCharacter } from "../aurora/character";
import { resolve } from "../aurora/engine";
import { buildSheet } from "../aurora/sheet";
import { checkCharacter } from "../aurora/rulesCheck";
import { exportFoundry, exportRoll20 } from "../aurora/exportForeign";
import { importForeignCharacter } from "../aurora/foreign";
import { randomCharacter } from "../aurora/randomCharacter";
import { mutate, seeded, type Json } from "./fuzzKit";
import { loadContentSet } from "./testContent";

describe("the importers never break on a damaged file", () => {
  const reg = loadContentSet("", "srd");
  const N = Number(process.env.IMPORT_FUZZ) || 150;
  const FILTERS = { legacy: true, playtest: false, unusual: false, scifi: false };

  const run = (raw: Json) => {
    const res = importForeignCharacter(raw, reg);
    const { character } = openCharacter(JSON.parse(JSON.stringify(res.character)), "an imported file", (id) => reg.get(id)?.name);
    const r = resolve(character, reg);
    checkCharacter(r, buildSheet(r), []);
  };

  it(`imports ${N} damaged Foundry and Roll20 files without a throw or a hang`, () => {
    const rng = seeded(20261123);
    // Files to damage: the two samples, and what Soul Forge itself exports for characters of every level.
    const bases: Json[] = ["foundry-sample.json", "roll20-sample.json"].map(
      (f) => JSON.parse(readFileSync(`fixtures/characters/${f}`, "utf8")) as Json,
    );
    for (let level = 1; level <= 20; level += 3) {
      const r = resolve(randomCharacter(reg, level, FILTERS, rng), reg);
      bases.push(JSON.parse(JSON.stringify(exportFoundry(r))) as Json, JSON.parse(JSON.stringify(exportRoll20(r))) as Json);
    }
    // Every base imports as it is: the damage is what the test adds.
    for (const b of bases) expect(() => run(b)).not.toThrow();

    const broke: string[] = [];
    let slowest = 0;
    for (let i = 0; i < N; i++) {
      let raw = bases[i % bases.length];
      const hits = 1 + Math.floor(rng() * 4);
      for (let h = 0; h < hits; h++) raw = mutate(raw, rng);
      const t0 = performance.now();
      try {
        run(raw);
      } catch (e) {
        // Damage to the marks a format is known by leaves a file that is no character file: said so, in words.
        if (/Not a recognised Foundry or Roll20 character file/.test((e as Error).message)) continue;
        if (broke.length < 12)
          broke.push(`#${i}: ${(e as Error).message.slice(0, 160)} @ ${((e as Error).stack ?? "").split("\n")[1]?.trim().slice(0, 120)}`);
        else broke.push(`#${i}`);
      }
      slowest = Math.max(slowest, performance.now() - t0);
    }
    expect(broke.slice(0, 12)).toEqual([]);
    expect(slowest).toBeLessThan(15000);
  }, 3600000);

  it("answers in words to what is no character file at all", () => {
    for (const raw of [null, 0, "", "text", [], [1, 2], {}, { name: "x" }, { system: 3 }, { attribs: "no" }] as Json[])
      expect(() => run(raw)).toThrow(/Not a recognised Foundry or Roll20 character file/);
  });
});
