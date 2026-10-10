import { describe, expect, it } from "vitest";
import { glossaryFor, lookup, parseGlossary, seedFor, serializeGlossary } from "./glossary";

describe("term glossary", () => {
  it("reads one term per line and skips notes", () => {
    const g = parseGlossary("# my terms\nQuarterstaff = Palica\nlight crossbow ; Ľahká kuša\n\nbad line");
    expect(g["quarterstaff"]).toBe("Palica");
    expect(g["light crossbow"]).toBe("Ľahká kuša");
    expect(Object.keys(g)).toHaveLength(2);
    expect(parseGlossary(serializeGlossary(g))).toEqual(g);
  });
  it("finds whole terms, ignoring case, and keeps a leading count", () => {
    const g = glossaryFor("de", "");
    expect(lookup(g, "Quarterstaff")).toBe("Kampfstab");
    expect(lookup(g, "2 dagger")).toBe("2 Dolch");
    expect(lookup(g, "A quarterstaff is a staff")).toBeUndefined();
  });
  it("lets the player's own terms win, and has none for a language without a starter list", () => {
    expect(lookup(glossaryFor("de", "Dagger = Messer"), "Dagger")).toBe("Messer");
    expect(Object.keys(seedFor("sk"))).toHaveLength(0);
    expect(lookup(glossaryFor("sk", "Dagger = Dýka"), "Dagger")).toBe("Dýka");
  });
});
