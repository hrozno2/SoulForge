import type { AElement, SelectRule, SetterValue, SpellcastingInfo } from "./types";
import type { ARegistry } from "./registry";
import { meets, type ReqCtx } from "./requirements";
import { StatBook, type StatInputs } from "./stats";
import { ABILITY_IDS, totalLevel, type AbilityId, type Character } from "./character";
import { isModern } from "./edition";

export interface ActiveElement {
  el: AElement;
  ownerLevel: number;
  /** Id of the element that granted or selected it, empty for roots. */
  from: string;
  /** Where in the build it comes from: "race", "background", "class:<id>", "item" or "option". */
  root: string;
}

export interface SpellcastingEntry {
  name: string;
  ability: string;
  prepare: boolean;
  lists: string[];
  /** Class element that owns this entry. */
  owner: string;
  /** Class level of the owner. */
  level: number;
}

export interface SpellPick {
  id: string;
  /** Spellcasting entry name, for example "Wizard". */
  casting: string;
  /** Granted spells are always prepared and do not count against the limit. */
  granted: boolean;
  prepared: boolean;
  /** Where the spell was offered from, used to pick a spellcasting entry when none was named. */
  hint?: string;
  /** The element whose rule gave the spell (a feat or a species trait), for spells outside any class's spellcasting. */
  from?: string;
}

export interface SelectSlot {
  key: string;
  owner: AElement;
  rule: SelectRule;
  /** Text choices for "List" selects. */
  listItems?: { id: string; text: string }[];
  ownerLevel: number;
  root: string;
  chosen: string[];
  defaulted: boolean;
  options: AElement[];
  /** Options whose own requirements are not met right now. */
  blocked: Set<string>;
  filter: string;
  /** The class level at which this choice is made (1 for species and background choices). */
  at?: number;
}

export interface Pass {
  ids: Set<string>;
  active: ActiveElement[];
  stats: StatBook;
  spellcasting: Map<string, SpellcastingEntry>;
  spellPicks: SpellPick[];
  rawSlots: Omit<SelectSlot, "options" | "blocked" | "filter">[];
  /** Where and at which class level each element was gained. */
  gained: Map<string, { root: string; at: number }>;
  warnings: string[];
  signature: string;
}

export interface Resolved extends Pass {
  character: Character;
  slots: SelectSlot[];
  totalLevel: number;
  classLevels: Record<string, number>;
  reg: ARegistry;
}

const lc = (s: string) => s.toLowerCase();
/** Marker-style grants whose element may live only inside Aurora itself. */
const QUIET_TYPES = new Set(["Grants", "Information", "Size", "Condition", "Vision", "Rule"]);

