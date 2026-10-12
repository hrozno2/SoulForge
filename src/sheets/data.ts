import { companionHtml } from "../aurora/companion";
import type { Resolved } from "../aurora/engine";
import { headerInfo, type SheetData } from "../aurora/sheet";
import { ABILITY_IDS, ABILITY_LABEL, SKILL_ABILITY, type AbilityId } from "../aurora/character";

export interface SpellRow {
  level: string;
  name: string;
  school: string;
  time: string;
  range: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  v: boolean;
  s: boolean;
  m: boolean;
  notes: string;
  /** Prepared or always prepared. Kept apart from the notes, which may be translated. */
  prepared?: boolean;
}

export interface CompanionFill {
  name: string;
  type: string;
  creature: string;
  size: string;
  alignment: string;
  cr: string;
  ac: string;
  speed: string;
  hp: string;
  hitDice: string;
  abilities: Record<string, string>;
  traits: string;
  actions: { name: string; bonus: string; damage: string }[];
  skills: string;
  senses: string;
  languages: string;
}

export interface FillData {
  name: string;
  background: string;
  className: string;
  species: string;
  subclass: string;
  level: number;
  xp: number;
  ac: number;
  shield: boolean;
  hpMax: number;
  hpCurrent: number;
  hpTemp: number;
  hdSpent: number;
  hdMax: string;
  speed: string;
  size: string;
  darkvision: string;
  inspiration: boolean;
  conditions: string;
  exhaustion: string;
  deathSuccess: number;
  deathFail: number;
  profBonus: string;
  initiative: string;
  /** Passive Perception as the sheet works it out, including feats and other bonuses. */
  passive: string;
  abilities: Record<AbilityId, { score: string; mod: string; save: string; saveProf: boolean }>;
  skills: Record<string, { bonus: string; prof: boolean; expert: boolean }>;
  armorTraining: { light: boolean; medium: boolean; heavy: boolean; shield: boolean };
  weaponTraining: { simple: boolean; martial: boolean; improvised: boolean };
  tools: string;
  languages: string;
  traits: string[];
  feats: string[];
  classFeatures: string[];
  weapons: { name: string; bonus: string; damage: string; notes: string }[];
  casting?: { ability: string; mod: string; dc: string; attack: string; focus: string; slots: number[]; used: number[] };
  spells: SpellRow[];
  armorWorn: string;
  weaponsText: string;
  otherGear: string;
  magicItems: { name: string; attuned: boolean }[];
  coins: { cp: string; sp: string; ep: string; gp: string; pp: string };
  carryCapacity: string;
  pushDrag: string;
  backstory: string;
  personality: string;
  appearance: string;
  alignment: string;
  notes: string;
  /** Features that did not fit the first page, for the "additional features" box. */
  portrait?: string;
  companion?: CompanionFill;
  /** Every feature with its full text, grouped, for sheets with room to print it. */
  /** Details a sheet may have its own boxes for. */
  body: { age: string; height: string; weight: string; eyes: string; hair: string; skin: string; gender: string; deity: string; allies: string; player: string };
  featureList: { group: string; name: string; usage: string; text: string }[];
}

/** Pulls attack lines out of a stat block's action text: name, to-hit and damage. */
export function parseActions(html: string): { name: string; bonus: string; damage: string }[] {
  const out: { name: string; bonus: string; damage: string }[] = [];
  for (const m of html.matchAll(/<p>\s*<b>([^<]+?)\.?<\/b>\.?\s*([\s\S]*?)<\/p>/g)) {
    const body = m[2].replace(/<[^>]+>/g, " ");
    const hit = body.match(/([+-]\d+)\s*to hit/);
    const dmg = body.match(/\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)\s*([a-z]+)\s+damage/i);
    if (hit || dmg) out.push({ name: m[1].trim(), bonus: hit?.[1] ?? "", damage: dmg ? `${dmg[1].replace(/\s+/g, "")} ${dmg[2]}` : "" });
  }
  return out;
}

const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));

