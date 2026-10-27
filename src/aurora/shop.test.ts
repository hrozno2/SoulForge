/** The shop's money (A2.3): prices, the per-character multiplier, paying with change, and selling at half. */
import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import { asCoins, buy, formatCp, pay, priceCp, purseCp, sell } from "./shop";
import type { AElement } from "./types";

const item = (value: string, currency = "gp") =>
  ({ id: `ID_TEST_${value}_${currency}`, name: "Thing", type: "Item", source: "Test", supports: [], description: "", setters: { cost: { value, attrs: { currency } } } }) as unknown as AElement;

describe("shop", () => {
  it("reads prices in copper", () => {
    expect(priceCp(item("5"))).toBe(500);
    expect(priceCp(item("1,500"))).toBe(150000);
    expect(priceCp(item("2", "sp"))).toBe(20);
    expect(priceCp(item("0"))).toBeUndefined();
  });

  it("makes change in the largest coins", () => {
    expect(asCoins(1234)).toEqual({ pp: 1, gp: 2, sp: 3, cp: 4, ep: 0 });
    expect(pay({ cp: 0, sp: 0, ep: 0, gp: 10, pp: 0 }, 150)).toEqual({ cp: 0, sp: 5, ep: 0, gp: 8, pp: 0 });
    expect(pay({ cp: 0, sp: 0, ep: 0, gp: 1, pp: 0 }, 150)).toBeUndefined();
    expect(formatCp(1250)).toBe("1 pp 2 gp 5 sp");
  });

  it("buys and sells with the character's multiplier", () => {
    const sword = item("15");
    const ch = { ...newCharacter(), coins: { cp: 0, sp: 0, ep: 0, gp: 50, pp: 0 }, priceMultiplier: 2 };
    const bought = buy(ch, sword, 1, "u1");
    if (!bought.ok) throw new Error(bought.reason);
    expect(purseCp(bought.character.coins)).toBe(2000);
    expect(bought.character.inventory.map((i) => [i.id, i.qty])).toEqual([[sword.id, 1]]);
    expect(buy(bought.character, sword, 1).ok).toBe(false);
    const sold = sell(bought.character, "u1", sword);
    if (!sold.ok) throw new Error(sold.reason);
    expect(purseCp(sold.character.coins)).toBe(3500);
    expect(sold.character.inventory).toEqual([]);
  });

  it("charges the plain price when no multiplier is set", () => {
    const ch = { ...newCharacter(), coins: { cp: 0, sp: 0, ep: 0, gp: 10, pp: 0 } };
    const r = buy(ch, item("5", "sp"), 3, "u2");
    expect(r.ok && purseCp(r.character.coins)).toBe(850);
  });
});

describe("rarity prices", () => {
  const magic = (rarity: string, extra: Record<string, unknown> = {}) =>
    ({ id: "ID_TEST_MAGIC", name: "Magic", type: "Magic Item", source: "Test", supports: [], description: "", setters: { rarity: { value: rarity, attrs: {} }, ...extra } }) as unknown as AElement;
  it("prices a magic item without a price by rarity only when the character uses rarity prices", () => {
    const sword = magic("Uncommon", { "base cost": { value: "15", attrs: { currency: "gp" } } });
    expect(priceCp(sword)).toBeUndefined();
    expect(priceCp(sword, true)).toBe(40000 + 1500);
    expect(priceCp(magic("Rare (requires attunement)"), true)).toBe(400000);
    expect(priceCp(magic("Common", { consumable: { value: "true", attrs: {} } }), true)).toBe(5000);
    expect(priceCp(magic("Artifact"), true)).toBeUndefined();
  });
});
