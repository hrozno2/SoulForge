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
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { srdClassTables, srdSections, srdSpell, srdTableRows } from "./srdPdf";
import { followSrd, gearRow, type FollowReport } from "./srdFollow";

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
/** 5e.tools splits this one by element, under names the base name cannot find. */
const KNOWN_ABSENT = new Set(["Magic Item | Ring of Elemental Command"]);
describe.skipIf(!C || process.env.RULES_TIER !== "srd-bundle")("the bundle", () => {
  const raw: Record<string, Record<string, unknown>> = {};
  const dir = join(C ?? "", "5etools-data");
  if (C) for (const f of walkDir(dir, ".json")) { const rel = relative(dir, f); if (!/index\.json$/.test(rel) && !rel.startsWith("bestiary")) raw[rel] = JSON.parse(readFileSync(f, "utf8")); }
  for (const edition of ["5.1", "5.2"] as SrdEdition[]) {
    it(`SRD ${edition} stands alone and names nothing outside the SRD`, () => {
      // The official PDF's text (pdftotext, <cache>/srd/pdf): only its words are bundled.
      const corpus = srdCorpus(readFileSync(join(C!, "srd", "pdf", edition === "5.1" ? "SRD_CC_v5.1.txt" : "SRD_CC_v5.2.1.txt"), "utf8"));
      const dropped: string[] = [];
      const pdf = join(C!, "srd", "pdf");
      const xml = join(pdf, "xml", `${edition === "5.1" ? "5.1" : "5.2.1"}.xml`);
      if (!existsSync(xml)) { mkdirSync(join(pdf, "xml"), { recursive: true }); writeFileSync(xml, execFileSync("pdftohtml", ["-xml", "-i", "-q", "-stdout", join(pdf, edition === "5.1" ? "SRD_CC_v5.1.pdf" : "SRD_CC_v5.2.1.pdf")], { maxBuffer: 1 << 28 })); }
      const follow: { report?: FollowReport } = {};
      const xmlText = readFileSync(xml, "utf8");
      const elements = srdElements(raw, edition, corpus, dropped, srdSections(xmlText), follow, srdTableRows(xmlText));
      // Features by level, against the SRD's class tables.
      const byId = new Map(elements.map((e) => [e.id, e]));
      const tableLines: string[] = [];
      const tables = srdClassTables(xmlText);
      tableLines.push(`classes read ${tables.size}`);
      for (const cls of elements.filter((e) => e.type === "Class")) {
        const t = tables.get(cls.name);
        if (!t) { tableLines.push(`no table: ${cls.name}`); continue; }
        for (const row of t) {
          const grants = cls.rules.filter((x) => x.kind === "grant" && (x.level ?? 1) === row.level).map((x) => byId.get((x as { id: string }).id)).filter((x) => !!x);
          const key = (n: string) => n.toLowerCase().replace(/\s*\(.*\)$/, "").replace(/[^a-z]+/g, "");
          // What the row says beyond numbers and dice, once our features are taken out of it.
          let rest = key(row.text.replace(/\b\d*d\d+\b/gi, " ").replace(/\((?:\d+ )?[^)]*\)/g, " ").replace(/\bunlimited\b/gi, " "));
          const ours: string[] = [];
          for (const g of grants) { const k = key(g.name); if (k && rest.includes(k)) rest = rest.replace(k, ""); else if (g.type === "Class Feature") ours.push(g.name); }
          // Ability score picks are choices rather than features.
          if (cls.rules.some((x) => (x.level ?? 1) === row.level && /ability score|\basi\b/i.test(`${(x as { name?: string }).name ?? ""}`))) rest = rest.replace("abilityscoreimprovement", "");
          rest = rest.replace(/^ft/, "").replace(/(?:\d)?ft$/, "");
          if (rest.length > 3 || ours.length) tableLines.push(`${cls.name} ${row.level}: SRD only ${rest}; here only ${ours.join(", ")}`);
        }
      }
      writeFileSync(join(C!, "srd", `srd-${edition}.class-tables.txt`), tableLines.join("\n"));
      const r = follow.report!;
      writeFileSync(join(C!, "srd", `srd-${edition}.follow.txt`), [`facts ${r.facts.length}`, ...r.facts, `texts ${r.texts.length}`, ...r.texts, `removed ${r.removed.length}`, ...r.removed, `in the SRD, not here ${r.absent.length}`, ...r.absent, `no heading found ${r.unmatched.length}`, ...r.unmatched].join("\n"));
      const allText = (e: (typeof elements)[number]) => `${e.name} ${e.description ?? ""} ${(e.sheet?.descriptions ?? []).map((d) => d.text).join(" ")}`;
      // Text from the PDF is the SRD's own, even where it names one of these (5.1's Orb of Dragonkind names Tiamat).
      const own = new Set([...r.fromPdf].map((e) => `${e.type}|${e.name}`));
      const named = elements.filter((e) => NOT_IN_SRD.test(own.has(`${e.type}|${e.name}`) ? e.name : allText(e)));
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
      // Every spell the SRD has is here with its facts; nothing else is; every class table's features are here.
      const spells = elements.filter((e) => e.type === "Spell");
      const pdfSpells = srdSections(xmlText).map(srdSpell).filter((x) => !!x);
      expect(spells.length).toBe(pdfSpells.length);
      for (const p of pdfSpells) {
        const e = spells.find((x) => x.name.replace(/\W/g, "") === p.name.replace(/\W/g, ""));
        expect(`${p.name} ${e?.setters.level?.value} ${e?.setters.school?.value}`).toBe(`${p.name} ${p.level} ${p.school}`);
      }
      expect(r.absent.filter((x) => !KNOWN_ABSENT.has(x))).toEqual([]);
      expect(tableLines.filter((l) => /SRD only [a-z]{4,}/.test(l)).filter((l) => !/^Wizard 20/.test(l))).toEqual([]);
      expect(otherSource).toEqual([]);
      expect(lines).toEqual([]);
      expect(findings).toEqual([]);
      // Only a bundle that passed reaches the app.
      mkdirSync("public/srd", { recursive: true });
      writeFileSync(join("public/srd", `srd-${edition}.json`), bundle);
    }, 300000);
  }
});

