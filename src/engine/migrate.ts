/**
 * Saved characters move to 5e.tools ids (docs/PLAN-5ETOOLS.md, D6). Every Aurora id a character holds maps to its
 * 5e.tools twin: the same type, name and book (twinKey), else the same concept (a skill, language, tool or sense,
 * whoever names it: concepts.ts), else a spell of that name. Root ids (species, background, classes, options, extras,
 * gear, spells prepared, companions) are replaced directly. Picks cannot be: a choice's key follows its owner's rules,
 * which differ between providers. So the character is rebuilt on 5e.tools content and each choice it opens is filled
 * with the old picks it offers, the owner's twin's picks first, until nothing more lands. What finds no place is
 * reported, as is every id with no twin.
 */
import type { Character } from "../aurora/character";
import { resolve } from "../aurora/engine";
import { buildSheet } from "../aurora/sheet";
import type { ARegistry } from "../aurora/registry";
import type { AElement } from "../aurora/types";
import { conceptOf, nameKey } from "./concepts";
import { twinKey } from "./timeline";

export interface Migration {
  ch: Character;
  /** Ids replaced by their twin. */
  moved: number;
  /** Ids with no 5e.tools twin, by name; they stay as they are. */
  noTwin: { id: string; name: string; type: string }[];
  /** Old picks whose twin no choice of the rebuilt character offers. */
  unplaced: { id: string; name: string; choice: string }[];
}

const isFive = (e: AElement | undefined) => !!e && (e.origin === "5etools" || e.id.startsWith("ID_5ET"));

