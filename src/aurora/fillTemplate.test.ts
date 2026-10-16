import { describe, expect, it } from "vitest";
import { fillTemplate } from "./sheet";
import type { Resolved } from "./engine";

const withStats = (v: Record<string, number>) => ({ stats: { text: () => undefined, get: (n: string) => v[n] ?? 0 } }) as unknown as Resolved;

describe("fillTemplate", () => {
  it("gives one sign where the text already has a plus (Divine Spark: 1d8+{{wisdom:modifier}})", () => {
    expect(fillTemplate("restore 1d8+{{wisdom:modifier}} HP", withStats({ "wisdom:modifier": 4 }))).toBe("restore 1d8+4 HP");
    expect(fillTemplate("1d8+{{wisdom:modifier}}", withStats({ "wisdom:modifier": -1 }))).toBe("1d8-1");
    expect(fillTemplate("1d8-{{wisdom:modifier}}", withStats({ "wisdom:modifier": -1 }))).toBe("1d8+1");
  });
  it("leaves plain numbers and standalone modifiers as they were", () => {
    expect(fillTemplate("DC {{cleric:spellcasting:dc}}", withStats({ "cleric:spellcasting:dc": 15 }))).toBe("DC 15");
    expect(fillTemplate("bonus {{wisdom:modifier}}", withStats({ "wisdom:modifier": 3 }))).toBe("bonus +3");
  });
});
