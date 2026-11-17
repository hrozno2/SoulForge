/**
 * A spell list widened for spells is not widened for cantrips unless the feature says so. The 2024 Bard's Magical
 * Secrets ("you can choose any of your new prepared spells from the Bard, Cleric, Druid, and Wizard spell lists",
 * Player's Handbook 2024, Bard, level 10) names prepared spells only, yet Aurora's data widens the whole Bard list, and
 * Soul Forge offered a Bard 10's cantrip choices every Cleric, Druid and Wizard cantrip (found 2026-11-17 in a
 * player's library: Shape Water and Spare the Dying as Bard cantrips). Divine Soul says "a sorcerer cantrip or a
 * sorcerer spell of 1st level or higher" (Xanathar's Guide), so its Cleric list does reach the cantrips; a list of
 * named spells (a Ravnica guild's, which holds cantrips) is taken as written.
 */
import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import { resolve, resolveSupports } from "./engine";
import { ARegistry } from "./registry";
import type { AElement, ARule } from "./types";

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
const spell = (id: string, name: string, level: number, lists: string[]) =>
  el(id, name, "Spell", { supports: lists, setters: { level: { value: String(level), attrs: {} } } });
const cantrips: ARule = {
  kind: "select",
  type: "Spell",
  name: "Cantrip (Bard)",
  supports: "$(spellcasting:list), 0",
  number: 2,
  spellcasting: "Bard",
};
const spells: ARule = {
  kind: "select",
  type: "Spell",
  name: "Spell (Bard)",
  supports: "$(spellcasting:list), 1",
  number: 2,
  spellcasting: "Bard",
};

function reg(widen: AElement) {
  const r = new ARegistry();
  r.addElements([
    el("BARD", "Bard", "Class", {
      spellcasting: { name: "Bard", ability: "Charisma", list: ["Bard"], extendLists: [] },
      rules: [cantrips, spells, { kind: "grant", type: "Class Feature", id: widen.id, level: 1 }],
      setters: { hd: { value: "d8", attrs: {} } },
    }),
    widen,
    spell("MOCKERY", "Vicious Mockery", 0, ["Bard"]),
    spell("FLAME", "Sacred Flame", 0, ["Cleric"]),
    spell("BLESS", "Bless", 1, ["Cleric"]),
    spell("CHARM", "Charm Person", 1, ["Bard"]),
  ]);
  r.build();
  return r;
}
const offered = (r: ARegistry, name: string) => {
  const ch = { ...newCharacter(), classes: [{ classId: "BARD", level: 1 }] };
  const res = resolve(ch, r);
  return res.slots
    .find((s) => s.rule.name === name)!
    .options.map((o) => o.name)
    .sort();
};

describe("a widened spell list and cantrips", () => {
  it("Magical Secrets (spells only) widens the spells, not the cantrips", () => {
    const r = reg(
      el("SECRETS", "Magical Secrets", "Class Feature", {
        description: "<p>You can choose any of your new prepared spells from the Bard, Cleric, Druid, and Wizard spell lists.</p>",
        spellcasting: { name: "Bard", extend: true, list: [], extendLists: ["Cleric"] },
      }),
    );
    expect(offered(r, "Cantrip (Bard)")).toEqual(["Vicious Mockery"]);
    // The spells are widened (the class's own choices draw on the lists by the slots it has; none here at level 1).
    const res = resolve({ ...newCharacter(), classes: [{ classId: "BARD", level: 1 }] }, r);
    expect(resolveSupports("$(spellcasting:list), 1", "Bard", res)).toBe("(Bard||Cleric), 1");
  });

  it("a feature that names cantrips (Divine Soul) widens them too", () => {
    const r = reg(
      el("SOUL", "Divine Magic", "Class Feature", {
        description:
          "<p>When your Spellcasting feature lets you learn or replace a sorcerer cantrip or a sorcerer spell of 1st level or higher, you can choose the new spell from the cleric spell list.</p>",
        spellcasting: { name: "Bard", extend: true, list: [], extendLists: ["Cleric"] },
      }),
    );
    expect(offered(r, "Cantrip (Bard)")).toEqual(["Sacred Flame", "Vicious Mockery"]);
  });

  it("a list of named spells is taken as written, cantrips included", () => {
    const r = reg(
      el("GUILD", "Guild Spells", "Background Feature", {
        description: "<p>The spells on the table are added to that class's spell list.</p>",
        spellcasting: { name: "Bard", extend: true, list: [], extendLists: ["FLAME"] },
      }),
    );
    expect(offered(r, "Cantrip (Bard)")).toEqual(["Sacred Flame", "Vicious Mockery"]);
  });
});
