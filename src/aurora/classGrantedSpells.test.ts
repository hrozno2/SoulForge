/**
 * A cantrip a class's own feature gives belongs on that class's casting line. The Artificer's Tinker's Magic
 * (Eberron: Forge of the Artificer: "You know the Mending cantrip") showed on a line of its own named "Tinker's
 * Magic", beside the Artificer's, with the same ability, DC and attack bonus. A line of its own is for spells from
 * outside the class (a species trait's, a feat's), or cast with another ability.
 */
import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { ARegistry } from "./registry";
import { buildSheet } from "./sheet";
import type { AElement } from "./types";

const el = (id: string, name: string, type: string, extra: Partial<AElement> = {}): AElement => ({
  id,
  name,
  type,
  source: "Test",
  supports: [],
  description: "",
  compendiumHidden: false,
  setters: {},
  rules: [],
  ...extra,
});
const cantrip = (id: string, name: string) => el(id, name, "Spell", { supports: ["Other"], setters: { level: { value: "0", attrs: {} } } });

function lines(tinkerText = "You know the Mending cantrip.", race?: string) {
  const reg = new ARegistry();
  reg.addElements([
    el("ART", "Artificer", "Class", {
      spellcasting: { name: "Artificer", ability: "Intelligence", list: ["Artificer"], extendLists: [] },
      setters: { hd: { value: "d8", attrs: {} } },
      rules: [{ kind: "grant", type: "Class Feature", id: "TINKER", level: 1 }],
    }),
    el("TINKER", "Tinker's Magic", "Class Feature", {
      description: `<p>${tinkerText}</p>`,
      rules: [{ kind: "grant", type: "Spell", id: "MENDING" }],
    }),
    el("AASIMAR", "Aasimar", "Race", { rules: [{ kind: "grant", type: "Racial Trait", id: "BEARER" }] }),
    el("BEARER", "Light Bearer", "Racial Trait", {
      description: "<p>You know the Light cantrip. Charisma is your spellcasting ability for it.</p>",
      rules: [{ kind: "grant", type: "Spell", id: "LIGHT" }],
    }),
    el("TIEFLING", "Tiefling", "Race", { rules: [{ kind: "grant", type: "Racial Trait", id: "LEGACY" }] }),
    el("LEGACY", "Fiendish Legacy", "Racial Trait", { rules: [{ kind: "grant", type: "Racial Trait", id: "LEGACY_WIS" }] }),
    // The ability the player chose for the legacy's spells, as the content models it: an element named for it.
    el("LEGACY_WIS", "Wisdom", "Racial Trait", {
      description: "<p>Wisdom is your spellcasting ability for these spells.</p>",
      rules: [{ kind: "grant", type: "Spell", id: "CHILL" }],
    }),
    // On the class's own list too: being on the list does not make a species' spell the class's.
    el("CHILL", "Chill Touch", "Spell", { supports: ["Artificer"], setters: { level: { value: "0", attrs: {} } } }),
    el("PLANAR", "Planar", "Race", { rules: [{ kind: "grant", type: "Racial Trait", id: "SCION" }] }),
    el("SCION", "Scion", "Racial Trait", {
      description:
        "<p>You know a cantrip. Your spellcasting ability for it is Intelligence, Wisdom, or Charisma (choose when you select this feat). Intelligence, Wisdom, or Charisma is your spellcasting ability for these spells.</p>",
      rules: [{ kind: "grant", type: "Spell", id: "CHILL" }],
    }),
    cantrip("MENDING", "Mending"),
    cantrip("LIGHT", "Light"),
  ]);
  reg.build();
  const sh = buildSheet(resolve({ ...newCharacter(), classes: [{ classId: "ART", level: 1 }], race }, reg));
  return sh.casting.map((c) => ({ name: c.name, cantrips: c.cantripsKnown.map((p) => reg.get(p.id)!.name) }));
}

describe("spells a class's own feature gives", () => {
  it("go on the class's casting line, not on a line of their own", () => {
    expect(lines()).toEqual([{ name: "Artificer", cantrips: ["Mending"] }]);
  });
  it("keep a line of their own when the feature casts them with another ability", () => {
    expect(lines("You know the Mending cantrip. Wisdom is your spellcasting ability for it.")).toEqual([
      { name: "Artificer", cantrips: [] },
      { name: "Tinker's Magic", cantrips: ["Mending"] },
    ]);
  });
  it("leave a spell whose giver is an ability a species trait offers on the species' line (a Tiefling's legacy cast with Intelligence)", () => {
    const got = lines(undefined, "TIEFLING");
    expect(got[0]).toEqual({ name: "Artificer", cantrips: ["Mending"] });
    expect(got.slice(1).flatMap((l) => l.cantrips)).toEqual(["Chill Touch"]);
    expect(got).toHaveLength(2);
  });
  it("do not take a choice among abilities for an ability named", () => {
    // No choice recorded: the text names three, so it names none, and a spell on the class's list stays with the class.
    const got = lines(undefined, "PLANAR");
    expect(got.map((l) => ({ ...l, cantrips: [...l.cantrips].sort() }))).toEqual([
      { name: "Artificer", cantrips: ["Chill Touch", "Mending"] },
    ]);
  });
  it("leave a species trait's spell on its own line", () => {
    expect(lines(undefined, "AASIMAR")).toEqual([
      { name: "Artificer", cantrips: ["Mending"] },
      { name: "Aasimar", cantrips: ["Light"] },
    ]);
  });
});
