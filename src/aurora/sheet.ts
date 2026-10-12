import type { AElement } from "./types";
import { FULL_CASTER_SLOTS, itemWeight, multiclassCasterLevel, sharedSlotLevel, type ActiveElement, type Resolved, type SpellPick } from "./engine";
import { ABILITY_IDS, SKILL_ABILITY, itemLabel, type AbilityId } from "./character";

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
  return text.replace(/\{\{([^}]+)\}\}/g, (_m, raw: string) => {
    const name = raw.trim().toLowerCase();
    const inline = r.stats.text(name);
    if (inline !== undefined) return inline;
    const v = r.stats.get(name);
    return name.endsWith(":modifier") || name.endsWith("modifier") ? signed(v) : String(v);
  });
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
  if (!sh || !sh.descriptions.length) return { text: stripHtml(a.el.description) };
  // The description whose level is the highest not above the owner's level, plus level-less ones.
  const plain = sh.descriptions.filter((d) => d.level === undefined);
  const leveled = sh.descriptions.filter((d) => d.level !== undefined && d.level <= a.ownerLevel).sort((x, y) => x.level! - y.level!);
  const best = leveled.length ? leveled[leveled.length - 1] : plain[0];
  const usage = best?.usage ?? sh.usage;
  const action = best?.action ?? sh.action;
  const body = [...(leveled.length ? [] : plain), ...(leveled.length ? [best] : [])].filter(Boolean);
  const text = body.map((d) => stripHtml(fillTemplate(d!.text, r))).join("\n");
  return { text, usage: usage ? fillTemplate(usage, r) : undefined, action };
}

