/** A sense is listed once, at its longest range, however many features give it. */
import { describe, expect, it } from "vitest";
import { senseLines } from "./senses";

const none = () => 0;

describe("the senses on the sheet", () => {
  it("lists blindsight once when two features give it (Feral Senses and Blind Fighting)", () => {
    expect(senseLines([{ name: "Blindsight" }, { name: "Blindsight" }], (s) => (s === "blindsight" ? 30 : 0))).toEqual([
      "Blindsight 30 ft",
    ]);
  });
  it("takes the longest range the names state when there is no statistic", () => {
    expect(senseLines([{ name: "Blindsight (10 ft.)" }, { name: "Blindsight (30 ft.)" }, { name: "Darkvision (60 feet)" }], none)).toEqual([
      "Blindsight 30 ft",
      "Darkvision 60 ft",
    ]);
  });
  it("keeps different senses apart, in the order met, and other entries by name, once", () => {
    expect(
      senseLines(
        [{ name: "Darkvision" }, { name: "Keen Sight" }, { name: "Tremorsense" }, { name: "Keen Sight" }, { name: "Darkvision" }],
        (s) => (s === "darkvision" ? 120 : s === "tremorsense" ? 10 : 0),
      ),
    ).toEqual(["Darkvision 120 ft", "Keen Sight", "Tremorsense 10 ft"]);
  });
  it("names a sense with no range anywhere as its source does", () => {
    expect(senseLines([{ name: "Truesight" }], none)).toEqual(["Truesight"]);
  });
});
