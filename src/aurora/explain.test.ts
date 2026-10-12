import { describe, expect, it } from "vitest";
import { explainUnmet, type ReqCtx } from "./requirements";

const ctx = (stats: Record<string, number>, ids: string[] = [], level = 1): ReqCtx => ({ hasId: (i) => ids.includes(i), hasType: () => false, level, stat: (s) => stats[s] ?? 0 });

describe("explaining unmet requirements", () => {
  it("names only the failing parts", () => {
    expect(explainUnmet("[str:13],[cha:13]", ctx({ strength: 14, charisma: 10 }))).toBe("Needs Charisma 13");
    expect(explainUnmet("[str:13]||[dex:13]", ctx({ strength: 8, dexterity: 10 }))).toBe("Needs Strength 13 or Dexterity 13");
    expect(explainUnmet("[level:4]", ctx({}, [], 2))).toBe("Needs level 4");
    expect(explainUnmet("ID_WOTC_PHB_CLASS_FIGHTER", ctx({}), (id) => (id.endsWith("FIGHTER") ? "Fighter" : undefined))).toBe("Needs Fighter");
  });
  it("says nothing when the requirement is met", () => {
    expect(explainUnmet("[str:13]", ctx({ strength: 13 }))).toBeUndefined();
    expect(explainUnmet(undefined, ctx({}))).toBeUndefined();
  });
});
