/** Every proficiency has a kind for the mixed-choice switch (C1.3). SOULFORGE_RULES=<test content folder>. */
import { describe, expect, it } from "vitest";
import { proficiencyKind } from "./facets";
import { loadTestContent } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;

describe.skipIf(!C)("proficiency kinds", () => {
  it("sorts every proficiency into a kind", () => {
    const reg = loadTestContent(C!);
    const all = reg.ofType("Proficiency");
    const other = all.filter((e) => proficiencyKind(e) === "Other").map((e) => `${e.id} ${e.name}`);
    console.log(`PROFKIND ${all.length} proficiencies, ${other.length} other: ${other.slice(0, 40).join(" | ")}`);
    expect(proficiencyKind(reg.get("ID_PROFICIENCY_SKILL_ATHLETICS")!)).toBe("Skills");
    expect(other.length / all.length).toBeLessThan(0.02);
  }, 600000);
});
