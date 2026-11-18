/**
 * FastCharacter imports (A1.7), on the saved sheets: SOULFORGE_RULES=<test content folder> with fastcharacter/raw.
 * Each case is a class of cause that once left choices open.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importFastCharacter } from "./foreign";
import { resolve } from "./engine";
import { loadTestContent } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;
const RAW = C ? join(C, "fastcharacter", "raw") : "";

describe.skipIf(!C || !existsSync(RAW))("FastCharacter import", () => {
  const reg = C ? loadTestContent(C) : undefined!;
  const load = (f: string) => {
    const res = importFastCharacter(readFileSync(join(RAW, f), "utf8"), reg);
    return { res, r: resolve(res.character, reg), names: () => new Set(resolve(res.character, reg).active.map((a) => a.el.name)) };
  };

  it("reads 'Feature: Option' bullets and FastCharacter's spellings (Divine Order: Thamaturge)", () => {
    const { names, res } = load("fc12.txt");
    expect([...names()].some((n) => /Thaumaturge/.test(n))).toBe(true);
    expect(res.todo.some((t) => /Sacred Role|Blessed Strikes/.test(t))).toBe(false);
  }, 600000);

  it("takes the spells a feat names in its text (Magic Initiate), and no extra feats for them", () => {
    const fc06 = load("fc06.txt");
    expect(fc06.res.todo.some((t) => /Magic Initiate/.test(t))).toBe(false);
    const fc33 = load("fc33.txt");
    expect(fc33.res.todo.filter((t) => /cantrip|spell/i.test(t))).toEqual([]);
    expect(fc33.r.active.filter((a) => a.el.type === "Feat" && /Magic Initiate/.test(a.el.name)).length).toBeLessThanOrEqual(1);
  }, 600000);

  it("matches names written without the apostrophe (Melfs Acid Arrow)", () => {
    expect(load("fc04.txt").names().has("Melf’s Acid Arrow")).toBe(true);
  }, 600000);

  it("fills the 2024 Fighter's skills from the file once Insight is on the list", () => {
    expect(load("fc19.txt").res.todo.some((t) => /Skill Proficiency \(Fighter\)/.test(t))).toBe(false);
  }, 600000);

  // W9: a carried Cloak of Protection came in unworn and unattuned, so the armor class was one short of the sheet's
  // own (fc04, fc22, fc132). The file's armor class is the evidence that it is worn.
  it("wears a protective item the sheet's armor class counts", () => {
    for (const f of ["fc04.txt", "fc22.txt", "fc132.txt"]) {
      const { res } = load(f);
      expect(
        res.differences.filter((d) => /^Armor class/.test(d)),
        f,
      ).toEqual([]);
      const cloak = res.character.inventory.find((i) => /cloak of protection/i.test(reg.get(i.id)?.name ?? ""));
      expect([cloak?.equipped, cloak?.attuned], f).toEqual([true, true]);
    }
  }, 900000);

  // W9: the sheet's "Martial Arts" attack is the Unarmed Strike (fc126).
  it("reads a Martial Arts attack as the Unarmed Strike", () => {
    expect(load("fc126.txt").res.differences.filter((d) => /^Martial Arts attack: in the file/.test(d))).toEqual([]);
  }, 600000);
});
