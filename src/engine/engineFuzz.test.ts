/**
 * Hardening (Chris 2026-11-23: "harden the engine so it can handle all edge cases and doesn't break on anything").
 * A saved character can hold anything: a field missing or of the wrong kind, an id that no longer exists, a level of
 * 0 or a million, a negative score, a list where a number should be. Whatever a file holds, opening it, resolving it,
 * building its sheet, checking it against the rules and exporting it must not throw and must not hang. The damage is
 * repaired or reported, never fatal.
 *
 * Runs on the bundled SRD, so everywhere. ENGINE_FUZZ=<mutants> for a longer run (default 400).
 */
import { describe, expect, it } from "vitest";
import { openCharacter } from "../aurora/character";
import { resolve } from "../aurora/engine";
import { buildSheet } from "../aurora/sheet";
import { checkCharacter } from "../aurora/rulesCheck";
import { exportFoundry, exportRoll20 } from "../aurora/exportForeign";
import { randomCharacter } from "../aurora/randomCharacter";
import { planLegal } from "../aurora/makeLegal";
import { checkStartingEquipment } from "../aurora/equipmentCheck";
import { loadContentSet } from "./testContent";
import { mutate, seeded, workMs, type Json } from "./fuzzKit";

describe("the engine never breaks on a damaged character", () => {
  const reg = loadContentSet("", "srd");
  const N = Number(process.env.ENGINE_FUZZ) || 400;

  const run = (raw: Json) => {
    const { character } = openCharacter(raw, "a damaged file", (id) => reg.get(id)?.name);
    const r = resolve(character, reg);
    const sh = buildSheet(r);
    const found = checkCharacter(r, sh, []);
    planLegal(r, found);
    checkStartingEquipment(character, reg);
    exportFoundry(r);
    exportRoll20(r);
    // What comes out can be saved and opened again.
    openCharacter(JSON.parse(JSON.stringify(character)), "saved again");
    return character;
  };

  it(`opens, resolves, checks and exports ${N} damaged characters without a throw or a hang`, () => {
    const rng = seeded(20261123);
    const broke: string[] = [];
    let slowest = 0;
    for (let i = 0; i < N; i++) {
      const base = randomCharacter(reg, 1 + (i % 20), { legacy: true, playtest: false, unusual: false, scifi: false }, rng);
      // One to four changes: damage is rarely alone.
      let raw = JSON.parse(JSON.stringify(base)) as Json;
      const hits = 1 + Math.floor(rng() * 4);
      for (let h = 0; h < hits; h++) raw = mutate(raw, rng);
      const t0 = workMs();
      try {
        run(raw);
      } catch (e) {
        // A file from a newer Soul Forge is refused in words, on purpose: that is an answer, not a break.
        if (/saved by a newer Soul Forge/.test((e as Error).message)) continue;
        if (broke.length < 12)
          broke.push(`#${i}: ${(e as Error).message.slice(0, 160)} @ ${((e as Error).stack ?? "").split("\n")[1]?.trim().slice(0, 120)}`);
        else broke.push(`#${i}`);
      }
      slowest = Math.max(slowest, workMs() - t0);
    }
    expect(broke.slice(0, 12)).toEqual([]);
    // A damaged character costs no more than a few seconds (a level of a million must not be walked).
    expect(slowest).toBeLessThan(15000);
  }, 3600000);

  it("opens what is not a character at all", () => {
    for (const raw of [
      null,
      0,
      "",
      "a string",
      [],
      [1, 2, 3],
      {},
      { version: 2 },
      { classes: "Fighter" },
      { selections: [] },
      { inventory: { a: 1 } },
    ] as Json[])
      expect(() => run(raw)).not.toThrow();
  });
});
