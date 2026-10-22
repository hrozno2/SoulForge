/** A random character that makes sense: books the player shows, the best scores where the class needs them, starting gear on. */
import { autoFill } from "./autofill";
import { hitDieOf, resolve } from "./engine";
import { buildSheet, preparePool } from "./sheet";
import { ABILITY_IDS, newCharacter, type AbilityId, type Character } from "./character";
import { BookIndex, hiddenBy, type ContentFilters } from "./books";
import type { ARegistry } from "./registry";
import type { AElement } from "./types";
import { ItemIndex, addToInventory, anyWeaponKind, resolveChosenTools, autoEquip, ledgerOf, startingPlans, variantItems, weaponChoices } from "./startingEquipment";
import { isModern as modern } from "./edition";

const SHORT: Record<string, AbilityId> = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" };

/** The abilities a class leans on, most important first: its multiclass prerequisite, then its saving throws, then Constitution and Dexterity. */
export function classPriorities(cls: AElement): AbilityId[] {
  const out: AbilityId[] = [];
  const add = (a?: AbilityId) => a && !out.includes(a) && out.push(a);
  for (const m of (cls.multiclass?.requirements ?? "").matchAll(/\[(str|dex|con|int|wis|cha)\w*:\d+\]/gi)) add(SHORT[m[1].toLowerCase()]);
  for (const r of cls.rules) {
    if (r.kind !== "grant") continue;
    const m = /SAVINGTHROW_(STRENGTH|DEXTERITY|CONSTITUTION|INTELLIGENCE|WISDOM|CHARISMA)/i.exec(r.id);
    if (m) add(m[1].toLowerCase() as AbilityId);
  }
  add("constitution");
  add("dexterity");
  return out;
}

export interface RandomForce {
  classId?: string;
  raceId?: string;
  backgroundId?: string;
  /** A second class with this many of the levels. */
  multiclass?: { classId: string; level: number };
  /** Pick a starting equipment option at random instead of the first with gear. */
  randomGear?: boolean;
  /** Optional rules to switch on (Firearms, Customized Ability Scores). */
  options?: string[];
  /** Add a companion creature by hand. */
  companion?: boolean;
  /** Roll hit points instead of taking the average. */
  rollHp?: boolean;
  /** More classes after the second, for three-class builds. */
  more?: { classId: string; level: number }[];
  /** Option names to choose wherever they are offered (a subclass, feats, a fighting style). */
  prefer?: string[];
}

