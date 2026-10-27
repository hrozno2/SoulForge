/**
 * Exporters for other tools: a Foundry VTT dnd5e actor and a Roll20 character in the shape its 5e sheet reads.
 * Both are best effort and name-based. Items come across with their descriptions but without links to any compendium,
 * so the target tool shows them as plain items and features.
 */
import { ABILITY_IDS, itemLabel, type AbilityId } from "./character";
import type { Resolved } from "./engine";
import type { AElement } from "./types";
import { buildSheet } from "./sheet";

const ABBR: Record<AbilityId, string> = { strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha" };
const FSKILL: Record<string, string> = { acrobatics: "acr", "animal handling": "ani", arcana: "arc", athletics: "ath", deception: "dec", history: "his", insight: "ins", intimidation: "itm", investigation: "inv", medicine: "med", nature: "nat", perception: "prc", performance: "prf", persuasion: "per", religion: "rel", "sleight of hand": "slt", stealth: "ste", survival: "sur" };
const R20SKILL = (n: string) => n.replace(/ /g, "_");
const html = (t: string) => (t ? `<p>${t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n+/g, "</p><p>")}</p>` : "");
const stripTags = (t: string) => t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const rid = (n: number) => Array.from({ length: n }, () => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 62)]).join("");

/** dnd5e's spell school keys. */
const FSCHOOL: Record<string, string> = { abjuration: "abj", conjuration: "con", divination: "div", enchantment: "enc", evocation: "evo", illusion: "ill", necromancy: "nec", transmutation: "trs" };

const lineagesOf = (r: Resolved) => r.active.filter((a) => /^(Sub Race|Race Variant)$/.test(a.el.type)).map((a) => a.el);

function details(r: Resolved) {
  const c = r.character;
  const nameOf = (id?: string) => (id ? r.reg.get(id)?.name ?? "" : "");
  const subEl = r.active.find((a) => a.el.type === "Archetype")?.el;
  // The species' subrace or lineage (Sea Elf, Water Genasi, White Dragonborn): named with it, as "Elf (Sea Elf)".
  const lineages = r.active.filter((a) => /^(Sub Race|Race Variant)$/.test(a.el.type)).map((a) => a.el);
  // The species' ancestry or legacy, as Foundry names it: "Dragonborn (Blue)".
  const ancestry = r.slots.filter((x) => x.root === "race" && /ancestry|legacy|lineage|heritage/i.test(x.rule.name)).flatMap((x) => x.chosen).map((id) => r.reg.get(id)?.name).filter((n): n is string => !!n && !/ancestry|legacy/i.test(n));
  const race = nameOf(c.race) + (ancestry.length && !lineagesOf(r).length ? ` (${ancestry.join("; ")})` : "");
  // Choices the species itself asks for (Fiendish Legacy, the legacy's spellcasting ability): the importer places them by id.
  const speciesPicks = r.slots.filter((x) => x.root === "race").flatMap((x) => x.chosen).map((id) => r.reg.get(id)).filter((e): e is NonNullable<typeof e> => !!e && e.type === "Racial Trait" && !lineages.includes(e));
  return {
    speciesPicks,
    c, race: lineages.length ? `${race} (${lineages.map((l) => l.name).join("; ")})` : race, lineages,
    background: nameOf(c.background), subclass: subEl?.name ?? "", subclassId: subEl?.id,
    classes: c.classes.map((x) => ({ name: nameOf(x.classId), level: x.level, id: x.classId })),
  };
}

/**
 * dnd5e's item type for an element: weapons by category (simpleM, martialR) with their base item, armour by weight, and
 * gear by use: ammunition, potions and flasks, food, and gear that is used up are consumables; clothes, lamps and kits
 * equipment; tools, kits and instruments tools; things that hold other things containers; the rest loot.
 */
