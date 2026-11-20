/**
 * Audit E3: a contribution to a statistic knows which element it came from, by id as well as by name, so "why is this
 * 17?" can link to the element, and reports do not break when a feature is renamed.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "./engine";
import { newCharacter } from "./character";
import { loadContentSet } from "../engine/testContent";

describe("where a statistic's parts come from", () => {
  it("each part carries its element's id beside its name; a custom bonus has none", () => {
    const reg = loadContentSet("", "srd-5.1");
    const dwarf = reg.ofType("Race").find((r) => r.name === "Dwarf")!;
    const ch = { ...newCharacter(), race: dwarf.id, customStats: [{ id: "x", stat: "constitution", value: 1, note: "A gift" }] };
    const parts = resolve(ch, reg).stats.parts("constitution");
    const fromDwarf = parts.find((p) => p.from === "Dwarf")!;
    expect(fromDwarf.fromId).toBe(dwarf.id);
    expect(reg.get(fromDwarf.fromId!)?.name).toBe("Dwarf");
    expect(parts.find((p) => p.from === "A gift")).toEqual({ from: "A gift", value: 1 });
  });
});
