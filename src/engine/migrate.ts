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
  /** Choices the rebuilt character leaves open, with a few of their options: where the unplaced picks should go. */
  open: string[];
  /** Picks kept although 5e.tools' rules rule them out, as "choice: pick (why)". */
  againstRules: string[];
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

/** "+2, +1" and "+2 to one score and +1 to another" are one shape; "+1, +1, +1" and "+1 to three different scores". */
function shapeOf(name: string): string {
  const n = name.toLowerCase();
  if (/\+2/.test(n)) return /\+1/.test(n) ? "2-1" : "2";
  const ones = (n.match(/\+1/g) ?? []).length;
  return /three/.test(n) || ones >= 3 ? "1-1-1" : /two|another/.test(n) || ones === 2 ? "1-1" : "1";
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
  type Pick = { id: string; name: string; owner: string; ownerName: string; choice: string; ability: boolean; spell: boolean; casting?: string; concept?: string; at: number };
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
      pool.push({ id: t ?? id, name: el?.name ?? id, owner: map(s.owner.id, false)!, ownerName: nameKey(s.owner.name), choice: s.rule.name, ability, spell: el?.type === "Spell", casting: s.rule.spellcasting, concept: el ? conceptOf(el) : undefined, at: s.at ?? 0 });
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
  const ownerOf = (s: Slot, p: Pick) => p.owner === s.owner.id || p.ownerName === nameKey(s.owner.name);
  const fits = (s: Slot, p: Pick, anyway = false): string | undefined => {
    // A spell stays with its spellcasting: a Warlock's spells known are not a Sorcerer's.
    // The owner's own choice takes it whatever each provider calls the casting (Blessed Warrior's cantrips: Aurora says
    // the Paladin's, 5e.tools Blessed Warrior's).
    if (p.spell && p.casting && s.rule.spellcasting && p.casting.toLowerCase() !== s.rule.spellcasting.toLowerCase() && !ownerOf(s, p)) return undefined;
    // `anyway`: the player's pick that 5e.tools' rules rule out (Polearm Master at 4th level without Strength or
    // Dexterity 13, which Aurora's copy did not ask) is kept, marked against the rules as any such pick is.
    const open = anyway ? s.options : s.options.filter((o) => !s.blocked.has(o.id));
    const byId = open.find((o) => o.id === p.id);
    if (byId) return byId.id;
    const n = nameKey(p.name);
    // The same concept, whoever names it: Aurora's "Skill Expertise (Acrobatics)" Class Feature is 5e.tools' expertise.
    const c = p.concept;
    const byConcept = c ? open.find((o) => conceptOf(o) === c) : undefined;
    if (byConcept) return byConcept.id;
    // Or the owner's name with the pick's, either owner: "Magic Initiate (Druid)" for Magic Initiate's "Druid" (the
    // feat's own choice under Aurora, its versions under 5e.tools), "Light Bringer: Light" for Light Bringer's "Light".
    const withOwner = new Set([nameKey(`${s.owner.name} ${p.name}`), `${p.ownerName} ${n}`]);
    const exact = open.find((o) => nameKey(o.name) === n) ?? open.find((o) => withOwner.has(nameKey(o.name)));
    if (exact) return exact.id;
    // Near names never fill a choice of increases: those are set to the old scores below ("Resilient (Strength)" is
    // the saving throw, not Resilient's "+1 Strength").
    // Only a pick that is an ability's bare name does (Fey Touched's "Intelligence" is its "+1 Intelligence").
    if (s.rule.type === "Ability Score Improvement") {
      if (!/^(strength|dexterity|constitution|intelligence|wisdom|charisma)$/.test(n)) return undefined;
      const hit = open.filter((o) => new RegExp(`^\\+\\d ${n}$`).test(nameKey(o.name).replace(/^(\d)/, "+$1")) || nameKey(o.name) === `1 ${n}` || nameKey(o.name) === `2 ${n}`);
      return hit.length === 1 ? hit[0].id : undefined;
    }
    // A near name, when only one option has it: "Rock Gnome" is "Rock Gnome Lineage", "Wisdom" is "+1 Wisdom";
    // "Resilient (Strength)" is "Saving throw proficiency (Strength)" by what the brackets name. Never across kinds:
    // the spell Light is not the feat Light Bringer (it took a Cleric's 4th-level feat).
    const kind = (to.get(p.id) ?? from.get(p.id))?.type;
    const same = (o: (typeof open)[number]) => !kind || o.type === kind || (kind !== "Spell" && kind !== "Feat" && o.type !== "Spell" && o.type !== "Feat");
    const one = (xs: typeof open) => { const ys = xs.filter(same); return ys.length === 1 ? ys[0].id : undefined; };
    const inName = n.length > 3 ? one(open.filter((o) => ` ${nameKey(o.name)} `.includes(` ${n} `))) : undefined;
    if (inName) return inName;
    // What the brackets name, as an option's brackets, its name, or inside its name: "Cloud's Jaunt (Cloud Giant)"
    // is "Cloud Giant Ancestry"; Scholar's "Skill Expertise (Medicine)" is its option "Medicine".
    const br = /\(([^)]+)\)\s*$/.exec(p.name)?.[1];
    if (!br) return undefined;
    const b = nameKey(br);
    return one(open.filter((o) => nameKey(/\(([^)]+)\)\s*$/.exec(o.name)?.[1] ?? "") === b)) ?? one(open.filter((o) => nameKey(o.name) === b)) ?? (b.length > 3 ? one(open.filter((o) => ` ${nameKey(o.name)} `.includes(` ${b} `))) : undefined);
  };
  const room = (s: Slot) => s.rule.type !== "List" && (next.selections[s.key]?.length ?? 0) < s.rule.number;
  // The owner's picks go first, to a fixed point (an invocation chosen opens its own feat choice, which its feat
  // must take before any other choice can); only then may a pick go to a choice of another owner. An owner is matched
  // by twin or by name (Aurora's Lessons of the First Ones is a Class Feature, 5e.tools' an Optional Feature). The
  // narrowest choices go first, so a choice of any skill does not take the picks a class's short list needs.
  type Mode = { owner?: boolean; level?: boolean; anyway?: boolean };
  const pass = (mode: Mode): boolean => {
    const r = resolve(next, to);
    let placed = false;
    for (const s of r.slots) {
      if (s.rule.type !== "List" || next.selections[s.key]?.length) continue;
      const l = lists.findIndex((x) => x.owner === s.owner.id && x.name === s.rule.name);
      if (l >= 0) { next.selections[s.key] = lists[l].values; lists.splice(l, 1); placed = true; }
    }
    // A maximum matching of picks to the places choices have (Kuhn's algorithm, as the importer matches trainings):
    // greedy order let 1st-level spells fill the spellbook's last places, leaving its 9th-level picks nowhere.
    const rooms = r.slots.filter(room);
    const places: { s: Slot; id?: string }[] = rooms.flatMap((x) => Array.from({ length: x.rule.number - (next.selections[x.key]?.length ?? 0) }, () => ({ s: x })));
    // Every allowed edge at once, the preferred first (owner and level, owner, level, then a pick the rules now rule
    // out kept at its own level, then anywhere): augmenting paths may move an earlier pick to make room for another.
    const rank = (pl: { s: Slot }, p: Pick): { rank: number; id: string } | undefined => {
      const own = ownerOf(pl.s, p), lvl = p.at === pl.s.at;
      const ok = fits(pl.s, p);
      // A feat goes only to its owner's choice or its own level's: an old pick whose choice 5e.tools no longer asks
      // (a background feat it now gives outright) must not take another level's feat (it pushed Spell Sniper out).
      if (ok && !own && !lvl && from.get(p.id)?.type === "Feat" || ok && !own && !lvl && to.get(p.id)?.type === "Feat") return undefined;
      if (ok) return { rank: own && lvl ? 0 : own ? 1 : lvl ? 2 : 4, id: ok };
      const anyway = lvl ? fits(pl.s, p, true) : undefined;
      return anyway ? { rank: 3, id: anyway } : undefined;
    };
    void mode;
    const edges = picks.map((p) => places.map((pl, j) => ({ j, ...(rank(pl, p) ?? { rank: 9, id: "" }) })).filter((e) => e.id && !(next.selections[places[e.j].s.key] ?? []).includes(e.id)).sort((x, y) => x.rank - y.rank));
    const owner = new Array<number>(places.length).fill(-1);
    const take = (i: number, seen: Set<number>): boolean => {
      for (const e of edges[i]) {
        if (seen.has(e.j)) continue;
        seen.add(e.j);
        if (owner[e.j] < 0 || take(owner[e.j], seen)) { owner[e.j] = i; places[e.j].id = e.id; return true; }
      }
      return false;
    };
    // The picks with the best places first, so a pick on its own owner's choice keeps it against one from elsewhere.
    const byRank = picks.map((_, i) => i).filter((i) => edges[i].length).sort((x, y) => edges[x][0].rank - edges[y][0].rank);
    for (const i of byRank) take(i, new Set());
    const used = new Set<number>();
    for (let j = 0; j < places.length; j++) {
      const i = owner[j];
      if (i < 0) continue;
      const have = (next.selections[places[j].s.key] ??= []);
      // One choice holds an option once: a second place of the same choice wanting the same id is left.
      if (have.includes(places[j].id!)) continue;
      have.push(places[j].id!);
      used.add(i);
      placed = true;
    }
    for (const i of [...used].sort((a, b) => b - a)) picks.splice(i, 1);
    return placed;
  };
  const place = () => { for (let round = 0; round < 120; round++) if (!pass({})) break; };

  // Ability increases: each open choice whose options raise scores (or choose how they are raised) takes the option
  // that brings the scores closest to the old sheet's, looking one choice ahead for a pattern ("+2 and +1").
  const gap = (c: Character) => buildSheet(resolve(c, to)).abilities.reduce((n, a, i) => n + Math.abs(target[i] - a.score), 0);
  // The options of a choice that raise scores or say how: all of an Ability Score Improvement choice's, else those so
  // named (the 2014 "Ability Score Improvement or feat" choice's improvement among its feats).
  const raising = (s: Slot) => s.options.filter((o) => !s.blocked.has(o.id) && (s.rule.type === "Ability Score Improvement" || isAbility(o.name, o.type)));
  const abilityish = (s: Slot) => !s.rule.optional && room(s) && raising(s).length > 0;
  const best = (c: Character, s: Slot, depth: number): { id: string; gap: number } | undefined => {
    let out: { id: string; gap: number } | undefined;
    // Every option: the 2014 improvement has 21 (six "+2", fifteen pairs), and "+1 Dexterity, +1 Charisma" is the 14th.
    for (const o of raising(s).filter((x) => !(c.selections[s.key] ?? []).includes(x.id))) {
      let t: Character = { ...c, selections: { ...c.selections, [s.key]: [...(c.selections[s.key] ?? []), o.id] } };
      // A pattern ("+2 to one score and +1 to another") opens the choices that raise: fill them the same way.
      for (let d = 0; d < depth; d++) {
        const opened = resolve(t, to).slots.find((x) => x.key !== s.key && !t.selections[x.key]?.length && abilityish(x));
        const sub = opened ? best(t, opened, 0) : undefined;
        if (!opened || !sub) break;
        t = { ...t, selections: { ...t.selections, [opened.key]: [sub.id] } };
      }
      const g = gap(t);
      // On a tie, the old pick's own pattern: "+1, +1, +1" is "+1 to three different scores", not "+2 and +1".
      if (!out || g < out.gap || (g === out.gap && sameShape(o.name) && !sameShape(from.get(out.id)?.name ?? to.get(out.id)?.name ?? ""))) out = { id: o.id, gap: g };
    }
    return out;
  };
  const shapes = pool.filter((p) => p.ability && /\+\d.*\+\d|\+\d to|three|two/i.test(p.name)).map((p) => shapeOf(p.name));
  const sameShape = (name: string) => shapes.includes(shapeOf(name));
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
  // A choice of a set ("expertise: AnyProficientSkill, or AnyProficientSkill and thieves' tools"; a lineage) that no
  // pick names: the option whose own choices then take the most old picks.
  const fillSets = () => {
    for (let round = 0; round < 20; round++) {
      const r = resolve(next, to);
      let done = false;
      for (const s of r.slots.filter((x) => room(x) && !x.rule.optional && x.rule.type === "Training Option" && x.options.length <= 8)) {
        let bestId: string | undefined, bestN = 0;
        for (const o of s.options.filter((x) => !s.blocked.has(x.id))) {
          const t: Character = { ...next, selections: { ...next.selections, [s.key]: [...(next.selections[s.key] ?? []), o.id] } };
          const after = resolve(t, to);
          const opened = after.slots.filter((x) => !r.slots.some((y) => y.key === x.key));
          // Picks its own choices would take, and picks it simply gives (the Rogue's "and thieves' tools" expertise).
          const gives = (p: Pick) => !!p.concept && after.active.some((a) => conceptOf(a.el) === p.concept) && !r.active.some((a) => conceptOf(a.el) === p.concept);
          const n = picks.filter((p) => opened.some((x) => fits(x, p)) || gives(p)).length;
          if (n > bestN) { bestN = n; bestId = o.id; }
        }
        if (bestId) { next.selections[s.key] = [...(next.selections[s.key] ?? []), bestId]; done = true; break; }
      }
      if (!done) break;
      place();
    }
  };
  // Picks first (a feat's own +1 counts before the species' pattern is chosen), then the scores, then again.
  place();
  fillScores((x) => x.rule.type === "Ability Score Improvement");
  place();
  // A subrace 5e.tools asks where Aurora's copy had none (the Human's, the Dragonborn's): the plain one.
  for (const s of resolve(next, to).slots) if (room(s) && /sub ?race/i.test(s.rule.type + s.rule.name)) { const plain = s.options.find((o) => /\(standard\)$/i.test(o.name)); if (plain) next.selections[s.key] = [plain.id]; }
  place();
  fillSets();
  fillScores();
  place();
  fillScores();

  // Spells a 2024 caster prepares rather than counts as picks: the old picks of that spellcasting become prepared.
  {
    const r = resolve(next, to);
    for (let i = 0; i < picks.length; i++) {
      const p = picks[i];
      // Spells, not cantrips: a cantrip is never prepared.
      const lvl = Number(to.get(p.id)?.setters.level?.value ?? from.get(p.id)?.setters.level?.value ?? 1);
      const entry = p.spell && p.casting && lvl > 0 ? r.spellcasting.get(p.casting.toLowerCase()) : undefined;
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
  const open = final.slots.filter((x) => room(x) && !x.rule.optional && x.options.length).map((x) => `${x.owner.name}: ${x.rule.name} [${x.options.slice(0, 4).map((o) => o.name).join("; ")}${x.options.length > 4 ? "; …" : ""}]`);
  const againstRules = final.slots.flatMap((x) => x.chosen.filter((id) => x.blocked.has(id)).map((id) => `${x.rule.name}: ${to.get(id)?.name ?? id} (${x.whyBlocked?.(id) ?? "against the rules"})`));
  return { ch: next, moved, noTwin: [...noTwin.values()], unplaced, open, againstRules };
}
