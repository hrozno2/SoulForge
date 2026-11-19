/**
 * W5 (E2.1): ability score increases judged by their source, from the rules and not from the sheet's own sum: a feat
 * raises scores by 1 in all (the Ability Score Improvement by 2), a level's improvement by 2, a 2024 background by 3
 * with no score by more than 2.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "./engine";
import { buildSheet } from "./sheet";
import { checkCharacter } from "./rulesCheck";
import { randomCharacter } from "./randomCharacter";
import type { AElement } from "./types";
import { loadContentSet } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;
const RULE = "Ability increases by source";

describe.skipIf(!C)("ability increases by source", () => {
  it("finds a feat that raises scores by more than a feat may", () => {
    const reg = loadContentSet(C!, "5etools");
    const feat: AElement = {
      id: "ID_TEST_FEAT_TOO_STRONG",
      name: "Too Strong",
      type: "Feat",
      source: "Test",
      supports: [],
      description: "",
      compendiumHidden: false,
      setters: {},
      rules: [{ kind: "stat", name: "strength", value: "2" }],
    };
    reg.addElements([feat]);
    reg.build();
    let seed = 5;
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const ch = randomCharacter(reg, 8, { legacy: true, playtest: false, unusual: false, scifi: false }, rng);
    const check = (c: typeof ch) => checkCharacter(resolve(c, reg), buildSheet(resolve(c, reg)), []).filter((f) => f.rule === RULE);
    expect(check(ch)).toEqual([]);
    const found = check({ ...ch, extras: [...ch.extras, feat.id] });
    expect(found.map((f) => f.detail)).toEqual(["Too Strong: +2 in all; a feat gives at most +1"]);
  }, 600000);
});
