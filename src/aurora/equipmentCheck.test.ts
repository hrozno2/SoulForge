/**
 * W5 (E2.1): starting equipment judged from the record each take leaves, against what the first class and the
 * background give: once each, never from a class taken by multiclassing, no more gold than the option gives, weapons
 * and armor among those it names.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeCharacter } from "./character";
import { checkStartingEquipment } from "./equipmentCheck";
import { startingPlans } from "./startingEquipment";
import { loadContentSet } from "../engine/testContent";

describe("starting equipment", () => {
  // A Sorcerer who multiclassed into Warlock, on the bundled SRD 5.2.
  const reg = loadContentSet("", "srd");
  const base = normalizeCharacter(JSON.parse(readFileSync(join(__dirname, "fixtures/sorcerer-warlock-srd.json"), "utf8")));
  const plans = startingPlans(base, reg);
  const cls = plans.find((p) => p.kind === "class")!;
  const gear = cls.variants.find((v) => !v.goldRoll)!;
  const gold = cls.variants.find((v) => v.goldRoll)!;
  const label = `${cls.title}, ${gear.label.toLowerCase()}`;
  const dagger = reg.all().find((e) => e.type === "Weapon" && e.name === "Light Crossbow")!;
  const plate = reg.all().find((e) => e.type === "Armor" && /^Plate/.test(e.name))!;
  const withLedger = (ledger: NonNullable<typeof base.equipmentLedger>) => ({
    ...base,
    equipmentLedger: ledger,
    equipmentAdded: Object.keys(ledger),
  });
  const details = (ledger: NonNullable<typeof base.equipmentLedger>) =>
    checkStartingEquipment(withLedger(ledger), reg).map((f) => f.detail);

  it("passes what the first class's option gives, and the player's own additions", () => {
    expect([cls.title, !!dagger, !!plate]).toEqual(["Sorcerer", true, true]);
    expect(
      details({ [label]: { items: [{ id: dagger.id, name: dagger.name, qty: 1 }], gp: gear.gp }, "Explorer's Pack": { items: [], gp: 0 } }),
    ).toEqual([]);
  });
  it("finds more gold than the option gives", () => {
    const rolled = `${cls.title}, ${gold.label.toLowerCase()}`;
    expect(details({ [rolled]: { items: [], gp: 120 } })).toEqual([]);
    expect(details({ [rolled]: { items: [], gp: 121 } })).toEqual([`${rolled}: 121 gp, the most it gives is 120 gp`]);
    expect(details({ [label]: { items: [], gp: 5 } })).toEqual([`${label}: 5 gp, the most it gives is 0 gp`]);
  });
  it("finds armor the option does not name", () => {
    expect(details({ [label]: { items: [{ id: plate.id, name: plate.name, qty: 1 }], gp: 0 } })).toEqual([
      `${label}: ${plate.name} is not among what it gives`,
    ]);
  });
  it("finds the equipment taken twice", () => {
    const second = `${cls.title}, ${gold.label.toLowerCase()}`;
    expect(details({ [label]: { items: [], gp: 0 }, [second]: { items: [], gp: 0 } })).toEqual([
      `Sorcerer's starting equipment taken 2 times (${label}; ${second})`,
    ]);
  });
  it("finds the equipment of a class taken by multiclassing", () => {
    expect(details({ "Warlock, starting equipment": { items: [], gp: 0 } })).toEqual([
      "Warlock's starting equipment: a class taken by multiclassing gives none",
    ]);
  });
});
