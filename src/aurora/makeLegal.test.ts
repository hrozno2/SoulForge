/**
 * "Make it legal" (Chris 2026-11-23): what has one safe answer is done; the rest is the player's call with options,
 * each of which ends with the finding gone or kept as a table ruling; the changes become a journal entry.
 */
import { describe, expect, it } from "vitest";
import { newCharacter, normalizeCharacter, uid, type Character } from "./character";
import { resolve } from "./engine";
import { buildSheet } from "./sheet";
import { checkCharacter } from "./rulesCheck";
import { applyLegal, findingKey, legalNote, planLegal, unaccept } from "./makeLegal";
import { loadContentSet } from "../engine/testContent";

const reg = loadContentSet("", "srd");
const find = (type: string, name: string, modern: boolean) =>
  reg.ofType(type).find((e) => e.name === name && /5\.2/.test(e.source) === modern && !e.compendiumHidden)!;
const check = (ch: Character) => {
  const r = resolve(ch, reg);
  const found = checkCharacter(r, buildSheet(r), []).filter((f) => !/^A required choice is not made$/.test(f.rule));
  const kept = new Set(ch.acceptedFindings ?? []);
  return { r, found: found.filter((f) => !kept.has(findingKey(f))) };
};
const rules = (ch: Character) => check(ch).found.map((f) => f.rule);

describe("make it legal", () => {
  const mixed: Character = {
    ...newCharacter(),
    abilityMethod: "manual",
    race: find("Race", "Elf", true).id,
    background: find("Background", "Acolyte", false).id,
    classes: [{ classId: find("Class", "Fighter", true).id, level: 1 }],
  };

  it("offers the 2024 rules for a 2014 background under a 2024 species, or keeping it as a ruling", () => {
    const { r, found } = check(mixed);
    expect(found.map((f) => f.rule)).toContain("Origin editions mixed");
    const plan = planLegal(r, found);
    const call = plan.calls.find((c) => c.finding.rule === "Origin editions mixed")!;
    expect(call.options.map((o) => o.label)).toEqual(["Use the 2024 rules for Acolyte", "Keep it, as a table ruling"]);
    // Nothing is chosen for the player: with no pick the character is as it was.
    expect(applyLegal(mixed, plan, {}).character).toEqual(mixed);

    const used = applyLegal(mixed, plan, { [call.key]: 0 });
    expect(rules(used.character)).not.toContain("Origin editions mixed");
    expect(used.changes).toEqual(["Acolyte now follows the 2024 rules: its ability score increases and origin feat are open on Build"]);

    const kept = applyLegal(mixed, plan, { [call.key]: 1 });
    expect(kept.character.acceptedFindings).toEqual([call.key]);
    expect(rules(kept.character)).not.toContain("Origin editions mixed");
    // Taken back, it counts again; and it survives saving and opening.
    expect(rules(unaccept(kept.character, call.key))).toContain("Origin editions mixed");
    expect(normalizeCharacter(JSON.parse(JSON.stringify(kept.character))).acceptedFindings).toEqual([call.key]);
  });

  it("asks which item to put away when more is held than two hands hold", () => {
    const weapon = (name: string) => reg.ofType("Weapon").find((w) => w.name === name && /5\.2/.test(w.source))!;
    const shield = reg.ofType("Armor").find((a) => a.name === "Shield" && /5\.2/.test(a.source))!;
    const held = [weapon("Longsword"), weapon("Shortsword"), shield].map((el) => ({
      uid: uid(),
      id: el.id,
      qty: 1,
      equipped: true,
      attuned: false,
    }));
    const ch = { ...mixed, background: find("Background", "Acolyte", true).id, inventory: held };
    const { r, found } = check(ch);
    const plan = planLegal(r, found);
    const call = plan.calls.find((c) => c.finding.rule === "More held than two hands can hold")!;
    expect(call.options.map((o) => o.label)).toEqual([
      "Put away Longsword",
      "Put away Shortsword",
      "Put away Shield",
      "Keep it, as a table ruling",
    ]);
    const after = applyLegal(ch, plan, { [call.key]: 2 });
    expect(after.character.inventory.map((i) => i.equipped)).toEqual([true, true, false]);
    expect(rules(after.character)).not.toContain("More held than two hands can hold");
  });

  it("clears leftover picks without asking, and says so", () => {
    const stray = `${find("Class", "Wizard", true).id}#leftover`;
    const ch = { ...mixed, background: find("Background", "Acolyte", true).id, selections: { [stray]: [find("Race", "Elf", true).id] } };
    const { r, found } = check(ch);
    const plan = planLegal(r, found);
    if (found.some((f) => f.rule === "Earlier choices with no place now")) {
      expect(plan.auto.length).toBe(1);
      const after = applyLegal(ch, plan, {});
      expect(after.character.selections[stray]).toBeUndefined();
      expect(after.changes[0]).toMatch(/^Cleared earlier choices that have no place now/);
    } else expect(plan.auto).toEqual([]);
  });

  it("writes the changes as a journal entry", () => {
    const note = legalNote(["Put away Shield (more was held than two hands can hold)", "Kept as a table ruling: X: y"], "2026-11-23");
    expect(note.title).toBe("Rules changes");
    expect(note.date).toBe("2026-11-23");
    expect(note.text).toBe("- Put away Shield (more was held than two hands can hold)\n- Kept as a table ruling: X: y");
  });
});
