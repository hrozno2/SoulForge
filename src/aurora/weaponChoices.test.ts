/** Starting gear's "any simple weapon" offers mundane weapons only (Chris 2026-10-29). SOULFORGE_RULES=<folder>. */
import { describe, expect, it } from "vitest";
import { loadTestContent } from "../engine/testContent";
import { weaponChoices } from "./startingEquipment";

describe.skipIf(!process.env.SOULFORGE_RULES)("weapon choices", () => {
  it("leaves out magic weapons (+1 to +3, named ones such as a Staff of Adornment)", () => {
    const reg = loadTestContent(process.env.SOULFORGE_RULES!);
    for (const category of ["simple", "martial"] as const) {
      const list = weaponChoices(reg, { category });
      expect(list.length).toBeGreaterThan(8);
      expect(list.filter((w) => /\+\d/.test(w.name) || /^(staff|sword|dagger|mace|axe|bow) of /i.test(w.name) || (w.setters.rarity?.value ?? "").trim()).map((w) => w.name)).toEqual([]);
    }
  }, 600000);
});
