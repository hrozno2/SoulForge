import { it, expect } from "vitest";
import { shortTime, shortRange } from "./data";
it("shortens casting times and ranges for the sheet boxes", () => {
  expect(shortTime("Bonus Action, which you take immediately after hitting a target with a Melee weapon or an Unarmed Strike")).toBe("1BA");
  expect(shortTime("Action or Ritual")).toBe("1A/R");
  expect(shortTime("1 action")).toBe("1A");
  expect(shortTime("Reaction, which you take when you are hit")).toBe("1R");
  expect(shortTime("10 minutes")).toBe("10m");
  expect(shortRange("Self (15-foot Cone)")).toBe("15ft cone");
  expect(shortRange("Self (30-foot radius)")).toBe("30ft rad");
  expect(shortRange("Self (60-foot line)")).toBe("60ft line");
  expect(shortRange("120 feet")).toBe("120 ft");
  expect(shortRange("Self")).toBe("Self");
});
