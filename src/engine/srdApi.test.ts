/**
 * "Against the SRD" (Stage D3, RULES_TIER=srd-api): the built-in rules compared with the SRD API's data, a third source
 * next to 5e.tools and Aurora (cached by scripts/srd-api-cache.mjs; never shipped). Report: <cache>/engine/srd-api.md.
 * A difference is settled by the SRD PDF: a real one is fixed at the cause; an API mistake or a difference of wording is
 * listed in KNOWN with why.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { AElement, ARule } from "../aurora/types";

const C = process.env.SOULFORGE_RULES;
type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
const key = (s: unknown) => norm(s).replace(/[^a-z0-9]+/g, "");
const setter = (e: AElement, k: string) => e.setters?.[k]?.value;
const time = (s: unknown) => norm(s).replace(/^1 /, "").replace(/, .*$/, "").replace(/ or ritual$/, "").replace(/\b(hour|minute)s\b/, "$1");
const range = (s: unknown) => norm(s).replace(/ component:.*$/, "").replace(/ ?\(.*$/, "").replace(/-foot.*$/, " feet").replace(/\bfoot\b/, "feet").replace(/\bmiles?\b/, "mile");
const duration = (s: unknown) => norm(s).replace(/^(?:concentration,? )?up to /, "").replace(/^concentration /, "").replace(/\bminutes\b/, "minute").replace(/\bhours\b/, "hour").replace(/\brounds\b/, "round").replace(/\bdays\b/, "day").replace(/instantaneous.*/, "instantaneous");

/**
 * What is left after each kind was read against the PDFs (docs/SRD-DIFF.md: the API is the one that is wrong, or names
 * things differently). A kind may only stay or fall; a new difference fails the gate.
 */
const KNOWN: Record<string, number> = {
  "2014 equipment cost": 4, "2014 equipment missing here": 53, "2014 equipment weight": 4, "2014 spell class list": 5, "2014 spell duration": 3, "2014 spell school": 3,
  "2024 class cantrips": 2, "2024 equipment cost": 14, "2024 equipment missing here": 23, "2024 equipment weight": 15, "2024 spell casting time": 1, "2024 spell component S": 6, "2024 spell component V": 9,
  "2024 spell concentration": 1, "2024 spell duration": 3, "2024 spell range": 2, "2024 spell school": 1, "2024 weapon damage type": 1, "2024 weapon damage": 1,
};

