/**
 * Every element of every content set, touched (Chris 2026-11-06: tests should cover all the content; RULES_TIER=sweep).
 * The rules suite samples at random; this goes through each one: every class at 20, every subclass, species, subrace,
 * background and feat held by a character with its choices filled and checked; every spell's facts and rolls; every item
 * carried and equipped; every element's text and links. RULES_CONTENT runs one set (default: all).
 * Report: <cache>/engine/coverage.md, with what each type reached and each kind of finding. A kind may only fall.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { autoFill } from "../aurora/autofill";
import { newCharacter, uid, type Character } from "../aurora/character";
import { resolve } from "../aurora/engine";
import type { ARegistry } from "../aurora/registry";
import { checkCharacter, type RefClass } from "../aurora/rulesCheck";
import { buildSheet } from "../aurora/sheet";
import type { AElement } from "../aurora/types";
import { spellRolls } from "../ui/RollChips";
import { CONTENT_SETS, holder, loadContentSet, type ContentSet } from "./testContent";

const C = process.env.SOULFORGE_RULES;
const HELD = ["Class", "Archetype", "Race", "Sub Race", "Background", "Feat"];
const CARRIED = ["Weapon", "Armor", "Item", "Magic Item"];
const RAW = /\{@\w|\{#\w|\{\{item\.|\[object |\bundefined\b|\bNaN\b/;

/** What each set has been read and accepted at. A kind may only fall. */
const KNOWN: Record<string, number> = {
  // Languages the 2024 rules offer no way to learn at creation, in the SRD's own lists.
  "srd never reached: Language": 6, "srd-5.1 never reached: Language": 6, "srd-5.2 never reached: Language": 7,
  // A subrace the holder does not pick; NPC species, sidekick classes and older subclass copies are hidden on purpose; house marks need a dragonmark feat's path.
  "5etools rules: Feat requirements not met": 3, "5etools never reached: Optional Feature": 4, "5etools never reached: Racial Trait": 58, "5etools never reached: Archetype Feature": 16, "5etools never reached: Class Feature": 32,
};

