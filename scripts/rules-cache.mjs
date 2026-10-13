// Downloads what the rules tests check against into a local cache (~/.soulforge-test, or SOULFORGE_TEST_CACHE):
//  - the AuroraLegacy content, the same content players load, and
//  - the 5e.tools class data from GitHub, condensed into rules-ref.json: hit dice, saving throws, spell slots,
//    cantrips, prepared and known spells, feat levels, multiclass requirements and every class and subclass
//    feature by level, for the 2014 and the 2024 rules.
// Neither is part of this repository. Usage: node scripts/rules-cache.mjs [--refresh]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const CACHE = process.env.SOULFORGE_TEST_CACHE || join(homedir(), ".soulforge-test");
const refresh = process.argv.includes("--refresh");
const CLASSES = ["artificer", "barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"];
const FIVE = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/class";

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r;
}

const AB = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" };
const strip = (s) => String(s).replace(/\{@\w+ ([^|}]*)[^}]*\}/g, "$1").trim();
const feat = (f) => {
  const ref = typeof f === "string" ? f : f.classFeature ?? f.subclassFeature;
  const p = ref.split("|");
  // Class features: name|class|classSource|level|source; a source of its own marks an optional feature (Tasha's).
  // Subclass features: name|class|classSource|subclass|subclassSource|level|source, the same way.
  const optional = typeof f === "string" ? (p.length === 5 && !!p[4]) || (p.length === 7 && !!p[6]) : false;
  return { name: strip(p[0]), optional, level: Number(p[p.length - 1].match(/^\d+$/) ? p[p.length - 1] : p.find((x, i) => i > 0 && /^\d+$/.test(x))), subclass: typeof f === "object" && !!f.gainSubclassFeature };
};

function condense(file) {
  const out = [];
  for (const c of file.class ?? []) {
    const groups = c.classTableGroups ?? [];
    const slotGroup = groups.find((g) => g.rowsSpellProgression);
    const flat = groups.find((g) => g.colLabels?.some((l) => /^Spell Slots$/i.test(strip(l))) && g.colLabels?.some((l) => /Slot Level/i.test(strip(l))));
    let pact;
    if (flat) {
      const si = flat.colLabels.findIndex((l) => /^Spell Slots$/i.test(strip(l)));
      const li = flat.colLabels.findIndex((l) => /Slot Level/i.test(strip(l)));
      pact = { slots: flat.rows.map((r) => Number(r[si])), level: flat.rows.map((r) => Number(String(strip(r[li])).match(/\d/)?.[0])) };
    }
    const features = (c.classFeatures ?? []).map(feat);
    const req = c.multiclassing?.requirements;
    out.push({
      name: c.name, source: c.source, edition: c.edition ?? (c.source === "XPHB" ? "one" : "classic"),
      hd: c.hd?.faces, saves: (c.proficiency ?? []).map((a) => AB[a]),
      caster: c.casterProgression ?? null,
      cantrips: c.cantripProgression ?? null,
      prepared: c.preparedSpellsProgression ?? null,
      preparedFormula: typeof c.preparedSpells === "string" ? c.preparedSpells : null,
      known: c.spellsKnownProgression ?? null,
      slots: slotGroup ? slotGroup.rowsSpellProgression : null,
      pact: pact ?? null,
      features,
      subclassLevel: features.find((f) => f.subclass)?.level ?? null,
      asiLevels: features.filter((f) => /^Ability Score Improvement$/i.test(f.name)).map((f) => f.level),
      epicBoon: c.featProgression?.find((p) => /epic boon/i.test(p.name))?.progression ? Number(Object.keys(c.featProgression.find((p) => /epic boon/i.test(p.name)).progression)[0]) : null,
      multiclass: req ? Object.fromEntries(Object.entries(req).filter(([k]) => AB[k]).map(([k, v]) => [AB[k], v])) : null,
      multiclassOr: req?.or ? req.or.map((o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [AB[k], v]))) : null,
      primaryAbility: c.primaryAbility ? c.primaryAbility.map((o) => Object.keys(o).map((k) => AB[k])) : null,
      subclasses: (file.subclass ?? []).filter((s) => s.className === c.name && s.classSource === c.source).map((s) => ({ name: s.name, shortName: s.shortName, source: s.source, caster: s.casterProgression ?? null, features: (s.subclassFeatures ?? []).map(feat) })),
    });
  }
  return out;
}

export async function ensureCache() {
  mkdirSync(CACHE, { recursive: true });
  const elements = join(CACHE, "elements-master");
  if (refresh || !existsSync(elements)) {
    console.log("Downloading the AuroraLegacy content...");
    const zip = join(CACHE, "elements.zip");
    writeFileSync(zip, Buffer.from(await (await get("https://github.com/AuroraLegacy/elements/archive/refs/heads/master.zip")).arrayBuffer()));
    execSync(`rm -rf "${elements}" && unzip -q "${zip}" -d "${CACHE}"`);
  }
  const ref = join(CACHE, "rules-ref.json");
  if (refresh || !existsSync(ref)) {
    console.log("Downloading the 5e.tools class data...");
    const all = [];
    for (const c of CLASSES) all.push(...condense(await (await get(`${FIVE}/class-${c}.json`)).json()));
    writeFileSync(ref, JSON.stringify(all));
  }
  // Blank sheets for the export checks, from their makers' own addresses (the same links the app offers).
  const sheets = join(CACHE, "sheets");
  mkdirSync(sheets, { recursive: true });
  const SHEETS = [
    ["2024-print.pdf", "https://media.dndbeyond.com/compendium-images/phb/downloads/DnD_2024_Character-Sheet.pdf"],
    ["dldm-2024.pdf", "https://drive.usercontent.google.com/download?id=120ePGYWD6NmExoEefO1wSOQA_gMhqaqy&export=download"],
  ];
  for (const [file, url] of SHEETS) {
    if (refresh || !existsSync(join(sheets, file))) writeFileSync(join(sheets, file), Buffer.from(await (await get(url)).arrayBuffer()));
  }
  if (refresh || !existsSync(join(sheets, "2014-3pages.pdf"))) {
    const zip = join(sheets, "2014.zip");
    writeFileSync(zip, Buffer.from(await (await get("https://media.dndbeyond.com/compendium-images/marketing/5e_charactersheets.zip")).arrayBuffer()));
    execSync(`cd "${sheets}" && rm -rf z && mkdir z && unzip -q -o "${zip}" -d z && cp "$(find z -name 'CharacterSheet_3Pgs*' | head -1)" 2014-3pages.pdf && rm -rf z`);
  }
  return { elements, ref, sheets };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const { elements, ref, sheets } = await ensureCache();
  console.log(`Sheets: ${sheets}`);
  const n = JSON.parse(readFileSync(ref, "utf8")).length;
  console.log(`Content: ${elements}\nRules reference: ${ref} (${n} classes)`);
}
