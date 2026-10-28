/** Where an always-prepared spell comes from (C6.5): the feature, or what a "… Spells" feature belongs to. */
import { describe, expect, it } from "vitest";
import { grantSource } from "./sheet";
import type { Resolved } from "./engine";

const els: Record<string, { id: string; name: string }> = {
  F: { id: "F", name: "Magic Initiate" },
  D: { id: "D", name: "Domain Spells" },
  L: { id: "L", name: "Life Domain" },
};
const r = { reg: { get: (id: string) => els[id] }, active: [{ el: els.D, from: "L" }] } as unknown as Resolved;

describe("grantSource", () => {
  it("names the feature that grants the spell", () => expect(grantSource(r, { from: "F" })).toBe("Magic Initiate"));
  it("names the subclass for a feature called only for its spells", () => expect(grantSource(r, { from: "D" })).toBe("Life Domain"));
  it("says nothing without a source", () => expect(grantSource(r, {})).toBeUndefined());
});
