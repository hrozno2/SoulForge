/** Dice that grow with level in data attacks (A2.5): the 2024 Monk's Martial Arts die. SOULFORGE_RULES=<folder>. */
import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { buildSheet } from "./sheet";
import { loadTestContent } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;

describe.skipIf(!C)("scale dice", () => {
  it("gives the 2024 Monk's unarmed strike its Martial Arts die by level", () => {
    const reg = loadTestContent(C!);
    const die = (level: number) => {
      const ch = newCharacter();
      ch.classes = [{ classId: "ID_WOTC_PHB24_CLASS_MONK", level }];
      const line = buildSheet(resolve(ch, reg)).attacks.find((a) => /^unarmed strike$/i.test(a.name));
      return line?.damage.match(/^\d+d\d+/)?.[0];
    };
    expect([1, 5, 11, 17].map(die)).toEqual(["1d6", "1d8", "1d10", "1d12"]);
  }, 600000);
});
