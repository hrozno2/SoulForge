import { expect, it } from "vitest";
import { spellRolls } from "./RollChips";
const rolls = (html: string, level: number, castLevel: number, characterLevel = 11) => spellRolls("X", html, {} as never, 5, { level, castLevel, characterLevel }).map((r) => r.expr);

it("a 2024 cantrip's dice rise with the character, as a 2014 one's do", () => {
  expect(rolls("<p>The target takes 1d10 Fire damage.</p><p>The damage increases by 1d10 when you reach levels 5 (2d10), 11 (3d10), and 17 (4d10).</p>", 0, 0)).toEqual(["3d10"]);
  expect(rolls("<p>The target takes 1d10 fire damage.</p><p>This spell's damage increases by 1d10 when you reach 5th level (2d10), 11th level (3d10), and 17th level (4d10).</p>", 0, 0)).toEqual(["3d10"]);
});
it("healing rises with the slot", () => {
  expect(rolls("<p>A creature you touch regains a number of Hit Points equal to 2d8 plus your spellcasting ability modifier.</p><p>The healing increases by 2d8 for each spell slot level above 1.</p>", 1, 2)).toEqual(["4d8"]);
  expect(rolls("<p>A creature you touch regains a number of hit points equal to 1d8 + your spellcasting ability modifier.</p><p>When you cast this spell using a spell slot of 2nd level or higher, the healing increases by 1d8 for each slot level above 1st.</p>", 1, 3)).toEqual(["3d8"]);
});
