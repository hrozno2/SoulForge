/**
 * Tasha's optional expanded spell lists for the 2014 classes (fivetools.ts tceExpandedLists): off until the optional
 * class feature is taken, then its spells join the class's list. Needs SOULFORGE_RULES.
 */
import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { loadContentSet } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;
describe.skipIf(!C)("Tasha's Additional Ranger Spells on 5e.tools content", () => {
  it("adds Entangle and Searing Smite to a 2014 Ranger's choices once taken", () => {
    const reg = loadContentSet(C!, "5etools");
    const ch = { ...newCharacter(), classes: [{ classId: "ID_5ET_CLASS_PHB_RANGER", level: 9 }] };
    const offered = (c: typeof ch) =>
      resolve(c, reg)
        .slots.filter((s) => s.rule.type === "Spell")
        .flatMap((s) => s.options.map((o) => o.name));
    const opt = resolve(ch, reg).slots.find((s) => /Additional Ranger Spells/.test(s.rule.name))!;
    expect(opt).toBeDefined();
    expect(offered(ch)).not.toContain("Entangle");
    const taken = { ...ch, selections: { [opt.key]: [opt.options[0].id] } };
    expect(offered(taken)).toEqual(expect.arrayContaining(["Entangle", "Searing Smite"]));
  }, 600000);
});