const TIME: [RegExp, string][] = [[/^(1 )?action$/i, "1A"], [/^(1 )?bonus action$/i, "1BA"], [/^(1 )?reaction.*/i, "1R"], [/^1 minute$/i, "1m"], [/^(\d+) minutes?$/i, "$1m"], [/^1 hour$/i, "1h"], [/^(\d+) hours?$/i, "$1h"]];
export const shortTime = (s: string) => TIME.reduce((t, [re, to]) => (re.test(t) ? t.replace(re, to) : t), s.trim());
export const shortRange = (s: string) => s.replace(/\s*feet\b/i, " ft").replace(/\s*mile(s)?\b/i, " mi").replace(/^Self \((.*)\)$/i, "S ($1)").trim();
export function shortDuration(s: string): { text: string; conc: boolean } {
  const conc = /concentration/i.test(s);
  const t = s.replace(/concentration,?\s*(up to)?\s*/i, "").replace(/instantaneous/i, "Inst").replace(/\s*minutes?\b/i, " min").replace(/\s*hours?\b/i, " hr").replace(/\s*rounds?\b/i, " rd").trim();
  return { text: t, conc };
}

const sentence = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  return stop > max * 0.5 ? cut.slice(0, stop + 1) : `${cut.trimEnd()}...`;
};

const has = (r: Resolved, id: string) => r.ids.has(id);

