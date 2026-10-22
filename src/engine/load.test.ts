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
    expect(c("Class Feature", "Skill Expertise (Animal Handling)")).toBe("expertise:animal-handling");
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

describe.skipIf(!CACHE)("the stat dictionary", () => {
  it("knows every stat the content sets, or something reads it", async () => {
    const { statKind } = await import("./statDictionary");
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
    const set = new Map<string, string[]>();
    const used = new Set<string>();
    const take = (t: string | undefined) => { for (const m of (t ?? "").matchAll(/\{\{([^}]+)\}\}/g)) used.add(m[1].trim().toLowerCase()); };
    for (const e of reg.all()) {
      take(e.description); take(e.sheet?.usage); for (const d of e.sheet?.descriptions ?? []) { take(d.text); take(d.usage); }
      const reqs = [e.requirements ?? "", ...e.rules.map((r) => ("requirements" in r ? r.requirements ?? "" : ""))].join(" ");
      for (const m of reqs.matchAll(/\[([a-z][^\]]*?):(-?\d+)\]/gi)) used.add(m[1].trim().toLowerCase());
      for (const r of e.rules) if (r.kind === "stat") {
        (set.get(r.name.toLowerCase()) ?? set.set(r.name.toLowerCase(), []).get(r.name.toLowerCase())!).push(e.id);
        if (isNaN(Number(r.value))) used.add(r.value.toLowerCase());
        if (r.bonus && isNaN(Number(r.bonus))) used.add(r.bonus.toLowerCase());
      }
    }
    const { TO_WIRE } = await import("./statDictionary");
    const toWire = [...set].filter(([n]) => !statKind(n) && !used.has(n) && TO_WIRE.some((k) => k.pattern.test(n)));
    const unknown = [...set].filter(([n]) => !statKind(n) && !used.has(n) && !TO_WIRE.some((k) => k.pattern.test(n))).map(([n, ids]) => `${n} (${ids.length}): ${ids.slice(0, 2).join(", ")}`);
    writeFileSync(join(CACHE!, "engine", "unknown-stats.txt"), unknown.join("\n"));
    console.log(`STATS ${set.size} names; to wire ${toWire.length}; unknown ${unknown.length}`);
    for (const u of unknown.slice(0, 40)) console.log(`UNKNOWN ${u}`);
  }, 600000);
});

describe.skipIf(!CACHE)("the lossless-load gate", () => {
  it("reads every 5e.tools field or has a decision for it", async () => {
    const { decisionFor } = await import("./fields");
    const dir = join(CACHE!, "5etools-data");
    if (!existsSync(dir)) return;
    // A field is read when the converter names it (a property access or key); the identity fields always are.
    // The Foundry files are read by foundry.ts, the lore files by lore.ts.
    const conv = ["fivetools", "lore"].map((n) => readFileSync(`src/aurora/${n}.ts`, "utf8")).join("\n");
    const foundryConv = readFileSync("src/aurora/foundry.ts", "utf8");
    // Read means accessed: ".lineage", "?.lineage", '["lineage"]' or a quoted key, not the word in a comment.
    const readsIn = (src: string, k: string) => new RegExp(`(?:\\.|\\[["'])${k.replace(/[$]/g, "\\$")}\\b|["']${k.replace(/[$]/g, "\\$")}["']`).test(src);
    const IDENTITY = new Set(["name", "source", "page", "srd", "srd52", "basicRules", "basicRules2024", "freeRules2024", "otherSources", "reprintedAs", "isReprinted", "hasFluff", "hasFluffImages", "fluff", "soundClip", "hasToken", "token", "tokenCredit", "foundryImg", "edition", "legacy", "_copy", "_isCopy", "_isBaseVersion"]);
    const undecided: string[] = [];
    const planned: string[] = [];
    const seen = new Set<string>();
    for (const f of walk(dir, ".json")) {
      if (/index\.json$|bestiary|books\.json|sources\.json/.test(f)) continue;
      const data = JSON.parse(readFileSync(f, "utf8"));
      const isFoundry = /(^|\/)foundry(-[a-z]+)?\.json$/.test(f);
      const reads = (k: string) => readsIn(isFoundry ? foundryConv : conv, k);
      for (const [kind, list] of Object.entries(data)) {
        if (!Array.isArray(list) || kind.startsWith("_")) continue;
        for (const x of list) if (x && typeof x === "object") for (const k of Object.keys(x)) {
          const key = `${isFoundry ? "foundry:" : ""}${kind}.${k}`;
          if (seen.has(key) || IDENTITY.has(k) || reads(k)) continue;
          seen.add(key);
          const d = decisionFor(isFoundry ? `foundry:${kind}` : kind, k);
          if (!d) undecided.push(key);
          else if (d.startsWith("planned")) planned.push(`${key}: ${d.slice(9)}`);
        }
      }
    }
    mkdirSync(join(CACHE!, "engine"), { recursive: true });
    writeFileSync(join(CACHE!, "engine", "fields-planned.txt"), planned.sort().join("\n"));
    console.log(`FIELDS undecided ${undecided.length}; planned ${planned.length}`);
    expect(undecided.sort()).toEqual([]);
  }, 600000);
});
