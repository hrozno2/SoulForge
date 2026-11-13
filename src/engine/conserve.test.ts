/**
 * Nothing dropped between the engine and the paper (docs/ENGINE-LEGAL-PLAN.md, W4; RULES_TIER=conserve). For random
 * characters on each content set, everything the engine gives the character is counted where a player would look for
 * it: features on the sheet, spells in a casting line, trainings in the proficiency lists, and all of it again in the
 * data the printed and fillable sheets are filled from (buildFillData). Each miss is listed by kind, with an example,
 * in <cache>/engine/conserve.md. The gate: no more misses than the last accepted count (RULES_SNAPSHOT=1 accepts).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { resolve } from "../aurora/engine";
import { randomCharacter } from "../aurora/randomCharacter";
import { buildSheet, stripHtml } from "../aurora/sheet";
import { buildFillData } from "../sheets/data";
import { conceptOf } from "./concepts";
import { loadContentSet, loadTestContent } from "./testContent";

const C = process.env.SOULFORGE_RULES;
const FEATURE_TYPES = /^(Racial Trait|Class Feature|Archetype Feature|Feat|Feat Feature|Background Feature|Class Feature Option|Optional Feature)$/;
const key = (s: string) => s.toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim();
/** Letters and digits only, one space between words: "Thieves' Tools" and "thieves-tools" are the same words. */
const words = (s: string) => s.toLowerCase().replace(/['’‘`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export function conserve(r: ReturnType<typeof resolve>): { kind: string; what: string }[] {
  const sh = buildSheet(r);
  const fill = buildFillData(r, sh, { allSpells: false });
  // Every text value the sheets are filled from, read as text (not as JSON: "Robe\n2 Book" must not read "robe n2").
  const texts: string[] = [];
  const collect = (v: unknown) => { if (typeof v === "string") texts.push(v); else if (Array.isArray(v)) v.forEach(collect); else if (v && typeof v === "object") Object.values(v).forEach(collect); };
  collect(fill);
  const printed = key(texts.join(" | "));
  const printedWords = words(texts.join(" | "));
  const misses: { kind: string; what: string }[] = [];
  const miss = (kind: string, what: string) => misses.push({ kind, what });
  const onSheet = new Set(sh.features.map((f) => f.id));
  // Features: an active feature with text of its own, not hidden by its content, is on the sheet and in the print.
  for (const a of r.active) {
    if (!FEATURE_TYPES.test(a.el.type)) continue;
    const text = stripHtml(a.el.description ?? "").trim();
    const hidden = !!a.el.sheet && !a.el.sheet.display;
    if (hidden || text.length < 40) continue;
    if (!onSheet.has(a.el.id)) { miss(`feature not on the sheet (${a.el.type})`, `${a.el.name} [${a.el.source}]`); continue; }
    const name = key(sh.features.find((f) => f.id === a.el.id)!.name.replace(/^level \d+:\s*/i, ""));
    if (!printed.includes(name.slice(0, 40))) miss(`feature on the sheet, not in the print data (${a.el.type})`, `${a.el.name} [${a.el.source}]`);
  }
  // Spells: every spell the character has (granted, or picked in a spell choice) is in a casting line and printed.
  const lines = new Set(sh.casting.flatMap((c) => [...c.cantripsKnown, ...c.spells, ...c.granted]).map((p) => p.id));
  const lineNames = new Set([...lines].map((id) => key(r.reg.get(id)?.name ?? id)));
  for (const a of r.active) {
    if (a.el.type !== "Spell") continue;
    if (!lines.has(a.el.id) && !lineNames.has(key(a.el.name))) { miss("spell not in a casting line", `${a.el.name} [${a.el.source}]`); continue; }
  }
  const printedSpells = new Set(fill.spells.map((s) => key(s.name)));
  for (const c of sh.casting) for (const p of [...c.cantripsKnown, ...c.granted, ...c.spells.filter((x) => x.granted || x.prepared || !c.prepare)]) {
    const n = key(r.reg.get(p.id)?.name ?? p.id);
    if (!printedSpells.has(n)) miss("spell in a casting line, not in the print data", `${r.reg.get(p.id)?.name} (${c.name})`);
  }
  // Trainings by concept: skills and saves on their lines, the rest in the lists, and in the print.
  const lists = words([...sh.proficiencies.armor, ...sh.proficiencies.weapons, ...sh.proficiencies.tools, ...sh.proficiencies.languages, ...sh.proficiencies.other].join(" | "));
  for (const a of r.active) {
    const c = conceptOf(a.el);
    if (!c) continue;
    const [kind, what] = c.split(":");
    if (kind === "skill") { if (!sh.skills.some((s) => key(s.name).replace(/[^a-z]/g, "-") === what && s.level !== "none")) miss("skill training not on the sheet", a.el.name); continue; }
    if (kind === "expertise") { if (!sh.skills.some((s) => key(s.name).replace(/[^a-z]/g, "-") === what && s.level === "expertise")) miss("expertise not on the sheet", a.el.name); continue; }
    if (kind === "save") { if (!sh.abilities.some((x) => x.id.startsWith(what) && x.saveProficient)) miss("save training not on the sheet", a.el.name); continue; }
    if (kind === "language" || kind === "tool" || kind === "armor" || kind === "weapon") {
      const w = words(what);
      // A single weapon a category gives ("simple weapons" lists each simple weapon) is the category on the sheet.
      if (kind === "weapon" && r.reg.get(a.from)?.type === "Proficiency") continue;
      if (kind === "armor" || (kind === "weapon" && /^(simple|martial)$/.test(what))) continue; // boxes, checked below
      if (!` ${lists} `.includes(` ${w} `)) miss(`${kind} not in the proficiency lists`, a.el.name);
      else if (!` ${printedWords} `.includes(` ${w} `)) miss(`${kind} on the sheet, not in the print data`, a.el.name);
    }
  }
  const has = (c: string) => r.active.some((a) => conceptOf(a.el) === c);
  for (const [c, box] of [["armor:light", fill.armorTraining.light], ["armor:medium", fill.armorTraining.medium], ["armor:heavy", fill.armorTraining.heavy], ["armor:shield", fill.armorTraining.shield], ["weapon:simple", fill.weaponTraining.simple], ["weapon:martial", fill.weaponTraining.martial]] as const)
    if (has(c) && !box) miss("training box not ticked in the print data", c);
  // Gear: every inventory entry is printed.
  for (const it of r.character.inventory) {
    // By its words in any order: Aurora's "Clothes, Fine" is printed "Fine Clothes".
    const n = words(it.label || (it.id ? r.reg.get(it.id)?.name ?? "" : it.custom?.name ?? "")).replace(/ \d+$/, "");
    if (n && !n.split(" ").every((x) => ` ${printedWords} `.includes(` ${x} `))) miss("item not in the print data", n);
  }
  return misses;
}

it.skipIf(!C || process.env.RULES_TIER !== "conserve")("nothing the engine gives is dropped on the way to the sheet and the print", () => {
  const sets = (process.env.RULES_CONTENT ?? "5etools,srd,both").split(",");
  const n = Number(process.env.RULES_BIG) || 200;
  const out: string[] = ["# Nothing dropped: engine to sheet to print (W4)", ""];
  const counts: Record<string, number> = {};
  for (const set of sets) {
    const reg = set === "both" ? loadTestContent(C!) : loadContentSet(set === "srd" ? "" : C!, set as Parameters<typeof loadContentSet>[1]);
    let seed = Number(process.env.RULES_SEED) || 20261113;
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const byKind = new Map<string, { n: number; chars: Set<number>; ex: string[] }>();
    let clean = 0;
    for (let i = 0; i < n; i++) {
      const ch = randomCharacter(reg, 1 + (i % 20), { legacy: true, playtest: false, unusual: true, scifi: false, modern: false }, rng, { randomGear: true });
      const ms = conserve(resolve(ch, reg));
      if (!ms.length) clean++;
      for (const m of ms) {
        const e = byKind.get(m.kind) ?? { n: 0, chars: new Set(), ex: [] };
        e.n++; e.chars.add(i);
        if (e.ex.length < 12 && !e.ex.includes(m.what)) e.ex.push(m.what);
        byKind.set(m.kind, e);
      }
    }
    counts[set] = n - clean;
    out.push(`## ${set}: ${clean} of ${n} characters with nothing dropped`, "");
    for (const [k, e] of [...byKind].sort((a, b) => b[1].chars.size - a[1].chars.size)) out.push(`- ${k}: ${e.chars.size} characters, ${e.n} in all. ${e.ex.join("; ")}`);
    out.push("");
  }
  const dir = join(C!, "engine");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "conserve.md"), out.join("\n"));
  const base = join(dir, "conserve-count.json");
  const was = existsSync(base) ? JSON.parse(readFileSync(base, "utf8")) as Record<string, number> : {};
  if (!existsSync(base) || process.env.RULES_SNAPSHOT) writeFileSync(base, JSON.stringify(counts));
  console.log(`CONSERVE ${JSON.stringify(counts)} (accepted ${JSON.stringify(was)})`);
  for (const k of Object.keys(counts)) if (typeof was[k] === "number") expect(counts[k], k).toBeLessThanOrEqual(was[k]);
}, 3600000);

// In every test run (CI too), on the bundled free rules: none dropped at all.
it("nothing is dropped for 80 random characters on the free rules", () => {
  const reg = loadContentSet("", "srd");
  let seed = 4242;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const all: string[] = [];
  for (let i = 0; i < 80; i++) {
    const ch = randomCharacter(reg, 1 + (i % 20), { legacy: true, playtest: false, unusual: true, scifi: false, modern: false }, rng, { randomGear: true });
    for (const m of conserve(resolve(ch, reg))) all.push(`${m.kind}: ${m.what}`);
  }
  expect(all).toEqual([]);
});
