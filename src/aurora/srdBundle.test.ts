import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { NOT_IN_SRD, SRD_SOURCE, srdElements, srdFiles, type SrdEdition } from "./srdBundle";
import { srdCorpus, srdDescription } from "./srdText";
import { SRD_ATTRIBUTION } from "./srdAttribution";
import { ARegistry } from "./registry";
import { randomCharacter } from "./randomCharacter";
import { resolve, stillToChoose } from "./engine";
import { buildSheet } from "./sheet";
import { checkCharacter } from "./rulesCheck";
import { walkDir } from "../engine/testContent";

describe("srdFiles", () => {
  const files = { "a.json": { _meta: { x: 1 }, itemProperty: [{ abbreviation: "F" }], spell: [{ name: "Light", srd: true }, { name: "Melf's Acid Arrow", srd: "Acid Arrow" }, { name: "New", srd52: true }, { name: "Hex" }], magicvariant: [{ name: "+1 Weapon", inherits: { srd: true } }, { name: "Odd", inherits: {} }] } };
  it("keeps an edition's marked entries and the tables the converter reads", () => {
    const { files: out } = srdFiles(files, "5.1");
    expect((out["a.json"].spell as { name: string }[]).map((s) => s.name)).toEqual(["Light", "Melf's Acid Arrow"]);
    expect((out["a.json"].magicvariant as { name: string }[]).map((s) => s.name)).toEqual(["+1 Weapon"]);
    expect(out["a.json"].itemProperty).toEqual([{ abbreviation: "F" }]);
    expect(out["a.json"]._meta).toEqual({ x: 1 });
  });
  it("the two editions are apart, and a string mark is the SRD's name", () => {
    expect((srdFiles(files, "5.2").files["a.json"].spell as { name: string }[]).map((s) => s.name)).toEqual(["New"]);
    expect([...srdFiles(files, "5.1").renames]).toEqual([["Melf's Acid Arrow", "Acid Arrow"]]);
  });
});

describe("only the SRD's words", () => {
  const corpus = srdCorpus("Legal Information\nYou regain 1 hit point when you finish a long rest.\u00a0 System Reference Document 5.1  12\f Each creature in the area must make a saving throw against your spell save DC, and takes 3d6 fire damage on a failure.");
  it("keeps a block the SRD has, emphasis and all", () => {
    const r = srdDescription("<p>You regain <b>1</b> hit point when you finish a long rest.</p>", corpus);
    expect(r.html).toBe("<p>You regain <b>1</b> hit point when you finish a long rest.</p>");
    expect(r.dropped).toEqual([]);
  });
  it("drops what the SRD does not say, and a heading left with nothing under it", () => {
    const r = srdDescription("<h5>Lore</h5><p>The vampire Count Strahd rules here.</p><h5>Rest</h5><p>You regain 1 hit point when you finish a long rest. Count Strahd approves.</p>", corpus);
    expect(r.html).toBe("<h5>Rest</h5><p>You regain 1 hit point when you finish a long rest.</p>");
    expect(r.dropped).toEqual(["The vampire Count Strahd rules here.", "Count Strahd approves."]);
  });
  it("lets a long sentence differ by a word, but not a short one", () => {
    expect(srdDescription("<p>Each creature in the area must make a saving throw against your spell save DC, and takes 3d6 cold damage on a failure.</p>", corpus).dropped).toEqual([]);
    expect(srdDescription("<p>You regain 2 hit points.</p>", corpus).dropped).toHaveLength(1);
  });
  it("reads through a page's footer", () => {
    expect(corpus).toContain("longrest" + "eachcreature");
  });
});

// RULES_TIER=srd-bundle (scripts/srd-bundle.mjs): builds the bundles from the 5e.tools data in the test cache.
const C = process.env.SOULFORGE_RULES;
describe.skipIf(!C || process.env.RULES_TIER !== "srd-bundle")("the bundle", () => {
  const raw: Record<string, Record<string, unknown>> = {};
  const dir = join(C ?? "", "5etools-data");
  if (C) for (const f of walkDir(dir, ".json")) { const rel = relative(dir, f); if (!/index\.json$/.test(rel) && !rel.startsWith("bestiary")) raw[rel] = JSON.parse(readFileSync(f, "utf8")); }
  for (const edition of ["5.1", "5.2"] as SrdEdition[]) {
    it(`SRD ${edition} stands alone and names nothing outside the SRD`, () => {
      // The official PDF's text (pdftotext, <cache>/srd/pdf): only its words are bundled.
      const corpus = srdCorpus(readFileSync(join(C!, "srd", "pdf", edition === "5.1" ? "SRD_CC_v5.1.txt" : "SRD_CC_v5.2.1.txt"), "utf8"));
      const dropped: string[] = [];
      const elements = srdElements(raw, edition, corpus, dropped);
      const allText = (e: (typeof elements)[number]) => `${e.name} ${e.description ?? ""} ${(e.sheet?.descriptions ?? []).map((d) => d.text).join(" ")}`;
      const named = elements.filter((e) => NOT_IN_SRD.test(allText(e)));
      const lines = named.map((e) => `${e.type}: ${e.name}: ${allText(e).match(NOT_IN_SRD)?.[0]}`);
      const reg = new ARegistry();
      reg.addElements(elements);
      reg.build();
      expect(reg.ofType("Class")).toHaveLength(12);
      expect(reg.ofType("Race").length).toBeGreaterThanOrEqual(9);
      expect(reg.ofType("Background").length).toBeGreaterThanOrEqual(1);
      const otherSource = [...new Set(reg.all().filter((e) => e.source !== SRD_SOURCE[edition] && e.source !== "Internal").map((e) => `${e.source}: ${e.type}`))];
      let seed = 11;
      const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const findings: string[] = [];
      for (let i = 0; i < 100; i++) {
        const r = resolve(randomCharacter(reg, 1 + (i % 20), {} as never, rng), reg);
        findings.push(...r.slots.filter((s) => stillToChoose(s, r)).map((s) => `open: ${s.rule.name}`), ...checkCharacter(r, buildSheet(r), []).filter((f) => f.rule !== "Class not in the rules reference").map((f) => `${f.rule}: ${f.detail}`));
      }
      const out = join(C!, "srd");
      mkdirSync(out, { recursive: true });
      const bundle = JSON.stringify({ edition, attribution: SRD_ATTRIBUTION[edition], elements });
      writeFileSync(join(out, `srd-${edition}.json`), bundle);
      writeFileSync(join(out, `srd-${edition}.dropped.txt`), dropped.join("\n"));
      writeFileSync(join(out, `srd-${edition}.report.txt`), [`dropped sentences ${dropped.length}`, `elements with text ${elements.filter((e) => e.description?.replace(/<[^>]+>/g, "").trim()).length}`, `elements ${elements.length}`, `other source ${otherSource.join(", ")}`, `not in the SRD ${lines.length}`, ...lines, `findings ${findings.length}`, ...new Set(findings)].join("\n"));
      expect(otherSource).toEqual([]);
      expect(lines).toEqual([]);
      expect(findings).toEqual([]);
      // Only a bundle that passed reaches the app.
      mkdirSync("public/srd", { recursive: true });
      writeFileSync(join("public/srd", `srd-${edition}.json`), bundle);
    }, 300000);
  }
});
