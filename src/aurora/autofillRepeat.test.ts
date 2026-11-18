/**
 * A repeat the auto-fill must take back is taken from the choice that has somewhere else to go. A Wizard 7 (big batch,
 * 2026-11-18) held Arcana in its Wizard skills and in Skilled; every other Wizard skill was the character's already,
 * so taking Arcana out of the Wizard's choice could only put it back. Skilled offers any skill: it gives way.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolve } from "./engine";
import { autoFill } from "./autofill";
import { normalizeCharacter } from "./character";
import { repeatedPicks } from "./rulesCheck";
import { loadTestContent } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;

describe.skipIf(!C)("the auto-fill's repeats", () => {
  it("are taken back from the choice that has another option", () => {
    const reg = loadTestContent(C!);
    const ch = normalizeCharacter(JSON.parse(readFileSync(join(__dirname, "fixtures/wizard-skilled-repeat.json"), "utf8")));
    const filled = autoFill(ch, reg);
    const r = resolve(filled, reg);
    expect(r.slots.flatMap((s) => repeatedPicks(r, s))).toEqual([]);
  }, 600000);
});
