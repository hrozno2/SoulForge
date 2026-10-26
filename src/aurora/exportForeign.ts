/**
 * Exporters for other tools: a Foundry VTT dnd5e actor and a Roll20 character in the shape its 5e sheet reads.
 * Both are best effort and name-based. Items come across with their descriptions but without links to any compendium,
 * so the target tool shows them as plain items and features.
 */
import { ABILITY_IDS, itemLabel, type AbilityId } from "./character";
import type { Resolved } from "./engine";
import { buildSheet } from "./sheet";

const ABBR: Record<AbilityId, string> = { strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha" };
const FSKILL: Record<string, string> = { acrobatics: "acr", "animal handling": "ani", arcana: "arc", athletics: "ath", deception: "dec", history: "his", insight: "ins", intimidation: "itm", investigation: "inv", medicine: "med", nature: "nat", perception: "prc", performance: "prf", persuasion: "per", religion: "rel", "sleight of hand": "slt", stealth: "ste", survival: "sur" };
const R20SKILL = (n: string) => n.replace(/ /g, "_");
const html = (t: string) => (t ? `<p>${t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n+/g, "</p><p>")}</p>` : "");
const stripTags = (t: string) => t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const rid = (n: number) => Array.from({ length: n }, () => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 62)]).join("");

/** dnd5e's spell school keys. */
const FSCHOOL: Record<string, string> = { abjuration: "abj", conjuration: "con", divination: "div", enchantment: "enc", evocation: "evo", illusion: "ill", necromancy: "nec", transmutation: "trs" };

function details(r: Resolved) {
  const c = r.character;
  const nameOf = (id?: string) => (id ? r.reg.get(id)?.name ?? "" : "");
  const subEl = r.active.find((a) => a.el.type === "Archetype")?.el;
  // The species' subrace or lineage (Sea Elf, Water Genasi, White Dragonborn): named with it, as "Elf (Sea Elf)".
  const lineages = r.active.filter((a) => /^(Sub Race|Race Variant)$/.test(a.el.type)).map((a) => a.el);
  const race = nameOf(c.race);
  return {
    c, race: lineages.length ? `${race} (${lineages.map((l) => l.name).join("; ")})` : race, lineages,
    background: nameOf(c.background), subclass: subEl?.name ?? "", subclassId: subEl?.id,
    classes: c.classes.map((x) => ({ name: nameOf(x.classId), level: x.level, id: x.classId })),
  };
}

