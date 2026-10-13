/**
 * The rules tests. They build characters the way a player would, then check every one against the rules
 * (rulesCheck.ts, with the 5e.tools class data) and check its exports: the JSON file, the 2024 and 2014 sheets and
 * the Soul Forge sheet. Run with: node scripts/rules-check.mjs  (it downloads what is needed and sets these):
 *   SOULFORGE_RULES=<cache folder>   RULES_SEED=<number, optional>   RULES_OUT=<folder for the files, optional>
 * A run passes only when a fresh batch comes out with no findings at all.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument, PDFTextField } from "pdf-lib";
import { loadRegistry } from "./fixture";
import { resolve } from "./engine";
import { buildSheet } from "./sheet";
import { autoFill } from "./autofill";
import { normalizeCharacter, type Character } from "./character";
import { randomBatch } from "./randomBatch";
import { randomCharacter } from "./randomCharacter";
import { multiclassLockFor } from "./multiclassLock";
import { checkCharacter, type Finding, type RefClass } from "./rulesCheck";
import { ALL_CONTENT, BookIndex, hiddenBy } from "./books";
import { buildFillData } from "../sheets/data";
import { fillOfficialSheet } from "../sheets/official";
import { fillDldm } from "../sheets/dldm";
import { buildPdf, DEFAULT_PDF_OPTIONS } from "../pdf/exportPdf";
import { BUILDS } from "./builds";
import { importForeignCharacter } from "./foreign";

const CACHE = process.env.SOULFORGE_RULES;
const OUT = process.env.RULES_OUT;
const SEED = Number(process.env.RULES_SEED) || Date.now() % 2147483647;

/**
 * What a filled sheet must show, read back as text (pdftotext): the name, AC, maximum hit points, the six scores,
 * the proficiency bonus, each spell save DC and the first weapon. Empty when pdftotext is missing.
 */
function sheetShows(bytes: Uint8Array, ch: Character, sh: ReturnType<typeof buildSheet>): string[] {
  let text = "";
  try {
    const file = join(tmpdir(), `sf-sheet-${process.pid}-${Math.random().toString(36).slice(2)}.pdf`);
    writeFileSync(file, bytes);
    text = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    rmSync(file, { force: true });
  } catch { return []; }
  const flat = text.replace(/\s+/g, " ");
  const has = (v: string | number) => new RegExp(`(^|[^\\d])${String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\d]|$)`).test(flat);
  const words = (v: string) => flat.toLowerCase().includes(v.toLowerCase().slice(0, 10));
  const miss: string[] = [];
  if (ch.name && !words(ch.name)) miss.push(`name "${ch.name}"`);
  if (!has(sh.ac.value)) miss.push(`AC ${sh.ac.value}`);
  if (!has(sh.hp)) miss.push(`HP ${sh.hp}`);
  for (const a of sh.abilities) if (!has(a.score)) miss.push(`${a.id} ${a.score}`);
  if (!flat.includes(`+${sh.proficiency}`)) miss.push(`proficiency +${sh.proficiency}`);
  for (const l of sh.casting) if (l.dc > 0 && !has(l.dc)) miss.push(`${l.name} spell save DC ${l.dc}`);
  const weapon = sh.attacks.find((a) => !a.hiddenByEdit)?.name;
  if (weapon && !words(weapon)) miss.push(`weapon ${weapon}`);
  return miss;
}