/** A companion's stat block in the shape the sheets use. */
export function companionFill(el: import("../aurora/types").AElement, name: string, reg?: import("../aurora/registry").ARegistry): CompanionFill {
  const s = el.setters;
  const v = (k: string) => s[k]?.value ?? "";
  const strip = (h: string) => h.replace(/<\/p>/g, "\n").replace(/<[^>]+>/g, "").trim();
  const dice = v("hp").match(/\((\d+d\d+)/)?.[1] ?? "";
  return {
    name, type: el.name, creature: v("type"), size: v("size"), alignment: v("alignment"), cr: v("challenge"), ac: v("ac"), speed: v("speed"),
    hp: v("hp"), hitDice: dice, skills: v("skills"), senses: v("senses"), languages: v("languages"),
    abilities: Object.fromEntries(ABILITY_IDS.map((a) => [a, v(a)])), traits: strip(companionHtml(v("traits"), reg) + companionHtml(v("actions"), reg)), actions: parseActions(companionHtml(v("actions"), reg)),
  };
}

export function buildFillData(r: Resolved, sh: SheetData): FillData {
  const ch = r.character;
  const head = headerInfo(r);
  const abilities = {} as FillData["abilities"];
  for (const a of sh.abilities) abilities[a.id] = { score: String(a.score), mod: signed(a.mod), save: signed(a.save), saveProf: a.saveProficient };
  const skills: FillData["skills"] = {};
  for (const s of sh.skills) skills[s.name] = { bonus: signed(s.bonus), prof: s.level !== "none", expert: s.level === "expertise" };

  const profText = [...sh.proficiencies.armor, ...sh.proficiencies.weapons].join(" ").toLowerCase();
  const armorTraining = {
    light: /light armor|all armor/.test(profText), medium: /medium armor|all armor/.test(profText),
    heavy: /heavy armor|all armor/.test(profText), shield: /shield/.test(profText),
  };
  const weaponTraining = { simple: /simple/.test(profText), martial: /martial/.test(profText), improvised: false };
  const other = [...sh.proficiencies.weapons.filter((w) => !/simple|martial/i.test(w)).map((w) => w.replace(/^Weapon Proficiency \((.*)\)$/, "$1")), ...sh.proficiencies.tools.map((t) => t.replace(/^Tool Proficiency \((.*)\)$/, "$1")), ...sh.proficiencies.other];

  const feat = (types: string[]) => sh.features.filter((f) => types.includes(f.type));
  const line = (f: { name: string; usage?: string; text: string }, max: number) => `${f.name}${f.usage ? ` (${f.usage})` : ""}: ${sentence(f.text, max)}`;

  // Spells: cantrips first, then by level. Prepare casters list what is prepared plus what is always prepared.
  const spells: SpellRow[] = [];
  const seen = new Set<string>();
  for (const c of sh.casting) {
    const list = [...c.cantripsKnown, ...(c.prepare ? [...c.granted, ...c.spells.filter((s) => s.prepared)] : [...c.spells, ...c.granted])];
    for (const p of list) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const el = r.reg.get(p.id);
      if (!el) continue;
      const set = (k: string) => el.setters[k]?.value ?? "";
      const dur = shortDuration(set("duration"));
      spells.push({
        level: set("level") || "0", name: el.name, school: set("school").slice(0, 4), time: shortTime(set("time")), range: shortRange(set("range")),
        duration: dur.text, concentration: dur.conc || set("isConcentration") === "true", ritual: set("isRitual") === "true",
        v: set("hasVerbalComponent") === "true", s: set("hasSomaticComponent") === "true", m: set("hasMaterialComponent") === "true",
        notes: set("level") === "0" ? "" : p.granted ? "always prepared" : c.prepare ? "prepared" : "",
        prepared: set("level") !== "0" && (p.granted || c.prepare),
      });
    }
  }
  spells.sort((a, b) => Number(a.level) - Number(b.level) || a.name.localeCompare(b.name));

  const first = sh.casting[0];
  const slots = Array(9).fill(0) as number[];
  const used = Array(9).fill(0) as number[];
  for (const c of sh.casting) for (const s of c.slots) { slots[s.level - 1] = Math.max(slots[s.level - 1], s.total); used[s.level - 1] = s.used; }
  const casting = first
    ? {
        ability: first.ability ? `${first.ability.charAt(0).toUpperCase()}${first.ability.slice(1)}` : "",
        mod: signed(sh.abilities.find((a) => a.id === first.ability)?.mod ?? 0),
        dc: String(first.dc), attack: signed(first.attack),
        focus: r.character.inventory.map((i) => (i.id ? r.reg.get(i.id) : undefined)).find((e) => e && /focus|holy symbol|amulet|emblem|reliquary|component pouch|spellbook/i.test(e.name))?.name ?? "",
        slots, used,
      }
    : undefined;

  const inv = ch.inventory.map((i) => ({ i, el: i.id ? r.reg.get(i.id) : undefined }));
  const nm = (x: { i: { qty: number; custom?: { name: string } }; el?: { name: string } }) => `${x.i.qty > 1 ? `${x.i.qty} ` : ""}${x.el?.name ?? x.i.custom?.name ?? "?"}`;
  const armor = inv.find((x) => x.i.equipped && x.el?.type === "Armor" && !/shield/i.test(x.el.name));
  const weaponsText = inv.filter((x) => x.el?.type === "Weapon").map(nm).join("\n");
  const gear = inv.filter((x) => !(x.el?.type === "Weapon") && !(x.el?.type === "Armor" && x.i.equipped)).filter((x) => !(x.el && /magic/i.test(x.el.type) && x.i.equipped)).map(nm).join("\n");
  const magic = inv.filter((x) => x.el?.type === "Magic Item" || /requires attunement/i.test(x.el?.setters.rarity?.value ?? "")).map((x) => ({ name: nm(x), attuned: x.i.attuned }));

  const firstComp = r.active.find((a) => a.el.type === "Companion")?.el ?? (ch.companions[0] ? r.reg.get(ch.companions[0].id) : undefined);
  const comp = firstComp ? companionFill(firstComp, ch.companions.find((c) => c.id === firstComp.id)?.name ?? firstComp.name, r.reg) : undefined;

  return {
    name: ch.name, background: head.background, className: ch.classes.map((c) => r.reg.get(c.classId)?.name ?? "").join(" / "),
    species: head.species, subclass: head.subclass === "-" ? "" : head.subclass, level: sh.level, xp: ch.xp,
    ac: sh.ac.value, shield: inv.some((x) => x.i.equipped && x.el?.type === "Armor" && /shield/i.test(x.el.name)),
    hpMax: sh.hp, hpCurrent: ch.play.hp ?? sh.hp, hpTemp: ch.play.tempHp, hdSpent: ch.play.hitDiceUsed,
    hdMax: sh.hitDice.map((h) => `${h.count}d${h.die}`).join("+"), speed: String(sh.speed), size: head.size, darkvision: (() => {
      const v = r.active.find((a) => a.el.type === "Vision" && /darkvision/i.test(a.el.name));
      if (!v) return "";
      const m = `${v.el.name} ${v.el.description}`.match(/(\d+)\s*(?:ft|feet)/i);
      return m ? `${m[1]} ft` : "yes";
    })(),
    inspiration: ch.play.inspiration, conditions: ch.play.conditions.join(", "), exhaustion: ch.play.conditions.find((c) => /exhaustion/i.test(c)) ? "1" : "",
    deathSuccess: ch.play.deathSaves.success, deathFail: ch.play.deathSaves.fail,
    profBonus: signed(sh.proficiency), initiative: signed(sh.initiative), passive: String(sh.passivePerception), abilities, skills, armorTraining, weaponTraining,
    tools: other.join(", "), languages: sh.proficiencies.languages.join(", "),
    traits: feat(["Racial Trait"]).map((f) => line(f, 160)), feats: feat(["Feat", "Feat Feature", "Background Feature"]).map((f) => line(f, 160)),
    classFeatures: feat(["Class Feature", "Archetype Feature"]).map((f) => line(f, 260)),
    weapons: sh.attacks.map((a) => ({ name: a.name, bonus: signed(a.bonus), damage: `${a.damage} ${a.damageType}`.trim(), notes: [a.properties, a.notes].filter(Boolean).join("; ") })),
    casting, spells, armorWorn: armor?.el?.name ?? "", weaponsText, otherGear: gear, magicItems: magic,
    coins: { cp: String(ch.coins.cp), sp: String(ch.coins.sp), ep: String(ch.coins.ep), gp: String(ch.coins.gp), pp: String(ch.coins.pp) },
    carryCapacity: String(sh.weight.capacity), pushDrag: String(sh.weight.capacity * 2),
    backstory: [ch.info.backstory, ch.info.allies && `Allies: ${ch.info.allies}`].filter(Boolean).join("\n\n"),
    personality: [...sh.lists.map((l) => `${l.name}: ${l.texts.join(" ")}`), ch.info.traits && `Traits: ${ch.info.traits}`, ch.info.ideals && `Ideals: ${ch.info.ideals}`, ch.info.bonds && `Bonds: ${ch.info.bonds}`, ch.info.flaws && `Flaws: ${ch.info.flaws}`].filter(Boolean).join("\n"),
    appearance: [ch.info.gender, ch.info.age && `Age ${ch.info.age}`, ch.info.height, ch.info.weight, ch.info.eyes && `${ch.info.eyes} eyes`, ch.info.hair && `${ch.info.hair} hair`, ch.info.skin && `${ch.info.skin} skin`].filter(Boolean).join(", "),
    alignment: ch.info.alignment, notes: ch.notes, portrait: ch.portrait, companion: comp,
    body: { age: ch.info.age ?? "", height: ch.info.height ?? "", weight: ch.info.weight ?? "", eyes: ch.info.eyes ?? "", hair: ch.info.hair ?? "", skin: ch.info.skin ?? "", gender: ch.info.gender ?? "", deity: ch.info.deity ?? "", allies: ch.info.allies ?? "", player: ch.playerName ?? "" },
    featureList: ([["Class features", ["Class Feature", "Archetype Feature"]], ["Species traits", ["Racial Trait"]], ["Feats", ["Feat", "Feat Feature", "Background Feature"]]] as [string, string[]][]).flatMap(([group, types]) => feat(types).map((f) => ({ group, name: f.name, usage: f.usage ?? "", text: f.text.replace(/\s+/g, " ").trim() }))),
  };
}

export { ABILITY_LABEL, SKILL_ABILITY, has };
