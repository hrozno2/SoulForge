import { describe, expect, it } from "vitest";
import { combine, effectsFor, speedAfterExhaustion } from "./conditions";

describe("conditions on rolls", () => {
  it("poison hurts attacks and checks, not saves", () => {
    expect(effectsFor("attack", undefined, ["Poisoned"], 0).mode).toBe("dis");
    expect(effectsFor("check", "wisdom", ["Poisoned"], 0).mode).toBe("dis");
    expect(effectsFor("save", "wisdom", ["Poisoned"], 0).mode).toBe("none");
  });
  it("advantage and disadvantage cancel, however many there are", () => {
    expect(effectsFor("attack", undefined, ["Invisible", "Poisoned", "Prone"], 0).mode).toBe("none");
    expect(combine(3, 1)).toBe("none");
    expect(combine(0, 2)).toBe("dis");
  });
  it("restrained only matters for Dexterity saves", () => {
    expect(effectsFor("save", "dexterity", ["Restrained"], 0).mode).toBe("dis");
    expect(effectsFor("save", "strength", ["Restrained"], 0).mode).toBe("none");
  });
  it("paralysis fails Strength and Dexterity saves outright", () => {
    expect(effectsFor("save", "dexterity", ["Paralyzed"], 0).autoFail).toMatch(/Dexterity/);
    expect(effectsFor("save", "wisdom", ["Paralyzed"], 0).autoFail).toBeUndefined();
  });
  it("exhaustion takes 2 per level off d20 tests and 5 feet per level off speed", () => {
    expect(effectsFor("check", "strength", [], 3).penalty).toBe(-6);
    expect(effectsFor("damage", undefined, [], 3).penalty).toBe(0);
    expect(speedAfterExhaustion(30, 2)).toBe(20);
    expect(speedAfterExhaustion(30, 6)).toBe(0);
  });
});
