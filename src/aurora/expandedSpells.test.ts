/**
 * A subclass's expanded spell list joins its class's list (2014 Warlock patrons: "expanded" in 5e.tools'
 * additionalSpells). Unread, a 2014 Warlock could not learn its patron's spells on 5e.tools content, and a moved
 * Archfey Warlock's Sleep was "a pick its choice does not offer" (2026-11-16). The SRD's Fiend, on the bundled rules.
 */
import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { loadContentSet } from "../engine/testContent";

describe("a patron's expanded spells", () => {
  const reg = loadContentSet("", "srd");
  const warlock = reg.ofType("Class").find((c) => c.name === "Warlock" && c.source.includes("5.1"))!;
  const known = (sub?: string) => {
    const ch = { ...newCharacter(), classes: [{ classId: warlock.id, level: 5 }] };
    const slot = resolve(ch, reg).slots.find((s) => s.rule.type === "Archetype")!;
    const r = resolve(sub ? { ...ch, selections: { [slot.key]: [slot.options.find((o) => o.name === sub)!.id] } } : ch, reg);
    return new Set(r.slots.filter((s) => s.rule.type === "Spell" && /known/i.test(s.rule.name)).flatMap((s) => s.options.map((o) => o.name)));
  };
  it("are learnable with the patron, and not without it", () => {
    expect(known("The Fiend").has("Burning Hands")).toBe(true);
    expect(known("The Fiend").has("Fireball")).toBe(true);
    expect(known().has("Burning Hands")).toBe(false);
  });
});
