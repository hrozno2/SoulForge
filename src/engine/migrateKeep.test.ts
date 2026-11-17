/**
 * The move to 5e.tools drops nothing the content still describes (docs/ENGINE-LEGAL-PLAN.md, section 4): an item
 * 5e.tools has no version of becomes a custom item of the same name, weight, cost and text; other content it has no
 * version of keeps its id and its text goes into the player's note. Found 2026-11-17 on the fresh sample (a Wooden
 * Stake, "String (10 feet)", three old Unearthed Arcana spells).
 */
import { describe, expect, it } from "vitest";
import { newCharacter } from "../aurora/character";
import { ARegistry } from "../aurora/registry";
import type { AElement } from "../aurora/types";
import { migrateToFiveTools } from "./migrate";

const el = (id: string, name: string, type: string, extra: Partial<AElement> = {}): AElement => ({
  id,
  name,
  type,
  source: "Curse of Strahd",
  supports: [],
  description: `<p>${name} text.</p>`,
  compendiumHidden: false,
  setters: {},
  rules: [],
  ...extra,
});

function regs() {
  const from = new ARegistry();
  from.addElements([
    el("ID_WOTC_COS_ITEM_WOODEN_STAKE", "Wooden Stake", "Item", {
      setters: { weight: { value: "1 lb.", attrs: { lb: "1" } }, cost: { value: "1", attrs: { currency: "cp" } } },
    }),
    el("ID_WOTC_UA_SPELL_FIND_VEHICLE", "Find Vehicle", "Spell", { source: "Unearthed Arcana: Modern Magic" }),
  ]);
  from.build();
  const to = new ARegistry();
  to.build();
  return { from, to };
}

describe("content 5e.tools has no version of", () => {
  it("an item becomes a custom item with its weight, cost and text", () => {
    const { from, to } = regs();
    const ch = { ...newCharacter(), inventory: [{ uid: "a", id: "ID_WOTC_COS_ITEM_WOODEN_STAKE", qty: 2, equipped: false }] } as never;
    const m = migrateToFiveTools(ch, from, to);
    const it = m.ch.inventory[0];
    expect(it.id).toBe("");
    expect(it.qty).toBe(2);
    expect(it.custom).toMatchObject({ name: "Wooden Stake", weight: 1, cost: "1 cp", description: "Wooden Stake text." });
    expect(m.customItems).toEqual(["Wooden Stake"]);
    expect(m.noTwin).toEqual([]);
  });

  it("anything else keeps its id, and its text is kept for the note", () => {
    const { from, to } = regs();
    const ch = { ...newCharacter(), extras: ["ID_WOTC_UA_SPELL_FIND_VEHICLE"] };
    const m = migrateToFiveTools(ch, from, to);
    expect(m.ch.extras).toEqual(["ID_WOTC_UA_SPELL_FIND_VEHICLE"]);
    expect(m.textKept).toEqual([{ name: "Find Vehicle", type: "Spell", text: "Find Vehicle text." }]);
  });
});
