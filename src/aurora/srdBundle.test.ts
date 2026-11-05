import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { NOT_IN_SRD, SRD_SOURCE, srdElements, srdFiles, type SrdEdition } from "./srdBundle";
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

// RULES_TIER=srd-bundle (scripts/srd-bundle.mjs): builds the bundles from the 5e.tools data in the test cache.
const C = process.env.SOULFORGE_RULES;
describe.skipIf(!C || process.env.RULES_TIER !== "srd-bundle")("the bundle", () => {
  const raw: Record<string, Record<string, unknown>> = {};
  const dir = join(C ?? "", "5etools-data");
  if (C) for (const f of walkDir(dir, ".json")) { const rel = relative(dir, f); if (!/index\.json$/.test(rel) && !rel.startsWith("bestiary")) raw[rel] = JSON.parse(readFileSync(f, "utf8")); }
  for (const edition of ["5.1", "5.2"] as SrdEdition[]) {
    it(`SRD ${edition} stands alone and names nothing outside the SRD`, () => {
      const elements = srdElements(raw, edition);
      const named = elements.filter((e) => NOT_IN_SRD.test(`${e.name} ${e.description ?? ""}`));
      const lines = named.map((e) => `${e.type}: ${e.name}: ${`${e.name} ${e.description ?? ""}`.match(NOT_IN_SRD)?.[0]}`);
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
      writeFileSync(join(out, `srd-${edition}.json`), JSON.stringify({ edition, elements }));
      writeFileSync(join(out, `srd-${edition}.report.txt`), [`elements ${elements.length}`, `other source ${otherSource.join(", ")}`, `not in the SRD ${lines.length}`, ...lines, `findings ${findings.length}`, ...new Set(findings)].join("\n"));
      expect(otherSource).toEqual([]);
      expect(lines).toEqual([]);
      expect(findings).toEqual([]);
    }, 300000);
  }
});
