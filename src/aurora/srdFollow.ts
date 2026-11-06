/**
 * The bundle follows the SRD (Chris, 2026-11-06): where 5e.tools' copy of an entry differs from the official SRD PDF, the
 * SRD decides. A spell's facts and text, an item's rarity, a feature's words come from the PDF (srdPdf.ts). Mechanics that
 * the converter read stay, unless a gate finds they differ. Every change is written to a report; an entry the SRD does not
 * have leaves the bundle.
 */
import { squash } from "./srdText";
import { isSpellSection, srdRunIns, srdSpell, srdSpellLists, type SrdSection } from "./srdPdf";
import type { AElement } from "./types";

const plainOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const CASTERS = ["Bard", "Cleric", "Druid", "Paladin", "Ranger", "Sorcerer", "Warlock", "Wizard"];
const TEXT_TYPES = new Set(["Magic Item", "Class Feature", "Archetype Feature", "Racial Trait", "Race", "Sub Race", "Feat", "Background", "Condition", "Optional Feature", "Archetype", "Item", "Weapon", "Armor", "Language"]);
/** Same fact, the app's wording: "Action" for "1 action", a ritual flagged apart. */
const timeKey = (s: string) => squash(s.replace(/^1 (?=\w)/, "").replace(/ or ritual$/i, "").replace(/, which .*$/i, (m) => m));
/** A variant of an SRD entry names it: "Ring of Radiant Resistance" is "Ring of Resistance", "Bag of Tricks, Gray" is "Bag of Tricks". */
const wordsOf = (name: string) => name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2 && w !== "the" && w !== "and");
const baseWords = (heading: string) => wordsOf(heading.replace(/,.*$/, "")).filter((w) => !/^(?:armor|weapon|ammunition)$/.test(w));
/** "sword" is in "Longsword", "axe" in "Greataxe", "bow" in "Shortbow". */
const namesBase = (name: Set<string>, base: string[]) => base.every((w) => [...name].some((n) => n.includes(w)));
/** A heading in the PDF, as an element would name it. */
const headingKey = (name: string) => squash(name.replace(/^Level \d+: /, "").replace(/^\w+ Subclass: /, "").replace(/\s*\(.*\)$/, ""));
const RUN = 4;

/** The share of `html`'s word runs found in `target` (both squashed). */
function overlap(html: string, target: string): number {
  const words = plainOf(html).split(" ").filter(Boolean);
  if (words.length < RUN) return target.includes(squash(words.join(" "))) ? 1 : 0;
  let hit = 0;
  for (let i = 0; i + RUN <= words.length; i++) if (target.includes(squash(words.slice(i, i + RUN).join(" ")))) hit++;
  return hit / (words.length - RUN + 1);
}

const set = (e: AElement, key: string, value: string) => { e.setters = { ...e.setters, [key]: { value, attrs: e.setters?.[key]?.attrs ?? {} } }; };

const same = (a: string | undefined, b: string) => squash(a ?? "") === squash(b);

/** The PDF lists gear inverted: "Tent, two-person", "Case, map or scroll", "Poison, basic (vial)". */
function namedIn(corpus: string, name: string): boolean {
  const words = name.replace(/\s*\(.*\)$/, "").split(/[\s-]+/);
  for (let i = 0; i < words.length; i++) if (corpus.includes(squash([...words.slice(i), ...words.slice(0, i)].join(" ")))) return true;
  return false;
}

export interface FollowReport { facts: string[]; texts: string[]; removed: string[]; absent: string[]; unmatched: string[]; fromPdf: Set<AElement> }

