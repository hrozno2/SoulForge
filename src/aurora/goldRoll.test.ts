/** 2014 classes can roll for starting gold instead of their gear (Plutonium's goldAlternative). SOULFORGE_RULES=<folder>. */
import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import { parseGoldRoll, startingPlans } from "./startingEquipment";
import { loadTestContent } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;

describe("starting gold roll", () => {
  it("reads the dice", () => {
    expect(parseGoldRoll("5d4 × 10")).toEqual({ dice: "5d4", times: 10 });
    expect(parseGoldRoll("5d4")).toEqual({ dice: "5d4", times: 1 });
    expect(parseGoldRoll("a lot")).toBeUndefined();
  });

  it.skipIf(!C)("is offered to 2014 Fighters from both providers and not to the 2024 Fighter", () => {
    const reg = loadTestContent(C!);
    const plan = (classId: string) => { const ch = newCharacter(); ch.classes = [{ classId, level: 1 }]; return startingPlans(ch, reg).find((p) => p.kind === "class"); };
    for (const id of ["ID_WOTC_PHB_CLASS_FIGHTER", "ID_5ET_CLASS_PHB_FIGHTER"]) {
      if (!reg.get(id)) continue;
      expect(plan(id)?.variants.find((v) => v.goldRoll)?.goldRoll, id).toEqual({ dice: "5d4", times: 10 });
    }
    expect(plan("ID_WOTC_PHB24_CLASS_FIGHTER")?.variants.some((v) => v.goldRoll)).toBe(false);
  }, 600000);
});