export function randomCharacter(reg: ARegistry, level: number, filters: ContentFilters, rng: () => number = Math.random, force: RandomForce = {}): Character {
  const books = new BookIndex(reg);
  const shown = (e: AElement) => !e.compendiumHidden && !hiddenBy(books.info(e.source), e.source, filters, e.type);
  const pick = <T,>(a: T[]): T | undefined => a[Math.floor(rng() * a.length)];
  const pool = (type: string) => {
    // "Custom Background" and "Custom Lineage" are build-your-own templates, not something to roll.
    const all = reg.ofType(type).filter((e) => !e.compendiumHidden && !/^custom\b/i.test(e.name));
    const vis = all.filter(shown);
    return vis.length ? vis : all;
  };
  const cls = force.classId ? reg.get(force.classId) : pick(pool("Class"));
  // Species and background mostly from the same edition as the class, so the pieces fit together.
  const sameEdition = (type: string) => {
    const p = pool(type);
    const same = p.filter((e) => modern(e) === modern(cls));
    return rng() < 0.8 && same.length ? same : p;
  };
  let c = newCharacter();
  c.race = force.raceId ?? pick(sameEdition("Race"))?.id;
  c.background = force.backgroundId ?? pick(sameEdition("Background"))?.id;
  const total = Math.max(1, Math.min(20, Math.floor(level) || 1));
  const second = force.multiclass && force.multiclass.level < total ? reg.get(force.multiclass.classId) : undefined;
  const moreLv = (force.more ?? []).reduce((t, m) => t + m.level, 0);
  if (cls) c.classes = second ? [{ classId: cls.id, level: total - force.multiclass!.level - moreLv }, { classId: second.id, level: force.multiclass!.level }, ...(force.more ?? [])] : [{ classId: cls.id, level: total }];
  c.options = force.options ?? [];
  c.abilityMethod = "standard";
  // The second class's prerequisite abilities come right after the first class's main one, so both reach 13.
  const p1 = cls ? classPriorities(cls) : [];
  const p2 = second ? classPriorities(second).slice(0, 2) : [];
  const first = [...new Set([p1[0], ...p2, ...p1.slice(1)].filter(Boolean))] as AbilityId[];
  const rest = ABILITY_IDS.filter((a) => !first.includes(a)).sort(() => rng() - 0.5);
  [...first, ...rest].forEach((a, i) => (c.abilityBase[a] = [15, 14, 13, 12, 10, 8][i]));
  const wanted = (force.prefer ?? []).map((x) => x.toLowerCase());
  const preferFn = (_slot: string, option: string) => (wanted.some((w) => option.toLowerCase() === w || option.toLowerCase().startsWith(`${w} (`)) ? 100 : rng());
  c = autoFill(c, reg, preferFn, shown);
  // Starting equipment: the first option of the class and of the background, worn and wielded.
  const idx = new ItemIndex(reg);
  const prefer = cls?.source ?? "";
  for (const plan of startingPlans(c, reg)) {
    // The option with gear rather than only gold; in the older "choose (a) or (b)" lists, an option at random,
    // with an actual weapon wherever it says "any martial weapon".
    const withGear = plan.variants.filter((x) => x.fixed.length + x.choices.length > 0 && !/^\s*\d+\s*gp\s*$/i.test(x.label));
    const v = force.randomGear && plan.variants.length > 1 ? plan.variants[Math.floor(rng() * plan.variants.length)] : withGear[0] ?? plan.variants[0];
    if (!v) continue;
    const picks = v.choices.map((g) => Math.floor(rng() * g.options.length));
    const weapons: Record<string, string> = {};
    v.choices.forEach((g, gi) => (g.options[picks[gi]] ?? []).forEach((ref, ri) => {
      const kind = anyWeaponKind(ref.text);
      const list = kind ? weaponChoices(reg, kind).filter((w) => !/\b(net|blowgun|lance)\b/i.test(w.name)) : [];
      const pickW = list.length ? (list.find((w) => modern(w) === modern(cls)) && list.filter((w) => modern(w) === modern(cls))) || list : [];
      if (pickW.length) weapons[`${gi}:${picks[gi]}:${ri}`] = pickW[Math.floor(rng() * pickW.length)].id;
    }));
    const items = resolveChosenTools(variantItems(v, picks, idx, prefer, true, weapons), resolve(c, reg).ids, reg, prefer);
    const label = `${plan.title}, ${v.label.toLowerCase()}`;
    c = addToInventory(c, items, v.gp);
    c = { ...c, equipmentAdded: [...(c.equipmentAdded ?? []), label], equipmentLedger: { ...(c.equipmentLedger ?? {}), [label]: ledgerOf(items, v.gp) } };
  }
  c = autoEquip(c, reg);
  // Prepared casters start with a full set of prepared spells.
  const sheet = buildSheet(resolve(c, reg));
  for (const line of sheet.casting) {
    if (!line.prepare || line.prepareMax <= 0) continue;
    const pool = preparePool(resolve(c, reg), line).sort(() => rng() - 0.5);
    c = { ...c, prepared: { ...c.prepared, [line.name]: pool.slice(0, line.prepareMax).map((e) => e.id) } };
  }
  if (force.companion) {
    const beasts = reg.ofType("Companion").filter((e) => shown(e) && /beast/i.test(e.setters.type?.value ?? ""));
    const b = pick(beasts);
    if (b) c = { ...c, companions: [...c.companions, { uid: `cmp${Math.floor(rng() * 1e9)}`, id: b.id, name: b.name }] };
  }
  if (force.rollHp) {
    const rolls: Record<string, number> = {};
    let n = 0;
    for (const k of c.classes) for (let i = 0; i < k.level; i++) { n++; if (n > 1) { const die = hitDieOf(reg.get(k.classId)) || 8; rolls[String(n)] = 1 + Math.floor(rng() * die); } }
    c = { ...c, hpMode: "roll", hpRolls: rolls };
  }
  c.name = "Random adventurer";
  return c;
}