describe.skipIf(!CACHE)("rules", () => {
  const reg = CACHE ? loadRegistry(join(CACHE, "elements-master")) : undefined!;
  const ref: RefClass[] = CACHE ? JSON.parse(readFileSync(join(CACHE, "rules-ref.json"), "utf8")) : [];
  const sheets = CACHE ? join(CACHE, "sheets") : "";
  const font = { regular: readFileSync("node_modules/dejavu-fonts-ttf/ttf/DejaVuSansCondensed.ttf"), bold: readFileSync("node_modules/dejavu-fonts-ttf/ttf/DejaVuSansCondensed-Bold.ttf") };
  let seed = SEED;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const filters = { legacy: true, playtest: false, unusual: false };
  const report: string[] = [`Seed ${SEED}`];

  /** Rules and exports for one character. */
  async function check(label: string, ch: Character): Promise<Finding[]> {
    const r = resolve(ch, reg);
    const sh = buildSheet(r);
    const found = checkCharacter(r, sh, ref);
    // The JSON file: saved and read back, the character is the same.
    const back = normalizeCharacter(JSON.parse(JSON.stringify(ch)));
    const sh2 = buildSheet(resolve(back, reg));
    for (const k of ["hp", "proficiency", "level", "speed", "initiative"] as const) if (sh2[k] !== sh[k]) found.push({ rule: "JSON file round trip", detail: `${k}: ${sh[k]} became ${sh2[k]}` });
    if (sh2.ac.value !== sh.ac.value) found.push({ rule: "JSON file round trip", detail: `AC ${sh.ac.value} became ${sh2.ac.value}` });
    // The sheets: filled, and the fillable ones say what the character says.
    const data = buildFillData(r, sh);
    const safe = label.replace(/[^\w-]+/g, "_").slice(0, 60);
    const save = (name: string, bytes: Uint8Array | string) => OUT && writeFileSync(join(OUT, `${safe}-${name}`), bytes);
    save("character.json", JSON.stringify(ch, null, 2));
    try {
      const p24 = await fillOfficialSheet(readFileSync(join(sheets, "2024-print.pdf")), "2024-print.pdf", data, font);
      save("2024.pdf", p24.bytes);
      for (const miss of sheetShows(p24.bytes, ch, sh)) found.push({ rule: "2024 sheet shows the character", detail: miss });
    } catch (e) { found.push({ rule: "2024 sheet export", detail: (e as Error).message }); }
    try {
      const p14 = await fillOfficialSheet(readFileSync(join(sheets, "2014-3pages.pdf")), "CharacterSheet_3Pgs_ Complete.pdf", data, font);
      save("2014.pdf", p14.bytes);
      const form = (await PDFDocument.load(p14.bytes)).getForm();
      const txt = (n: string) => { try { const f = form.getField(n); return f instanceof PDFTextField ? (f.getText() ?? "") : ""; } catch { return ""; } };
      const expect14: [string, string][] = [["CharacterName", ch.name], ["AC", String(sh.ac.value)], ["HPMax", String(sh.hp)], ["STR", String(sh.abilities[0].score)], ["DEX", String(sh.abilities[1].score)], ["ProfBonus", `+${sh.proficiency}`]];
      for (const [f, v] of expect14) if (txt(f).trim() !== v) found.push({ rule: "2014 sheet shows the character", detail: `${f}: "${txt(f)}", should be "${v}"` });
    } catch (e) { found.push({ rule: "2014 sheet export", detail: (e as Error).message }); }
    try {
      const d = await fillDldm(readFileSync(join(sheets, "dldm-2024.pdf")), data, { pages: ["p1a", "p2a", "spells"], font });
      save("dldm.pdf", d.bytes);
      if (d.missing.length) found.push({ rule: "DLDM sheet fields", detail: d.missing.join(", ") });
    } catch (e) { found.push({ rule: "DLDM sheet export", detail: (e as Error).message }); }
    try {
      const sf = await buildPdf(r, sh, { ...DEFAULT_PDF_OPTIONS, paper: "letter" }, font);
      save("soulforge.pdf", sf);
      for (const miss of sheetShows(sf, ch, sh)) found.push({ rule: "Soul Forge sheet shows the character", detail: miss });
      if ((await PDFDocument.load(sf)).getPageCount() < 1) found.push({ rule: "Soul Forge sheet export", detail: "no pages" });
    } catch (e) { found.push({ rule: "Soul Forge sheet export", detail: (e as Error).message }); }
    report.push(`\n### ${label}\n${found.length ? found.map((f) => `- ${f.rule}: ${f.detail}`).join("\n") : "- no findings"}`);
    return found;
  }
  const run = async (label: string, chars: [string, Character][]) => {
    const all: string[] = [];
    for (const [name, ch] of chars) for (const f of await check(`${label} ${name}`, ch)) all.push(`${name}: ${f.rule}: ${f.detail}`);
    return all;
  };
  if (OUT) mkdirSync(OUT, { recursive: true });
  const writeReport = () => OUT && writeFileSync(join(OUT, "report.md"), report.join("\n"));

  const batch = CACHE ? randomBatch(reg, 10, filters, rng) : [];

  it("a batch of 10 varied random characters", async () => {
    expect(await run("batch", batch.map((c) => [c.name, c]))).toEqual([]);
  }, 1800000);

  it("level 20 in every class, varied species, subclasses and feats", async () => {
    const books = new BookIndex(reg);
    const classes = reg.ofType("Class").filter((c) => !c.compendiumHidden && !hiddenBy(books.info(c.source), c.source, filters));
    const chars: [string, Character][] = classes.map((c) => {
      const ch = randomCharacter(reg, 20, filters, rng, { classId: c.id, randomGear: true });
      return [`${c.name} (${c.source}) 20`, ch];
    });
    expect(await run("L20", chars)).toEqual([]);
  }, 3600000);

  it("companions and optional rules", async () => {
    const options = reg.ofType("Option").map((o) => o.id);
    const chars: [string, Character][] = Array.from({ length: 6 }, (_, i) => {
      const ch = randomCharacter(reg, 3 + Math.floor(rng() * 15), filters, rng, { companion: true, randomGear: true, options: options.filter(() => rng() < 0.5) });
      return [`companion ${i + 1}`, ch];
    });
    expect(await run("extras", chars)).toEqual([]);
  }, 1800000);

  it("levelling up five characters", async () => {
    const chars: [string, Character][] = batch.filter((c) => c.classes.reduce((n, k) => n + k.level, 0) < 18).slice(0, 5).map((c) => {
      let ch = c;
      const steps = 1 + Math.floor(rng() * 3);
      for (let s = 0; s < steps; s++) {
        const i = Math.floor(rng() * ch.classes.length);
        ch = { ...ch, classes: ch.classes.map((k, j) => (j === i ? { ...k, level: k.level + 1 } : k)) };
        ch = autoFill(ch, reg, () => rng());
      }
      return [`${c.name} +${steps}`, ch];
    });
    expect(await run("levelup", chars)).toEqual([]);
  }, 1800000);

  it("adding a second class to five characters", async () => {
    const books = new BookIndex(reg);
    const classes = reg.ofType("Class").filter((c) => !c.compendiumHidden && !hiddenBy(books.info(c.source), c.source, filters));
    const chars: [string, Character][] = [];
    for (const c of batch.filter((x) => x.classes.length === 1 && x.classes[0].level < 19)) {
      if (chars.length >= 5) break;
      const r = resolve(c, reg);
      const ok = classes.filter((k) => k.name !== reg.get(c.classes[0].classId)?.name && !multiclassLockFor(r, k.id) && !multiclassLockFor({ ...r, character: { ...c, classes: [...c.classes, { classId: k.id, level: 1 }] } } as typeof r, k.id));
      const pick = ok[Math.floor(rng() * ok.length)];
      if (!pick) continue;
      const ch = autoFill({ ...c, classes: [...c.classes, { classId: pick.id, level: 1 + Math.floor(rng() * 2) }] }, reg, () => rng());
      chars.push([`${c.name} + ${pick.name}`, ch]);
    }
    expect(await run("multiclass", chars)).toEqual([]);
  }, 1800000);

  it("known builds from the community", async () => {
    const chars: [string, Character][] = [];
    for (const b of BUILDS) {
      const ch = b.build(reg, rng);
      if (typeof ch === "string") { report.push(`\n### build ${b.name}\n- could not be made: ${ch}`); chars.push([b.name, undefined as never]); continue; }
      chars.push([b.name, ch]);
    }
    const missing = chars.filter(([, c]) => !c).map(([n]) => `${n}: could not be made from the loaded content`);
    expect([...missing, ...(await run("build", chars.filter(([, c]) => c)))]).toEqual([]);
    writeReport();
  }, 3600000);

  // Coverage: every subclass at a level with all its features, and on the way every species, background and feat
  // at least once, every level band and both rule sets. Only with RULES_TIER=full (it builds a few hundred).
  it.skipIf(process.env.RULES_TIER !== "full")("coverage: every subclass, species, background and feat", async () => {
    const books = new BookIndex(reg);
    const shown = (e: { source: string; compendiumHidden: boolean; name: string }) => !e.compendiumHidden && !/^custom\b/i.test(e.name) && !hiddenBy(books.info(e.source), e.source, filters);
    const classes = reg.ofType("Class").filter(shown);
    const species = reg.ofType("Race").filter(shown);
    const backgrounds = reg.ofType("Background").filter(shown);
    const feats = reg.ofType("Feat").filter(shown).map((f) => f.name);
    const chars: [string, Character][] = [];
    let i = 0;
    for (const cls of classes) {
      const probe = resolve({ ...randomCharacter(reg, 20, filters, rng, { classId: cls.id }), name: "probe" }, reg);
      const subSlot = probe.slots.find((sl) => sl.rule.type === "Archetype" && sl.root === `class:${cls.id}`);
      for (const sub of (subSlot?.options ?? []).filter(shown)) {
        // Every other one at 20 so all subclass features are checked; the rest spread over 3 to 19.
        const level = i % 2 === 0 ? 20 : 3 + ((i * 7) % 17);
        const ch = randomCharacter(reg, level, filters, rng, {
          classId: cls.id, raceId: species[i % species.length].id, backgroundId: backgrounds[i % backgrounds.length].id,
          prefer: [sub.name, feats[i % feats.length], feats[(i * 3 + 1) % feats.length]], randomGear: true, rollHp: i % 4 === 0,
        });
        chars.push([`${cls.name} (${cls.source}) / ${sub.name}`, ch]);
        i++;
      }
    }
    // Species and backgrounds the subclass pass did not reach.
    for (let k = i; k < Math.max(species.length, backgrounds.length); k++) {
      const cls = classes[k % classes.length];
      chars.push([`${species[k % species.length].name} ${backgrounds[k % backgrounds.length].name} ${cls.name}`, randomCharacter(reg, 1 + (k % 20), filters, rng, { classId: cls.id, raceId: species[k % species.length].id, backgroundId: backgrounds[k % backgrounds.length].id, randomGear: true })]);
    }
    report.push(`\nCoverage: ${chars.length} characters, ${classes.length} classes, ${species.length} species, ${backgrounds.length} backgrounds, ${feats.length} feats offered.`);
    expect(await run("coverage", chars)).toEqual([]);
  }, 7200000);

  // Every feat, species, background and subclass on its own, three ways of filling its choices each: nothing may be
  // left without options, nothing may point at missing content, every spell must be castable.
  it("every element on its own", () => {
    const books = new BookIndex(reg);
    const shown = (e: { source: string; compendiumHidden: boolean; name: string }) => !e.compendiumHidden && !/^custom\b/i.test(e.name) && !/unearthed|playtest/i.test(e.source) && !hiddenBy(books.info(e.source), e.source, { legacy: true, playtest: false, unusual: true });
    const found: string[] = [];
    const base = (classId: string, level: number, race: string, bg: string): Character => ({ ...randomCharacter(reg, level, { legacy: true, playtest: false, unusual: true }, rng, { classId, raceId: race, backgroundId: bg }), extras: [] });
    const probe = (label: string, c0: Character) => {
      for (let k = 0; k < 3; k++) {
        const c = autoFill(c0, reg, k ? () => rng() : undefined);
        const r = resolve(c, reg);
        const sh = buildSheet(r);
        for (const f of checkCharacter(r, sh, ref).filter((x) => /required choice has no options|refers to something missing|not castable/.test(x.rule))) found.push(`${label}: ${f.rule}: ${f.detail}`);
      }
    };
    for (const [cls, race, bg] of [["ID_WOTC_PHB24_CLASS_FIGHTER", "ID_WOTC_PHB24_RACE_HUMAN", "ID_WOTC_PHB24_BACKGROUND_SOLDIER"], ["ID_WOTC_PHB_CLASS_WIZARD", "ID_RACE_HUMAN", "ID_BACKGROUND_SOLDIER"]] as const) {
      if (!reg.get(cls)) continue;
      for (const f of reg.ofType("Feat").filter(shown)) probe(`feat ${f.name} (${f.source})`, { ...base(cls, 8, race, bg), extras: [f.id] });
      for (const sp of reg.ofType("Race").filter(shown)) probe(`species ${sp.name} (${sp.source})`, { ...base(cls, 5, sp.id, bg) });
      for (const b of reg.ofType("Background").filter(shown)) probe(`background ${b.name} (${b.source})`, { ...base(cls, 1, race, b.id) });
    }
    report.push(`\n### every element on its own\n${found.length ? found.map((f) => `- ${f}`).join("\n") : "- no findings"}`);
    expect([...new Set(found)]).toEqual([]);
  }, 3600000);

  // Characters made in Roll20 and Foundry (kept in the cache's imports folder, not in this repository). Each one
  // imports, exports, and guesses no more than it did when its baseline was written: a guess is a choice the file
  // does not settle, so a new one means the importer lost something it used to read.
  it("imported characters", async () => {
    if (!CACHE) return;
    const dir = join(CACHE, "imports");
    if (!existsSync(dir)) return;
    const basePath = join(dir, "baseline.json");
    const baseline: Record<string, number> = existsSync(basePath) ? JSON.parse(readFileSync(basePath, "utf8")) : {};
    const now: Record<string, number> = {};
    const worse: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json") && x !== "baseline.json").sort()) {
      let res;
      try { res = importForeignCharacter(JSON.parse(readFileSync(join(dir, f), "utf8")), reg); } catch (e) { worse.push(`${f}: ${(e as Error).message}`); continue; }
      now[f] = res.guessed.length;
      report.push(`\n### import ${f}\n- guessed: ${res.guessed.join("; ") || "nothing"}\n- not in the content: ${res.missing.length}`);
      const found = (await check(`import ${f}`, res.character)).filter((x) => /export|round trip|sheet/i.test(x.rule));
      for (const x of found) worse.push(`${f}: ${x.rule}: ${x.detail}`);
      if (baseline[f] !== undefined && res.guessed.length > baseline[f]) worse.push(`${f}: ${res.guessed.length} guesses, the baseline is ${baseline[f]}: ${res.guessed.join("; ")}`);
    }
    if (!existsSync(basePath) || process.env.IMPORT_BASELINE) writeFileSync(basePath, JSON.stringify(now, null, 2));
    expect(worse, worse.join("\n")).toEqual([]);
  }, 600000);

  it("writes the report", () => {
    writeReport();
    void ALL_CONTENT;
  });
});
