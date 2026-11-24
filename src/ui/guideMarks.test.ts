/** The guide's marks: the recommended options of the step in hand, and nothing else. */
import { afterEach, describe, expect, it } from "vitest";
import { guideMarks, guideScoped, isGuideMarked, setGuideMarks } from "./guideMarks";

afterEach(() => setGuideMarks(null));

describe("the guide's marks in the lists", () => {
  it("marks the recommended options of one kind only", () => {
    setGuideMarks({ type: "Class", names: ["Fighter", "Barbarian"] });
    const m = guideMarks();
    expect(isGuideMarked(m, { type: "Class", name: "Fighter" })).toBe(true);
    expect(isGuideMarked(m, { type: "Class", name: "Wizard" })).toBe(false);
    // A background that shares a name with a class is not marked by the class step.
    expect(isGuideMarked(m, { type: "Background", name: "Fighter" })).toBe(false);
  });
  it("marks nothing when the guide is closed", () => {
    setGuideMarks({ type: "Race", names: ["Human"] });
    setGuideMarks(null);
    expect(isGuideMarked(guideMarks(), { type: "Race", name: "Human" })).toBe(false);
  });
});

describe("the guide's lists", () => {
  const el = (id: string, type: string, source: string) => ({ id, type, source });
  const classes = [
    el("f24", "Class", "SRD 5.2.1 (2024)"),
    el("f14", "Class", "SRD 5.1 (2014)"),
    el("art", "Class", "Eberron: Forge of the Artificer"),
  ];
  it("show the free 2024 rules only, and what is already picked", () => {
    expect(guideScoped(classes, new Set()).map((e) => e.id)).toEqual(["f24"]);
    expect(guideScoped(classes, new Set(["art"])).map((e) => e.id)).toEqual(["f24", "art"]);
  });
  it("leave a list whole when it has nothing from those rules, or is not classes, species or backgrounds", () => {
    const other = [el("a", "Race", "Some Book"), el("b", "Race", "SRD 5.1 (2014)")];
    expect(guideScoped(other, new Set())).toBe(other);
    const spells = [el("s", "Spell", "SRD 5.2.1 (2024)"), el("t", "Spell", "SRD 5.1 (2014)")];
    expect(guideScoped(spells, new Set())).toBe(spells);
  });
});
