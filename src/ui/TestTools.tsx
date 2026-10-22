/**
 * Tools only in the test build (scripts/test-app.sh sets VITE_TEST_TOOLS=1): make 10 varied test characters, and
 * export every test character as JSON, the 2024 sheet, the 2014 sheet and the Soul Forge sheet in one zip.
 */
import type { ARegistry } from "../aurora/registry";
import { normalizeCharacter, uid, type Character } from "../aurora/character";
import { listCharacters, listTemplates, saveCharacterRecord, templateBytes } from "../aurora/storage";
import { randomBatch } from "../aurora/randomBatch";
import { resolve } from "../aurora/engine";
import { buildSheet } from "../aurora/sheet";
import { buildFillData } from "../sheets/data";
import { fillOfficialSheet } from "../sheets/official";
import { buildPdf, DEFAULT_PDF_OPTIONS } from "../pdf/exportPdf";
import { saveFile } from "../store";
import { getSettings } from "./Settings";

export const testToolsEnabled = import.meta.env.VITE_TEST_TOOLS === "1";

export async function makeTestBatch(reg: ARegistry): Promise<{ id: string; ch: Character }[]> {
  const p = getSettings();
  const batch = randomBatch(reg, 10, { legacy: p.showLegacy, playtest: p.showPlaytest, unusual: p.showUnusual });
  const out: { id: string; ch: Character }[] = [];
  for (const ch of batch) {
    const id = uid();
    const classes = ch.classes.map((c) => `${reg.get(c.classId)?.name ?? "?"} ${c.level}`).join(" / ");
    await saveCharacterRecord({ id, name: ch.name, summary: [reg.get(ch.race ?? "")?.name, classes].filter(Boolean).join(" "), updated: Date.now(), data: ch });
    out.push({ id, ch });
  }
  return out;
}

/** Every saved character whose name starts with "Test", with its files, in one zip. Returns a note. */
export async function testExport(reg: ARegistry, onProgress: (s: string) => void): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const { loadFonts } = await import("../pdf/fonts");
  const fonts = await loadFonts();
  const templates = await listTemplates();
  const t2024 = templates.find((t) => t.kind === "official" && t.layout === "2024") ?? templates.find((t) => t.kind.startsWith("wotc2024"));
  const t2014 = templates.find((t) => t.kind === "official" && (t.layout === "3p" || t.layout === "classic"));
  const b2024 = t2024 ? new Uint8Array(await templateBytes(t2024.id)) : undefined;
  const b2014 = t2014 ? new Uint8Array(await templateBytes(t2014.id)) : undefined;
  const zip = new JSZip();
  const notes: string[] = [];
  if (!b2024) notes.push("No official 2024 sheet is stored; get it on Sheet, Export, Manage sheets.");
  if (!b2014) notes.push("No classic 2014 sheet is stored; get it on Sheet, Export, Manage sheets.");
  const list = (await listCharacters()).filter((c) => /^test\b/i.test(c.name));
  let n = 0;
  for (const rec of list) {
    n++;
    onProgress(`Exporting ${n} of ${list.length}: ${rec.name}`);
    const ch = normalizeCharacter(rec.data);
    const r = resolve(ch, reg);
    const sh = buildSheet(r);
    const data = buildFillData(r, sh, { allSpells: true });
    const base = rec.name.replace(/[^\w -]+/g, "").trim() || rec.id;
    zip.file(`${base}/${base}.json`, JSON.stringify(ch, null, 2));
    try { zip.file(`${base}/${base} - Soul Forge.pdf`, await buildPdf(r, sh, { ...DEFAULT_PDF_OPTIONS, paper: getSettings().paper }, fonts)); } catch (e) { notes.push(`${rec.name}: Soul Forge sheet failed: ${(e as Error).message}`); }
    if (b2024) try { zip.file(`${base}/${base} - 2024.pdf`, (await fillOfficialSheet(b2024, t2024!.name, data, fonts)).bytes); } catch (e) { notes.push(`${rec.name}: 2024 sheet failed: ${(e as Error).message}`); }
    if (b2014) try { zip.file(`${base}/${base} - 2014.pdf`, (await fillOfficialSheet(b2014, t2014!.name, data, fonts)).bytes); } catch (e) { notes.push(`${rec.name}: 2014 sheet failed: ${(e as Error).message}`); }
  }
  if (!list.length) return "No characters named \"Test ...\". Make a test batch first.";
  if (notes.length) zip.file("NOTES.txt", notes.join("\n"));
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const ok = await saveFile(`soulforge-test-export-${new Date().toISOString().slice(0, 10)}.zip`, bytes, "application/zip");
  return ok ? `Exported ${list.length} test characters.${notes.length ? ` ${notes.length} notes in NOTES.txt.` : ""}` : "Cancelled.";
}

/**
 * Dev server only (the browser test run, docs/PROMPT-ui-check.md): loads the test cache's Aurora files and 5e.tools
 * data, served by the dev server, as two ordinary content sources, through the same storage the app uses.
 */
export async function loadTestContent(onProgress: (s: string) => void): Promise<string> {
  const { idbFileCache, saveSource } = await import("../aurora/storage");
  const { storeFiveTools } = await import("../aurora/content");
  const list = (await (await fetch("/__testcontent/list")).json()) as { aurora: string[]; fivetools: string[] };
  // Aurora's internal and essentials files first, as the tests load them (later files override earlier ones).
  const aurora = [...list.aurora].sort((a, b) => Number(/internal|ALE/.test(b)) - Number(/internal|ALE/.test(a)));
  const root = "local://Test content (Aurora)";
  const urls: string[] = [];
  let n = 0;
  const get = async (p: string, set = "") => (await fetch(`/__testcontent/file?p=${encodeURIComponent(p)}${set ? `&set=${set}` : ""}`)).text();
  for (const p of aurora) {
    const url = `${root}/${p}`;
    await idbFileCache.put(url, await get(p), root);
    urls.push(url);
    if (++n % 200 === 0) onProgress(`Aurora files: ${n} of ${aurora.length}`);
  }
  await saveSource({ url: root, name: "Test content (Aurora)", kind: "local", format: "aurora", tree: { url: root, name: "Test content (Aurora)", description: "The test cache's Aurora files", version: "local", files: urls, children: [] }, disabled: [], versions: {}, lastChecked: Date.now(), fileCount: urls.length });
  const files = new Map<string, string>();
  n = 0;
  for (const p of list.fivetools) {
    files.set(p, await get(p, "5etools"));
    if (++n % 50 === 0) onProgress(`5e.tools files: ${n} of ${list.fivetools.length}`);
  }
  await saveSource(await storeFiveTools("Test content (5e.tools)", files));
  return `Loaded ${urls.length} Aurora files and ${files.size} 5e.tools files.`;
}