export function foundryItemType(el: AElement | undefined, name: string): { type: string; system: Record<string, unknown> } {
  const n = name.toLowerCase();
  const key = n.replace(/\s*\(.*\)\s*/g, "").replace(/[^a-z]/g, "");
  if (el?.type === "Weapon" || /^ID_INTERNAL_WEAPON_CATEGORY/.test(el?.supports.find((x) => x.startsWith("ID_INTERNAL_WEAPON_CATEGORY")) ?? "")) {
    const cat = el?.supports.find((x) => x.startsWith("ID_INTERNAL_WEAPON_CATEGORY_")) ?? "";
    const value = `${/MARTIAL/.test(cat) ? "martial" : "simple"}${/RANGED/.test(cat) ? "R" : "M"}`;
    return { type: "weapon", system: { type: { value, baseItem: key } } };
  }
  if (el?.type === "Armor") {
    const w = String(el.setters.armor?.value ?? "").toLowerCase();
    const value = /shield/.test(n) || w === "shield" ? "shield" : w === "light" || w === "medium" || w === "heavy" ? w : "clothing";
    return { type: "equipment", system: { type: { value, baseItem: key.replace(/armor$/, "") } } };
  }
  if (el?.supports.includes("container") || /^(backpack|pouch|sack|chest|barrel|basket|bag|waterskin|quiver|case|component pouch)\b/.test(n)) return { type: "container", system: {} };
  if (/\b(tools|supplies|utensils|kit|set)\b/.test(n) && !/\b(mess kit|climber)/.test(n)) return { type: "tool", system: { type: { value: /\b(supplies|utensils|tools)\b/.test(n) && !/thieves|navigator/.test(n) ? "art" : "" } } };
  if (/\b(arrows?|bolts?|bullets?|needles?|ammunition)\b/.test(n)) return { type: "consumable", system: { type: { value: "ammo" } } };
  if (el?.type === "Magic Item" && /potion/i.test(String(el.setters.type?.value ?? ""))) return { type: "consumable", system: { type: { value: "potion" } } };
  if (/\b(potion|oil|acid|alchemist's fire|holy water|antitoxin|perfume|poison)\b/.test(n)) return { type: "consumable", system: { type: { value: "potion" } } };
  if (/\b(rations?|food|bread|cheese|meat|wine|ale)\b/.test(n)) return { type: "consumable", system: { type: { value: "food" } } };
  if (/\b(torch|rope|caltrops|candle|ball bearings|chalk|pitons?|spikes|paper|parchment|ink|string|soap)\b/.test(n)) return { type: "consumable", system: { type: { value: "trinket" } } };
  if (/\b(clothes|robes?|costume|vestments|tinderbox|lamp|lantern|bedroll|blanket|mess kit|mirror|signet|ring|amulet)\b/.test(n)) return { type: "equipment", system: { type: { value: "trinket" } } };
  return { type: "loot", system: { type: { value: "gear" } } };
}

export function exportFoundry(r: Resolved): Record<string, unknown> {
  const sheet = buildSheet(r);
  const { c, race, lineages, speciesPicks, background, subclass, subclassId, classes } = details(r);
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
  // Every pick made in a class's, the species' or the background's own choices (feats, improvements, fighting styles,
  // invocations; spells travel as spells), so an import makes the same picks instead of guessing.
  const picksUnder = (root: string) => r.slots.filter((x) => x.root === root && x.rule.type !== "Spell" && !x.listItems).flatMap((x) => x.chosen);
  for (const k of classes) add("class", k.name, { levels: k.level, identifier: ident(k.name), description: { value: "" } }, { id: k.id, choices: picksUnder(`class:${k.id}`) });
  const subOf = r.active.find((a) => a.el.id === subclassId)?.root ?? "";
  const subClass = subOf.startsWith("class:") ? r.reg.get(subOf.slice(6))?.name ?? "" : classes[0]?.name ?? "";
  if (subclass) add("subclass", subclass, { identifier: ident(subclass), classIdentifier: ident(subClass), description: { value: "" } }, { id: subclassId });
  if (race) add("race", race, { description: { value: "" } }, { id: c.race, lineages: [...lineages, ...speciesPicks].map((l) => l.id), choices: picksUnder("race") });
  if (background) add("background", background, { description: { value: "" } }, { id: c.background, choices: picksUnder("background") });
  // A feat's own choices go with it (Magic Initiate's list and ability, Resilient's ability, Skilled's skills), and
  // their choices in turn, so an import makes the same picks.
  const choicesUnder = (id: string, depth = 0): string[] => depth > 3 ? [] : r.slots.filter((s) => s.owner.id === id).flatMap((s) => s.chosen.flatMap((c) => [c, ...choicesUnder(c, depth + 1)]));
  const feats = sheet.features.filter((x) => x.type === "Feat");
  // Class, subclass, species and background features too, as dnd5e's feature items (type class, race, background),
  // with their uses ("3/Long Rest": three uses, all back on a long rest).
  const KIND: Record<string, string> = { "Class Feature": "class", "Archetype Feature": "class", "Optional Feature": "class", "Racial Trait": "race", "Background Feature": "background" };
  // Every feature the character has, also those the sheet does not show (Extra Attack, Bonus Proficiencies), named as
  // Foundry names them: without "Level 5:", with straight apostrophes, an option with what it was chosen for
  // ("Fighting Style: Interception", "Runes: Fire Rune"), a sense as a species feature ("Darkvision").
  const usesOf = new Map(sheet.features.map((f) => [f.id, f]));
  const chosenFor = new Map<string, string>();
  for (const sl of r.slots) for (const id of sl.chosen) {
    const label = /^fighting style\b/i.test(sl.rule.name) ? "Fighting Style" : /^runes?\b/i.test(sl.rule.name) ? "Runes" : undefined;
    if (label) chosenFor.set(id, label);
  }
  const foundryName = (n: string, id: string) => {
    const base = n.replace(/^level \d+:\s*/i, "").replace(/[’‘]/g, "'");
    return chosenFor.has(id) ? `${chosenFor.get(id)}: ${base}` : base;
  };
  for (const f of feats) add("feat", foundryName(f.name, f.id), { description: { value: html(stripTags(f.text)) }, type: { value: "feat" } }, f.id ? { id: f.id, choices: choicesUnder(f.id) } : {});
  const listed = new Set<string>();
  for (const a of r.active) {
    const kind = KIND[a.el.type] ?? (a.el.type === "Vision" ? "race" : undefined);
    if (!kind || listed.has(a.el.id) || /\bsubclass$|^(level \d+: )?ability score improvement$/i.test(a.el.name)) continue;
    listed.add(a.el.id);
    const f = usesOf.get(a.el.id);
    const u = /(\d+)\s*\/\s*(short|long)/i.exec(f?.usage ?? "");
    const uses = u ? { max: u[1], spent: 0, recovery: [{ period: u[2].toLowerCase() === "short" ? "sr" : "lr", type: "recoverAll" }] } : undefined;
    const name = a.el.type === "Vision" ? a.el.name.replace(/\s*\(.*\)\s*$/, "") : foundryName(a.el.name, a.el.id);
    add("feat", name, { description: { value: f ? html(stripTags(f.text)) : a.el.description }, type: { value: kind }, ...(uses ? { uses } : {}) }, { id: a.el.id });
  }
  // Each spell once, with how it is ready (dnd5e's preparation): always prepared from a feature, prepared today, or
  // known (cantrips and the spells of a class that does not prepare).
  const prep = new Map<string, { mode: string; prepared: boolean }>();
  const inChoice = new Set(r.slots.filter((x) => x.rule.type === "Spell").flatMap((x) => x.chosen));
  const fromOf = new Map<string, string>();
  for (const line of sheet.casting) {
    for (const p of line.cantripsKnown) prep.set(p.id, { mode: "prepared", prepared: true });
    for (const p of line.granted) prep.set(p.id, { mode: "always", prepared: true });
    // A spell held in a choice (a Mystic Arcanum, a Book of Ancient Secrets ritual, a 2024 class's chosen spells) is one
    // the character has, so it is ready; only spells merely on a whole class list carry their prepared mark.
    for (const p of line.spells) if (!prep.has(p.id)) prep.set(p.id, { mode: "prepared", prepared: inChoice.has(p.id) || p.granted || !line.prepare || p.prepared });
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
  // Items as dnd5e types them (Foundry's own actor for the same character, Chris 2026-10-26): weapons and armour by
  // category, gear by use; an item keeps the container it is in.
  const fid = new Map(c.inventory.map((it) => [it.uid, rid(16)]));
  for (const it of c.inventory) {
    const el = it.id ? r.reg.get(it.id) : undefined;
    const name = (itemLabel(it, el?.name) || "Item").replace(/[’‘]/g, "'");
    const kind = foundryItemType(el, name);
    const system: Record<string, unknown> = { quantity: it.qty, equipped: it.equipped, attunement: it.attuned ? 2 : 0, description: { value: el?.description ?? html(it.custom?.description ?? "") }, ...kind.system };
    if (it.container && fid.has(it.container)) system.container = fid.get(it.container);
    const before = items.length;
    add(kind.type, name, system, el ? { id: el.id } : {});
    (items[before] as { _id: string })._id = fid.get(it.uid)!;
  }
  // Every dnd5e actor has an Unarmed Strike (a natural weapon); importing skips it again.
  add("weapon", "Unarmed Strike", { type: { value: "natural", baseItem: "" }, quantity: 1, equipped: true, description: { value: "" } });
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
