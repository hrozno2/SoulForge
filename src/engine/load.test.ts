/**
 * E1 checks (docs/ENGINE-PLAN.md): the concept vocabulary on its own, and with the real content (Aurora plus the
 * 5e.tools data folder in the test cache) every shared concept gets one key and nothing points nowhere.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { conceptOf, plain } from "./concepts";
import { loadContent } from "./load";
import { nodeXml } from "../aurora/fixture";
import { parseElementsXml } from "../aurora/parse";
import { ARegistry } from "../aurora/registry";
import { convertFiveTools } from "../aurora/fivetools";

describe("concepts", () => {
  const c = (type: string, name: string, id = "X") => conceptOf({ type, name, id });
  it("reads both sources' names to the same key", () => {
    expect(c("Proficiency", "Saving Throw Proficiency (Strength)")).toBe("save:str");
    expect(c("Proficiency", "Saving throw proficiency (Strength)")).toBe("save:str");
    expect(c("Proficiency", "Weapon Proficiency (Martial Weapons)")).toBe("weapon:martial");
    expect(c("Proficiency", "Weapon Proficiency ({@Item Longsword)")).toBe("weapon:longsword");
    expect(c("Proficiency", "Weapon Proficiency (Longsword)")).toBe("weapon:longsword");
    expect(c("Proficiency", "Armor Proficiency (Shields)")).toBe("armor:shield");
    expect(c("Proficiency", "Armor Proficiency (Shield)")).toBe("armor:shield");
    expect(c("Proficiency", "Armor Proficiency (Heavy Armor)")).toBe("armor:heavy");
    expect(c("Proficiency", "Tool Proficiency (Thieves’ tools)")).toBe("tool:thieves-tools");
    expect(c("Proficiency", "Animal Handling")).toBe("skill:animal-handling");
    expect(c("Proficiency", "Acrobatics (expertise)", "ID_5ET_EXPERTISE_ACROBATICS")).toBe("expertise:acrobatics");
    expect(c("Language", "Elvish")).toBe("language:elvish");
    expect(c("Vision", "Darkvision (60 ft.)")).toBe("sense:darkvision");
    expect(c("Proficiency", "Tool Expertise (Thieves’ Tools)")).toBe("tool-expertise:thieves-tools");
  });
  it("strips 5e.tools markup", () => {
    expect(plain("{@item Hand Crossbow|phb}")).toBe("hand crossbow");
  });
});

const CACHE = process.env.SOULFORGE_RULES;
const walk = (d: string, ext: string, out: string[] = []): string[] => {
  for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p, ext, out); else if (p.endsWith(ext)) out.push(p); }
  return out;
};

describe.skipIf(!CACHE)("loading the real content", () => {
  it("gives every shared concept one key and leaves no reference dangling", () => {
    const reg = new ARegistry();
    for (const f of walk(join(CACHE!, "elements-master"), ".xml").sort((a, b) => Number(/internal|ALE/.test(b)) - Number(/internal|ALE/.test(a)))) {
      try { reg.addFile(parseElementsXml(readFileSync(f, "utf8").replace(/^﻿/, ""), nodeXml, f)); } catch { /* not a content file */ }
    }
    const dir = join(CACHE!, "5etools-data");
    if (existsSync(dir)) {
      const json: Record<string, unknown> = {};
      for (const f of walk(dir, ".json")) { const rel = relative(dir, f); if (!/index\.json$/.test(rel) && !rel.startsWith("bestiary")) json[rel] = JSON.parse(readFileSync(f, "utf8")); }
      reg.addElements(convertFiveTools({ files: json as never }));
    }
    reg.build();
    const content = loadContent(reg);
    const r = content.report;
    const out = join(CACHE!, "engine");
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "load-report.json"), JSON.stringify(r, null, 2));
    console.log(`elements ${r.elements} (aurora ${r.bySource.aurora}, 5etools ${r.bySource["5etools"]}), merged ${r.merged}, shared concepts ${r.sharedConcepts.length}, unmapped concepts ${r.unmappedConcepts.length}, dangling ${r.danglingRefs.length}, repeated choices ${r.repeatedChoices}`);
    // Every skill and save, and the armor and weapon categories, must be one concept across both sources.
    for (const k of ["skill:perception", "skill:sleight-of-hand", "save:str", "save:cha", "armor:light", "armor:heavy", "armor:shield", "weapon:simple", "weapon:martial", "weapon:longsword", "language:elvish", "language:common"]) {
      expect(r.sharedConcepts, k).toContain(k);
    }
    expect(r.danglingRefs).toEqual([]);
    expect(r.unmappedConcepts).toEqual([]);
  }, 600000);
});
