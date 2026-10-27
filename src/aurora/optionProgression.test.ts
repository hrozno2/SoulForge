/** 5e.tools option progressions on feats, subclasses and options: SOULFORGE_RULES=<test content folder>. */
import { describe, expect, it } from "vitest";
import { loadTestContent } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;

describe.skipIf(!C)("option progressions", () => {
  it("gives Martial Adept two maneuvers and Metamagic Adept two options to choose", () => {
    const reg = loadTestContent(C!);
    for (const [id, n] of [["ID_5ET_FEAT_PHB_MARTIAL_ADEPT", 2], ["ID_5ET_FEAT_TCE_METAMAGIC_ADEPT", 2], ["ID_5ET_FEAT_TCE_FIGHTING_INITIATE", 1]] as const) {
      const sel = reg.get(id)?.rules.find((r) => r.kind === "select" && r.type === "Optional Feature");
      expect(sel && sel.kind === "select" ? sel.number : 0, id).toBe(n);
      expect(sel && sel.kind === "select" ? reg.find("Optional Feature", sel.supports).length : 0, id).toBeGreaterThan(3);
    }
  }, 600000);
});
