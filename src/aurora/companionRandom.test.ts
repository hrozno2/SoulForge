/**
 * Random Echo Knights and Battle Smiths on every content set (Chris, 2026-11-17: "Make random characters with these,
 * make them rules legal ... and compare"). Each is made by the random builder, must pass the rules check, and must
 * have its companion with the book's numbers, worked out here from the book's sentence and not from the stat block:
 *   Echo (Explorer's Guide to Wildemount): AC 14 + proficiency bonus, 1 hit point.
 *   Steel Defender (Tasha's Cauldron of Everything): AC 15 (17 from 15th level, Improved Defender), hit points 2 +
 *   Intelligence modifier + 5 x artificer level.
 *   Steel Defender (Eberron: Forge of the Artificer): AC 12 + Intelligence modifier, hit points 5 + 5 x artificer level.
 * COMPANION_N sets the characters per class and content set (default 12). Needs SOULFORGE_RULES.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolve } from "./engine";
import { buildSheet } from "./sheet";
import { checkCharacter, type RefClass } from "./rulesCheck";
import { randomCharacter } from "./randomCharacter";
import { formStats } from "./forms";
import { loadContentSet, type ContentSet } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;
const N = Number(process.env.COMPANION_N) || 12;

describe.skipIf(!C)("random Echo Knights and Battle Smiths", () => {
  const ref: RefClass[] = C ? JSON.parse(readFileSync(join(C, "rules-ref.json"), "utf8")) : [];
  for (const set of ["5etools", "both", "aurora"] as ContentSet[]) {
    it(`on ${set}: legal, and the companion has the book's numbers`, () => {
      const reg = loadContentSet(C!, set);
      let seed = 4242;
      const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const filters = { legacy: true, playtest: false, unusual: false };
      const problems: string[] = [];
      let made = 0;
      const classes = reg
        .ofType("Class")
        .filter((c) => /^(Fighter|Artificer)$/.test(c.name) && !c.compendiumHidden && !/unearthed|playtest/i.test(c.source));
      for (const cls of classes) {
        const sub = cls.name === "Fighter" ? "Echo Knight" : "Battle Smith";
        for (let i = 0; i < N; i++) {
          const level = 3 + Math.floor(rng() * 18);
          const ch = randomCharacter(reg, level, filters, rng, { classId: cls.id, prefer: [sub] });
          const r = resolve(ch, reg);
          const arche = r.active.find((a) => a.el.type === "Archetype" && a.el.name === sub);
          if (!arche) continue; // this class's edition has no such subclass in this content
          made++;
          const sh = buildSheet(r);
          const label = `${cls.name} (${cls.source}) ${level}`;
          for (const f of checkCharacter(r, sh, ref)) problems.push(`${label}: ${f.rule}: ${f.detail}`);
          const pal = r.active.filter((a) => a.el.type === "Companion");
          const want = sub === "Echo Knight" ? "Echo" : "Steel Defender";
          const comp = pal.find((a) => a.el.name === want)?.el;
          if (!comp) {
            problems.push(`${label}: no ${want} (companions: ${pal.map((a) => a.el.name).join(", ") || "none"})`);
            continue;
          }
          const b = formStats(r, comp, "companion");
          const int = sh.abilities.find((a) => a.id === "intelligence")!.mod;
          const lvl = ch.classes.find((c) => c.classId === cls.id)!.level;
          const modern = /Forge of the Artificer/.test(arche.el.source);
          const book =
            sub === "Echo Knight"
              ? { ac: 14 + sh.proficiency, hp: 1 }
              : modern
                ? { ac: 12 + int, hp: 5 + 5 * lvl }
                : { ac: 15 + (lvl >= 15 ? 2 : 0), hp: 2 + int + 5 * lvl }; // Improved Defender: +2 AC at 15th level (2014)
          if (b.ac !== book.ac || b.hp !== book.hp)
            problems.push(
              `${label}: ${want} AC ${b.ac} HP ${b.hp}, the book says AC ${book.ac} HP ${book.hp} (${comp.source}; companions ${pal.map((a) => a.el.name).join(", ")})`,
            );
        }
      }
      if (set !== "aurora") expect(made, "characters made with the subclass").toBeGreaterThan(0);
      expect(problems).toEqual([]);
    }, 1200000);
  }
});