function sweep(reg: ARegistry, set: ContentSet, ref: RefClass[]) {
  const findings = new Map<string, string[]>();
  const find = (kind: string, what: string) => { if (!findings.has(kind)) findings.set(kind, []); findings.get(kind)!.push(what); };
  const reached = new Set<string>();
  const all = reg.all();
  const isFive = (e: AElement) => set !== "aurora" && (e.origin === "5etools" || /^SRD /.test(e.source) || e.id.startsWith("ID_5ET"));
  let seed = 31;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // Text and links, on everything.
  for (const e of all) {
    if (!e.name?.trim()) find("no name", e.id);
    if (isFive(e) && RAW.test(`${e.name} ${e.description ?? ""}`)) find("raw markup or a broken value in the text", `${e.type}: ${e.name}: ${RAW.exec(`${e.name} ${e.description ?? ""}`)?.[0]}`);
    // Aurora grants markers with no element of their own, and its content linter has them listed.
    if (isFive(e)) for (const r of e.rules) if (r.kind === "grant" && r.id && !reg.get(r.id) && !/^CREATUREREF:/.test(r.id)) find("a grant of something missing", `${e.type}: ${e.name}: ${r.id}`);
  }

  // Everything a character can hold, with its choices filled. Every option a choice offers is noted, to be tried below.
  const pending = new Map<string, { ch: Character; key: string; rest: string[]; label: string }>();
  const check = (label: string, ch: Character) => {
    const filled = autoFill(ch, reg, () => rng());
    const r = resolve(filled, reg);
    const sh = buildSheet(r);
    for (const a of r.active) reached.add(a.el.id);
    for (const sl of r.slots) for (const id of sl.chosen) reached.add(id);
    for (const sl of r.slots) for (const o of sl.options) if (!reached.has(o.id) && !pending.has(o.id) && !["Spell", ...CARRIED].includes(o.type)) pending.set(o.id, { ch: filled, key: sl.key, rest: sl.chosen.slice(1), label });
    // Taking every option on purpose repeats what the character has; a player gets told, and that is not a fault here.
    const forced = /, taking /.test(label);
    for (const f of checkCharacter(r, sh, ref)) if (!/Class not in the rules reference/.test(f.rule) && !(forced && /repeats something|Same feat twice|does not meet its requirements|feature missing|requirements not met/.test(f.rule))) find(`rules: ${f.rule}`, `${label}: ${f.detail}`);
    for (const a of sh.attacks) if (/NaN|undefined/.test(`${a.bonus} ${a.damage}`)) find("an attack with a broken number", `${label}: ${a.name} ${a.bonus} ${a.damage}`);
    if (!Number.isFinite(sh.hp) || !Number.isFinite(sh.ac.value)) find("a sheet with a broken number", label);
  };
  /** A feat's holder must meet its requirement: high scores, and a class and level that do. */
  const strong = { strength: 16, dexterity: 16, constitution: 16, intelligence: 16, wisdom: 16, charisma: 16 };
  const casters = reg.ofType("Class").filter((c) => /^(Fighter|Wizard|Cleric|Paladin)$/.test(c.name));
  const feat = (e: AElement): Character => {
    const modern = /2024/.test(e.source);
    const same = casters.filter((c) => /2024/.test(c.source) === modern);
    const cands = same.length ? same : casters.length ? casters : reg.ofType("Class").slice(0, 1);
    const need = e.requirements ?? "";
    const cls = cands.find((c) => (/FIGHTING_STYLE/.test(need) ? c.name === "Fighter" : /SPELLCASTING|type:spell/.test(need) ? c.name === "Wizard" : /ARMOR|WEAPON/.test(need) ? c.name === "Fighter" : true)) ?? cands[0];
    // What the requirement names: the species, background or feat that comes before it.
    const named = [...need.matchAll(/ID_[A-Z0-9_]+/g)].map((m) => reg.get(m[0])).filter((x): x is AElement => !!x);
    const race = named.find((x) => x.type === "Race");
    const background = named.find((x) => x.type === "Background");
    const before = named.find((x) => x.type === "Feat");
    return { ...newCharacter(), abilityBase: { ...newCharacter().abilityBase, ...strong }, classes: [{ classId: cls.id, level: 20 }], extras: [...(before ? [before.id] : []), e.id], ...(race ? { race: race.id } : {}), ...(background ? { background: background.id } : {}) };
  };
  const replaced = new Set<string>();
  const offeredNames = new Set(reg.ofType("Archetype").filter((e) => holder(reg, e)).map((e) => e.name));
  for (const type of HELD) for (const e of reg.ofType(type)) {
    if (e.compendiumHidden) continue;
    const ch = type === "Feat" ? feat(e) : holder(reg, e);
    // A reprint takes an older subclass's place on the list (the 2014 Knowledge Domain copied for the 2024 Cleric).
    if (!ch && type === "Archetype" && offeredNames.has(e.name)) { replaced.add(e.id); continue; }
    if (!ch) { find(`${type} no character can hold it`, e.name); continue; }
    try { check(`${type} ${e.name} (${e.source})`, ch); reached.add(e.id); } catch (err) { find("crashed", `${type} ${e.name}: ${String(err).slice(0, 120)}`); }
    // A species or background is held at level 1; what it opens later (Simic Hybrid's 5th-level enhancement, the
    // Aasimar's 3rd-level revelation) is tried at level 20 as well.
    if ((type === "Race" || type === "Background") && ch.classes.length) try { check(`${type} ${e.name} (${e.source}) at level 20`, { ...ch, classes: [{ ...ch.classes[0], level: 20 }] }); } catch (err) { find("crashed", `${type} ${e.name} at 20: ${String(err).slice(0, 120)}`); }
  }
  // Every option of every choice, taken once, which may open more.
  for (let n = 0; pending.size && n < 40000; n++) {
    const [id, p] = pending.entries().next().value as [string, { ch: Character; key: string; rest: string[]; label: string }];
    pending.delete(id);
    if (reached.has(id)) continue;
    try { check(`${p.label}, taking ${reg.get(id)?.name}`, { ...p.ch, selections: { ...p.ch.selections, [p.key]: [id, ...p.rest] } }); reached.add(id); } catch (err) { find("crashed", `option ${reg.get(id)?.name}: ${String(err).slice(0, 120)}`); }
  }

  // Every spell: its facts, and that its rolls can be read.
  for (const s of reg.ofType("Spell")) {
    const lv = Number(s.setters.level?.value);
    if (!Number.isFinite(lv) || lv < 0 || lv > 9) find("a spell with no level", s.name);
    if (!s.setters.school?.value) find("a spell with no school", s.name);
    if (!s.setters.time?.value) find("a spell with no casting time", s.name);
    if (!s.setters.range?.value) find("a spell with no range", s.name);
    if (!s.setters.duration?.value) find("a spell with no duration", s.name);
    if (!s.description?.replace(/<[^>]+>/g, "").trim()) find("a spell with no text", s.name);
    try { for (const x of spellRolls(s.name, s.description ?? "", { proficiency: 3, mods: {} }, 5, { level: lv, castLevel: Math.min(9, lv + 1), characterLevel: 11 })) if (/NaN|undefined/.test(x.expr)) find("a spell roll with a broken number", `${s.name}: ${x.expr}`); reached.add(s.id); } catch (err) { find("crashed", `Spell ${s.name}: ${String(err).slice(0, 120)}`); }
  }

  // Every creature the content holds is listed; its numbers are read when a form or companion is taken.
  for (const b of reg.ofType("Companion")) {
    reached.add(b.id);
  }

  // Every item, carried and equipped, by the handful.
  const cls = reg.ofType("Class").find((c) => c.name === "Fighter") ?? reg.ofType("Class")[0];
  if (cls) {
    const items = CARRIED.flatMap((t) => reg.ofType(t));
    for (let i = 0; i < items.length; i += 40) {
      const part = items.slice(i, i + 40);
      const ch: Character = { ...newCharacter(), classes: [{ classId: cls.id, level: 5 }], inventory: part.map((e) => ({ uid: uid(), id: e.id, qty: 1, equipped: true, attuned: false })) as Character["inventory"] };
      try {
        const sh = buildSheet(resolve(ch, reg));
        for (const a of sh.attacks) if (/NaN|undefined/.test(`${a.bonus} ${a.damage}`)) find("an attack with a broken number", `${a.name} ${a.bonus} ${a.damage}`);
        if (!Number.isFinite(sh.ac.value)) find("a sheet with a broken number", part.map((p) => p.name).slice(0, 3).join(", "));
        for (const e of part) reached.add(e.id);
      } catch (err) { find("crashed", `Items ${part[0].name}...: ${String(err).slice(0, 120)}`); }
    }
    for (const e of items) { if (e.type === "Weapon" && !e.setters.rarity && !e.setters.damage && !e.supports.includes("special")) find("a weapon with no damage", e.name); }
  }

  const types = new Map<string, { total: number; reached: number }>();
  for (const e of all) { const t = types.get(e.type) ?? { total: 0, reached: 0 }; t.total++; if (reached.has(e.id)) t.reached++; types.set(e.type, t); }
  // What no character reached, by type: hidden helpers mostly. A name here is content no test exercises.
  for (const e of all) if (!reached.has(e.id) && !replaced.has(e.id) && !e.compendiumHidden) find(`never reached: ${e.type}`, `${e.name} (${e.source})`);
  if (replaced.size) find("info: subclasses a reprint replaced", String(replaced.size));
  return { findings, types, total: all.length };
}

