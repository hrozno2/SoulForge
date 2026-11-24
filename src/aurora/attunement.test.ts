/**
 * One reader decides whether an item needs attunement (audit E2). The engine, the equipment screen and the printed
 * sheet each had their own: the engine also took the content's `attunement` setter, the screen did not, so a homebrew
 * magic item marked "Requires attunement" was held back by the engine with no box on the screen to attune it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { attunementFrom, needsAttunement } from "./engine";
import { featRepeatFrom } from "./rulesCheck";
import type { AElement } from "./types";
import { nodeXml } from "./fixture";
import { newEntry, toXml } from "./homebrew";
import { parseElementsXml } from "./parse";

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });

describe("an item's attunement", () => {
  it("holds for a homebrew magic item marked so, and not for one left unmarked", () => {
    const e = newEntry("magic");
    const make = (attunement: boolean) =>
      parseElementsXml(toXml([{ ...e, name: "Ring of Tests", description: "A plain band.", data: { ...e.data, attunement } }]), nodeXml)
        .elements[0];
    expect(needsAttunement(make(true))).toBe(true);
    expect(needsAttunement(make(false))).toBe(false);
    expect(needsAttunement(undefined)).toBe(false);
  });

  it("is the data's to say on 5e.tools content: a property that needs attunement does not make the whole item need it", () => {
    // The Hammer of Thunderbolts: +1 for anyone holding it; only its Giant's Bane property asks for attunement.
    const text =
      "<p>You gain a +1 bonus to attack and damage rolls.</p><p><b>Giant's Bane (Requires Attunement).</b> You must be wearing…</p>";
    const el = (id: string, rarity: string) =>
      ({ id, name: "Hammer", type: "Weapon", description: text, setters: { rarity: { value: rarity } }, rules: [] }) as unknown as AElement;
    expect(attunementFrom(el("ID_5ET_ITEM_DMG_HAMMER_OF_THUNDERBOLTS", "Legendary"))).toBeUndefined();
    expect(attunementFrom(el("ID_5ET_ITEM_DMG_HOLY_AVENGER", "Legendary (requires attunement by a paladin)"))).toBe("data");
    // Content that states it nowhere but its text is still read.
    expect(attunementFrom(el("ID_HOMEBREW_ITEM_HAMMER", "Legendary"))).toBe("text");
  });

  it("is read in one place: no other file tests an item's text for it", () => {
    const own = files("src").filter((f) => /requires attunement\/i\.test\(/.test(readFileSync(f, "utf8")));
    expect(own.map((f) => f.replace(/\\/g, "/"))).toEqual(["src/aurora/engine.ts"]);
  });
});

describe("a feat taken more than once", () => {
  const feat = (description: string, setters = {}) =>
    ({ id: "ID_X_FEAT_TEST", name: "Test", type: "Feat", description, setters, rules: [] }) as unknown as AElement;
  it("is said by the data or by the feat's own sentence, not by any 'more than once'", () => {
    expect(featRepeatFrom(feat("", { "allow duplicate": { value: "true" } }))).toBe("data");
    expect(featRepeatFrom(feat("Repeatable. You can take this feat more than once, but you must choose…"))).toBe("text");
    expect(featRepeatFrom(feat("You can select it more than once."))).toBe("text");
    // 5e.tools says it as data. The 2024 Magic Initiate is repeatable "but you must choose a different spell list
    // each time": its version for one list carries the sentence and is not itself to be taken twice.
    const cleric = {
      ...feat("Repeatable. You can take this feat more than once, but you must choose a different spell list each time."),
      id: "ID_5ET_FEAT_XPHB_MAGIC_INITIATE_CLERIC",
    };
    expect(featRepeatFrom(cleric)).toBeUndefined();
    // Ember of the Fire Giant, Rune Carver Adept: a limit on a use, not on the feat.
    expect(featRepeatFrom(feat("a number of times equal to your proficiency bonus (but no more than once per turn)"))).toBeUndefined();
  });
});
