import { describe, expect, it } from "vitest";
import { isContainer } from "./containers";
import type { AElement } from "./types";

const item = (description: string, extra: Partial<AElement> = {}): AElement => ({ id: "X", name: "X", type: "Item", source: "", supports: [], description, compendiumHidden: false, setters: {}, rules: [], ...extra });

describe("containers", () => {
  it("knows a container by what it holds, or by 5e.tools' mark", () => {
    expect(isContainer(item("A backpack can hold 1 cubic foot/ 30 pounds of gear."))).toBe(true);
    expect(isContainer(item("A Backpack holds up to 30 pounds within 1 cubic foot."))).toBe(true);
    // A liquid measure holds no gear (C7.3).
    expect(isContainer(item("A waterskin can hold up to 4 pints of liquid."))).toBe(false);
    expect(isContainer(item("A barrel can hold 40 gallons of liquid or 4 cubic feet of solid goods."))).toBe(true);
    // A quiver holds arrows, not a lantern.
    const quiver = item("", { supports: ["container-for"], setters: { holds: { value: "arrow; crossbow bolt", attrs: {} } } });
    expect(isContainer(quiver, item("", { name: "Arrows" }))).toBe(true);
    expect(isContainer(quiver, item("", { name: "Crossbow Bolt" }))).toBe(true);
    expect(isContainer(quiver, item("", { name: "Lantern, Hooded" }))).toBe(false);
    expect(isContainer(item("", { supports: ["container"] }))).toBe(true);
  });
  it("does not take a focus group (Aurora's container setter) or weight a thing bears for a container", () => {
    expect(isContainer(item("An arcane focus.", { setters: { container: { value: "Arcane Focus", attrs: {} } } }))).toBe(false);
    expect(isContainer(item("The rod can hold up to 8,000 pounds of weight."))).toBe(false);
    expect(isContainer(item("The rope can hold up to 3,000 pounds."))).toBe(false);
  });
});
