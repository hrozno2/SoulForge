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
// The same condensing code the app uses (it has no imports, so Node loads the TypeScript directly).
import { downloadRulesRef } from "../src/aurora/rulesRef.ts";

export const CACHE = process.env.SOULFORGE_TEST_CACHE || join(homedir(), ".soulforge-test");
const refresh = process.argv.includes("--refresh");

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r;
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
    const all = await downloadRulesRef(async (url) => (await get(url)).json());
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
