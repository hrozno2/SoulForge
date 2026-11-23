/** The guide's marks: the recommended options of the step in hand, and nothing else. */
import { afterEach, describe, expect, it } from "vitest";
import { guideMarks, isGuideMarked, setGuideMarks } from "./guideMarks";

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
