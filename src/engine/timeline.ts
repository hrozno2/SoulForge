/**
 * The timeline resolver (docs/ENGINE-PLAN.md, 3.4): the character is built the way the rules build it, one level at
 * a time in the order the classes were taken, and each choice is judged against the character as it was when the
 * choice was made. It returns the same `Resolved` shape as the old resolver, so the sheet, the checker and the UI
 * can use either, and the two can be compared on every saved character.
 *
 * What it fixes by construction, not by more passes:
 * - No pass limit. Each level settles on its own, starting from the previous level's state, and a requirement
 *   loop that never settles is reported as a finding instead of being cut off.
 * - No future knowledge. An ASI from level 8 cannot make a level-4 feat legal; a feature gained at level 14 cannot
 *   block or allow a choice made at level 4. The state of each level is computed, not approximated.
 * - Character level and class level are separate in requirements (requirements.ts).
 */
import { makeCtx, resolveSupports, sharedSlotLevel, walk, type Pass, type Resolved, type SelectSlot } from "../aurora/engine";
import { explainUnmet, meets } from "../aurora/requirements";
import { totalLevel, type Character } from "../aurora/character";
import type { ARegistry } from "../aurora/registry";
import type { AElement } from "../aurora/types";
import { replaceable } from "./replace";
import { byEdition, choiceEdition } from "./editionPolicy";
import { bookKey } from "../aurora/books";

export interface LevelState {
  /** Character level after this step (0 for a character without a class). */
  level: number;
  pass: Pass;
}

export interface TimelineResolved extends Resolved {
  /** The settled state after each character level, in order. */
  timeline: LevelState[];
  /** Problems the resolver itself found (a requirement loop that does not settle). */
  findings: string[];
}

const lc = (s: string) => s.toLowerCase();

/** The character as it stood at character level `n`: classes filled in the order they were taken. */
export function atLevel(ch: Character, n: number): Character {
  let left = n;
  const classes = [];
  for (const c of ch.classes) {
    if (left <= 0) break;
    const take = Math.min(c.level, left);
    classes.push({ ...c, level: take });
    left -= take;
  }
  return { ...ch, classes };
}

/**
 * Walks one level until it settles. The previous level's state is the starting point, so a level usually settles in
 * one or two walks. A state seen before means a loop (two requirements that switch each other off); it is reported.
 */
function settle(ch: Character, reg: ARegistry, seed: Pass | null, findings: string[], level: number): Pass {
  let pass = walk(ch, reg, seed);
  const seen = new Set([pass.signature]);
  for (let i = 0; i < 64; i++) {
    const next = walk(ch, reg, pass);
    if (next.signature === pass.signature) return next;
    if (seen.has(next.signature)) {
      const a = new Set(pass.ids);
      const flipping = [...next.ids].filter((id) => !a.has(id)).concat([...a].filter((id) => !next.ids.has(id)));
      findings.push(`Level ${level}: requirements switch each other on and off (${flipping.slice(0, 6).join(", ")})`);
      return next;
    }
    seen.add(next.signature);
    pass = next;
  }
  findings.push(`Level ${level}: did not settle after 64 walks`);
  return pass;
}

/**
 * Settled levels, reused between calls (the UI resolves on every click). A level's result depends on the character
 * apart from its choices, on the level before it, and on the choices that level read; a change at level 10 leaves
 * levels 1 to 9 untouched. Entries are per content registry.
 */
interface Cached { used: [string, string][]; pass: Pass; findings: string[] }
const CACHE = new WeakMap<ARegistry, Map<string, Cached[]>>();
const CACHE_LIMIT = 400;

function settleCached(chN: Character, reg: ARegistry, seed: Pass | null, findings: string[], level: number): Pass {
  const byKey = CACHE.get(reg) ?? CACHE.set(reg, new Map()).get(reg)!;
  const key = `${JSON.stringify({ ...chN, selections: undefined, play: undefined, info: undefined, notes: undefined, portrait: undefined })}\u0000${seed?.signature ?? ""}`;
  const sel = (k: string) => JSON.stringify(chN.selections[k] ?? null);
  const hit = byKey.get(key)?.find((c) => c.used.every(([k, v]) => sel(k) === v));
  if (hit) {
    findings.push(...hit.findings);
    return hit.pass;
  }
  const own: string[] = [];
  const pass = settle(chN, reg, seed, own, level);
  findings.push(...own);
  const list = byKey.get(key) ?? [];
  list.unshift({ used: pass.rawSlots.map((r) => [r.key, sel(r.key)]), pass, findings: own });
  byKey.set(key, list.slice(0, 4));
  if (byKey.size > CACHE_LIMIT) byKey.delete(byKey.keys().next().value!);
  return pass;
}