const GEAR = /^(item|armor|weapon|magic item|ammunition|tool)/i;
function gearNames(el: AElement): string[] {
  const n = el.name.replace(/[’‘]/g, "'");
  const out = [n];
  const m = /^([^,(]+),\s*([^(]+?)(\s*\(.*\))?$/.exec(n);
  if (m) out.push(`${m[2].trim()} ${m[1].trim()}${m[3] ?? ""}`);
  if (/^armor$/i.test(el.type) && !/armor|shield|mail|plate/i.test(n)) out.push(`${n} Armor`);
  return out;
}

/** The 5e.tools twin of an element, by twin key, then concept, then (spells, items) name and type. */
export function fiveToolsTwins(reg: ARegistry): (id: string) => string | undefined {
  const byTwin = new Map<string, string>();
  const byConcept = new Map<string, string>();
  const byName = new Map<string, AElement[]>();
  for (const e of reg.all()) {
    if (!isFive(e)) continue;
    if (!byTwin.has(twinKey(e))) byTwin.set(twinKey(e), e.id);
    const c = conceptOf(e);
    if (c && !byConcept.has(c)) byConcept.set(c, e.id);
    const k = `${e.type}|${nameKey(e.name)}`;
    (byName.get(k) ?? byName.set(k, []).get(k)!).push(e);
    if (GEAR.test(e.type)) { const g = `gear|${nameKey(e.name)}`; (byName.get(g) ?? byName.set(g, []).get(g)!).push(e); }
  }
  const memo = new Map<string, string | undefined>();
  return (id: string) => {
    if (memo.has(id)) return memo.get(id);
    const el = reg.get(id);
    let hit: string | undefined;
    if (!el) hit = undefined;
    else if (isFive(el)) hit = id;
    else {
      hit = byTwin.get(twinKey(el));
      const c = hit ? undefined : conceptOf(el);
      if (!hit && c) hit = byConcept.get(c);
      if (!hit) {
        // Another book's copy of the same thing (a spell or an item reprinted): the same edition's first.
        // Gear by the names either writes: Aurora's "Rope, Hempen (50 feet)", "Clothes, Fine" and "Leather" are
        // 5e.tools' "Hempen Rope (50 feet)", "Fine Clothes" and "Leather Armor", whatever kind of item each calls it.
        const gear = GEAR.test(el.type) ? gearNames(el).flatMap((n) => byName.get(`gear|${nameKey(n)}`) ?? []) : [];
        const same = [...(byName.get(`${el.type}|${nameKey(el.name)}`) ?? []), ...gear];
        hit = (same.find((e) => e.edition && e.edition === el.edition) ?? same[0])?.id;
      }
    }
    memo.set(id, hit);
    return hit;
  };
}

const ABILITY = /\b(strength|dexterity|constitution|intelligence|wisdom|charisma)\b/i;

/** `ch` built on `from` (both providers) moved onto `to` (5e.tools without Aurora). */
export function migrateToFiveTools(ch: Character, from: ARegistry, to: ARegistry): Migration {
  const twin = fiveToolsTwins(from);
  const noTwin = new Map<string, { id: string; name: string; type: string }>();
  let moved = 0;
  // `keep`: an id the character holds; one with no twin is reported. Choice owners are only mapped to match picks.
  const map = (id: string | undefined, keep = true): string | undefined => {
    if (!id) return id;
    const t = twin(id);
    if (!t) {
      const el = from.get(id);
      if (el && keep) noTwin.set(id, { id, name: el.name, type: el.type });
      return id;
    }
    if (t !== id && keep) moved++;
    return t;
  };

  // The old picks, each with the twin of the element whose choice held it. Ability increases are not carried as
  // picks: the two providers build them differently, so they are filled below to give the old scores.
  const old = resolve(ch, from);
  const target = buildSheet(old).abilities.map((a) => a.score);
  type Pick = { id: string; name: string; owner: string; ownerName: string; choice: string; ability: boolean; spell: boolean; casting?: string };
  const pool: Pick[] = [];
  const lists: { owner: string; name: string; values: string[] }[] = [];
  const isAbility = (name: string, type: string) => type === "Ability Score Improvement" || /^ability score (improvement|increase)/i.test(name) || (ABILITY.test(name) && /\+\d|increase|improvement/i.test(name));
  for (const s of old.slots) {
    if (s.rule.type === "List") { if (s.chosen.length) lists.push({ owner: map(s.owner.id, false)!, name: s.rule.name, values: s.chosen }); continue; }
    for (const id of s.chosen) {
      const el = from.get(id);
      // Aurora's structure, not a pick of the player's: "Feat" under an improvement (the feat itself is the next pick).
      if (el && el.type === "Class Feature" && /^feat$/i.test(el.name)) continue;
      // By what the pick is, not by its choice's name: Aurora's "Ability Score Improvement (Barbarian 4)" holds feats.
      const ability = el?.type !== "Feat" && (s.rule.type === "Ability Score Improvement" || isAbility(el?.name ?? "", el?.type ?? ""));
      const t = ability ? id : map(id, false);
      pool.push({ id: t ?? id, name: el?.name ?? id, owner: map(s.owner.id, false)!, ownerName: nameKey(s.owner.name), choice: s.rule.name, ability, spell: el?.type === "Spell", casting: s.rule.spellcasting });
    }
  }
  const picks = pool.filter((p) => !p.ability);

  const next: Character = {
    ...ch,
    race: map(ch.race),
    background: map(ch.background),
    classes: ch.classes.map((c) => ({ ...c, classId: map(c.classId)! })),
    options: ch.options.map((x) => map(x)!),
    extras: ch.extras.map((x) => map(x)!),
    inventory: ch.inventory.map((it) => (it.id ? { ...it, id: map(it.id)! } : it)),
    prepared: Object.fromEntries(Object.entries(ch.prepared ?? {}).map(([k, v]) => [k, v.map((x) => map(x)!)])),
    companions: (ch.companions ?? []).map((c) => (c.id ? { ...c, id: map(c.id)! } : c)),
    selections: {},
    declined: [],
    taken: [],
  };

  // Which option of a choice an old pick is: the same id; the same name (another book's copy of a spell, Aurora's
  // infusion Class Features for 5e.tools' Optional Features); or the owner's name with the pick's ("Magic Initiate
  // (Bard)" for Magic Initiate's "Bard").
  type Slot = ReturnType<typeof resolve>["slots"][number];
  const fits = (s: Slot, p: Pick): string | undefined => {
    // A spell stays with its spellcasting: a Warlock's spells known are not a Sorcerer's.
    if (p.spell && p.casting && s.rule.spellcasting && p.casting.toLowerCase() !== s.rule.spellcasting.toLowerCase()) return undefined;
    const open = s.options.filter((o) => !s.blocked.has(o.id));
    const byId = open.find((o) => o.id === p.id);
    if (byId) return byId.id;
    const n = nameKey(p.name);
    return (open.find((o) => nameKey(o.name) === n) ?? open.find((o) => nameKey(o.name) === nameKey(`${s.owner.name} (${p.name})`)))?.id;
  };
  const room = (s: Slot) => s.rule.type !== "List" && (next.selections[s.key]?.length ?? 0) < s.rule.number;
  // The owner's picks go first, to a fixed point (an invocation chosen opens its own feat choice, which its feat
  // must take before any other choice can); only then may a pick go to a choice of another owner. An owner is matched
  // by twin or by name (Aurora's Lessons of the First Ones is a Class Feature, 5e.tools' an Optional Feature). The
  // narrowest choices go first, so a choice of any skill does not take the picks a class's short list needs.
  const ownerOf = (s: Slot, p: Pick) => p.owner === s.owner.id || p.ownerName === nameKey(s.owner.name);
  const pass = (ownerOnly: boolean): boolean => {
    const r = resolve(next, to);
    let placed = false;
    for (const s of r.slots) {
      if (s.rule.type !== "List" || next.selections[s.key]?.length) continue;
      const l = lists.findIndex((x) => x.owner === s.owner.id && x.name === s.rule.name);
      if (l >= 0) { next.selections[s.key] = lists[l].values; lists.splice(l, 1); placed = true; }
    }
    for (const s of r.slots.filter(room).sort((a, b) => a.options.length - b.options.length)) {
      const have = next.selections[s.key] ?? [];
      for (let i = 0; i < picks.length && have.length < s.rule.number; i++) {
        const p = picks[i];
        if (ownerOnly && !ownerOf(s, p)) continue;
        const id = fits(s, p);
        if (id && !have.includes(id)) { have.push(id); picks.splice(i--, 1); placed = true; }
      }
      if (have.length) next.selections[s.key] = have;
      // Any owner: one choice at a time, so what it opens is offered to its own picks first.
      if (!ownerOnly && placed) return true;
    }
    return placed;
  };
  const place = () => { for (let round = 0; round < 80; round++) if (!pass(true) && !pass(false)) break; };

  // Ability increases: each open choice whose options raise scores (or choose how they are raised) takes the option
  // that brings the scores closest to the old sheet's, looking one choice ahead for a pattern ("+2 and +1").
  const gap = (c: Character) => buildSheet(resolve(c, to)).abilities.reduce((n, a, i) => n + Math.abs(target[i] - a.score), 0);
  // The options of a choice that raise scores or say how: all of an Ability Score Improvement choice's, else those so
  // named (the 2014 "Ability Score Improvement or feat" choice's improvement among its feats).
  const raising = (s: Slot) => s.options.filter((o) => !s.blocked.has(o.id) && (s.rule.type === "Ability Score Improvement" || isAbility(o.name, o.type)));
  const abilityish = (s: Slot) => !s.rule.optional && room(s) && raising(s).length > 0;
  const best = (c: Character, s: Slot, depth: number): { id: string; gap: number } | undefined => {
    let out: { id: string; gap: number } | undefined;
    for (const o of raising(s).filter((x) => !(c.selections[s.key] ?? []).includes(x.id)).slice(0, 12)) {
      let t: Character = { ...c, selections: { ...c.selections, [s.key]: [...(c.selections[s.key] ?? []), o.id] } };
      // A pattern ("+2 to one score and +1 to another") opens the choices that raise: fill them the same way.
      for (let d = 0; d < depth; d++) {
        const opened = resolve(t, to).slots.find((x) => x.key !== s.key && !t.selections[x.key]?.length && abilityish(x));
        const sub = opened ? best(t, opened, 0) : undefined;
        if (!opened || !sub) break;
        t = { ...t, selections: { ...t.selections, [opened.key]: [sub.id] } };
      }
      const g = gap(t);
      if (!out || g < out.gap) out = { id: o.id, gap: g };
    }
    return out;
  };
  const fillScores = (only?: (s: Slot) => boolean) => {
  const skipped = new Set<string>();
  for (let round = 0; round < 40 && gap(next) > 0; round++) {
    const s = resolve(next, to).slots.find((x) => !skipped.has(x.key) && abilityish(x) && (!only || only(x)));
    if (!s) break;
    const b = best(next, s, 3);
    if (!b || b.gap >= gap(next)) { skipped.add(s.key); continue; }
    next.selections[s.key] = [...(next.selections[s.key] ?? []), b.id];
  }
  };

  // The species', background's and feats' own increases first, so a feat's score requirement holds when it is
  // placed (Charger: Strength or Dexterity 13); then the picks; then the class improvements a feat did not take.
  fillScores((x) => x.rule.type === "Ability Score Improvement");
  place();
  fillScores();
  place();

  // Spells a 2024 caster prepares rather than counts as picks: the old picks of that spellcasting become prepared.
  {
    const r = resolve(next, to);
    for (let i = 0; i < picks.length; i++) {
      const p = picks[i];
      const entry = p.spell && p.casting ? r.spellcasting.get(p.casting.toLowerCase()) : undefined;
      if (!entry?.prepare) continue;
      const list = (next.prepared[entry.name] ??= []);
      const sp = to.get(p.id)?.type === "Spell" ? p.id : to.ofType("Spell").find((e) => nameKey(e.name) === nameKey(p.name))?.id;
      if (sp && !list.includes(sp)) { list.push(sp); picks.splice(i--, 1); }
    }
  }

  // A pick the rebuilt character has anyway (5e.tools grants what Aurora asked) has its place.
  const final = resolve(next, to);
  const names = new Set(final.active.map((a) => nameKey(a.el.name)));
  // "Channel Divinity: Divine Spark" is "Divine Spark" where 5e.tools grants it.
  const had = (n: string) => names.has(nameKey(n)) || names.has(nameKey(n.replace(/^[^:]+:\s*/, "")));
  const unplaced = picks.filter((p) => !final.ids.has(p.id) && !had(p.name)).map((p) => ({ id: p.id, name: p.name, choice: p.choice }));
  return { ch: next, moved, noTwin: [...noTwin.values()], unplaced };
}
