import { describe, expect, it } from "vitest";
import { nodeXml } from "./fixture";
import { parseElementsXml } from "./parse";
import { ARegistry } from "./registry";
import { BookIndex, formatRelease, groupVariants, popularity, sortGroups } from "./books";
import { applyFacets, facetCounts, facetsFor } from "./facets";

const XML = `<elements>
  <element name="Old Book" type="Source" source="Core" id="S1"><setters><set name="release">20160815</set><set name="official">true</set><set name="abbreviation">OB</set></setters></element>
  <element name="New Book" type="Source" source="Core" id="S2"><setters><set name="release">20220517</set><set name="official">true</set><set name="abbreviation">NB</set></setters></element>
  <element name="Unearthed Arcana: Fresh" type="Source" source="Core" id="S3"><setters><set name="release">20230101</set><set name="official">true</set><set name="abbreviation">UA</set></setters></element>
  <element name="Aasimar" type="Race" source="Old Book" id="R1"/>
  <element name="Aasimar" type="Race" source="New Book" id="R2"/>
  <element name="Aasimar" type="Race" source="Unearthed Arcana: Fresh" id="R3"/>
  <element name="Aasimar" type="Race" source="New Book" id="R2b"/>
  <element name="Human" type="Race" source="Old Book" id="R4"/>
  <element name="Zzz" type="Race" source="New Book" id="R5"/>
  <element name="Fire Bolt" type="Spell" source="Old Book" id="P1"><supports>Wizard</supports><setters><set name="level">0</set><set name="school">Evocation</set><set name="time">1 action</set><set name="range">120 feet</set><set name="hasVerbalComponent">true</set><set name="hasSomaticComponent">true</set></setters></element>
  <element name="Fireball" type="Spell" source="Old Book" id="P2"><supports>Wizard</supports><setters><set name="level">3</set><set name="school">Evocation</set><set name="time">1 action</set><set name="range">150 feet</set><set name="isConcentration">true</set></setters></element>
  <element name="Shield" type="Spell" source="New Book" id="P3"><supports>Wizard, Sorcerer</supports><setters><set name="level">1</set><set name="school">Abjuration</set><set name="time">1 reaction</set><set name="range">Self</set><set name="isRitual">true</set></setters></element>
</elements>`;

function setup() {
  const reg = new ARegistry();
  reg.addFile(parseElementsXml(XML, nodeXml));
  reg.build();
  return { reg, books: new BookIndex(reg) };
}

describe("books and versions", () => {
  it("reads release dates and flags playtest material", () => {
    const { books } = setup();
    expect(books.info("Old Book")).toMatchObject({ release: 20160815, official: true, abbr: "OB" });
    expect(books.info("Unearthed Arcana: Fresh").playtest).toBe(true);
    expect(books.info("Nowhere").release).toBeUndefined();
    expect(formatRelease(20220517)).toBe("May 2022");
  });

  it("groups the same name into one entry, newest first, one copy per book", () => {
    const { reg, books } = setup();
    const groups = groupVariants(reg.ofType("Race"), books);
    const a = groups.find((g) => g.name === "Aasimar")!;
    expect(a.variants.map((v) => v.el.source)).toEqual(["Unearthed Arcana: Fresh", "New Book", "Old Book"]);
    expect(a.best.el.id).toBe("R2"); // newest official, not the playtest
    expect(a.newest.el.id).toBe("R2");
    expect(groups).toHaveLength(3);
  });

  it("sorts alphabetically, by newest, and by recommendation", () => {
    const { reg, books } = setup();
    const groups = groupVariants(reg.ofType("Race"), books);
    expect(sortGroups(groups, "az").map((g) => g.name)).toEqual(["Aasimar", "Human", "Zzz"]);
    expect(sortGroups(groups, "newest").map((g) => g.name)[0]).toBe("Aasimar");
    // Human is on the popularity list, so it leads the recommended order
    expect(sortGroups(groups, "recommended").map((g) => g.name)[0]).toBe("Human");
    expect(popularity("Race", "Human")).toBeLessThan(popularity("Race", "Zzz"));
  });
});

describe("filters", () => {
  it("filters spells by level, class, components, concentration and ritual", () => {
    const { reg, books } = setup();
    const spells = reg.ofType("Spell");
    const defs = facetsFor("Spell");
    const pick = (id: string, v: string) => applyFacets(spells, defs, { [id]: new Set([v]) }, books).map((s) => s.name).sort();
    expect(pick("level", "C")).toEqual(["Fire Bolt"]);
    expect(pick("level", "3")).toEqual(["Fireball"]);
    expect(pick("class", "Sorcerer")).toEqual(["Shield"]);
    expect(pick("components", "V")).toEqual(["Fire Bolt"]);
    expect(pick("concentration", "Yes")).toEqual(["Fireball"]);
    expect(pick("ritual", "Yes")).toEqual(["Shield"]);
    expect(pick("time", "Reaction")).toEqual(["Shield"]);
    expect(pick("range", "Self")).toEqual(["Shield"]);
    expect(pick("source", "Old Book")).toEqual(["Fire Bolt", "Fireball"]);
  });

  it("combines groups with AND and values within a group with OR", () => {
    const { reg, books } = setup();
    const spells = reg.ofType("Spell");
    const defs = facetsFor("Spell");
    expect(applyFacets(spells, defs, { level: new Set(["C", "3"]) }, books)).toHaveLength(2);
    expect(applyFacets(spells, defs, { level: new Set(["C", "3"]), concentration: new Set(["Yes"]) }, books).map((s) => s.name)).toEqual(["Fireball"]);
  });

  it("counts values for the filter bar, cantrips first", () => {
    const { reg, books } = setup();
    const level = facetsFor("Spell").find((d) => d.id === "level")!;
    expect(facetCounts(reg.ofType("Spell"), level, books).map(([v]) => v)).toEqual(["C", "1", "3"]);
  });
});