/** One element of one book, whichever provider has it: type, name and book. */
const TWIN = new WeakMap<object, string>();
export const twinKey = (e: { type: string; name: string; source: string }) => {
  let k = TWIN.get(e);
  if (k === undefined) TWIN.set(e, (k = `${e.type}|${e.name.toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim()}|${bookKey(e.source ?? "")}`));
  return k;
};

/** Options without the second provider's copy of an element the primary provider has (Aurora's, then 5e.tools'). */
function primaryOptions<T extends { id: string; type: string; name: string; source: string; origin?: string }>(options: T[], chosen: string[]): T[] {
  if (!options.some((e) => e.origin === "5etools")) return options;
  const primary = new Set(options.filter((e) => e.origin !== "5etools").map(twinKey));
  return options.filter((e) => e.origin !== "5etools" || chosen.includes(e.id) || !primary.has(twinKey(e)));
}

/** The kept options per registry and (kind, filter, edition, books): they do not depend on the character's picks. */
const OPTIONS = new WeakMap<ARegistry, Map<string, { kept: AElement[]; keptIds: Set<string>; primary: Set<string> }>>();
function optionsFor(reg: ARegistry, type: string, filter: string, ed: string, books: string, build: () => { kept: AElement[]; primary: Set<string> }) {
  const byReg = OPTIONS.get(reg) ?? OPTIONS.set(reg, new Map()).get(reg)!;
  const key = `${type}\u0000${filter}\u0000${ed}\u0000${books}`;
  let hit = byReg.get(key);
  if (!hit) {
    const b = build();
    hit = { ...b, keptIds: new Set(b.kept.map((e) => e.id)) };
    byReg.set(key, hit);
  }
  return hit;
}

