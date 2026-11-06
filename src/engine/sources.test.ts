/**
 * Every source compared (Stage D3b, RULES_TIER=sources), for what the SRD covers: the official PDF decides; the SRD API,
 * 5e.tools' own copy (as converted, before the bundle follows the SRD) and Aurora's are each compared with it. Who disagrees
 * with whom says what a difference is:
 *   - 5e.tools alone differs: our converter or its data, and every 5e.tools user sees it.
 *   - Aurora alone differs: Aurora's copy, or how it is read.
 *   - 5e.tools and Aurora agree against the PDF: the book and the SRD differ. Expected; the bundle follows the SRD.
 *   - The API alone differs: the API's mistake, not used.
 * Report: <cache>/engine/sources.md. Each kind has a ceiling and may only fall.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, it } from "vitest";
import { convertFiveTools } from "../aurora/fivetools";
import { parseElementsXml } from "../aurora/parse";
import { nodeXml } from "../aurora/fixture";
import { gearRow } from "../aurora/srdFollow";
import { srdSections, srdSpell, srdTableRows } from "../aurora/srdPdf";
import { squash } from "../aurora/srdText";
import type { AElement } from "../aurora/types";
import { walkDir } from "./testContent";

const C = process.env.SOULFORGE_RULES;
type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
const fact: Record<string, (s: unknown) => string> = {
  level: (s) => String(Number(s) || 0),
  school: (s) => norm(s),
  time: (s) => norm(s).replace(/^1 /, "").replace(/, .*$/, "").replace(/ or ritual$/, "").replace(/\b(minute|hour)s\b/, "$1").replace(/^bonus$/, "bonus action"),
  range: (s) => norm(s).replace(/ ?\(.*$/, "").replace(/\bfoot\b/, "feet").replace(/-feet.*$/, " feet").replace(/\bmiles\b/, "mile"),
  duration: (s) => norm(s).replace(/\.$/, "").replace(/^concentration,? /, "").replace(/^up to /, "").replace(/\b(minute|hour|round|day)s\b/, "$1").replace(/^one /, "1 ").replace(/^24 hour$/, "1 day").replace(/ or triggered$/, "").replace(/instantaneous.*/, "instantaneous"),
  concentration: (s) => norm(s),
  ritual: (s) => norm(s),
  v: (s) => norm(s), s: (s) => norm(s), m: (s) => norm(s),
};
const bool = (v: unknown) => (norm(v) === "true" ? "true" : "false");
function elFacts(e: AElement): Record<string, string> {
  const g = (k: string) => e.setters?.[k]?.value;
  return { level: fact.level(g("level")), school: fact.school(g("school")), time: fact.time(g("time")), range: fact.range(g("range")), duration: fact.duration(g("duration")), concentration: bool(g("isConcentration")), ritual: bool(g("isRitual")), v: bool(g("hasVerbalComponent")), s: bool(g("hasSomaticComponent")), m: bool(g("hasMaterialComponent")) };
}
const AURORA_SOURCE: Record<string, RegExp> = { "5.1": /^(Player.s Handbook|System Reference Document)$/, "5.2": /^Player.s Handbook \(2024\)$/ };
const FIVE_SOURCE: Record<string, RegExp> = { "5.1": /^Player.s Handbook(?! \(2024\))|^PHB$/, "5.2": /2024|^XPHB$/ };

/** How many of each kind are known and explained (docs/SRD-DIFF.md). A kind may only fall. */
const KNOWN: Record<string, number> = {
  "5.1 API alone": 4, "5.1 gear Aurora alone": 8,
  "5.2 5e.tools alone": 4, "5.2 API alone": 25, "5.2 book and SRD differ": 1, "5.2 Aurora alone": 1, "5.2 gear Aurora alone": 11, "5.2 gear 5e.tools alone": 1,
};