/** A row of a gear table as facts. Its order differs per edition, so each fact is found by its shape. */
export function gearRow(row: string): { cost?: string; currency?: string; lb?: number; dice?: string; type?: string; ac?: string; str?: string; stealth?: boolean } {
  const cost = /([\d,]+) ?(CP|SP|EP|GP|PP)\b/i.exec(row);
  const lb = /([\d,]*[½¼⅛]|[\d,]+(?:\/\d+)?) ?lb\b/i.exec(row);
  const dmg = /\b(\d+d\d+|1) (Bludgeoning|Piercing|Slashing)\b/i.exec(row);
  const num = (raw: string) => { const x = raw.replace(/,/g, ""); return (/[½¼⅛]$/.test(x) ? Number(x.slice(0, -1) || 0) + ({ "½": 0.5, "¼": 0.25, "⅛": 0.125 } as Record<string, number>)[x.slice(-1)] : x.includes("/") ? Number(x.split("/")[0]) / Number(x.split("/")[1]) : Number(x)); };
  const ac = /\b(\d+)(?: \+ Dex(?: modifier)?(?: \(max 2\))?)?(?= |$)/.exec(row.replace(cost?.[0] ?? "\u0000", " ").replace(lb?.[0] ?? "\u0000", " "));
  const str = /\bStr(?:ength)? (\d+)/i.exec(row);
  return { ...(cost ? { cost: cost[1].replace(/,/g, ""), currency: cost[2].toLowerCase() } : {}), ...(lb ? { lb: num(lb[1]) } : {}), ...(dmg ? { dice: dmg[1], type: dmg[2].toLowerCase() } : {}), ...(ac ? { ac: ac[1] } : {}), ...(str ? { str: str[1] } : {}), stealth: /Disadvantage/i.test(row) };
}
const rotations = (name: string) => { const w = name.replace(/\s*\(.*\)$/, "").split(/[\s-]+/); return w.map((_, i) => squash([...w.slice(i), ...w.slice(0, i)].join(" "))); };

