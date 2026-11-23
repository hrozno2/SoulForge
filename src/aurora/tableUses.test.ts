/** "What this table uses": the one list of content switches, and how many of a list's options each stands for. */
import { describe, expect, it } from "vitest";
import { ARegistry } from "./registry";
import { parseElementsXml } from "./parse";
import { nodeXml } from "./fixture";
import { BookIndex, hiddenBy } from "./books";
import { TABLE_SWITCHES, contentFilters, switchCounts } from "./tableUses";

const reg = new ARegistry();
reg.addFile(
  parseElementsXml(
    `<elements>
    <element name="Player's Handbook (2024)" type="Source" source="Core" id="A"><setters><set name="release">20240917</set><set name="official">true</set></setters></element>
    <element name="Player's Handbook" type="Source" source="Core" id="B"><setters><set name="release">20140819</set><set name="official">true</set></setters></element>
    <element name="Unearthed Arcana: Fresh" type="Source" source="Core" id="C"><setters><set name="release">20230101</set><set name="official">true</set></setters></element>
    <element name="Eberron: Rising from the Last War" type="Source" source="Core" id="D"><setters><set name="release">20190119</set><set name="official">true</set></setters></element>
  </elements>`,
    nodeXml,
  ),
);
reg.build();
const books = new BookIndex(reg);
const info = (s: string) => books.info(s);
const item = (source: string, supports: string[] = [], type = "Race") => ({ source, type, supports });
const LIST = [
  item("Player's Handbook (2024)"),
  item("Player's Handbook (2024)"),
  item("Player's Handbook"),
  item("Unearthed Arcana: Fresh"),
  item("Eberron: Rising from the Last War"),
  item("Eberron: Rising from the Last War"),
  item("Player's Handbook (2024)", ["scifi"], "Weapon"),
  item("Player's Handbook", ["modern"], "Weapon"),
  item("Player's Handbook", [], "Language"),
];

describe("what this table uses", () => {
  it("counts what each switch alone would hide from a list", () => {
    // 2014: the 2014 species, the 2014 pistol and the two Eberron species (a 2014-rules book of another world, so
    // they count under both switches); the language belongs to no rule set and is never hidden.
    expect(switchCounts(LIST, info)).toEqual({ legacy: 4, playtest: 1, unusual: 2, scifi: 1, modern: 1 });
  });
  it("agrees with the filter itself, switch by switch", () => {
    const all = { showLegacy: true, showPlaytest: true, showUnusual: true, showSciFi: true, showModern: true };
    const counts = switchCounts(LIST, info);
    for (const s of TABLE_SWITCHES) {
      const f = contentFilters({ ...all, [s.setting]: false });
      expect(LIST.filter((e) => hiddenBy(info(e.source), e.source, f, e.type, e.supports)).length, s.label).toBe(counts[s.key]);
    }
  });
  it("names every content switch once", () => {
    expect(TABLE_SWITCHES.map((s) => s.key).sort()).toEqual(["legacy", "modern", "playtest", "scifi", "unusual"]);
    expect(new Set(TABLE_SWITCHES.map((s) => s.setting)).size).toBe(5);
  });
});