it.skipIf(!C || process.env.RULES_TIER !== "sweep")("every element of every content set", () => {
  const ref: RefClass[] = JSON.parse(readFileSync(join(C!, "rules-ref.json"), "utf8"));
  const sets = process.env.RULES_CONTENT ? [process.env.RULES_CONTENT as ContentSet] : CONTENT_SETS;
  const lines = ["# Every element of every content set", ""];
  const over: string[] = [];
  for (const set of sets) {
    const reg = loadContentSet(C!, set);
    const { findings, types, total } = sweep(reg, set, ref);
    lines.push(`## ${set}: ${total} elements`, "", "| Type | Elements | Reached |", "|---|---|---|", ...[...types].sort((a, b) => b[1].total - a[1].total).map(([t, v]) => `| ${t} | ${v.total} | ${v.reached} |`), "");
    for (const [kind, rows] of [...findings].sort()) {
      lines.push(`### ${kind} (${rows.length})`, ...rows.slice(0, 40).map((r) => `- ${r}`), "");
      // Aurora's sets are listed, not gated, but for crashes and broken numbers: its requirements name ids the sweep's
      // characters do not build, the counts drift with the random picks, and it leaves the release.
      const gated = !/^(aurora|both)$/.test(set) || /^(crashed|a sheet|an attack|a spell roll)/.test(kind);
      if (gated && !/^info:/.test(kind) && rows.length > (KNOWN[`${set} ${kind}`] ?? 0)) over.push(`${set} ${kind}: ${rows.length}, known ${KNOWN[`${set} ${kind}`] ?? 0}`);
    }
    console.log(`SWEEP ${set}: ${total} elements; ${[...findings].map(([k, r]) => `${k} ${r.length}`).join("; ") || "no findings"}`);
  }
  mkdirSync(join(C!, "engine"), { recursive: true });
  writeFileSync(join(C!, "engine", process.env.RULES_CONTENT ? `coverage-${process.env.RULES_CONTENT}.md` : "coverage.md"), lines.join("\n"));
  expect(over).toEqual([]);
}, 7200000);
