/**
 * Chris's Eleanor (v0.26.3), saved three ways: Soul Forge, Roll20 and Foundry. Each import must come back as the same
 * character: class, subclass, species, background, feats, spells, prepared spells and scores, with nothing left open.
 * The files are kept outside the repository, in the test content folder's imports/eleanor.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "./engine";
import { importForeignCharacter } from "./foreign";
import { loadTestContent } from "../engine/testContent";
import { exportFoundry, exportRoll20 } from "./exportForeign";

const C = process.env.SOULFORGE_RULES;
const D = `${C}/imports/eleanor`;

describe.skipIf(!C || !existsSync(`${D}/soulforge.json`))("Eleanor's exports", () => {
  it("import as the character they were saved from", () => {
    const reg = loadTestContent(C!);
    const names = (r: ReturnType<typeof resolve>, re: RegExp) =>
      [...new Set(r.active.filter((x) => re.test(x.el.type)).map((x) => x.el.name.toLowerCase()))].sort();
    // Prepared beyond the spells the character always has (Magic Initiate's Bless needs no preparing; the v0.26.3
    // file prepared it again, which an import rightly leaves out).
    const prepared = (r: ReturnType<typeof resolve>) =>
      [
        ...new Set(
          Object.values(r.character.prepared)
            .flat()
            .map((id) => r.reg.get(id)?.name.toLowerCase() ?? id),
        ),
      ]
        .filter((n) => !names(r, /^Spell$/).includes(n))
        .sort();
    const sum = (r: ReturnType<typeof resolve>) => ({
      classes: r.character.classes.map((c) => `${r.reg.get(c.classId)?.name} ${c.level}`),
      subclass: names(r, /^Archetype$/),
      species: names(r, /^(Race|Sub Race)$/),
      background: names(r, /^Background$/),
      feats: names(r, /^Feat$/),
      spells: names(r, /^Spell$/),
      prepared: prepared(r),
      scores: ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map((s) => r.stats.get(s)),
    });
    const native = resolve(JSON.parse(readFileSync(`${D}/soulforge.json`, "utf8")), reg);
    // The files Chris saved with v0.26.3, and the ones this version writes.
    const files: Record<string, unknown> = {
      roll20: JSON.parse(readFileSync(`${D}/roll20.json`, "utf8")),
      foundry: JSON.parse(readFileSync(`${D}/foundry.json`, "utf8")),
      "roll20 now": JSON.parse(JSON.stringify(exportRoll20(native))),
      "foundry now": JSON.parse(JSON.stringify(exportFoundry(native))),
    };
    const want = sum(native);
    for (const [f, data] of Object.entries(files)) {
      const imp = importForeignCharacter(data, reg);
      expect({ file: f, ...sum(resolve(imp.character, reg)), todo: imp.todo }).toEqual({ file: f, ...want, todo: [] });
    }
  }, 600000);
});