it.skipIf(!C || process.env.RULES_TIER !== "sources")("every source against the SRD", () => {
  const json: Record<string, unknown> = {};
  const dir = join(C!, "5etools-data");
  for (const f of walkDir(dir, ".json")) { const rel = relative(dir, f); if (!/index\.json$/.test(rel) && !rel.startsWith("bestiary")) json[rel] = JSON.parse(readFileSync(f, "utf8")); }
  const five = convertFiveTools({ files: json as never });
  const aurora: AElement[] = [];
  for (const f of walkDir(join(C!, "elements-master"), ".xml")) { try { aurora.push(...parseElementsXml(readFileSync(f, "utf8").replace(/^﻿/, ""), nodeXml, f).elements); } catch { /* not a content file */ } }
  const lines: string[] = ["# Every source against the SRD", ""];
  const counts = new Map<string, number>();
  const add = (kind: string, row: string, groups: Map<string, string[]>) => { counts.set(kind, (counts.get(kind) ?? 0) + 1); if (!groups.has(kind)) groups.set(kind, []); groups.get(kind)!.push(row); };
  for (const [edition, xmlName, apiDir] of [["5.1", "5.1", "2014"], ["5.2", "5.2.1", "2024"]] as const) {
    const xml = readFileSync(join(C!, "srd", "pdf", "xml", `${xmlName}.xml`), "utf8");
    const pdf = srdSections(xml).map(srdSpell).filter((x) => !!x);
    const pick = (els: AElement[], type: string, source: RegExp) => { const m = new Map<string, AElement>(); for (const e of els) if (e.type === type && source.test(e.source ?? "")) m.set(squash(e.name), e); return m; };
    const fiveSpells = pick(five, "Spell", FIVE_SOURCE[edition]);
    const auroraSpells = pick(aurora, "Spell", AURORA_SOURCE[edition]);
    const apiSpells = new Map((JSON.parse(readFileSync(join(C!, "srd-api", apiDir, "spells.json"), "utf8")) as J[]).map((s) => [squash(s.name), s]));
    const groups = new Map<string, string[]>();
    let seenFive = 0; let seenAurora = 0;
    for (const p of pdf) {
      const k = squash(p.name);
      const f = fiveSpells.get(k); const a = auroraSpells.get(k); const api = apiSpells.get(k);
      if (f) seenFive++; if (a) seenAurora++;
      const comps = p.components.replace(/\(.*$/, "");
      const want: Record<string, string> = { level: String(p.level), school: fact.school(p.school), time: fact.time(p.time), range: fact.range(p.range), duration: fact.duration(p.duration), concentration: String(/concentration/i.test(p.duration)), ritual: String(p.ritual), v: String(/\bV\b/.test(comps)), s: String(/\bS\b/.test(comps)), m: String(/\bM\b/.test(comps)) };
      const ff = f ? elFacts(f) : undefined;
      const fa = a ? elFacts(a) : undefined;
      const fapi: Record<string, string> | undefined = api ? { level: String(api.level), school: fact.school(api.school?.name), time: fact.time(api.casting_time), range: fact.range(api.range), duration: fact.duration(api.duration), concentration: String(!!api.concentration), ritual: String(!!api.ritual), v: String((api.components ?? []).includes("V")), s: String((api.components ?? []).includes("S")), m: String((api.components ?? []).includes("M")) } : undefined;
      for (const key of Object.keys(want)) {
        const w = want[key];
        const bad5 = ff && ff[key] !== w; const badA = fa && fa[key] !== w; const badApi = fapi && fapi[key] !== w;
        if (!bad5 && !badA && !badApi) continue;
        const who = bad5 && badA ? "book and SRD differ" : bad5 ? "5e.tools alone" : badA ? "Aurora alone" : "API alone";
        add(`${edition} ${who}`, `${p.name}, ${key}: SRD ${w}; 5e.tools ${ff?.[key] ?? "-"}; Aurora ${fa?.[key] ?? "-"}; API ${fapi?.[key] ?? "-"}`, groups);
      }
    }
    // Gear, by the PDF's table rows.
    const rows = srdTableRows(xml).filter((r) => /\d/.test(r) && /\b(?:CP|SP|EP|GP|PP)\b|\blb\b/i.test(r) && !/^(?:or|and|the|a)\b|[;:]/i.test(r));
    const rowBy = new Map(rows.map((r) => [squash(r.replace(/[\d½¼⅛].*$/, "")), r]));
    for (const type of ["Weapon", "Armor", "Item"]) {
      const fm = pick(five, type, FIVE_SOURCE[edition]); const am = pick(aurora, type, AURORA_SOURCE[edition]);
      for (const [k, r] of rowBy) {
        const f = fm.get(k); const a = am.get(k);
        if (!f && !a) continue;
        const g = gearRow(r);
        const gold = (e?: AElement) => (e?.setters?.cost ? `${e.setters.cost.value}${String(e.setters.cost.attrs?.currency ?? "gp").toLowerCase()}` : undefined);
        const lb = (e?: AElement) => (e?.setters?.weight?.attrs?.lb !== undefined ? Number(e.setters.weight.attrs.lb) : undefined);
        const dmg = (e?: AElement) => (e?.setters?.damage ? norm(`${e.setters.damage.value} ${e.setters.damage.attrs?.type ?? ""}`) : undefined);
        const cmp = (key: string, want: unknown, vf: unknown, va: unknown) => {
          if (want === undefined) return;
          const bad5 = vf !== undefined && vf !== want; const badA = va !== undefined && va !== want;
          if (!bad5 && !badA) return;
          const who = bad5 && badA ? "book and SRD differ" : bad5 ? "5e.tools alone" : "Aurora alone";
          add(`${edition} gear ${who}`, `${r.slice(0, 30)}, ${key}: SRD ${want}; 5e.tools ${vf ?? "-"}; Aurora ${va ?? "-"}`, groups);
        };
        cmp("cost", g.cost ? `${g.cost}${g.currency}` : undefined, gold(f), gold(a));
        cmp("weight", g.lb, lb(f), lb(a));
        if (type === "Weapon") cmp("damage", g.dice ? norm(`${g.dice} ${g.type}`) : undefined, dmg(f), dmg(a));
      }
    }
    lines.push(`## SRD ${edition}: ${pdf.length} spells; found in 5e.tools ${seenFive}, in Aurora ${seenAurora}`, "");
    for (const [kind, rowsOf] of [...groups].sort()) lines.push(`### ${kind} (${rowsOf.length})`, ...rowsOf.map((r) => `- ${r}`), "");
  }
  mkdirSync(join(C!, "engine"), { recursive: true });
  writeFileSync(join(C!, "engine", "sources.md"), lines.join("\n"));
  const over = [...counts].filter(([k, n]) => n > (KNOWN[k] ?? 0)).map(([k, n]) => `${k}: ${n}, known ${KNOWN[k] ?? 0}`);
  console.log(`Sources: ${[...counts].map(([k, n]) => `${k} ${n}`).join("; ")}`);
  expect(over).toEqual([]);
}, 300000);
