/** W6: the build's "you already have this" note sees a skill granted under the other provider's id. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolve } from "../aurora/engine";
import { normalizeCharacter } from "../aurora/character";
import { loadTestContent } from "../engine/testContent";
import { ownership } from "./Slots";

const C = process.env.SOULFORGE_RULES;

describe.skipIf(!C)("ownership", () => {
  it("names the 5e.tools background for Aurora's Insight", () => {
    const reg = loadTestContent(C!);
    const ch = normalizeCharacter(JSON.parse(readFileSync(join(__dirname, "../aurora/fixtures/wizard-skilled-repeat.json"), "utf8")));
    const r = resolve(ch, reg);
    const wiz = r.slots.find((s) => /Skill Proficiency \(Wizard\)/.test(s.rule.name))!;
    const insight = wiz.options.find((o) => o.id === "ID_PROFICIENCY_SKILL_INSIGHT")!;
    expect(ownership(r, insight, wiz.key)).toMatch(/Ward of the Sheltering Hands/);
  }, 600000);
});