export function exportFoundry(r: Resolved): Record<string, unknown> {
  const sheet = buildSheet(r);
  const { c, race, lineages, background, subclass, subclassId, classes } = details(r);
  const items: Record<string, unknown>[] = [];
  // Each item carries the Soul Forge element it came from (flags.soulforge, as Plutonium keeps flags.plutonium), so
  // importing the actor back finds exactly that element; other tools read the name.
  const add = (type: string, name: string, system: Record<string, unknown>, sf: Record<string, unknown> = {}) => {
    const el = typeof sf.id === "string" ? r.reg.get(sf.id) : undefined;
    const source = el ? { book: el.source, rules: el.edition ?? "" } : undefined;
    items.push({ _id: rid(16), name, type, img: "icons/svg/item-bag.svg", system: source ? { source, ...system } : system, effects: [], flags: Object.keys(sf).length ? { soulforge: sf } : {} });
  };
  // dnd5e ties a subclass to its class by the class's identifier (the name, lower case, dashed).
  const ident = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  for (const k of classes) add("class", k.name, { levels: k.level, identifier: ident(k.name), description: { value: "" } }, { id: k.id });
  const subOf = r.active.find((a) => a.el.id === subclassId)?.root ?? "";
  const subClass = subOf.startsWith("class:") ? r.reg.get(subOf.slice(6))?.name ?? "" : classes[0]?.name ?? "";
  if (subclass) add("subclass", subclass, { identifier: ident(subclass), classIdentifier: ident(subClass), description: { value: "" } }, { id: subclassId });
  if (race) add("race", race, { description: { value: "" } }, { id: c.race, lineages: lineages.map((l) => l.id) });
  if (background) add("background", background, { description: { value: "" } }, { id: c.background });
  // A feat's own choices go with it (Magic Initiate's list and ability, Resilient's ability, Skilled's skills), and
  // their choices in turn, so an import makes the same picks.
  const choicesUnder = (id: string, depth = 0): string[] => depth > 3 ? [] : r.slots.filter((s) => s.owner.id === id).flatMap((s) => s.chosen.flatMap((c) => [c, ...choicesUnder(c, depth + 1)]));
  for (const f of sheet.features.filter((x) => x.type === "Feat")) add("feat", f.name, { description: { value: html(stripTags(f.text)) }, type: { value: "feat" } }, f.id ? { id: f.id, choices: choicesUnder(f.id) } : {});
  // Class, subclass, species and background features too, as dnd5e's feature items (type class, race, background),
  // with their uses ("3/Long Rest": three uses, all back on a long rest).
  const KIND: Record<string, string> = { "Class Feature": "class", "Archetype Feature": "class", "Racial Trait": "race", "Background Feature": "background" };
  for (const f of sheet.features.filter((x) => KIND[x.type])) {
    const u = /(\d+)\s*\/\s*(short|long)/i.exec(f.usage ?? "");
    const uses = u ? { max: u[1], spent: 0, recovery: [{ period: u[2].toLowerCase() === "short" ? "sr" : "lr", type: "recoverAll" }] } : undefined;
    add("feat", f.name, { description: { value: html(stripTags(f.text)) }, type: { value: KIND[f.type] }, ...(uses ? { uses } : {}) }, { id: f.id });
  }
  // Each spell once, with how it is ready (dnd5e's preparation): always prepared from a feature, prepared today, or
  // known (cantrips and the spells of a class that does not prepare).
  const prep = new Map<string, { mode: string; prepared: boolean }>();
  const fromOf = new Map<string, string>();
  for (const line of sheet.casting) {
    for (const p of line.cantripsKnown) prep.set(p.id, { mode: "prepared", prepared: true });
    for (const p of line.granted) prep.set(p.id, { mode: "always", prepared: true });
    for (const p of line.spells) if (!prep.has(p.id)) prep.set(p.id, { mode: "prepared", prepared: p.granted || !line.prepare || p.prepared });
  }
  // Where each spell was chosen, as Foundry 5's sourceItem ("feat:magic-initiate", "class:spellcasting"): the feature
  // whose choice holds it, so an import puts it back in that choice and not in another that also offers it.
  for (const p of r.spellPicks) {
    const owner = p.from ? r.reg.get(p.from) : undefined;
    if (!owner || fromOf.has(p.id)) continue;
    const kind = owner.type === "Feat" ? "feat" : /^(Race|Sub Race|Racial Trait)$/.test(owner.type) ? "race" : owner.type === "Background" ? "background" : "class";
    fromOf.set(p.id, `${kind}:${owner.name.replace(/^level \d+:\s*/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`);
  }
  for (const [id, preparation] of prep) {
    const el = r.reg.get(id);
    if (el) add("spell", el.name, { level: Number(el.setters.level?.value) || 0, school: FSCHOOL[(el.setters.school?.value ?? "").toLowerCase()] ?? "", preparation, ...(fromOf.get(id) ? { sourceItem: fromOf.get(id) } : {}), description: { value: el.description } }, { id });
  }
  for (const it of c.inventory) {
    const el = it.id ? r.reg.get(it.id) : undefined;
    const name = itemLabel(it, el?.name) || "Item";
    const type = el?.type === "Weapon" ? "weapon" : el?.type === "Armor" ? "equipment" : "loot";
    add(type, name, { quantity: it.qty, equipped: it.equipped, attunement: it.attuned ? 2 : 0, description: { value: el?.description ?? html(it.custom?.description ?? "") } });
  }
  const abilities = Object.fromEntries(ABILITY_IDS.map((a) => {
    const line = sheet.abilities.find((x) => x.id === a)!;
    return [ABBR[a], { value: line.score, proficient: line.saveProficient ? 1 : 0, bonuses: { check: "", save: "" } }];
  }));
  const skills = Object.fromEntries(sheet.skills.map((s) => [FSKILL[s.name.toLowerCase()] ?? s.name.slice(0, 3).toLowerCase(), { value: s.level === "expertise" ? 2 : s.level === "proficient" ? 1 : 0, ability: ABBR[s.ability] }]));
  const hp = c.play.hp ?? sheet.hp;
  return {
    name: c.name || "Character",
    type: "character",
    img: c.portrait && c.portrait.startsWith("data:") ? "icons/svg/mystery-man.svg" : "icons/svg/mystery-man.svg",
    system: {
      abilities, skills,
      attributes: { hp: { value: hp, max: sheet.hp, temp: c.play.tempHp }, ac: { flat: sheet.ac.value, calc: "flat" }, movement: { walk: sheet.speed, units: "ft" }, exhaustion: c.play.exhaustion ?? 0 },
      currency: { ...c.coins },
      details: {
        alignment: c.info.alignment, gender: c.info.gender, age: c.info.age, height: c.info.height, weight: c.info.weight, eyes: c.info.eyes, hair: c.info.hair, skin: c.info.skin,
        faith: c.info.deity, trait: c.info.traits, ideal: c.info.ideals, bond: c.info.bonds, flaw: c.info.flaws, xp: { value: c.xp },
        biography: { value: html(c.info.backstory ?? ""), public: "" },
      },
    },
    items, effects: [], flags: {}, prototypeToken: { name: c.name || "Character" },
    _stats: { systemId: "dnd5e", systemVersion: "3.2.0", coreVersion: "11.315" },
  };
}

