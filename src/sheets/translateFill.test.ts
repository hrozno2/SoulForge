import { describe, expect, it } from "vitest";
import type { FillData } from "./data";
import { translateFill } from "./translateFill";

const base = {
  name: "Čeněk", className: "Wizard", species: "High Elf", background: "Sage", subclass: "Abjuration",
  backstory: "Raised in a tower.", languages: "Common, Elvish", alignment: "Neutral Good",
  traits: ["Fey Ancestry: Advantage on saving throws against being charmed."], feats: [], classFeatures: ["Arcane Recovery"],
  weapons: [{ name: "Dagger", bonus: "+6", damage: "1d4+3 piercing", notes: "finesse, light" }],
  spells: [{ level: "0", name: "Fire Bolt", school: "Evocation", time: "1 action", range: "120 feet", duration: "Instantaneous", concentration: false, ritual: false, v: true, s: true, m: false, notes: "" }],
  tools: "Calligrapher's supplies", coins: { cp: "0", sp: "0", ep: "0", gp: "25", pp: "0" }, ac: 13,
} as unknown as FillData;

describe("translating sheet values", () => {
  it("translates descriptive text and leaves names, numbers and the player's own words alone", async () => {
    const sent: string[] = [];
    const store = new Map<string, string>();
    const out = await translateFill(base, {
      target: "fr",
      translator: async (texts) => { sent.push(...texts); return texts.map((t) => `<${t}>`); },
      cache: { get: async (k) => store.get(k), put: async (k, v) => void store.set(k, v) },
    });
    expect(out.traits[0]).toMatch(/^<Fey Ancestry/);
    expect(out.classFeatures).toEqual(["<Arcane Recovery>"]);
    expect(out.weapons[0].name).toBe("<Dagger>");
    expect(out.spells[0].name).toBe("<Fire Bolt>");
    expect(out.spells[0].range).toBe("<120 feet>");
    expect(out.tools).toBe("<Calligrapher's supplies>");
    expect(out.name).toBe("Čeněk");
    expect(out.backstory).toBe("Raised in a tower.");
    expect(out.languages).toBe("Common, Elvish");
    expect(out.ac).toBe(13);
    expect(sent).not.toContain("Wizard"); // the class name is kept, as the sheet header shows it
    expect(sent).not.toContain("+6");
  });
});