function compare(edition: "2014" | "2024", els: AElement[]): Map<string, string[]> {
  const api = (f: string): J[] => { const p = join(C!, "srd-api", edition, `${f}.json`); return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : []; };
  const out = new Map<string, string[]>();
  const add = (kind: string, line: string) => { if (!out.has(kind)) out.set(kind, []); out.get(kind)!.push(line); };
  const byName = (types: string[]) => { const m = new Map<string, AElement>(); for (const e of els) if (types.includes(e.type)) m.set(key(e.name), e); return m; };

  const spells = byName(["Spell"]);
  for (const s of api("spells")) {
    const e = spells.get(key(s.name));
    if (!e) { add("spell missing here", s.name); continue; }
    const diff = (what: string, a: unknown, b: unknown) => { if (norm(a) !== norm(b)) add(`spell ${what}`, `${s.name}: API ${a}, here ${b}`); };
    if (s.level !== undefined) diff("level", s.level, setter(e, "level"));
    if (s.school?.name) diff("school", s.school.name, setter(e, "school"));
    if (s.casting_time) diff("casting time", time(s.casting_time), time(setter(e, "time")));
    if (s.range) diff("range", range(s.range), range(setter(e, "range")));
    if (s.duration) diff("duration", duration(s.duration), duration(setter(e, "duration")));
    if (s.concentration !== undefined) diff("concentration", s.concentration, setter(e, "isConcentration"));
    if (s.ritual !== undefined) diff("ritual", s.ritual, setter(e, "isRitual"));
    if (s.components) for (const [c, k] of [["V", "hasVerbalComponent"], ["S", "hasSomaticComponent"], ["M", "hasMaterialComponent"]]) diff(`component ${c}`, s.components.includes(c), setter(e, k) ?? "false");
    const theirs = (s.classes as J[] ?? []).map((c) => norm(c.name)).sort().join(", ");
    const ours = ["bard", "cleric", "druid", "paladin", "ranger", "sorcerer", "warlock", "wizard"].filter((c) => e.supports.some((x) => norm(x) === c)).join(", ");
    const known = theirs.split(", ").filter((c) => c).join(", ");
    if (known && known !== ours) add("spell class list", `${s.name}: API ${known}; here ${ours}`);
  }
  const apiSpells = new Set(api("spells").map((s) => key(s.name)));
  for (const [k, e] of spells) if (!apiSpells.has(k)) add("spell missing in the API", e.name);

  const items = byName(["Weapon", "Armor", "Item"]);
  for (const i of api("equipment")) {
    const e = items.get(key(i.name));
    if (!e) { add("equipment missing here", i.name); continue; }
    const cost = i.cost ? `${i.cost.quantity} ${i.cost.unit}` : undefined;
    const ours = e.setters?.cost ? `${e.setters.cost.value} ${e.setters.cost.attrs?.currency ?? ""}`.trim() : undefined;
    if (cost && ours && norm(cost) !== norm(ours)) add("equipment cost", `${i.name}: API ${cost}, here ${ours}`);
    const lb = e.setters?.weight?.attrs?.lb;
    if (i.weight !== undefined && i.weight !== 0 && lb !== undefined && Number(lb) !== Number(i.weight)) add("equipment weight", `${i.name}: API ${i.weight}, here ${lb}`);
    const dmg = i.damage?.damage_dice;
    if (dmg && norm(dmg) !== norm(setter(e, "damage"))) add("weapon damage", `${i.name}: API ${dmg}, here ${setter(e, "damage")}`);
    if (i.damage?.damage_type?.name && e.setters?.damage?.attrs?.type && norm(i.damage.damage_type.name) !== norm(e.setters.damage.attrs.type)) add("weapon damage type", `${i.name}: API ${i.damage.damage_type.name}, here ${e.setters.damage.attrs.type}`);
    const ac = i.armor_class?.base;
    if (ac !== undefined && e.type === "Armor" && !norm(setter(e, "armorClass")).includes(String(ac))) add("armor class", `${i.name}: API ${ac}, here ${setter(e, "armorClass")}`);
  }

  const classes = byName(["Class"]);
  for (const c of api("classes")) {
    const e = classes.get(key(c.name));
    if (!e) { add("class missing here", c.name); continue; }
    if (`d${c.hit_die}` !== setter(e, "hd")) add("class hit die", `${c.name}: API d${c.hit_die}, here ${setter(e, "hd")}`);
    const saves = (c.saving_throws as J[]).map((s) => ({ str: "STRENGTH", dex: "DEXTERITY", con: "CONSTITUTION", int: "INTELLIGENCE", wis: "WISDOM", cha: "CHARISMA" } as Record<string, string>)[s.index]).sort().join(",");
    const ours = e.rules.filter((r): r is Extract<ARule, { kind: "grant" }> => r.kind === "grant" && /^ID_5ET_SAVE_/.test(r.id ?? "")).map((r) => r.id!.replace("ID_5ET_SAVE_", "")).sort().join(",");
    if (saves !== ours) add("class saving throws", `${c.name}: API ${saves}; here ${ours}`);
    const levels = (c.levels as J[] ?? []).filter((l) => !l.subclass);
    const sum = (test: (r: ARule) => boolean, val: (r: ARule) => number, lv: number) => e.rules.filter((r) => test(r) && ((r as { level?: number }).level ?? 1) <= lv).reduce((n, r) => n + val(r), 0);
    for (const l of levels) {
      const sc = l.spellcasting;
      if (!sc) continue;
      const lv = Number(l.level ?? String(l.index).replace(/^.*-/, ""));
      for (let n = 1; n <= 9; n++) {
        const theirs = sc[`spell_slots_level_${n}`] ?? 0;
        const mine = sum((r) => r.kind === "stat" && new RegExp(`:spellcasting:slots:${n}$`).test(r.name), (r) => Number((r as { value: string }).value) || 0, lv);
        if (theirs !== mine) add("class spell slots", `${c.name} ${lv}, slot ${n}: API ${theirs}, here ${mine}`);
      }
      if (sc.cantrips_known !== undefined) {
        const mine = sum((r) => r.kind === "select" && r.type === "Spell" && /^Cantrip/.test(r.name), (r) => (r as { number: number }).number, lv);
        if (sc.cantrips_known !== mine) add("class cantrips", `${c.name} ${lv}: API ${sc.cantrips_known}, here ${mine}`);
      }
    }
  }

  const species = byName(["Race"]);
  for (const r of [...api("races"), ...api("species")]) {
    const e = species.get(key(r.name));
    if (!e) { add("species missing here", r.name); continue; }
    const speed = e.rules.find((x) => x.kind === "stat" && norm(x.name) === "innate speed") as { value: string } | undefined;
    if (typeof r.speed === "number" && speed && Number(speed.value) !== r.speed) add("species speed", `${r.name}: API ${r.speed}, here ${speed.value}`);
  }
  for (const [file, types, what] of [["backgrounds", ["Background"], "background"], ["feats", ["Feat"], "feat"], ["subclasses", ["Archetype"], "subclass"]] as const) {
    const here = byName([...types]);
    // The API names a subclass short ("Berserker" for "Path of the Berserker").
    for (const x of api(file)) if (!here.has(key(x.name)) && ![...here.keys()].some((k) => k.includes(key(x.name)))) add(`${what} missing here`, x.name);
  }
  return out;
}

it.skipIf(!C || process.env.RULES_TIER !== "srd-api")("the built-in rules against the SRD API", () => {
  const lines: string[] = ["# The built-in rules against the SRD API", ""];
  let total = 0;
  const over: string[] = [];
  for (const [edition, file] of [["2014", "srd-5.1.json"], ["2024", "srd-5.2.json"]] as const) {
    const els = (JSON.parse(readFileSync(join("public/srd", file), "utf8")) as { elements: AElement[] }).elements;
    const found = compare(edition, els);
    lines.push(`## ${edition}`, "");
    for (const [kind, rows] of [...found].sort()) { total += rows.length; lines.push(`### ${kind} (${rows.length})`, ...rows.map((r) => `- ${r}`), ""); if (rows.length > (KNOWN[`${edition} ${kind}`] ?? 0)) over.push(`${edition} ${kind}: ${rows.length}, known ${KNOWN[`${edition} ${kind}`] ?? 0}: ${rows.slice(0, 8).join("; ")}`); }
  }
  mkdirSync(join(C!, "engine"), { recursive: true });
  writeFileSync(join(C!, "engine", "srd-api.md"), lines.join("\n"));
  console.log(`SRD API differences ${total}`);
  expect(over).toEqual([]);
}, 120000);
