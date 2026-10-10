import { describe, expect, it } from "vitest";
import { loadRegistry } from "./fixture";
import { companionHtml } from "./companion";
import { companionFill } from "../sheets/data";

const CONTENT = process.env.AURORA_FIXTURES_2014;

describe("companion stat blocks", () => {
  it("leaves plain text alone and drops unknown ids quietly", () => {
    expect(companionHtml("<p>Keen smell.</p>", undefined)).toBe("<p>Keen smell.</p>");
    expect(companionHtml("ID_NOT_THERE", undefined)).toBe("");
  });
});

describe.skipIf(!CONTENT)("companions from real content", () => {
  it("shows the traits and actions of a black bear by name, not by id", () => {
    const reg = loadRegistry(CONTENT!);
    const bear = reg.ofType("Companion").find((e) => e.name === "Black Bear");
    expect(bear).toBeTruthy();
    const html = companionHtml(bear!.setters.traits?.value, reg) + companionHtml(bear!.setters.actions?.value, reg);
    expect(html).not.toMatch(/ID_[A-Z]/);
    expect(html).toMatch(/Keen Smell/);
    expect(html).toMatch(/Multiattack/);
    const fill = companionFill(bear!, "Bruno", reg);
    expect(fill.traits).not.toMatch(/ID_[A-Z]/);
    expect(fill.actions.length).toBeGreaterThan(0);
  });
});