export function resolveTimeline(ch: Character, reg: ARegistry): TimelineResolved {
  const findings: string[] = [];
  const total = totalLevel(ch);
  const timeline: LevelState[] = [];
  let seed: Pass | null = null;
  for (let n = total === 0 ? 0 : 1; n <= total; n++) {
    const pass = settleCached(atLevel(ch, n), reg, seed, findings, n);
    timeline.push({ level: n, pass });
    seed = pass;
  }
  const final = timeline[timeline.length - 1].pass;

  // Each choice belongs to the first level at which it opened, and is judged against that level's state.
  const openedAt = new Map<string, LevelState>();
  for (const st of timeline) for (const s of st.pass.rawSlots) if (!openedAt.has(s.key)) openedAt.set(s.key, st);

  const restricted = new Set(ch.sources.map(bookKey));
  const restrictedKey = [...restricted].sort().join("|");
  // Feats had, by twin key and provider: the same feat from the other provider counts as had, but a provider's own
  // copies of one feat (Aurora's Ability Score Improvement, _2, _3, taken again by design) do not block each other.
  const featsHad = new Map<string, Set<boolean>>();
  for (const a of final.active) if (a.el.type === "Feat") (featsHad.get(twinKey(a.el)) ?? featsHad.set(twinKey(a.el), new Set()).get(twinKey(a.el))!).add(a.el.origin === "5etools");
  const hadAsTwin = (e: { type: string; name: string; source: string; origin?: string }) => featsHad.get(twinKey(e))?.has(e.origin !== "5etools") ?? false;
  const shared = sharedSlotLevel(final);
  const slots: SelectSlot[] = final.rawSlots.map((s) => {
    if (s.rule.type === "List") return { ...s, options: [], blocked: new Set<string>(), filter: "", listItems: s.rule.items ?? [] };
    const st = openedAt.get(s.key) ?? timeline[timeline.length - 1];
    const then = st.pass;
    const thenSlot = then.rawSlots.find((x) => x.key === s.key) ?? s;
    // A choice the rules let the character change later (spells known, invocations...) may hold what the current
    // level allows; anything else must have been legal when it was made.
    const changeable = replaceable(s);
    const filter = resolveSupports(s.rule.supports, s.rule.spellcasting, changeable ? final : then, shared);
    // The options for this kind, filter, edition and book restriction, the same on every resolve, so kept: one
    // option per element of one book (the primary provider's, as in the lists), and the edition rule (the choice's own
    // edition's version of each option; no 2024-only option in a 2014 choice). Picks already made are added back;
    // one the edition rule leaves out is marked against the rules.
    const ed = choiceEdition(s.owner, s.root, ch, reg);
    const all = reg.find(s.rule.type, filter);
    const base = optionsFor(reg, s.rule.type, filter, ed, restrictedKey, () => {
      const inBooks = restricted.size ? all.filter((e) => !e.source || restricted.has(bookKey(e.source))) : all;
      const primary = primaryOptions(inBooks, []);
      return { kept: byEdition(primary, ed, []).options, primary: new Set(primary.map((e) => e.id)) };
    });
    let options = base.kept;
    const edition = { outOfEdition: new Set<string>() };
    if (s.chosen.some((id) => !base.keptIds.has(id))) {
      const extra = all.filter((e) => s.chosen.includes(e.id) && !base.keptIds.has(e.id));
      for (const e of extra) if (base.primary.has(e.id)) edition.outOfEdition.add(e.id);
      options = [...options, ...extra];
    }
    const ctx = makeCtx(then, thenSlot.ownerLevel, atLevel(ch, st.level), reg, then.stats);
    const blocked = new Set<string>(edition.outOfEdition);
    const why = new Map<string, string | (() => string)>([...edition.outOfEdition].map((id) => [id, "from the other edition's rules"]));
    const nowCtx = changeable ? makeCtx(final, s.ownerLevel, ch, reg, final.stats) : undefined;
    // Each option is judged as itself: "Draconic, unless you have Draconic" is not blocked by this pick of it.
    for (const e of options) {
      if (!e.requirements) continue;
      if (!meets(e.requirements, ctx.as?.(e.id) ?? ctx) && !(nowCtx && meets(e.requirements, nowCtx.as?.(e.id) ?? nowCtx))) { blocked.add(e.id); const c = ctx.as?.(e.id) ?? ctx; const req = e.requirements; why.set(e.id, () => explainUnmet(req, c, (x) => reg.get(x)?.name) ?? "requirements not met"); }
    }
    // A feat the character has from another choice or grant, at any level, is not offered again.
    // The same feat from the other provider counts as had too.
    // A feat the rules let a character take again (5e.tools "repeatable") stays open.
    if (s.rule.type === "Feat") for (const e of options) if ((final.ids.has(e.id) || hadAsTwin(e)) && !s.chosen.includes(e.id) && e.setters["allow duplicate"]?.value !== "true") { blocked.add(e.id); why.set(e.id, "you already have this feat"); }
    // Repeat copies (Aurora's Skilled and Skilled_2, its several Replicate Magic Item infusions, one name each): one
    // copy is offered at a time, the first the character can take and does not have; chosen ones stay.
    const byKey = new Map<string, typeof options>();
    for (const e of options) (byKey.get(twinKey(e)) ?? byKey.set(twinKey(e), []).get(twinKey(e))!).push(e);
    const dropped = new Set<string>();
    for (const group of byKey.values()) {
      if (group.length < 2) continue;
      const sameProvider = group.filter((e) => (e.origin === "5etools") === (group[0].origin === "5etools"));
      if (sameProvider.length < 2) continue;
      const free = sameProvider.filter((e) => !s.chosen.includes(e.id) && !final.ids.has(e.id) && !blocked.has(e.id));
      // The first free copy, while the choice has room for it: copies exist so an option can be taken again (an
      // Artificer learns Replicate Magic Item more than once in one choice). A copy already picked stays as well.
      const room = s.chosen.length < s.rule.number;
      const pickedHere = sameProvider.some((e) => s.chosen.includes(e.id));
      const keep = !pickedHere || room ? free[0] : undefined;
      for (const e of sameProvider) if (!s.chosen.includes(e.id) && e !== keep) dropped.add(e.id);
    }
    if (dropped.size) options = options.filter((e) => !dropped.has(e.id));
    const whyBlocked = (id: string) => { const w = why.get(id); return typeof w === "function" ? w() : w; };
    return { ...s, options, blocked, whyBlocked, filter };
  });

  const classLevels: Record<string, number> = {};
  for (const c of ch.classes) {
    const el = reg.get(c.classId);
    if (el) classLevels[lc(el.name)] = (classLevels[lc(el.name)] ?? 0) + c.level;
  }
  return { ...final, warnings: [...final.warnings, ...findings], character: ch, slots, totalLevel: total, classLevels, reg, timeline, findings };
}
