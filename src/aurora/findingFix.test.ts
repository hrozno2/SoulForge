/**
 * E3.1: a rules-check finding with one safe answer carries its fix: take a repeated, unoffered or disallowed pick out
 * of its choice (the choice opens again for the player), or keep only as many picks as the choice allows.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "./engine";
import { buildSheet } from "./sheet";
import { checkCharacter } from "./rulesCheck";
import { applyFix } from "./findingFix";
import { randomCharacter } from "./randomCharacter";
import { loadContentSet } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;

describe.skipIf(!C)("fix-it on rules-check findings", () => {
  it("removes a repeated pick and a pick over the choice's number, and the finding goes", () => {
    const reg = loadContentSet(C!, "5etools");
    let seed = 4242;
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const filters = { legacy: true, playtest: false, unusual: false, scifi: false };
    let tried = 0;
    let repeats = 0;
    for (let i = 0; i < 60 && repeats < 5; i++) {
      const ch = randomCharacter(reg, 5, filters, rng);
      const r = resolve(ch, reg);
      const skill = r.slots.find((s) => s.rule.type === "Proficiency" && s.chosen.length >= 1 && s.rule.number >= 1);
      if (!skill) continue;
      tried++;
      const check = (c: typeof ch) => checkCharacter(resolve(c, reg), buildSheet(resolve(c, reg)), []);
      // Over the number: one more pick than allowed.
      const spare = skill.options.filter((o) => !skill.chosen.includes(o.id) && !r.ids.has(o.id));
      if (!spare.length) continue;
      const over = { ...ch, selections: { ...ch.selections, [skill.key]: [...skill.chosen.slice(0, skill.rule.number), spare[0].id] } };
      const f1 = check(over).find((f) => f.rule === "A choice holds more than it allows");
      expect(f1?.fix, "over the number").toBeTruthy();
      expect(check(applyFix(over, f1!.fix!)).some((f) => f.rule === "A choice holds more than it allows")).toBe(false);
      // A repeat: a choice takes a skill the character already has from elsewhere.
      const other = r.slots.find(
        (s) => s.rule.type === "Proficiency" && s.chosen.length && s.options.some((o) => r.ids.has(o.id) && !s.chosen.includes(o.id)),
      );
      if (!other) continue;
      const dup = other.options.find((o) => r.ids.has(o.id) && !other.chosen.includes(o.id))!;
      const rep = { ...ch, selections: { ...ch.selections, [other.key]: [dup.id, ...other.chosen.slice(1)] } };
      const f2 = check(rep).find((f) => f.rule === "A choice repeats something the character already has");
      if (!f2) continue;
      repeats++;
      expect(f2.fix, "a repeat").toBeTruthy();
      expect(check(applyFix(rep, f2.fix!)).some((f) => f.rule === "A choice repeats something the character already has")).toBe(false);
    }
    expect(tried).toBeGreaterThan(0);
    expect(repeats).toBeGreaterThan(0);
  }, 600000);

  // A file saved before stable keys keeps its picks under an older key, which the engine reads while the choice's own
  // key is missing: the fix must still take the pick out (a 2014 warlock's Fly stayed).
  it("works on a character saved under older keys", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { normalizeCharacter } = await import("./character");
    const { loadTestContent } = await import("../engine/testContent");
    const reg = loadTestContent(C!);
    const ch = normalizeCharacter(JSON.parse(readFileSync(join(__dirname, "../engine/fixtures/fiend-warlock-2014.json"), "utf8")));
    const check = (c: typeof ch) => checkCharacter(resolve(c, reg), buildSheet(resolve(c, reg)), []);
    const f = check(ch).find((x) => /: Fly$/.test(x.detail) && x.fix);
    expect(f).toBeTruthy();
    expect(check(applyFix(ch, f!.fix!)).some((x) => /: Fly$/.test(x.detail))).toBe(false);
  }, 600000);

  // W2: picks saved under something the character no longer has are shown, and can be cleared; picks a lower level
  // keeps for later (a class levelled down) are not.
  it("shows picks with no place, and leaves picks kept for higher levels alone", () => {
    const reg = loadContentSet(C!, "5etools");
    let seed = 99;
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const ch = randomCharacter(reg, 8, { legacy: true, playtest: false, unusual: false, scifi: false }, rng);
    const check = (c: typeof ch) => checkCharacter(resolve(c, reg), buildSheet(resolve(c, reg)), []);
    const RULE = "Earlier choices with no place now";
    // Levelled down to 3: the 4th to 8th levels' picks wait for the levels to come back.
    const down = { ...ch, classes: ch.classes.map((c) => ({ ...c, level: 3 })) };
    expect(check(down).some((f) => f.rule === RULE)).toBe(false);
    // An item's choice waits while the item is not equipped (or not attuned): never flagged.
    const item = reg.all().find((e) => /item/i.test(e.type) && e.rules.some((x) => x.kind === "select"));
    if (item) {
      const unequipped = {
        ...ch,
        inventory: [...ch.inventory, { uid: "t", id: item.id, qty: 1, equipped: false } as (typeof ch.inventory)[number]],
        selections: { ...ch.selections, [`${item.id}#x`]: ["ID_5ET_SKILL_STEALTH"] },
      };
      expect(check(unequipped).some((f) => f.rule === RULE)).toBe(false);
    }
    // A pick under an element the character does not have at any level.
    const stray = { ...ch, selections: { ...ch.selections, "ID_5ET_FEAT_PHB_ALERT#zzz": ["ID_5ET_SKILL_STEALTH"] } };
    const f = check(stray).find((x) => x.rule === RULE);
    expect(f?.fix).toBeTruthy();
    const cleared = applyFix(stray, f!.fix!);
    expect(cleared.selections["ID_5ET_FEAT_PHB_ALERT#zzz"]).toBeUndefined();
    expect(check(cleared).some((x) => x.rule === RULE)).toBe(false);
  }, 600000);
});