export function followSrd(elements: AElement[], sections: SrdSection[], edition: "5.1" | "5.2", corpus?: string, tableRows: string[] = []): { elements: AElement[]; report: FollowReport } {
  const report: FollowReport = { facts: [], texts: [], removed: [], absent: [], unmatched: [], fromPdf: new Set() };
  const spells = new Map(sections.filter(isSpellSection).map((s) => [squash(s.name), srdSpell(s)!]));
  const lists = edition === "5.1" ? srdSpellLists(sections, [...spells.values()].map((s) => s.name)) : undefined;
  const others = sections.filter((s) => !isSpellSection(s));
  const byHeading = new Map<string, { s: SrdSection; text: string }[]>();
  const add = (s: SrdSection) => { const k = headingKey(s.name); if (!byHeading.has(k)) byHeading.set(k, []); byHeading.get(k)!.push({ s, text: squash(plainOf(s.html)) }); };
  for (const s of others) { add(s); if (!/^Monsters?\b/.test(s.path[0] ?? "")) for (const r of srdRunIns(s)) add(r); }
  const items = others.filter((s) => s.path.includes("Magic Items") || /^Magic Items/.test(s.path[1] ?? "")).map((s) => ({ s, text: squash(plainOf(s.html)), words: baseWords(s.name) })).filter((x) => x.words.length);
  const species = others.filter((s) => s.path.some((p) => /^(?:Species Descriptions|Races)$/.test(p)) || /^Races$/.test(s.name)).map((s) => ({ s, text: squash(plainOf(s.html)) }));
  // A gear table's rows, by the name they start with (the longest name wins: "Oil" is not "Oil, flask").
  const gearRows = tableRows.filter((r) => /\d/.test(r) && /\b(?:CP|SP|EP|GP|PP)\b|\blb\b/i.test(r) && !/^(?:or|and|the|a)\b|[;:]/i.test(r));
  const rowOf = (name: string) => {
    const keys = rotations(name);
    let best: string | undefined;
    for (const r of gearRows) { const head = squash(r.replace(/[\d½¼⅛].*$/, "")); if (keys.includes(head)) { best = r; break; } }
    return best;
  };
  const seenSpells = new Set<string>();
  const used = new Set<SrdSection>();
  const out: AElement[] = [];

  const swapText = (e: AElement, html: string, old: string) => {
    const description = html;
    const sheet = e.sheet ? { ...e.sheet, descriptions: e.sheet.descriptions?.map((d) => (d.text && same(d.text, old) ? { ...d, text: html } : d)) } : e.sheet;
    return { ...e, description, ...(sheet ? { sheet } : {}) };
  };

  for (const el of elements) {
    if (el.type === "Spell") {
      const p = spells.get(squash(el.name));
      if (!p) { report.removed.push(`Spell | ${el.name}`); continue; }
      seenSpells.add(squash(el.name));
      let e: AElement = { ...el, name: p.name.replace(/’/g, "'") };
      const fact = (key: string, want: string, shown = want) => { const was = e.setters?.[key]?.value ?? ""; if (key === "time" ? timeKey(String(was)) !== timeKey(want) : !same(String(was), want)) { report.facts.push(`${p.name} | ${key} | ${was} -> ${shown}`); set(e, key, shown); } };
      fact("level", String(p.level));
      fact("school", p.school);
      fact("time", p.time);
      fact("range", p.range);
      fact("duration", p.duration);
      fact("isConcentration", String(/concentration/i.test(p.duration)));
      fact("isRitual", String(p.ritual));
      const comps = p.components;
      fact("hasVerbalComponent", String(/\bV\b/.test(comps.replace(/\(.*$/, ""))));
      fact("hasSomaticComponent", String(/\bS\b/.test(comps.replace(/\(.*$/, ""))));
      fact("hasMaterialComponent", String(/\bM\b/.test(comps.replace(/\(.*$/, ""))));
      const material = /\((.*)\)/.exec(comps)?.[1];
      if (material) fact("materialComponent", material);
      // The class lists.
      const classes = lists ? lists.get(p.name) ?? [] : p.classes;
      const mine = CASTERS.filter((c) => e.supports.some((x) => x.toLowerCase() === c.toLowerCase()));
      if ([...mine].sort().join() !== [...classes].sort().join() && classes.length) {
        report.facts.push(`${p.name} | classes | ${mine.join(", ")} -> ${classes.join(", ")}`);
        e = { ...e, supports: [...e.supports.filter((x) => !CASTERS.some((c) => c.toLowerCase() === x.toLowerCase())), ...classes] };
      }
      if (!same(plainOf(e.description ?? ""), plainOf(p.html))) { report.texts.push(`Spell | ${p.name}`); e = swapText(e, p.html, e.description ?? ""); report.fromPdf.add(e); }
      out.push(e);
      continue;
    }
    // Gear: the SRD's table decides its price, weight, damage and armor class.
    let gear = el;
    if ((el.type === "Item" || el.type === "Weapon" || el.type === "Armor") && !el.setters?.rarity) {
      const row = rowOf(el.name);
      if (row) {
        const g = gearRow(row);
        const change = (key: string, want: string | undefined, attrs?: Record<string, string>) => {
          if (want === undefined) return;
          const was = el.setters?.[key];
          if (String(was?.value ?? "") === want && (!attrs || Object.entries(attrs).every(([k, v]) => was?.attrs?.[k] === v))) return;
          report.facts.push(`${el.name} | ${key} | ${was?.value ?? ""} ${JSON.stringify(was?.attrs ?? {})} -> ${want} | ${row}`);
          gear = { ...gear, setters: { ...gear.setters, [key]: { value: want, attrs: { ...(was?.attrs ?? {}), ...attrs } } } };
        };
        if (g.cost && el.setters?.cost && !/\(\d+\)$/.test(el.name)) change("cost", g.cost, { currency: g.currency! });
        if (g.lb !== undefined && el.setters?.weight && Number(el.setters.weight.attrs?.lb) !== g.lb && !/\(\d+\)$/.test(el.name)) change("weight", `${g.lb} lb.`, { lb: String(g.lb) });
        if (el.type === "Weapon" && g.dice) change("damage", g.dice, { type: g.type! });
        if (el.type === "Armor" && g.ac && el.setters?.armorClass && !String(el.setters.armorClass.value).includes(g.ac)) change("armorClass", g.ac);
        if (el.type === "Armor" && g.str && el.setters?.strength?.value !== g.str) change("strength", g.str);
      } else if (el.setters?.cost) report.unmatched.push(`gear row | ${el.name}`);
    }
    // A magic item's rarity is in the line under its heading.
    if (!TEXT_TYPES.has(el.type) || !gear.description) { out.push(gear); continue; }
    if ((el.type === "Weapon" || el.type === "Armor") && !el.setters?.rarity) { out.push(gear); continue; }
    // Gear the SRD does not list at all leaves ("Dulcimer").
    if (corpus && (el.type === "Item" || el.type === "Weapon" || el.type === "Armor") && !el.setters?.rarity && !/Barding$/.test(el.name) && !namedIn(corpus, el.name.replace(/ Set$/, ""))) { report.removed.push(`${el.type} | ${el.name}`); continue; }
    const candidates = byHeading.get(headingKey(el.name)) ?? [];
    let best: { s: SrdSection; text: string } | undefined;
    let score = 0;
    for (const c of candidates) { const v = overlap(el.description, c.text); if (!best || v > score) { best = c; score = v; } }
    if ((!best || score < 0.3) && el.setters?.rarity) {
      // A variant of an item whose text the SRD gives once.
      const words = new Set(wordsOf(el.name));
      for (const c of items) { if (!namesBase(words, c.words)) continue; used.add(c.s); const v = overlap(el.description, c.text); if (v > score) { best = c; score = v; } }
    }
    if ((!best || score < 0.3) && el.type === "Sub Race") for (const c of species) { const v = overlap(el.description, c.text); if (v > score) { best = c; score = v; } }
    if (!best || score < 0.3) { report.unmatched.push(`${el.type} | ${el.name}${best ? ` | best ${score.toFixed(2)}` : ""}`); out.push(gear); continue; }
    // The SRD's rarity for an item it lists under this very name.
    if (best.s.sub && el.setters?.rarity && headingKey(best.s.name) === headingKey(el.name)) {
      const m = /\b(common|uncommon|very rare|rare|legendary|artifact)\b/i.exec(best.s.sub);
      const was = el.setters.rarity.value;
      const wasBase = /\b(common|uncommon|very rare|rare|legendary|artifact)\b/i.exec(was)?.[1] ?? "";
      const attune = /attunement/i.test(best.s.sub);
      if (m && !/varies/i.test(best.s.sub) && (wasBase.toLowerCase() !== m[1].toLowerCase() || attune !== /attunement/i.test(was))) {
        const shown = `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase().replace(/ rare/, " Rare")}${attune ? ` (${/\((requires attunement[^)]*)\)/i.exec(best.s.sub)?.[1]?.toLowerCase() ?? "requires attunement"})` : ""}`;
        report.facts.push(`${el.name} | rarity | ${was} -> ${shown}`);
        gear = { ...gear, setters: { ...gear.setters, rarity: { value: shown, attrs: el.setters.rarity.attrs ?? {} } } };
      }
    }
    used.add(best.s);
    if (squash(plainOf(el.description)) === best.text) { out.push(gear); continue; }
    report.texts.push(`${el.type} | ${el.name} | ${best.s.name} | ${score.toFixed(2)}`);
    const swapped = swapText(gear, best.s.html, el.description);
    report.fromPdf.add(swapped);
    out.push(swapped);
  }
  for (const [k, s] of spells) if (!seenSpells.has(k)) report.absent.push(`Spell | ${s.name}`);
  // The other entries the SRD lists by heading, none of which should be missing here.
  const kinds: [string, RegExp][] = [["Magic Item", /^Magic Items A/], ["Feat", /^(?:Feats|Feat Descriptions|Origin Feats|General Feats|Fighting Style Feats|Epic Boon Feats)$/], ["Background", /^(?:Backgrounds|Background Descriptions)$/]];
  const names = new Set(out.map((e) => headingKey(e.name)));
  for (const s of others) for (const [kind, re] of kinds) if (s.path.length && re.test(s.path[s.path.length - 1]) && !used.has(s) && !names.has(headingKey(s.name)) && !/^(?:Proficiencies|Equipment|Customizing a Background|Feat Descriptions|Parts of a Feat|(?:Origin|General|Fighting Style|Epic Boon) Feats|Giant Fly|Avatar of Death)$/.test(s.name) && !/^(?:Ammunition|Armor|Weapon), \+1/.test(s.name) && (kind !== "Condition" || /\[Condition\]|^(?:Blinded|Charmed|Deafened|Exhaustion|Frightened|Grappled|Incapacitated|Invisible|Paralyzed|Petrified|Poisoned|Prone|Restrained|Stunned|Unconscious)\b/.test(s.name))) report.absent.push(`${kind} | ${s.name}`);
  return { elements: out, report };
}