function proficiencyGroups(r: Resolved) {
  const out = { armor: [] as string[], weapons: [] as string[], tools: [] as string[], languages: [] as string[], other: [] as string[] };
  const byId = new Map(r.active.map((a) => [a.el.id, a.el]));
  for (const a of r.active) {
    const { el } = a;
    // Individual weapon/armor proficiencies granted by a category (for example "Martial weapons") are implied by it.
    if (el.type === "Proficiency" && byId.get(a.from)?.type === "Proficiency") continue;
    if (el.type === "Language") out.languages.push(el.name);
    else if (el.type === "Proficiency") {
      if (/_ARMOR_/.test(el.id)) out.armor.push(el.name);
      else if (/_WEAPON_/.test(el.id)) out.weapons.push(el.name);
      else if (/_TOOL|_INSTRUMENT|_GAMING|_ARTISAN|_KIT|_SUPPLIES/.test(el.id)) out.tools.push(el.name);
      else if (/_SKILL_|_SAVINGTHROW_/.test(el.id) || /^ID_INTERNAL_PROFICIENCY/.test(el.id)) continue;
      else out.other.push(el.name);
    }
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
  return undefined;
}

function buildCasting(r: Resolved): CastingLine[] {
  const ch = r.character;
  const entries = [...r.spellcasting.values()];
  const nonPact = entries.filter((e) => !(r.stats.get(`${lc(e.name)}:spellcasting:slots:count`) > 0));
  const mcLevel = multiclassCasterLevel(r, r.reg);
  const useShared = nonPact.length > 1 && mcLevel > 0;
  const sharedRow = useShared ? (FULL_CASTER_SLOTS[Math.min(20, mcLevel)] ?? []) : [];

  return entries.map((e) => {
    const key = lc(e.name);
    const slots: SpellSlotRow[] = [];
    const isPact = r.stats.get(`${key}:spellcasting:slots:count`) > 0;
    for (let n = 1; n <= 9; n++) {
      const total = useShared && !isPact ? (sharedRow[n - 1] ?? 0) : r.stats.get(`${key}:spellcasting:slots:${n}`);
      if (total > 0) slots.push({ level: n, total, used: ch.play.slotsUsed[String(n)] ?? 0 });
    }
    // Spells with no named entry (racial or feat spells) go to the first entry that can cast from their list.
    const picks = r.spellPicks.filter((p) => (castingOf(r, p) ?? lc(entries[0].name)) === key);
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
    const maxLevel = slots.length ? slots[slots.length - 1].level : 0;
    return {
      name: e.name,
      ability: e.ability,
      dc: r.stats.get(`${key}:spellcasting:dc`),
      attack: r.stats.get(`${key}:spellcasting:attack`),
      prepare: e.prepare,
      prepareMax: r.stats.get(`${key}:spellcasting:prepare`),
      slots,
      pactLevel: isPact ? r.stats.get(`${key}:spellcasting:slot`) || maxLevel : undefined,
      cantripsKnown: cantrips,
      spells,
      granted,
      maxSpellLevel: maxLevel,
    };
  });
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
    const cap = kind === "heavy" ? 0 : kind === "medium" ? Math.min(2, dex) : dex;
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

/** Attack lines from equipped weapons and custom attacks. With `carried`, weapons that are only carried count too, once per kind. */
function buildAttacks(r: Resolved, carried = false): AttackLine[] {
  const s = r.stats;
  const prof = s.get("proficiency");
  const out: AttackLine[] = [];
  const mods = (a: AbilityId) => s.get(`${a}:modifier`);
  // Dueling: +2 damage with a melee weapon held in one hand and no other weapon. The content leaves this to the app.
  const dueling = r.active.some((a) => /^dueling$/i.test(a.el.name) && /feature|feat/i.test(a.el.type));
  const weaponsHeld = r.character.inventory.filter((i) => i.equipped && i.id && r.reg.get(i.id)?.type === "Weapon").length;
  for (const it of r.character.inventory) {
    const el = it.id ? r.reg.get(it.id) : undefined;
    if ((!it.equipped && !carried) || !el || el.type !== "Weapon") continue;
    if (carried && !it.equipped && out.some((o) => o.elId === el.id)) continue;
    const tags = el.supports.map(lc);
    const ranged = tags.some((t) => t.includes("ranged"));
    const finesse = tags.some((t) => t.includes("finesse"));
    const ability: AbilityId = ranged ? "dexterity" : finesse && mods("dexterity") > mods("strength") ? "dexterity" : "strength";
    const proficient = (el.setters.proficiency?.value ?? "").split(",").some((id) => r.ids.has(id.trim()));
    const magicAtk = (Number(el.setters.attackBonus?.value) || 0) + (it.magic ?? 0);
    const magicDmg = (Number(el.setters.damageBonus?.value) || 0) + (it.magic ?? 0);
    const kind = ranged ? "ranged" : "melee";
    // Fighting styles and similar features add to every attack of a kind.
    const atkExtra = s.get(`${kind}:attack`) + s.get("attack") + magicAtk;
    const twoHandedWeapon = tags.some((t) => /two.?handed/.test(t)) || it.twoHanded;
    const duel = dueling && kind === "melee" && !twoHandedWeapon && weaponsHeld <= 1 ? 2 : 0;
    const dmgExtra = s.get(`${kind}:damage`) + s.get("damage") + magicDmg + duel;
    const dmg = it.twoHanded && el.setters.versatile ? { value: el.setters.versatile.value, attrs: el.setters.damage?.attrs ?? {} } : el.setters.damage;
    const props = el.supports
      .filter((t) => /WEAPON_PROPERTY/.test(t))
      .map((t) => t.replace(/^ID_(INTERNAL|WOTC_PHB24|WOTC_PHB)_WEAPON_PROPERTY_/, "").replace(/_/g, " ").toLowerCase());
    const versatile = el.setters.versatile?.value;
    const edit = r.character.attackEdits?.[it.uid];
    const line: AttackLine = {
      id: it.uid,
      elId: el.id,
      auto: true,
      name: edit?.name?.trim() || itemLabel(it, el.name),
      bonus: mods(ability) + (proficient ? prof : 0) + atkExtra + (edit?.bonusAdjust ?? 0),
      damage: edit?.damage?.trim() || (dmg ? `${dmg.value}${mods(ability) + dmgExtra ? signed(mods(ability) + dmgExtra) : ""}` : ""),
      damageType: edit?.damageType ?? dmg?.attrs.type ?? "",
      properties: [...props, versatile && !it.twoHanded ? `versatile (${versatile})` : "", it.twoHanded ? "two-handed" : ""].filter(Boolean).join(", "),
      notes: edit?.notes ?? (proficient ? "" : "not proficient"),
    };
    if (edit?.hidden) line.hiddenByEdit = true;
    out.push(line);
  }
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
  for (const a of r.active) {
    if (!SHEET_TYPES.includes(a.el.type)) continue;
    if (a.el.sheet && !a.el.sheet.display) continue;
    const t = sheetText(a, r);
    if (!t.text && !a.el.sheet) continue;
    features.push({
      id: a.el.id,
      name: a.el.sheet?.alt ?? a.el.name,
      type: a.el.type,
      source: a.el.source,
      text: t.text,
      usage: t.usage,
      action: t.action,
      level: a.ownerLevel,
    });
  }

  const carried =
    r.character.inventory.reduce((n, i) => n + itemWeight(i.id ? r.reg.get(i.id) : undefined) * i.qty + (i.custom?.weight ?? 0) * i.qty, 0) +
    Object.values(r.character.coins).reduce((n, c) => n + c, 0) / 50;

  const sizeEl = r.active.find((a) => /^ID_INTERNAL_RACIAL_TRAIT_(SMALL|MEDIUM|LARGE|TINY)$/.test(a.el.id));

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
    features,
    attacks: buildAttacks(r).filter((a) => !a.hiddenByEdit),
    attacksAll: buildAttacks(r),
    attacksCarried: buildAttacks(r, true).filter((a) => !a.hiddenByEdit),
    weight: { carried: Math.round(carried * 10) / 10, capacity: s.get("strength") * 15 },
    attunement: { current: s.get("attunement:current"), max: s.get("attunement:max") },
    size: sizeEl?.el.name,
    vision: r.active.filter((a) => a.el.type === "Vision").map((a) => a.el.name),
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
  alignment: string;
}

/** The text that goes in the header of the sheet. */
export function headerInfo(r: Resolved): HeaderInfo {
  const ch = r.character;
  const race = ch.race ? r.reg.get(ch.race)?.name : undefined;
  const sub = r.active.find((a) => ["Sub Race", "Race Variant"].includes(a.el.type));
  const lineage = r.active.find((a) => a.from && a.el.type === "Racial Trait" && /lineage|heritage|ancestry/i.test(r.reg.get(a.from)?.name ?? "") && false);
  const species = [sub?.el.name ?? lineage?.el.name ?? race].filter(Boolean).join("") || "-";
  return {
    species: sub && race && !sub.el.name.toLowerCase().includes(race.toLowerCase()) ? `${sub.el.name} ${race}` : species,
    classLine: ch.classes.map((c) => `${r.reg.get(c.classId)?.name ?? "?"} ${c.level}`).join(" / ") || "-",
    subclass: r.active.filter((a) => a.el.type === "Archetype").map((a) => a.el.name).join(", ") || "-",
    background: ch.background ? (r.reg.get(ch.background)?.name ?? "-") : "-",
    size: (() => {
      const id = [...r.ids].find((x) => /^ID_(INTERNAL_RACIAL_TRAIT|SIZE)_(TINY|SMALL|MEDIUM|LARGE|HUGE|GARGANTUAN)(_|$)/.test(x));
      const m = id?.match(/(TINY|SMALL|MEDIUM|LARGE|HUGE|GARGANTUAN)/);
      return m ? m[1].charAt(0) + m[1].slice(1).toLowerCase() : "";
    })(),
    alignment: ch.info.alignment || "-",
  };
}

/**
 * The spells a prepared caster chooses from: the spells they know (a wizard's spellbook) or, for casters like the
 * Cleric, the whole class list up to the highest slot level, from the book of the class when it has one.
 */
export function preparePool(r: Resolved, line: CastingLine): AElement[] {
  const entry = r.spellcasting.get(line.name.toLowerCase());
  if (!entry) return [];
  const known = line.spells.map((p) => r.reg.get(p.id)).filter((e): e is AElement => !!e);
  if (known.length) return known;
  const levels = Array.from({ length: Math.max(1, line.maxSpellLevel) }, (_, i) => i + 1).join("||");
  const all = r.reg.find("Spell", `(${entry.lists.join("||")}),(${levels})`);
  const book = r.reg.get(entry.owner)?.source;
  const same = all.filter((x) => x.source === book);
  return same.length ? same : all;
}