export function exportRoll20(r: Resolved): Record<string, unknown> {
  const sheet = buildSheet(r);
  const { c, race, background, subclass, classes } = details(r);
  const attribs: { name: string; current: string | number; max: string; id: string }[] = [];
  const set = (name: string, current: string | number) => attribs.push({ name, current, max: "", id: `-${rid(19)}` });
  set("character_name", c.name || "Character");
  const main = classes[0];
  set("class", main?.name ?? "");
  set("base_level", sheet.level);
  set("level", sheet.level);
  set("subclass", subclass);
  classes.slice(1, 4).forEach((k, i) => { set(`multiclass${i + 1}`, k.name); set(`multiclass${i + 1}_lvl`, k.level); });
  set("race", race);
  set("background", background);
  for (const a of ABILITY_IDS) { set(a, sheet.abilities.find((x) => x.id === a)!.score); if (sheet.abilities.find((x) => x.id === a)!.saveProficient) set(`${a}_save_prof`, `(@{pb})`); }
  for (const s of sheet.skills) if (s.level !== "none") { set(`${R20SKILL(s.name.toLowerCase())}_prof`, "(@{pb}*@{ability_flag})"); if (s.level === "expertise") set(`${R20SKILL(s.name.toLowerCase())}_type`, 2); }
  set("hp", c.play.hp ?? sheet.hp);
  attribs[attribs.length - 1].max = String(sheet.hp);
  for (const k of ["cp", "sp", "ep", "gp", "pp"] as const) set(k, c.coins[k]);
  set("alignment", c.info.alignment ?? "");
  for (const [k, v] of Object.entries({ age: c.info.age, height: c.info.height, weight: c.info.weight, eyes: c.info.eyes, hair: c.info.hair, skin: c.info.skin, gender: c.info.gender, personality_traits: c.info.traits, ideals: c.info.ideals, bonds: c.info.bonds, flaws: c.info.flaws })) set(k, v ?? "");
  set("xp", c.xp);
  const row = (section: string, fields: Record<string, string | number>) => {
    const id = `-${rid(19)}`;
    for (const [k, v] of Object.entries(fields)) set(`repeating_${section}_${id}_${k}`, v);
  };
  for (const it of c.inventory) {
    const el = it.id ? r.reg.get(it.id) : undefined;
    row("inventory", { itemname: itemLabel(it, el?.name) || "Item", itemcount: it.qty, equipped: it.equipped ? 1 : 0 });
  }
  const seen = new Set<string>();
  for (const line of sheet.casting) for (const p of [...line.cantripsKnown, ...line.spells, ...line.granted]) {
    const el = r.reg.get(p.id);
    if (!el || seen.has(el.id)) continue;
    seen.add(el.id);
    const lvl = Number(el.setters.level?.value) || 0;
    row(lvl === 0 ? "spell-cantrip" : `spell-${lvl}`, { spellname: el.name, spelllevel: lvl === 0 ? "cantrip" : lvl });
  }
  for (const f of sheet.features.filter((x) => x.type === "Feat")) row("traits", { name: f.name, source: "Feat", description: stripTags(f.text) });
  return { schema_version: 3, type: "character", character: { oldId: rid(19), name: c.name || "Character", avatar: "", bio: html(c.info.backstory ?? ""), gmnotes: "", defaulttoken: "", tags: "", controlledby: "", inplayerjournals: "", attribs, abilities: [] } };
}