describe("the SRD's PDF as structure", () => {
  const page = (body: string) => `<pdf2xml><page number="1" position="absolute" top="0" left="0" height="1174" width="891"><fontspec id="18" size="18" family="X+GillSans-SemiBold" color="#88191f"/><fontspec id="24" size="15" family="X+Cambria" color="#231f20"/><fontspec id="15" size="14" family="X+GillSans-SemiBold" color="#231f20"/><fontspec id="11" size="14" family="X+GillSans" color="#231f20"/><fontspec id="3" size="15" family="X+Cambria" color="#231f20"/>${body}</page></pdf2xml>`;
  const t = (top: number, left: number, font: number, html: string) => `<text top="${top}" left="${left}" width="${html.length * 7}" height="16" font="${font}">${html}</text>`;
  const xml = page([
    t(100, 95, 18, "<b>Reincarnate</b>"),
    t(120, 95, 24, "<i>Level 5 Necromancy (Druid)</i>"),
    t(145, 95, 15, "<b>Casting Time:</b>"), t(145, 190, 11, " 1 hour"),
    t(162, 95, 15, "<b>Range:</b>"), t(162, 140, 11, " Touch"),
    t(179, 95, 15, "<b>Components:</b>"), t(179, 190, 11, " V, S, M (rare oils,"),
    t(196, 95, 11, "which the spell consumes)"),
    t(213, 95, 15, "<b>Duration:</b>"), t(213, 160, 11, " Instantaneous"),
    t(240, 95, 3, "You touch a dead Humanoid in an un-"),
    t(258, 95, 3, "occupied space."),
    t(276, 95, 3, "  A new paragraph."),
    t(300, 110, 15, "<b>1d10</b>"), t(300, 260, 15, "<b>Species</b>"),
    t(320, 110, 11, "1"), t(320, 260, 11, "Roll again."),
    t(350, 95, 18, "<b>Other Heading</b>"),
    t(372, 95, 3, "Text."),
  ].join(""));
  it("reads a spell's facts, its paragraphs and its table, and stops at the next heading", () => {
    const s = srdSections(xml);
    expect(s.map((x) => x.name)).toEqual(["Reincarnate", "Other Heading"]);
    const spell = srdSpell(s[0])!;
    expect(spell).toMatchObject({ level: 5, school: "Necromancy", classes: ["Druid"], time: "1 hour", range: "Touch", components: "V, S, M (rare oils, which the spell consumes)", duration: "Instantaneous" });
    expect(spell.html).toBe("<p>You touch a dead Humanoid in an unoccupied space.</p><p>A new paragraph.</p><table><thead><tr><th>1d10</th><th>Species</th></tr></thead><tbody><tr><td>1</td><td>Roll again.</td></tr></tbody></table>");
  });
  it("a gear table's row gives its facts in either edition's order", () => {
    expect(gearRow("Longsword 15 gp 1d8 slashing 3 lb. Versatile (1d10)")).toMatchObject({ cost: "15", currency: "gp", dice: "1d8", type: "slashing", lb: 3 });
    expect(gearRow("Entertainer's Pack 58½ lb. 40 GP")).toMatchObject({ lb: 58.5, cost: "40" });
    expect(gearRow("Chain Mail 16 Str 13 Disadvantage 55 lb. 75 GP")).toMatchObject({ ac: "16", str: "13", stealth: true, lb: 55, cost: "75" });
  });
  it("what the SRD says replaces 5e.tools' copy, and an entry it lacks leaves", () => {
    const spell = (name: string, school: string) => ({ id: name, type: "Spell", name, source: "x", supports: ["Wizard"], rules: [], description: "<p>Book words.</p>", setters: { level: { value: "5", attrs: {} }, school: { value: school, attrs: {} }, time: { value: "1 hour", attrs: {} }, range: { value: "touch", attrs: {} }, duration: { value: "Instantaneous", attrs: {} } } }) as never;
    const { elements, report } = followSrd([spell("Reincarnate", "Transmutation"), spell("Not In The SRD", "Evocation")], srdSections(xml), "5.2");
    expect(elements.map((e) => e.name)).toEqual(["Reincarnate"]);
    expect(elements[0].setters.school.value).toBe("Necromancy");
    expect(elements[0].setters.range.value).toBe("touch");
    expect(elements[0].supports).toEqual(["Druid"]);
    expect(elements[0].description).toContain("Roll again.");
    expect(report.removed).toEqual(["Spell | Not In The SRD"]);
  });
});