export function hitDieOf(el: AElement | undefined): number {
  const hd = el?.setters.hd?.value ?? "";
  const m = hd.match(/d\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
}

function setterNum(s: SetterValue | undefined): number {
  const n = parseFloat(s?.attrs.lb ?? s?.value ?? "");
  return Number.isNaN(n) ? 0 : n;
}
export const itemWeight = (el: AElement | undefined): number => setterNum(el?.setters.weight);

const SHIELD_TAGS = ["shield"];

/** What the character wears, for `equipped="[armor:heavy]"` style checks. */
function equippedFacts(ch: Character, reg: ARegistry) {
  let armor = "none";
  let shield = false;
  for (const it of ch.inventory) {
    if (!it.equipped || !it.id) continue;
    const el = reg.get(it.id);
    if (!el || el.type !== "Armor") continue;
    const kind = lc(el.setters.armor?.value ?? "");
    if (SHIELD_TAGS.includes(kind) || /shield/i.test(el.name)) shield = true;
    else armor = kind || "armor";
  }
  return { armor, shield };
}

function makeCtx(prev: Pass | null, level: number, ch: Character, reg: ARegistry, empty: StatBook): ReqCtx {
  const ids = prev?.ids ?? new Set<string>();
  const types = new Set<string>();
  if (prev) for (const a of prev.active) types.add(lc(a.el.type));
  const facts = equippedFacts(ch, reg);
  const stats = prev?.stats ?? empty;
  return {
    hasId: (id) => ids.has(id),
    hasType: (t) => types.has(lc(t)),
    level,
    stat: (n) => stats.get(n),
    equipped: (kind, value) => {
      const v = lc(value);
      if (kind === "armor") {
        if (v === "none") return facts.armor === "none";
        if (v === "any") return facts.armor !== "none";
        return facts.armor === v;
      }
      if (kind === "shield") return v === "none" ? !facts.shield : facts.shield;
      return false;
    },
  };
}

function inputsFor(ch: Character, reg: ARegistry, spellAbility: Record<string, string>): StatInputs {
  const classLevels: Record<string, number> = {};
  for (const c of ch.classes) {
    const el = reg.get(c.classId);
    if (el) classLevels[lc(el.name)] = (classLevels[lc(el.name)] ?? 0) + c.level;
  }
  const attunedCount = ch.inventory.filter((i) => i.attuned).length;
  return {
    abilityBase: ch.abilityBase,
    totalLevel: totalLevel(ch),
    classLevels,
    attunedCount,
    spellAbility,
    baseHp: (conMod) => baseHitPoints(ch, reg, conMod),
  };
}

/** Hit points from hit dice and Constitution, before bonuses from stat rules. */
export function baseHitPoints(ch: Character, reg: ARegistry, conMod: number): number {
  let hp = 0;
  let n = 0;
  for (const c of ch.classes) {
    const die = hitDieOf(reg.get(c.classId));
    for (let i = 0; i < c.level; i++) {
      n++;
      if (n === 1) hp += die + conMod;
      else {
        const roll = ch.hpMode === "roll" ? ch.hpRolls[String(n)] : undefined;
        hp += (roll ?? Math.floor(die / 2) + 1) + conMod;
      }
    }
  }
  return hp;
}

function walk(ch: Character, reg: ARegistry, prev: Pass | null): Pass {
  const spellAbility: Record<string, string> = {};
  const inputs = inputsFor(ch, reg, spellAbility);
  const stats = new StatBook(inputs);
  const empty = prev ? prev.stats : stats;
  const ids = new Set<string>();
  const active: ActiveElement[] = [];
  const rawSlots: Pass["rawSlots"] = [];
  const warnings: string[] = [];
  const spellcasting = new Map<string, SpellcastingEntry>();
  const extendLists = new Map<string, string[]>();
  const spellPicks: SpellPick[] = [];
  const seen = new Set<string>();
  const lvlTotal = totalLevel(ch);

  // The class level at which each element was gained (1 for roots), so a choice can be judged at its own level.
  const gained = new Map<string, { root: string; at: number }>();
  const visit = (el: AElement, ownerLevel: number, from: string, root: string, classOwner?: AElement, at = 1): void => {
    if (seen.has(el.id)) return;
    seen.add(el.id);
    ids.add(el.id);
    gained.set(el.id, { root, at });
    active.push({ el, ownerLevel, from, root });

    const sc: SpellcastingInfo | undefined = el.spellcasting;
    if (sc && sc.name) {
      const key = lc(sc.name);
      if (sc.extend) {
        extendLists.set(key, [...(extendLists.get(key) ?? []), ...sc.extendLists]);
      } else {
        spellcasting.set(key, {
          name: sc.name,
          ability: lc(sc.ability ?? ""),
          prepare: !!sc.prepare,
          lists: sc.list.length ? sc.list : [sc.name],
          owner: classOwner?.id ?? el.id,
          level: ownerLevel,
        });
        spellAbility[key] = lc(sc.ability ?? "");
      }
    }

    el.rules.forEach((rule, idx) => {
      const ctx = makeCtx(prev, ownerLevel, ch, reg, empty);
      if (rule.level !== undefined && rule.level > ownerLevel) return;
      if (!meets(rule.requirements, ctx)) return;

      if (rule.kind === "stat") {
        if (rule.equipped && !meets(rule.equipped, ctx, true)) return;
        stats.add(rule.name, { value: rule.value, bonus: rule.bonus, from: el.name, alt: rule.alt, inline: rule.inline });
      } else if (rule.kind === "grant") {
        if (!rule.id) return;
        const target = reg.get(rule.id);
        if (!target) {
          // Internal marker grants have no element of their own but still count as present.
          ids.add(rule.id);
          if (!QUIET_TYPES.has(rule.type) && !rule.id.startsWith("ID_INTERNAL_")) warnings.push(`Missing ${rule.type} "${rule.id}" (from ${el.name})`);
          return;
        }
        // A granted spell is always known and prepared. When the grant does not name its spellcasting (Light Bearer,
        // Telekinetic, some domain and oath spell lists), the sheet places it: on the class whose list has it, or on
        // a line of its own with the ability the feature names.
        if (rule.type === "Spell") {
          spellPicks.push({ id: rule.id, casting: rule.spellcasting ?? "", granted: true, prepared: true, from: el.id });
        }
        if (!meets(target.requirements, makeCtx(prev, ownerLevel, ch, reg, empty))) return;
        visit(target, ownerLevel, el.id, root, classOwner, Math.max(at, rule.level ?? 0));
      } else {
        const key = `${el.id}|${idx}`;
        let chosen = (ch.selections[key] ?? []).slice(0, rule.number);
        let defaulted = false;
        if (!chosen.length && rule.default && reg.get(rule.default)) {
          chosen = [rule.default];
          defaulted = true;
        }
        const isList = rule.type === "List";
        rawSlots.push({ key, owner: el, rule: isList ? { ...rule, optional: true } : rule, ownerLevel, root, chosen, defaulted, at: Math.max(at, rule.level ?? 0) });
        for (const id of isList ? [] : chosen) {
          const target = reg.get(id);
          if (!target) {
            warnings.push(`A choice for "${rule.name}" points to missing content (${id})`);
            continue;
          }
          if (rule.type === "Spell") {
            spellPicks.push({ id, casting: rule.spellcasting ?? "", granted: false, prepared: false, hint: rule.supports, from: el.id });
          }
          visit(target, ownerLevel, el.id, root, classOwner, Math.max(at, rule.level ?? 0));
        }
      }
    });
  };

  // Roots: species, background, each class, options and equipped gear.
  if (ch.race) {
    const el = reg.get(ch.race);
    if (el) visit(el, lvlTotal, "", "race");
    else warnings.push(`Species ${ch.race} is not loaded`);
  }
  if (ch.background) {
    const el = reg.get(ch.background);
    if (el) visit(el, lvlTotal, "", "background");
    else warnings.push(`Background ${ch.background} is not loaded`);
  }
  ch.classes.forEach((c, i) => {
    const el = reg.get(c.classId);
    if (!el) {
      warnings.push(`Class ${c.classId} is not loaded`);
      return;
    }
    if (i > 0 && el.multiclass) {
      const mc = el.multiclass;
      const pseudo: AElement = {
        id: mc.id,
        name: `${el.name} (multiclass)`,
        type: "Multiclass",
        source: el.source,
        supports: [],
        description: "",
        compendiumHidden: true,
        setters: mc.setters,
        rules: mc.rules,
      };
      visit(pseudo, c.level, el.id, `class:${el.id}`, el);
    }
    visit(el, c.level, "", `class:${el.id}`, el);
  });
  for (const id of ch.options ?? []) {
    const el = reg.get(id);
    if (el) visit(el, lvlTotal, "", "option");
  }
  for (const id of ch.extras ?? []) {
    const el = reg.get(id);
    if (!el) {
      warnings.push(`Added content ${id} is not loaded`);
      continue;
    }
    if (el.type === "Spell") spellPicks.push({ id, casting: "", granted: false, prepared: false, hint: el.supports.join(",") });
    visit(el, lvlTotal, "", "extra");
  }
  for (const it of ch.inventory) {
    if (!it.equipped || !it.id) continue;
    const el = reg.get(it.id);
    if (!el) continue;
    // Items that need attunement only count once attuned.
    const needsAttune = el.setters.attunement?.value === "true" || /requires attunement/i.test(el.setters.rarity?.value ?? "") || /requires attunement/i.test(el.description.slice(0, 400));
    if (needsAttune && !it.attuned) continue;
    visit(el, lvlTotal, "", "item");
  }

  for (const c of ch.customStats ?? []) {
    if (c.stat && c.value) stats.add(c.stat, { value: String(c.value), from: c.note || "Custom bonus" });
  }

  for (const [key, more] of extendLists) {
    const entry = spellcasting.get(key);
    if (entry) entry.lists = [...entry.lists, ...more];
  }

  const signature =
    [...ids].sort().join(",") + "#" + [...stats.names()].sort().map((n) => `${n}=${stats.get(n)}`).join(";") + "#" + rawSlots.length;
  return { ids, active, stats, spellcasting, spellPicks, rawSlots, warnings, signature, gained };
}

/** Replaces `$(spellcasting:list)` and `$(spellcasting:slots)` inside a supports filter. */
export function resolveSupports(filter: string, casting: string | undefined, pass: Pass, shared?: number): string {
  if (!filter.includes("$(")) return filter;
  let entry = casting ? pass.spellcasting.get(lc(casting)) : undefined;
  if (!entry && pass.spellcasting.size === 1) entry = [...pass.spellcasting.values()][0];
  const lists = entry ? entry.lists : [];
  const listExpr = lists.length ? `(${lists.join("||")})` : "(no-list)";
  let maxSlot = 0;
  if (entry) {
    const name = lc(entry.name);
    for (let n = 1; n <= 9; n++) if (pass.stats.get(`${name}:spellcasting:slots:${n}`) > 0) maxSlot = n;
    // Pact magic casters state the slot level directly.
    const pact = pass.stats.get(`${name}:spellcasting:slot`);
    if (pact > maxSlot) maxSlot = pact;
    // Multiclassed, a class still learns and prepares spells by its own level, not by the combined slot table
    // (PHB, Multiclassing: "as if you were a single-classed member of that class"). So the shared table is not used here.
    void shared;
  }
  const slotExpr = maxSlot > 0 ? `(${Array.from({ length: maxSlot }, (_, i) => i + 1).join("||")})` : "(none)";
  return filter.replace(/\$\(spellcasting:list\)/g, listExpr).replace(/\$\(spellcasting:slots\)/g, slotExpr);
}

const HALF_CASTERS = new Set(["paladin", "ranger", "artificer"]);
const FULL_CASTERS = new Set(["bard", "cleric", "druid", "sorcerer", "wizard"]);

/**
 * The combined caster level for multiclass spell slots. Content may state it; when it does not, it is worked out from
 * the rules: full casters count their level, half casters half (rounded up in the 2024 rules, down in 2014, always up
 * for the artificer), third casters such as the Eldritch Knight a third. Other casters count the full caster level whose
 * slots match their own. Zero when the character has fewer than two classes that use the shared table.
 */
export function multiclassCasterLevel(pass: Pass, reg?: ARegistry): number {
  // The content states a multiclass caster level, but rounds the artificer's share down (it rounds up), so the
  // level is worked out here whenever every class is known; the stated one only stands in for unknown casters.
  const stated = pass.stats.get("multiclass:spellcasting:level");
  const own = [...pass.spellcasting.values()].filter((e) => !(pass.stats.get(`${lc(e.name)}:spellcasting:slots:count`) > 0));
  const byOwner = new Map(own.map((e) => [e.owner, e]));
  if (byOwner.size < 2) return stated > 0 ? stated : 0;
  let total = 0;
  let unknown = false;
  for (const e of byOwner.values()) {
    const cls = reg?.get(e.owner);
    const name = lc(cls?.name ?? (e.owner.match(/CLASS_([A-Z]+)$/i)?.[1] ?? e.name));
    const modern = isModern({ id: e.owner, source: cls?.source ?? "" });
    if (FULL_CASTERS.has(name)) total += e.level;
    else if (HALF_CASTERS.has(name)) total += name === "artificer" || modern ? Math.ceil(e.level / 2) : Math.floor(e.level / 2);
    else if (name === "fighter" || name === "rogue") total += Math.floor(e.level / 3);
    else {
      // A caster this does not know: count the full caster level whose slots match its own.
      const row = Array.from({ length: 9 }, (_, i) => pass.stats.get(`${lc(e.name)}:spellcasting:slots:${i + 1}`)).filter((n) => n > 0);
      const match = FULL_CASTER_SLOTS.findIndex((r, i) => i > 0 && r.length === row.length && r.every((n, j) => n === row[j]));
      total += match > 0 ? match : 0;
      unknown = true;
    }
  }
  return unknown && stated > 0 ? stated : total;
}

/** Highest spell level a shared multiclass slot table gives, 0 when not applicable. */
export function sharedSlotLevel(pass: Pass): number {
  const mc = multiclassCasterLevel(pass);
  if (mc <= 0) return 0;
  const row = FULL_CASTER_SLOTS[Math.min(20, mc)] ?? [];
  return row.length;
}

/** Slots per spell level by combined caster level (index 1 to 20). */
export const FULL_CASTER_SLOTS: number[][] = [
  [], [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

export function resolve(ch: Character, reg: ARegistry): Resolved {
  let prev: Pass | null = null;
  let pass = walk(ch, reg, null);
  for (let i = 0; i < 6; i++) {
    prev = pass;
    pass = walk(ch, reg, prev);
    if (pass.signature === prev.signature) break;
  }

  const restricted = new Set(ch.sources.map(lc));
  const shared = sharedSlotLevel(pass);
  const slots: SelectSlot[] = pass.rawSlots.map((s) => {
    if (s.rule.type === "List") return { ...s, options: [], blocked: new Set<string>(), filter: "", listItems: s.rule.items ?? [] };
    const filter = resolveSupports(s.rule.supports, s.rule.spellcasting, pass, shared);
    let options = reg.find(s.rule.type, filter);
    if (restricted.size) options = options.filter((e) => !e.source || restricted.has(lc(e.source)) || s.chosen.includes(e.id));
    const base = makeCtx(pass, s.ownerLevel, ch, reg, pass.stats);
    // A choice is judged at the level it is made: what the same class gains later (a Monk's Disciplined Survivor at
    // 14) does not make a feat taken at 4 illegal. Other classes' and the species' features count as present.
    const at = s.at ?? 1;
    const ctx = { ...base, hasId: (id: string) => { if (!pass.ids.has(id)) return false; const g = pass.gained.get(id); return !g || g.root !== s.root || g.at <= at; } };
    const blocked = new Set<string>();
    for (const e of options) if (!meets(e.requirements, ctx)) blocked.add(e.id);
    // A feat the character already has from another choice or grant (a species feat and an origin feat, say) is not offered again.
    if (s.rule.type === "Feat") for (const e of options) if (pass.ids.has(e.id) && !s.chosen.includes(e.id)) blocked.add(e.id);
    return { ...s, options, blocked, filter };
  });

  const classLevels: Record<string, number> = {};
  for (const c of ch.classes) {
    const el = reg.get(c.classId);
    if (el) classLevels[lc(el.name)] = (classLevels[lc(el.name)] ?? 0) + c.level;
  }
  return { ...pass, character: ch, slots, totalLevel: totalLevel(ch), classLevels, reg };
}

export type { AbilityId };
export { ABILITY_IDS };

/** A requirement context for the whole character, for UI checks such as multiclass prerequisites. */
export function reqCtx(r: Resolved): ReqCtx {
  return makeCtx(r, r.totalLevel, r.character, r.reg, r.stats);
}
