import { canonicalName, effectsOfKind } from "../engine/effects";
import { conceptOf, conceptOfMarker } from "../engine/concepts";
import type { AElement } from "./types";
import { evalFormula } from "./stats";
import { FULL_CASTER_SLOTS, itemWeight, multiclassCasterLevel, sharedSlotLevel, type ActiveElement, type Resolved, type SpellPick } from "./engine";
import { ABILITY_IDS, SKILL_ABILITY, itemLabel, type AbilityId } from "./character";
import { isModern as modern } from "./edition";

const lc = (s: string) => s.toLowerCase();
const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));

export interface AbilityLine {
  id: AbilityId;
  score: number;
  mod: number;
  save: number;
  saveProficient: boolean;
}

export interface SkillLine {
  name: string;
  ability: AbilityId;
  bonus: number;
  passive: number;
  level: "none" | "proficient" | "expertise";
}

export interface SpellSlotRow {
  level: number;
  total: number;
  used: number;
}

export interface CastingLine {
  name: string;
  ability: string;
  dc: number;
  attack: number;
  prepare: boolean;
  prepareMax: number;
  slots: SpellSlotRow[];
  /** Pact casters: every slot is cast at this level. */
  pactLevel?: number;
  cantripsKnown: SpellPick[];
  spells: SpellPick[];
  /** Always-prepared spells from features. */
  granted: SpellPick[];
  /** The highest spell level the class may learn or prepare, by its own table (not the shared multiclass slots). */
  maxSpellLevel: number;
}

export interface AttackLine {
  /** Inventory uid for weapons, custom attack uid otherwise. */
  id?: string;
  /** True when the line is worked out from an equipped weapon. */
  auto?: boolean;
  hiddenByEdit?: boolean;
  /** The weapon element, for weapons. */
  elId?: string;
  /** The weapon's +1, +2 or +3. */
  magic?: number;
  name: string;
  bonus: number;
  damage: string;
  damageType: string;
  properties: string;
  notes: string;
}

export interface FeatureLine {
  id: string;
  name: string;
  type: string;
  source: string;
  text: string;
  usage?: string;
  action?: string;
  /** Maximum uses if the element has a `:usage` style stat, else 0. */
  level: number;
  /** The feature whose uses this one spends, and how many (Turn Undead spends a Channel Divinity). */
  consumes?: { id: string; name: string; amount: number };
}

export interface SheetData {
  name: string;
  abilities: AbilityLine[];
  skills: SkillLine[];
  proficiency: number;
  level: number;
  hp: number;
  ac: { value: number; parts: string[] };
  speed: number;
  otherSpeeds: { kind: string; value: number }[];
  initiative: number;
  passivePerception: number;
  hitDice: { die: number; count: number; classId: string; name: string }[];
  casting: CastingLine[];
  proficiencies: { armor: string[]; weapons: string[]; tools: string[]; languages: string[]; other: string[] };
  /** Damage resistances, immunities and vulnerabilities from any source (species, feats, features, items). */
  defenses: { resistances: string[]; immunities: string[]; vulnerabilities: string[] };
  features: FeatureLine[];
  attacks: AttackLine[];
  /** Every attack including ones the player hid, for the editing list. */
  attacksAll: AttackLine[];
  /** The same, counting weapons that are carried but not equipped. Used by sheets when nothing is equipped. */
  attacksCarried: AttackLine[];
  weight: { carried: number; capacity: number };
  attunement: { current: number; max: number };
  size?: string;
  vision: string[];
  /** Chosen text lists such as personality traits and ideals. */
  lists: { name: string; texts: string[] }[];
}

const SHEET_TYPES = ["Racial Trait", "Class Feature", "Archetype Feature", "Feat", "Feat Feature", "Background Feature", "Class Feature Option"];

/** Replace {{stat}} placeholders in sheet text with computed values. */
export function fillTemplate(text: string, r: Resolved): string {
  const MARK = "\u0000";
  const filled = text.replace(/\{\{([^}]+)\}\}/g, (_m, raw: string) => {
    const name = raw.trim().toLowerCase();
    const inline = r.stats.text(name);
    if (inline !== undefined) return inline;
    const v = r.stats.get(name);
    return MARK + (name.endsWith(":modifier") || name.endsWith("modifier") ? signed(v) : String(v));
  });
  // "1d8+{{wisdom:modifier}}" gives one sign, not "1d8++4" or "1d8+-1".
  return filled.replace(/\+\u0000([+-])/g, "$1").replace(/-\u0000\+/g, "-").replace(/-\u0000-/g, "+").replace(/\u0000/g, "");
}

export const stripHtml = (s: string): string =>
  s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h\d|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

function sheetText(a: ActiveElement, r: Resolved): { text: string; usage?: string; action?: string } {
  const sh = a.el.sheet;
  // No sheet text of its own: the description, but still the sheet's uses and action (Aurora's 2014 Channel Divinity
  // has only "{{channel divinity:count}}/Short Rest").
  if (!sh || !sh.descriptions.length) return { text: withSenses(a, r, stripHtml(a.el.description)), usage: sh?.usage ? fillTemplate(sh.usage, r) : undefined, action: sh?.action };
  // The description whose level is the highest not above the owner's level, plus level-less ones.
  const plain = sh.descriptions.filter((d) => d.level === undefined);
  const leveled = sh.descriptions.filter((d) => d.level !== undefined && d.level <= a.ownerLevel).sort((x, y) => x.level! - y.level!);
  const best = leveled.length ? leveled[leveled.length - 1] : plain[0];
  const usage = best?.usage ?? sh.usage;
  const action = best?.action ?? sh.action;
  const body = [...(leveled.length ? [] : plain), ...(leveled.length ? [best] : [])].filter(Boolean);
  let text = body.map((d) => stripHtml(fillTemplate(d!.text, r))).join("\n");
  // A sheet text that ends "...the following benefits:" leaves its list in the description. The items that are not
  // features of their own (Dread Ambusher's Initiative Bonus) are added, so nothing it does goes missing.
  if (/:\s*$/.test(text)) {
    const names = new Set(r.active.map((x) => (x.el.sheet?.alt ?? x.el.name).toLowerCase().replace(/^level \d+: /, "")));
    const items = [...a.el.description.matchAll(/<p[^>]*>\s*<b>\s*<i>([^<]+?)\.?<\/i>\s*<\/b>([\s\S]*?)<\/p>/g)]
      .filter((m) => !names.has(m[1].trim().toLowerCase()))
      .map((m) => `${m[1].trim()}. ${stripHtml(m[2]).trim()}`);
    if (items.length) text = `${text}\n${items.join("\n")}`;
  }
  return { text: withSenses(a, r, text), usage: usage ? fillTemplate(usage, r) : undefined, action };
}

/** A feature that grants darkvision says so, with its range (Umbral Sight's text is only about being unseen). */
function withSenses(a: ActiveElement, r: Resolved, text: string): string {
  const range = a.el.rules.find((x) => x.kind === "stat" && (x as { name?: string }).name === "darkvision:range");
  const grantsVision = a.el.rules.some((x) => x.kind === "grant" && x.type === "Vision");
  if (!range || !grantsVision || /(you have|you gain|grants?) darkvision|darkvision (of |out to )?\d+/i.test(text)) return text;
  const ft = r.stats.get("darkvision:range");
  return ft > 0 ? `You have Darkvision ${ft} ft.${text ? ` ${text}` : ""}` : text;
}

/**
 * The character's trainings by kind, one entry per concept whichever provider gives it (Aurora's "Light Armor" and
 * 5e.tools' "Armor Proficiency (Light Armor)" are one), named as the primary provider names it. Skills and saves
 * have their own lines on the sheet. A tool the character has expertise in is marked so.
 */
function proficiencyGroups(r: Resolved) {
  const out = { armor: [] as string[], weapons: [] as string[], tools: [] as string[], languages: [] as string[], other: [] as string[] };
  const byId = new Map(r.active.map((a) => [a.el.id, a.el]));
  const named = new Map<string, { name: string; aurora: boolean; kind: keyof typeof out }>();
  const toolExpertise = new Set<string>();
  for (const a of r.active) {
    const { el } = a;
    // Individual weapon/armor proficiencies granted by a category (for example "Martial weapons") are implied by it.
    if (el.type === "Proficiency" && byId.get(a.from)?.type === "Proficiency") continue;
    if (el.type !== "Language" && el.type !== "Proficiency") continue;
    const k = conceptOf(el);
    if (k?.startsWith("tool-expertise:")) { toolExpertise.add(k.slice(15)); continue; }
    if (k && /^(skill|expertise|save|size|sense):/.test(k)) continue;
    if (!k && (/_SKILL_|_SAVINGTHROW_|_SAVE_/.test(el.id) || /^ID_INTERNAL_PROFICIENCY/.test(el.id))) continue;
    // By concept; content outside the vocabulary by its id, as before.
    const kind: keyof typeof out = k?.startsWith("language:") || el.type === "Language" ? "languages" : k?.startsWith("armor:") || (!k && /_ARMOR_/.test(el.id)) ? "armor" : k?.startsWith("weapon:") || (!k && /_WEAPON_/.test(el.id)) ? "weapons" : k?.startsWith("tool:") || (!k && /_TOOL|_INSTRUMENT|_GAMING|_ARTISAN|_KIT|_SUPPLIES/.test(el.id)) ? "tools" : "other";
    const key = k ?? `${kind}:${el.name.toLowerCase()}`;
    const had = named.get(key);
    const aurora = el.origin !== "5etools";
    if (!had || (aurora && !had.aurora)) named.set(key, { name: el.name, aurora, kind });
  }
  // Aurora gives tool expertise as a stat ("thieves' tools:proficiency" doubled).
  for (const n of r.stats.names()) { const m = /^(.+(?:tools?|supplies|utensils|kit)):proficiency$/.exec(n); if (m) toolExpertise.add(m[1].replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-")); }
  for (const [key, v] of named) {
    const expert = v.kind === "tools" && toolExpertise.has(key.replace(/^tool:/, ""));
    out[v.kind].push(expert ? `${v.name} (expertise)` : v.name);
  }
  for (const k of Object.keys(out) as (keyof typeof out)[]) out[k] = [...new Set(out[k])].sort();
  return out;
}

const hintTokens = (hint: string | undefined) =>
  (hint ?? "").split(/[,|()]+/).map((t) => t.trim().toLowerCase()).filter((t) => t && !/^\d+$/.test(t));

/** Which spellcasting entry a pick belongs to: the one it names, or the one whose list matches its filter. */
function castingOf(r: Resolved, p: SpellPick): string | undefined {
  if (p.casting && r.spellcasting.has(lc(p.casting))) return lc(p.casting);
  const tokens = hintTokens(p.hint);
  for (const e of r.spellcasting.values()) if (e.lists.some((l) => tokens.includes(lc(l)))) return lc(e.name);
  // A spell a feature grants without naming the spellcasting: a class whose list has it (a domain spell), or none.
  if (p.granted && !p.casting) {
    const supports = (r.reg.get(p.id)?.supports ?? []).map(lc);
    for (const e of r.spellcasting.values()) if (e.lists.some((l) => supports.includes(lc(l)))) return lc(e.name);
  }
  return undefined;
}

function buildCasting(r: Resolved): CastingLine[] {
  const ch = r.character;
  const entries = [...r.spellcasting.values()];
  const nonPact = entries.filter((e) => !(r.stats.get(`${lc(e.name)}:spellcasting:slots:count`) > 0));
  const mcLevel = multiclassCasterLevel(r, r.reg);
  const useShared = nonPact.length > 1 && mcLevel > 0;
  const sharedRow = useShared ? (FULL_CASTER_SLOTS[Math.min(20, mcLevel)] ?? []) : [];

  // Spells from a feat or a species trait whose source says which ability casts them ("Magic Initiate (Wizard)"
  // with Wisdom) get a line of their own; others join the first class's line, or one of their own when there is none.
  const ABIL = ["intelligence", "wisdom", "charisma", "strength", "dexterity", "constitution"];
  const abilityOf = (fromId: string): string | undefined => {
    const child = r.active.find((a) => a.from === fromId && ABIL.includes(lc(a.el.name)));
    if (child) return lc(child.el.name);
    const texts = [r.reg.get(fromId), ...r.active.filter((a) => a.from === fromId).map((a) => a.el)].map((x) => `${x?.description ?? ""} ${x?.sheet?.descriptions.map((d) => d.text).join(" ") ?? ""}`);
    for (const t of texts) {
      // Both ways the books write it: "your spellcasting ability for it is Charisma" and "Charisma is your
      // spellcasting ability for it" (the 2024 Player's Handbook).
      const m = /spellcasting ability for (?:th(?:is|ese)[^.]*?|it)\s+is\s+(intelligence|wisdom|charisma)/i.exec(t) ?? /(intelligence|wisdom|charisma) is your spellcasting ability/i.exec(t);
      if (m) return lc(m[1]);
    }
    return undefined;
  };
  // Granted spells that no class line takes (Light Bearer's Light on a Paladin) always get a line of their own.
  const orphans = r.spellPicks.filter((p) => !castingOf(r, p) && (!entries.length || (p.from && abilityOf(p.from)) || (p.granted && !p.casting)));
  const orphanIds = new Set(orphans.map((p) => p.id));
  const bySource = new Map<string, SpellPick[]>();
  for (const p of orphans) {
    const k = p.from ?? "";
    (bySource.get(k) ?? bySource.set(k, []).get(k)!).push(p);
  }
  const prof = r.stats.get("proficiency");
  const extraLines: CastingLine[] = [...bySource.entries()].map(([fromId, picks]) => {
    const src = r.reg.get(fromId);
    const ability = abilityOf(fromId) ?? ["intelligence", "wisdom", "charisma"].sort((a, b) => r.stats.get(b) - r.stats.get(a))[0];
    const mod = r.stats.get(`${ability}:modifier`);
    const lvl = (id: string) => parseInt(r.reg.get(id)?.setters.level?.value ?? "0", 10) || 0;
    const uniq = picks.filter((p, i) => picks.findIndex((q) => q.id === p.id) === i).map((p) => ({ ...p, prepared: true }));
    const childAlt = r.active.find((a) => a.from === fromId && a.el.sheet?.alt)?.el.sheet?.alt;
    const name = childAlt || src?.sheet?.alt || (src && /feat feature|racial trait/i.test(src.type) && r.reg.get(r.active.find((a) => a.el.id === fromId)?.from ?? "")?.name) || src?.name || "Other spells";
    return {
      name, ability, dc: 8 + prof + mod, attack: prof + mod, prepare: false, prepareMax: 0, slots: [],
      cantripsKnown: uniq.filter((p) => lvl(p.id) === 0),
      spells: uniq.filter((p) => lvl(p.id) > 0 && !p.granted),
      granted: uniq.filter((p) => p.granted),
      maxSpellLevel: Math.max(0, ...uniq.map((p) => lvl(p.id))),
    };
  });

  return [...entries.map((e) => {
    const key = lc(e.name);
    const slots: SpellSlotRow[] = [];
    const isPact = r.stats.get(`${key}:spellcasting:slots:count`) > 0;
    for (let n = 1; n <= 9; n++) {
      const total = useShared && !isPact ? (sharedRow[n - 1] ?? 0) : r.stats.get(`${key}:spellcasting:slots:${n}`);
      if (total > 0) slots.push({ level: n, total, used: ch.play.slotsUsed[String(n)] ?? 0 });
    }
    // Spells with no named entry (racial or feat spells) go to the first entry that can cast from their list.
    const picks = r.spellPicks.filter((p) => !orphanIds.has(p.id) && (castingOf(r, p) ?? lc(entries[0].name)) === key);
    const prepared = new Set(ch.prepared[e.name] ?? []);
    const spells: SpellPick[] = [];
    const cantrips: SpellPick[] = [];
    const granted: SpellPick[] = [];
    const seen = new Set<string>();
    for (const p of picks) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const el = r.reg.get(p.id);
      const lvl = parseInt(el?.setters.level?.value ?? "0", 10) || 0;
      const entry = { ...p, prepared: p.granted || prepared.has(p.id) };
      if (p.granted) granted.push(entry);
      if (lvl === 0) cantrips.push(entry);
      else if (!p.granted) spells.push(entry);
    }
    // A class that prepares from its whole list (a Cleric, every 2024 class) has no picks for its spells: the ones
    // prepared in Magic are the line's spells.
    for (const id of prepared) {
      if (seen.has(id) || granted.some((g) => g.id === id)) continue;
      const lvl = parseInt(r.reg.get(id)?.setters.level?.value ?? "0", 10) || 0;
      if (!r.reg.get(id) || lvl === 0) continue;
      seen.add(id);
      spells.push({ id, casting: e.name, granted: false, prepared: true });
    }
    const maxLevel = slots.length ? slots[slots.length - 1].level : 0;
    // What the class itself may learn and prepare: its own table, as if single-classed (PHB, Multiclassing), not the
    // shared multiclass slots it casts with.
    let ownLevel = 0;
    for (let n = 1; n <= 9; n++) if (r.stats.get(`${key}:spellcasting:slots:${n}`) > 0) ownLevel = n;
    if (isPact) ownLevel = Math.max(ownLevel, r.stats.get(`${key}:spellcasting:slot`));
    return {
      name: e.name,
      ability: e.ability,
      dc: r.stats.get(`${key}:spellcasting:dc`),
      attack: r.stats.get(`${key}:spellcasting:attack`),
      prepare: e.prepare,
      // "Ability modifier + level (minimum of one spell)": a low score never leaves a caster who prepares with none
      // (C7.18; the content's formula has no floor).
      prepareMax: e.prepare ? Math.max(1, r.stats.get(`${key}:spellcasting:prepare`)) : r.stats.get(`${key}:spellcasting:prepare`),
      slots,
      pactLevel: isPact ? r.stats.get(`${key}:spellcasting:slot`) || maxLevel : undefined,
      cantripsKnown: cantrips,
      spells,
      granted,
      maxSpellLevel: ownLevel || maxLevel,
    };
  }), ...extraLines];
}

function buildAc(r: Resolved): { value: number; parts: string[] } {
  const s = r.stats;
  const dex = s.get("dexterity:modifier");
  const parts: string[] = [];
  let armor: AElement | undefined;
  for (const it of r.character.inventory) {
    const el = it.equipped && it.id ? r.reg.get(it.id) : undefined;
    if (el && el.type === "Armor" && lc(el.setters.armor?.value ?? "") !== "shield" && !/shield/i.test(el.name)) armor = el;
  }
  let value: number;
  const armorBase = s.get("ac:armored:armor");
  if (armor && armorBase > 0) {
    const kind = lc(armor.setters.armor?.value ?? "");
    // Medium armor counts Dexterity up to +2, or more where content raises the cap (Medium Armor Master: +3).
    const mediumCap = Math.max(2, s.get("ac:armored:dexterity:cap"));
    // An armor that sets its own Dexterity cap (5e.tools dexterityMax) uses it.
    const own = armor.setters["dexterity max"]?.value;
    const cap = own !== undefined ? Math.min(Number(own) || 0, dex) : kind === "heavy" ? 0 : kind === "medium" ? Math.min(mediumCap, dex) : dex;
    value = armorBase + cap + s.get("ac:armored:enhancement") + s.get("ac:armored:misc");
    parts.push(`${armor.name} ${armorBase}`);
    if (cap) parts.push(`Dex ${signed(cap)}`);
  } else {
    const alt = s.get("ac:calculation");
    const base = Math.max(10 + dex, alt);
    value = base;
    parts.push(alt > 10 + dex ? `Alternate calculation ${alt}` : `10 ${signed(dex)} Dex`);
  }
  // +1, +2 and +3 armor and shields from the inventory.
  let enchant = 0;
  for (const it of r.character.inventory) {
    const el = it.equipped && it.magic && it.id ? r.reg.get(it.id) : undefined;
    if (el?.type === "Armor") enchant += it.magic ?? 0;
  }
  const shield = s.get("ac:shield");
  const misc = s.get("ac:misc") + s.get("ac");
  value += shield + misc + enchant;
  if (shield) parts.push(`Shield ${signed(shield)}`);
  if (enchant) parts.push(`Magic armor ${signed(enchant)}`);
  if (misc) parts.push(`Other ${signed(misc)}`);
  return { value, parts };
}

/**
 * Features that let a weapon attack use another ability, read from their rules text: "you can use your Charisma
 * modifier, instead of Strength or Dexterity, for the attack and damage rolls" (Hex Warrior, Pact of the Blade), "When
 * you attack with a magic weapon, you can use your Intelligence modifier..." (Battle Ready). The conditions the same
 * sentence or paragraph sets are kept: a magic weapon, a weapon without the two-handed property.
 */
export function weaponAbilityOptions(r: Resolved): { ability: AbilityId; magicOnly: boolean; notTwoHanded: boolean; from: string }[] {
  const out: { ability: AbilityId; magicOnly: boolean; notTwoHanded: boolean; from: string }[] = [];
  for (const a of r.active) {
    const text = a.el.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    for (const para of [text]) {
      const m = /use your (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) modifier,? instead of (?:your )?Strength or Dexterity(?: modifiers?)?,? for (?:the )?attack and damage rolls/i.exec(para)
        ?? /use your (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) modifier for (?:the |its |the weapon's )?attack and damage rolls,? instead of (?:using )?(?:your )?Strength or Dexterity/i.exec(para);
      if (!m) continue;
      // The conditions are the granting sentence's ("When you attack with a magic weapon, you can use..."), or the
      // sentence before for a weapon chosen there (Hex Warrior's "lacks the two-handed property").
      const start = para.lastIndexOf(". ", m.index);
      const prev = para.lastIndexOf(". ", Math.max(0, start - 1));
      const sentence = para.slice(start + 1, para.indexOf(".", m.index) + 1 || undefined);
      const around = para.slice(prev + 1, para.indexOf(".", m.index) + 1 || undefined);
      // Only while something is active (Bladesong, a Rage): not the sheet's standing attack.
      if (/while (?:your |the )?[\w' ]{0,30}\bis active|while it(?:'s| is) active|while you(?:'re| are) (?:raging|in)/i.test(para.slice(Math.max(0, m.index - 120), m.index))) continue;
      out.push({ ability: m[1].toLowerCase() as AbilityId, magicOnly: /attack with a magic weapon/i.test(sentence), notTwoHanded: /lacks the two-handed property/i.test(around), from: a.el.name });
    }
  }
  return out;
}

/** Attack lines from equipped weapons and custom attacks. With `carried`, weapons that are only carried count too, once per kind. */
function buildAttacks(r: Resolved, carried = false): AttackLine[] {
  const s = r.stats;
  const prof = s.get("proficiency");
  const out: AttackLine[] = [];
  const mods = (a: AbilityId) => s.get(`${a}:modifier`);
  const weaponAbilities = weaponAbilityOptions(r);
  // Dueling: +2 damage with a melee weapon held in one hand and no other weapon. The content leaves this to the app.
  const dueling = effectsOfKind(r, "one-hand-melee-damage").reduce((m, x) => Math.max(m, x.effect.value), 0);
  const weaponsHeld = r.character.inventory.filter((i) => i.equipped && i.id && r.reg.get(i.id)?.type === "Weapon").length;
  // Weapons mastered: the chosen Weapon Mastery options, named "Longbow (Slow)".
  const dropped = effectsOfKind(r, "drop-property");
  const mastered = new Set(r.active.filter((a) => a.el.supports.includes("Weapon Mastery")).map((a) => a.el.name.replace(/\s*\(.*$/, "").toLowerCase()));
  for (const it of r.character.inventory) {
    const el = it.id ? r.reg.get(it.id) : undefined;
    if ((!it.equipped && !carried) || !el || el.type !== "Weapon") continue;
    // Carried weapons once per kind, a +1 one apart from a plain one.
    if (carried && !it.equipped && out.some((o) => o.elId === el.id && (o.magic ?? 0) === (it.magic ?? 0))) continue;
    const tags = el.supports.map(lc);
    const ranged = tags.some((t) => t.includes("ranged"));
    const finesse = tags.some((t) => t.includes("finesse"));
    // Finesse (a dart too, which is also ranged): the better of Strength and Dexterity, for the attack and the damage.
    const usual: AbilityId = finesse ? (mods("dexterity") > mods("strength") ? "dexterity" : "strength") : ranged ? "dexterity" : "strength";
    // Another ability a feature allows for this weapon (Hex Warrior, Battle Ready), when it is better.
    const twoHandedTag = tags.some((t) => /two.?handed/.test(t));
    const alt = weaponAbilities.filter((o) => (!o.magicOnly || (it.magic ?? 0) > 0 || el.type === "Magic Item" || /^\+\d/.test(el.name)) && (!o.notTwoHanded || !twoHandedTag)).map((o) => o.ability);
    const ability: AbilityId = [usual, ...alt].reduce((best, x) => (mods(x) > mods(best) ? x : best), usual);
    const proficient = (el.setters.proficiency?.value ?? "").split(",").some((id) => r.ids.has(id.trim()));
    const magicAtk = (Number(el.setters.attackBonus?.value) || 0) + (it.magic ?? 0);
    const magicDmg = (Number(el.setters.damageBonus?.value) || 0) + (it.magic ?? 0);
    const kind = ranged ? "ranged" : "melee";
    // Fighting styles and similar features add to every attack of a kind.
    // Bonuses for this kind of weapon by name (Bracers of Archery: longbow:damage; Fell Handed: handaxe:attack).
    const wname = el.name.replace(/^[+-]\d+\s*/, "").replace(/\s*,?\s*[+-]\d+$/, "").replace(/\s*\(.*\)\s*$/, "").toLowerCase();
    const atkExtra = s.get(`${kind}:attack`) + s.get("attack") + magicAtk + s.get(`${wname}:attack`);
    const twoHandedWeapon = tags.some((t) => /two.?handed/.test(t)) || it.twoHanded;
    const duel = dueling && kind === "melee" && !twoHandedWeapon && weaponsHeld <= 1 ? dueling : 0;
    const dmgExtra = s.get(`${kind}:damage`) + s.get("damage") + magicDmg + duel + s.get(`${wname}:damage`);
    const dmg = it.twoHanded && el.setters.versatile ? { value: el.setters.versatile.value, attrs: el.setters.damage?.attrs ?? {} } : el.setters.damage;
    // A 2024 weapon's mastery property applies only when the character has mastered that weapon (issue #3).
    const isMastery = (t: string) => /^ID_WOTC_PHB24_WEAPON_PROPERTY_/.test(t);
    // Properties a feature removes (Crossbow Expert: crossbows lose Loading).
    const lost = dropped.filter((d) => d.effect.weapons.test(el.name)).map((d) => d.effect.property.toUpperCase());
    const props = el.supports
      .filter((t) => /WEAPON_PROPERTY/.test(t) && (!isMastery(t) || mastered.has(el.name.toLowerCase())) && !lost.some((p) => t.toUpperCase().endsWith(p)))
      .map((t) => (isMastery(t) ? "mastery: " : "") + t.replace(/^ID_(INTERNAL|WOTC_PHB24|WOTC_PHB)_WEAPON_PROPERTY_/, "").replace(/_/g, " ").toLowerCase());
    const versatile = el.setters.versatile?.value;
    const edit = r.character.attackEdits?.[it.uid];
    const line: AttackLine = {
      id: it.uid,
      elId: el.id,
      magic: it.magic ?? 0,
      auto: true,
      name: edit?.name?.trim() || itemLabel(it, el.name),
      bonus: mods(ability) + (proficient ? prof : 0) + atkExtra + (edit?.bonusAdjust ?? 0),
      damage: edit?.damage?.trim() || (dmg ? `${dmg.value}${mods(ability) + dmgExtra ? signed(mods(ability) + dmgExtra) : ""}` : ""),
      damageType: edit?.damageType ?? dmg?.attrs.type ?? "",
      properties: [...props.filter((x) => !(versatile && x === "versatile")), versatile && !it.twoHanded ? `versatile (${versatile})` : "", it.twoHanded ? "two-handed" : ""].filter(Boolean).join(", "),
      notes: edit?.notes ?? [proficient ? "" : "not proficient", el.setters.critRange ? `critical hit on ${el.setters.critRange.value}–20` : ""].filter(Boolean).join("; "),
    };
    if (edit?.hidden) line.hiddenByEdit = true;
    out.push(line);
  }
  // Everyone can make an unarmed strike (proficient): 1 + Strength bludgeoning, or a die from Martial Arts, the
  // Unarmed Fighting style or Tavern Brawler; a monk may use Dexterity. Bonuses to unarmed and melee attacks apply.
  if (!out.some((o) => /unarmed strike/i.test(o.name))) out.push(unarmedStrike(r));
  out.push(...featureAttacks(r));
  for (const c of r.character.attacks) {
    const m = mods(c.ability);
    out.push({
      id: c.uid,
      name: c.name,
      bonus: m + (c.proficient ? prof : 0) + c.bonus,
      damage: `${c.damage}${m ? signed(m) : ""}`,
      damageType: c.damageType,
      properties: "",
      notes: c.notes ?? "",
    });
  }
  return out;
}

/**
 * The numbers a feature's content works out for it and that its text does not show: a stat named after the
 * feature ending in dc, damage or attack ("fighter:psionic power:dc", "barbarian rage:damage", "agonizing blast:
 * damage"). "DC 14", "damage +3", "attack +6".
 */
function featureValues(el: AElement, r: Resolved): string {
  const n = canonicalName(el.name);
  if (n.length < 3) return "";
  const out: string[] = [];
  for (const name of r.stats.names()) {
    const parts = name.split(":");
    const last = parts[parts.length - 1];
    if (!["dc", "damage", "attack"].includes(last) || parts.length < 2) continue;
    const owner = parts.slice(0, -1);
    // The feature's own name, alone or after its class ("barbarian rage" for Rage).
    if (!owner.some((p) => p === n || p.endsWith(` ${n}`))) continue;
    if (/^(melee|ranged|unarmed|natural|spellcasting|attack|damage)$/.test(owner[owner.length - 1])) continue;
    const v = r.stats.get(name);
    if (!v) continue;
    out.push(last === "dc" ? `DC ${v}` : `${last} ${v >= 0 ? "+" : ""}${v}`);
  }
  // Values a feature's own statistic gives that its text describes without a number (UA2: the 2019 playtest
  // Artificer's "infusions:vanish", the days an infusion lasts after the artificer dies: Intelligence, at least 1).
  for (const [stat, feature, say] of SAID) {
    if (n !== feature || !r.stats.names().includes(stat)) continue;
    const v = r.stats.get(stat);
    if (v) out.push(say(v));
  }
  return [...new Set(out)].join("; ");
}

const SAID: [string, string, (v: number) => string][] = [
  ["infusions:vanish", "infuse item", (v) => `infusions last ${v} ${v === 1 ? "day" : "days"} after your death`],
];

/**
 * Where an always-prepared spell comes from, in words ("Life Domain", "Magic Initiate"), for the mark's hover and the
 * exported sheets' brackets (C6.5). A feature named only for its spells ("Domain Spells", "Oath of Devotion Spells")
 * names what it belongs to instead, when that says more.
 */
/**
 * How many spells a line can prepare now: its number by the rules, but never more than it has to prepare from (C7.18,
 * Chris 2026-10-29: a Wizard's higher Intelligence asked for more prepared spells than the spellbook held, so the
 * spellbook's count could never be met). A choice never asks for more than it offers.
 */
export function prepareTarget(r: Resolved, line: CastingLine): number {
  return Math.min(line.prepareMax, preparePool(r, line).length);
}

export function grantSource(r: Resolved, p: Pick<SpellPick, "from">): string | undefined {
  const el = p.from ? r.reg.get(p.from) : undefined;
  if (!el) return undefined;
  if (/^(\w+ )?spells$|spell list$/i.test(el.name)) {
    const parent = r.active.find((a) => a.el.id === el.id)?.from;
    const pe = parent ? r.reg.get(parent) : undefined;
    if (pe) return pe.name;
  }
  return el.name;
}

export function buildSheet(r: Resolved): SheetData {
  const s = r.stats;
  const prof = s.get("proficiency");
  const abilities: AbilityLine[] = ABILITY_IDS.map((id) => ({
    id,
    score: s.get(id),
    mod: s.get(`${id}:modifier`),
    save: s.get(`${id}:save`),
    saveProficient: s.get(`${id}:save:proficiency`) > 0,
  }));
  const skills: SkillLine[] = Object.entries(SKILL_ABILITY).map(([name, ability]) => {
    const p = s.get(`${name}:proficiency`);
    return {
      name,
      ability,
      bonus: s.get(name),
      passive: s.get(`${name}:passive`),
      level: p >= prof * 2 && prof > 0 ? "expertise" : p > 0 ? "proficient" : "none",
    };
  });

  const hitDice = r.character.classes.map((c) => {
    const el = r.reg.get(c.classId);
    const m = (el?.setters.hd?.value ?? "").match(/d\s*(\d+)/i);
    return { die: m ? parseInt(m[1], 10) : 0, count: c.level, classId: c.classId, name: el?.name ?? "" };
  });

  const innate = s.get("innate speed");
  const otherSpeeds = (["climb", "fly", "swim", "burrow"] as const)
    .map((kind) => ({ kind, value: s.get(`speed:${kind}`) }))
    .filter((x) => x.value > 0);

  const features: FeatureLine[] = [];
  // A class or subclass option the player chose (the 2024 Cleric's Divine Order: Thaumaturge) shows even when the
  // content hides it from the sheet, named after the choice it was made in.
  const chosenIn = new Map<string, string>();
  for (const sl of r.slots) if (/^(Class|Archetype) Feature$/.test(sl.rule.type)) for (const id of sl.chosen) chosenIn.set(id, (sl.owner.sheet?.alt ?? sl.owner.name).replace(/^Level \d+:\s*/, ""));
  for (const a of r.active) {
    if (!SHEET_TYPES.includes(a.el.type)) continue;
    if (a.el.sheet && !a.el.sheet.display && a.el.type !== "Feat" && chosenIn.has(a.el.id)) {
      const text = stripHtml(fillTemplate(a.el.description, r)).trim();
      const owner = chosenIn.get(a.el.id)!;
      if (text) features.push({ id: a.el.id, name: owner && owner !== a.el.name ? `${owner}: ${a.el.name}` : a.el.name, type: a.el.type, source: a.el.source, text, level: a.ownerLevel });
      continue;
    }
    // "Not on the sheet" hides a feature's text. A feat still belongs in the sheet's list of feats by name (Skilled,
    // whose skills already show, is marked that way), so it stays, without its text.
    const hidden = !!a.el.sheet && !a.el.sheet.display;
    if (hidden && a.el.type !== "Feat") continue;
    if (hidden) {
      // Its effect in a sentence, from the description (Archery: +2 to attack rolls with Ranged weapons).
      const summary = stripHtml(a.el.description).replace(/^(Origin|General|Fighting Style|Epic Boon) Feat( \([^)]*\))?\s*/i, "").trim();
      if (!features.some((f) => f.name === a.el.name && f.type === "Feat")) features.push({ id: a.el.id, name: a.el.name, type: a.el.type, source: a.el.source, text: summary, level: a.ownerLevel });
      continue;
    }
    const t = sheetText(a, r);
    if (!t.text && !a.el.sheet) continue;
    const values = featureValues(a.el, r);
    features.push({
      id: a.el.id,
      name: a.el.sheet?.alt ?? a.el.name,
      type: a.el.type,
      source: a.el.source,
      text: values && !t.text.includes(values) ? `${t.text}${t.text ? " " : ""}(${values})` : t.text,
      usage: t.usage,
      action: t.action,
      level: a.ownerLevel,
    });
  }

  // A feature that spends another's uses: the content says so ("consumes", from 5e.tools), or its name does ("Channel
  // Divinity: Turn Undead" spends Channel Divinity, Aurora's way). Linked to the pool when the sheet has one with uses.
  for (const f of features) {
    const el = r.reg.get(f.id);
    // Aurora also names the pool as the feature's usage ("Turn Undead", usage "Channel Divinity").
    const usageNames = f.usage && !/\d/.test(f.usage) ? f.usage : undefined;
    const named = el?.setters.consumes?.value ?? usageNames ?? /^([^:]{3,40}):\s*\S/.exec(f.name)?.[1] ?? /^([^:]{3,40}):\s*\S/.exec(el?.name ?? "")?.[1];
    if (!named) continue;
    const pool = features.find((p) => p !== f && p.usage && p.name.toLowerCase() === named.trim().toLowerCase());
    if (pool) f.consumes = { id: pool.id, name: pool.name, amount: Number(el?.setters.consumes?.attrs?.amount) || 1 };
  }

  const carried =
    r.character.inventory.reduce((n, i) => n + itemWeight(i.id ? r.reg.get(i.id) : undefined) * i.qty + (i.custom?.weight ?? 0) * i.qty, 0) +
    Object.values(r.character.coins).reduce((n, c) => n + c, 0) / 50;

  const sizeEl = r.active.find((a) => /^(ID_INTERNAL_RACIAL_TRAIT|ID_5ET_SIZE)_(SMALL|MEDIUM|LARGE|TINY)$/.test(a.el.id));

  return {
    name: r.character.name,
    abilities,
    skills,
    proficiency: prof,
    level: r.totalLevel,
    hp: s.get("hp"),
    ac: buildAc(r),
    speed: innate > 0 ? s.get("speed") : 30 + s.get("speed:misc"),
    otherSpeeds,
    initiative: s.get("initiative"),
    passivePerception: s.get("perception:passive"),
    hitDice,
    casting: buildCasting(r),
    proficiencies: proficiencyGroups(r),
    defenses: defensesOf(r),
    features,
    attacks: buildAttacks(r).filter((a) => !a.hiddenByEdit),
    attacksAll: buildAttacks(r),
    attacksCarried: buildAttacks(r, true).filter((a) => !a.hiddenByEdit),
    weight: { carried: Math.round(carried * 10) / 10, capacity: s.get("strength") * 15 },
    attunement: { current: s.get("attunement:current"), max: s.get("attunement:max") },
    size: sizeEl?.el.name,
    vision: r.active.filter((a) => a.el.type === "Vision").map((a) => (/darkvision/i.test(a.el.name) && r.stats.get("darkvision:range") > 0 ? `Darkvision ${r.stats.get("darkvision:range")} ft` : a.el.name)),
    lists: r.slots
      .filter((x) => x.listItems && x.chosen.length)
      .map((x) => ({ name: x.rule.name, texts: x.chosen.map((id) => x.listItems!.find((i) => i.id === id)?.text).filter((t): t is string => !!t) })),
  };
}

export { sharedSlotLevel };

export interface HeaderInfo {
  species: string;
  classLine: string;
  subclass: string;
  background: string;
  size: string;
  /** Humanoid, Construct...: when the species' content says. */
  creatureType: string;
  alignment: string;
}

/** The text that goes in the header of the sheet. */
export function headerInfo(r: Resolved): HeaderInfo {
  const ch = r.character;
  const race = ch.race ? r.reg.get(ch.race)?.name : undefined;
  const sub = r.active.find((a) => ["Sub Race", "Race Variant"].includes(a.el.type));
  // The 2024 species' lineage, legacy or ancestry, as chosen ("Wood Elf"; "Tiefling (Abyssal Legacy)"; "Dragonborn (Red)").
  const pick = r.slots.find((s) => s.root === "race" && /lineage|legacy|ancestry/i.test(s.rule.name) && s.chosen.length);
  const chosen = pick ? r.reg.get(pick.chosen[0])?.name.replace(/\s*\(.*\)\s*$/, "") : undefined;
  const lineage = chosen && race ? (chosen.toLowerCase().includes(race.toLowerCase()) ? chosen : `${race} (${chosen})`) : undefined;
  const species = [sub?.el.name ?? lineage ?? race].filter(Boolean).join("") || "-";
  return {
    species: sub && race && !sub.el.name.toLowerCase().includes(race.toLowerCase()) ? `${sub.el.name} ${race}` : species,
    classLine: ch.classes.map((c) => `${r.reg.get(c.classId)?.name ?? "?"} ${c.level}`).join(" / ") || "-",
    subclass: r.active.filter((a) => a.el.type === "Archetype").map((a) => a.el.name).join(", ") || "-",
    background: ch.background ? (r.reg.get(ch.background)?.name ?? "-") : "-",
    // The size by concept, whichever provider names it (Aurora's ID_SIZE_SMALL, 5e.tools' Small).
    size: (() => {
      for (const id of r.ids) {
        const el = r.reg.get(id);
        const k = (el ? conceptOf(el) : undefined) ?? conceptOfMarker(id) ?? (/^ID_INTERNAL_RACIAL_TRAIT_(TINY|SMALL|MEDIUM|LARGE|HUGE|GARGANTUAN)(_|$)/.exec(id) ? `size:${/(TINY|SMALL|MEDIUM|LARGE|HUGE|GARGANTUAN)/.exec(id)![1].toLowerCase()}` : undefined);
        if (k?.startsWith("size:")) return k.slice(5).charAt(0).toUpperCase() + k.slice(6);
      }
      return "";
    })(),
    creatureType: (ch.race ? r.reg.get(ch.race)?.setters["creature type"]?.value : undefined) ?? "",
    alignment: ch.info.alignment || "-",
  };
}

/**
 * The spells a prepared caster chooses from: the spells they know (a wizard's spellbook) or, for casters like the
 * Cleric, the whole class list up to the highest slot level, one version of each spell from the class's edition.
 */
/**
 * The spells a casting line has ready: its cantrips, the always-prepared ones, and the prepared ones. When the player
 * has marked none prepared, every spell the line has chosen counts (a 2024 cleric's choices are its prepared
 * spells). The one rule for the sheet's spell table and the spell cards, so the two never disagree.
 */
export function readySpells(line: CastingLine): SpellPick[] {
  const anyPrepared = line.spells.some((s) => s.prepared);
  return [...line.cantripsKnown, ...(line.prepare && anyPrepared ? [...line.granted, ...line.spells.filter((s) => s.prepared)] : [...line.spells, ...line.granted])];
}

/**
 * Every spell a line can use: the ready ones and, for a class that prepares from its whole list (a cleric, a druid,
 * a wizard's spellbook), everything it could prepare. For the sheet's "every spell I can prepare" and the cards.
 */
export function everySpellOf(r: Resolved, line: CastingLine): SpellPick[] {
  const ready = readySpells(line);
  if (!line.prepare) return ready;
  const have = new Set(ready.map((p) => p.id));
  return [...ready, ...preparePool(r, line).filter((e) => !have.has(e.id)).map((e) => ({ id: e.id, casting: line.name, granted: false, prepared: false }))];
}

export function preparePool(r: Resolved, line: CastingLine): AElement[] {
  const entry = r.spellcasting.get(line.name.toLowerCase());
  if (!entry) return [];
  const known = line.spells.map((p) => r.reg.get(p.id)).filter((e): e is AElement => !!e);
  // A wizard prepares from the spellbook. Other prepared casters prepare from the whole class list; a spell a feature
  // lets them pick for the class (a domain or circle choice) is one more on it, not the whole list.
  const book = r.slots.some((s) => s.rule.type === "Spell" && /spellbook/i.test(s.rule.name) && s.rule.name.toLowerCase().includes(line.name.toLowerCase()));
  if (book && known.length) return known;
  const levels = Array.from({ length: Math.max(1, line.maxSpellLevel) }, (_, i) => i + 1).join("||");
  const all = r.reg.find("Spell", `(${entry.lists.join("||")}),(${levels})`);
  // One version of each spell, from the class's own edition where both exist (the 2024 Fireball for a 2024 class).
  const want = modern(r.reg.get(entry.owner));
  const byName = new Map<string, AElement>();
  for (const x of all) {
    const k = x.name.toLowerCase();
    const cur = byName.get(k);
    if (!cur || (modern(cur) !== want && modern(x) === want)) byName.set(k, x);
  }
  for (const k of known) if (!byName.has(k.name.toLowerCase())) byName.set(k.name.toLowerCase(), k);
  return [...byName.values()];
}

/** The content grants damage defenses as markers (ID_INTERNAL_CONDITION_DAMAGE_RESISTANCE_FIRE and the like). */
export function defensesOf(r: Resolved): SheetData["defenses"] {
  const of = (kind: string) => [...new Set([...r.ids].map((id) => new RegExp(`^ID_INTERNAL_CONDITION_DAMAGE_${kind}_([A-Z]+)$`).exec(id)?.[1]?.toLowerCase()).filter((x): x is string => !!x))].sort();
  return { resistances: of("RESISTANCE"), immunities: of("IMMUNITY"), vulnerabilities: of("VULNERABILITY") };
}

/** The unarmed strike as the character makes it, from the content's stats (Martial Arts die, Unarmed Fighting). */
/**
 * Attacks features give (the mechanics table): natural weapons use the unarmed strike's ability and bonuses; a
 * weapon of the feature's own (Psychic Blades) is finesse, so the better of Strength and Dexterity.
 */
function featureAttacks(r: Resolved): AttackLine[] {
  const s = r.stats;
  // Attacks the content states as data (5e.tools' Foundry activities): ability as given; none means Strength or
  // Dexterity, the better (Foundry's default for a feature's weapon-like attack); "spellcasting", the casting ability.
  const fromData: AttackLine[] = [];
  const seenNames = new Set<string>();
  const withData = new Set<string>();
  for (const a of r.active) for (const at of a.el.attacks ?? []) {
    withData.add(a.el.id);
    if (seenNames.has(at.name.toLowerCase())) continue;
    seenNames.add(at.name.toLowerCase());
    const abil = at.ability === "spellcasting" ? (r.spellcasting.values().next().value?.ability ?? "") : ({ str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" } as Record<string, string>)[at.ability] ?? "";
    const mod = abil ? s.get(`${abil}:modifier`) : at.ranged ? s.get("dexterity:modifier") : Math.max(s.get("strength:modifier"), s.get("dexterity:modifier"));
    const kind = at.ranged ? "ranged" : "melee";
    const bonus = mod + s.get("proficiency") + s.get(`${kind}:attack`) + s.get("attack");
    const extra = mod + s.get(`${kind}:damage`) + s.get("damage");
    // A die that grows with level (a Monk's Martial Arts die): worked out from its scale formulas now.
    const die = at.dieFormula ? `${evalFormula(at.dieFormula.count, (n) => s.get(n))}d${evalFormula(at.dieFormula.faces, (n) => s.get(n))}` : at.die;
    fromData.push({ id: `data-${a.el.id}-${at.name}`, auto: true, name: at.name, bonus, damage: `${die}${extra ? signed(extra) : ""}`, damageType: at.damageType, properties: at.ranged ? "ranged" : "", notes: a.el.name });
  }
  const prof = s.get("proficiency");
  const str = s.get("strength:modifier");
  const dex = s.get("dexterity:modifier");
  const martial = s.get("martial arts:dice") > 0;
  // The hand-written table only where the data has nothing: no attack of that name, none from that feature.
  return [...fromData, ...effectsOfKind(r, "attack").filter(({ effect: e, from }) => !seenNames.has(e.name.toLowerCase()) && !withData.has(from.id)).map(({ effect: e, from }) => {
    const mod = e.ability === "finesse" || martial ? Math.max(str, dex) : str;
    const unarmed = e.ability === "unarmed";
    const bonus = mod + prof + s.get("melee:attack") + s.get("attack") + (unarmed ? s.get("unarmed:attack") + s.get("unarmed strike:attack") + s.get("natural:attack") : s.get(`${canonicalName(from.name)}:attack`));
    const extra = mod + s.get("melee:damage") + s.get("damage") + (unarmed ? s.get("unarmed:damage") + s.get("unarmed strike:damage") + s.get("natural:damage") : s.get(`${canonicalName(from.name)}:damage`));
    return {
      id: `feature-${from.id}-${e.name}`,
      auto: true,
      name: e.name,
      bonus,
      damage: `${e.die}${extra ? signed(extra) : ""}`,
      damageType: e.damageType,
      properties: e.properties ?? (unarmed ? "unarmed strike" : ""),
      notes: [from.name, e.notes].filter(Boolean).join("; "),
    };
  })];
}

function unarmedStrike(r: Resolved): AttackLine {
  const s = r.stats;
  const martial = s.get("martial arts:dice");
  const fighting = s.get("unarmed fighting:size");
  const dice = effectsOfKind(r, "unarmed-die");
  const brawler = dice.reduce((m, x) => Math.max(m, x.effect.die), 0);
  const die = Math.max(martial, fighting, brawler);
  const str = s.get("strength:modifier");
  const dex = s.get("dexterity:modifier");
  const mod = martial > 0 ? Math.max(str, dex) : str;
  const bonus = mod + s.get("proficiency") + s.get("unarmed:attack") + s.get("unarmed strike:attack") + s.get("melee:attack") + s.get("attack");
  const extra = mod + s.get("unarmed:damage") + s.get("unarmed strike:damage") + s.get("melee:damage") + s.get("damage");
  const notes: string[] = [];
  if (martial > 0) notes.push(`Martial Arts d${martial}${dex > str ? ", Dexterity" : ""}; bonus action strike`);
  for (const x of effectsOfKind(r, "unarmed-note")) notes.push(x.effect.text);
  if (fighting > 0) notes.push("Unarmed Fighting");
  if (brawler && die === brawler) notes.push(dice.find((x) => x.effect.die === brawler)!.effect.note);
  return {
    id: "unarmed-strike",
    auto: true,
    name: "Unarmed Strike",
    bonus,
    damage: die > 0 ? `1d${die}${extra ? signed(extra) : ""}` : String(Math.max(1, 1 + extra)),
    damageType: "bludgeoning",
    properties: "",
    notes: notes.join("; "),
  };
}
