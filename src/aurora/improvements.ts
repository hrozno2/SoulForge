/**
 * Ability score increases as a grid (A1.9, Chris's Foundry screenshot): a row per ability, a column per increase (+2,
 * +1, +1...), one box per column, a different ability in each column. Every shape the content uses becomes one
 * grid model, so the interface needs one component:
 * - a choice whose options are single abilities (5e.tools' "+2 to one score" and "+1 to another score"; the sibling
 *   choices of one owner make one grid),
 * - a choice of packages ("+2 to one ability" / "+1 to two abilities" / a feat instead: the class improvements and the
 *   2024 Ability Score Improvement feat), a package that raises fixed abilities (Aurora's "+1, +1, +1"),
 * - a choice of sets ("Strength, Dexterity, Constitution": Aurora's 2024 backgrounds), each holding packages.
 * Nothing here changes the rules: the grid writes the same picks the lists would.
 */
import type { AElement, SelectRule } from "./types";
import { choiceKey, type Resolved } from "./engine";
import type { Character } from "./character";

export const ABILITY_ORDER = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;
export type Ability = (typeof ABILITY_ORDER)[number];

type Slot = Resolved["slots"][number];

/** One increase: its amount, how many abilities it raises, the choice holding the picks, and the option per ability. */
export interface GridColumn { amount: number; count: number; key: string; options: Map<Ability, string> }

/** One way to take the increase: a package (or the choice itself) and its columns; fixed increases are pre-ticked. */
export interface GridMode { label: string; optionId?: string; columns: GridColumn[]; fixed: { ability: Ability; amount: number }[] }

/** One set of abilities (a three-ability combination): the abilities it holds and its ways, for the boxes (C7.11). */
export interface SetWays { id: string; abilities: Set<Ability>; modeKey: string; modes: GridMode[] }

export interface Grid {
  /** The choice the grid stands for (the first of a sibling group). */
  anchor: Slot;
  /** Every choice the grid fills, so the list does not show them again. */
  keys: Set<string>;
  /** Choices of sets: the outer choice's key and its options (null when there is no set level). */
  sets?: { key: string; options: { id: string; label: string }[]; chosen?: string; each?: SetWays[] };
  /** The choice that picks a package (null when the grid's columns are the choices themselves). */
  modeKey?: string;
  modes: GridMode[];
  /** Options of the package choice that are not increases (a feat instead): shown as a switch to the plain list. */
  others: { id: string; label: string }[];
  /** The package or "other" option taken now. */
  chosenMode?: string;
}

const isAbility = (n: string): n is Ability => (ABILITY_ORDER as readonly string[]).includes(n);

/** The ability and amount an option raises, when that is all it does. */
export function singleIncrease(el: AElement | undefined): { ability: Ability; amount: number } | undefined {
  if (!el || el.rules.length !== 1) return undefined;
  const r = el.rules[0];
  if (r.kind !== "stat") return undefined;
  const ability = r.name.toLowerCase();
  const amount = Number(r.value);
  return isAbility(ability) && amount > 0 ? { ability, amount } : undefined;
}

/** A column from a choice whose every option raises one ability by the same amount. */
function columnOf(key: string, rule: SelectRule, options: AElement[]): GridColumn | undefined {
  const inc = options.map(singleIncrease);
  if (!options.length || inc.some((x) => !x)) return undefined;
  const amounts = new Set(inc.map((x) => x!.amount));
  if (amounts.size !== 1) return undefined;
  const map = new Map<Ability, string>();
  options.forEach((o, i) => { if (!map.has(inc[i]!.ability)) map.set(inc[i]!.ability, o.id); });
  return { amount: [...amounts][0], count: rule.number, key, options: map };
}

/** A package: an option whose rules are only increases (choices of single abilities, or fixed ones). */
function modeOf(r: Resolved, el: AElement): GridMode | undefined {
  const columns: GridColumn[] = [];
  const fixed: GridMode["fixed"] = [];
  for (let i = 0; i < el.rules.length; i++) {
    const rule = el.rules[i];
    if (rule.kind === "stat") {
      const a = rule.name.toLowerCase();
      if (!isAbility(a) || !(Number(rule.value) > 0)) return undefined;
      fixed.push({ ability: a, amount: Number(rule.value) });
    } else if (rule.kind === "select" && rule.type === "Ability Score Improvement") {
      const col = columnOf(choiceKey(el, rule, i), rule, r.reg.find(rule.type, rule.supports));
      if (!col) return undefined;
      columns.push(col);
    } else return undefined;
  }
  if (!columns.length && !fixed.length) return undefined;
  return { label: el.name, optionId: el.id, columns, fixed };
}

/** The sets level: an option with one choice whose options are packages (Aurora's ability combinations). */
function innerPackages(r: Resolved, el: AElement): { key: string; packages: AElement[] } | undefined {
  const sel = el.rules.map((rule, i) => ({ rule, i })).filter((x) => x.rule.kind === "select");
  if (sel.length !== 1 || el.rules.length !== 1) return undefined;
  const rule = sel[0].rule as SelectRule;
  const packages = r.reg.find(rule.type, rule.supports);
  // Packages, not single increases (a "+2 to one ability" option holds single +2s: that is a column, not a set).
  if (!packages.length || packages.some((p) => !modeOf(r, p) || singleIncrease(p))) return undefined;
  return { key: choiceKey(el, rule, sel[0].i), packages };
}

/**
 * The grids among a list's choices. A choice already declined (an optional one left out) or a list of text entries
 * is left to the plain list.
 */
export function findGrids(r: Resolved, slots: Slot[]): Grid[] {
  const out: Grid[] = [];
  const used = new Set<string>();
  // Sibling choices of single abilities under one owner: one grid.
  const groups = new Map<string, { slot: Slot; col: GridColumn }[]>();
  for (const s of slots) {
    if (s.declined || s.listItems) continue;
    const col = columnOf(s.key, s.rule, s.options);
    if (col) {
      const k = `${s.owner.id}|${s.root}|${s.ownerLevel ?? ""}`;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push({ slot: s, col });
      continue;
    }
    // Sets, each holding packages.
    const sets = s.options.map((o) => ({ o, inner: innerPackages(r, o) }));
    if (s.options.length && sets.every((x) => x.inner)) {
      const chosen = s.chosen[0];
      const cur = sets.find((x) => x.o.id === chosen);
      const modes = cur ? cur.inner!.packages.map((p) => modeOf(r, p)!) : [];
      const modeChosen = cur ? r.character.selections[cur.inner!.key]?.[0] : undefined;
      const keys = new Set([s.key, ...(cur ? [cur.inner!.key, ...modes.flatMap((m) => m.columns.map((c) => c.key))] : [])]);
      // Every set's abilities and ways, so the boxes can show every ability any set allows and settle the set from
      // the ticks (C7.11, Chris 2026-10-29: no list of combinations to pick from first).
      const each: SetWays[] = sets.map(({ o, inner }) => {
        const ms = inner!.packages.map((p) => modeOf(r, p)!);
        const abilities = new Set<Ability>(ms.flatMap((m) => [...m.columns.flatMap((c) => [...c.options.keys()]), ...m.fixed.map((f) => f.ability)]));
        return { id: o.id, abilities, modeKey: inner!.key, modes: ms };
      });
      out.push({ anchor: s, keys, sets: { key: s.key, options: s.options.map((o) => ({ id: o.id, label: o.name })), chosen, each }, modeKey: cur?.inner!.key, modes, others: [], chosenMode: modeChosen });
      keys.forEach((k) => used.add(k));
      continue;
    }
    // Packages (and options that are not, such as a feat instead).
    // A feat that also raises an ability (a half-feat: Crusher, Elven Accuracy) is a feat, not a way of taking the
    // increase; only the increase itself (the 2024 "Ability Score Improvement" feat, packages) is a mode.
    const modes = s.options.map((o) => ({ o, m: o.type === "Feat" && !/^ability score improvement/i.test(o.name) ? undefined : modeOf(r, o) }));
    if (modes.some((x) => x.m)) {
      const ms = modes.filter((x) => x.m).map((x) => x.m!);
      const keys = new Set([s.key, ...ms.flatMap((m) => m.columns.map((c) => c.key))]);
      out.push({ anchor: s, keys, modeKey: s.key, modes: ms, others: modes.filter((x) => !x.m).map((x) => ({ id: x.o.id, label: x.o.name })), chosenMode: s.chosen[0] });
      keys.forEach((k) => used.add(k));
    }
  }
  for (const list of groups.values()) {
    if (list.some((x) => used.has(x.slot.key))) continue;
    out.push({ anchor: list[0].slot, keys: new Set(list.map((x) => x.slot.key)), modes: [{ label: "", columns: list.map((x) => x.col), fixed: [] }], others: [] });
  }
  // A choice another grid already draws (the 2024 background's combination holds its +2/+1 choice) is not a grid of its
  // own as well: it showed twice (C6.1).
  return out.filter((g) => !out.some((o) => o !== g && o.keys.has(g.anchor.key)));
}

/** The abilities ticked in each column instance, read from the character's picks. */
export function gridPicks(ch: Character, mode: GridMode): (Ability | undefined)[][] {
  return mode.columns.map((c) => {
    const ids = ch.selections[c.key] ?? [];
    const byId = new Map([...c.options].map(([a, id]) => [id, a]));
    return Array.from({ length: c.count }, (_, i) => byId.get(ids[i]));
  });
}

/**
 * Ticks one box: column `col`, instance `n`, ability `a` (undefined unticks). An ability is in one column only, so it
 * leaves the others. Returns the new selections for the mode's columns.
 */
export function tickBox(ch: Character, mode: GridMode, col: number, n: number, a: Ability | undefined): Record<string, string[]> {
  const picks = gridPicks(ch, mode).map((p) => p.map((x) => (x === a ? undefined : x)));
  picks[col][n] = a;
  const out: Record<string, string[]> = {};
  mode.columns.forEach((c, i) => { out[c.key] = picks[i].filter((x): x is Ability => !!x).map((x) => c.options.get(x)!); });
  return out;
}

/**
 * One grid for the usual pair of ways (C6.2, Chris: "I can just pick my combination with the checkmarks"): "+2 to one
 * and +1 to another" or "+1 to three" (or "+2 to one" or "+1 to two"). A "+2" column, then as many "+1" columns as
 * either way has; the ticks decide the way: a "+2" ticked takes the way with +2, none the way of +1s.
 */
export interface Unified { modeKey: string; two: GridMode; one: GridMode; ones: number; onesWithTwo: number }

// A way's increases: its columns', or (a set of three that each get +1, no choice) its fixed ones.
const amounts = (m: GridMode) => [...m.columns.flatMap((c) => Array.from({ length: c.count }, () => c.amount)), ...m.fixed.map((f) => f.amount)];

export function unifiedOf(grid: Grid): Unified | undefined {
  if (!grid.modeKey || grid.modes.length !== 2) return undefined;
  const two = grid.modes.find((m) => !m.fixed.length && amounts(m).filter((a) => a === 2).length === 1 && amounts(m).every((a) => a === 1 || a === 2));
  // The other way: +1s to choose, or +1 to each of a fixed set (then ticking all of them takes it).
  const one = grid.modes.find((m) => m !== two && amounts(m).length > 0 && amounts(m).every((a) => a === 1) && (!m.fixed.length || !m.columns.length));
  if (!two || !one) return undefined;
  return { modeKey: grid.modeKey, two, one, ones: Math.max(amounts(one).length, amounts(two).length - 1), onesWithTwo: amounts(two).length - 1 };
}

/** What the unified grid shows: the +2 pick and the +1 picks, from the way taken now. */
export function unifiedPicks(ch: Character, u: Unified, chosenMode?: string): { two?: Ability; ones: (Ability | undefined)[] } {
  const mode = chosenMode === u.one.optionId ? u.one : chosenMode === u.two.optionId ? u.two : undefined;
  const ones: (Ability | undefined)[] = Array.from({ length: u.ones }, () => undefined);
  if (!mode) return { ones };
  const picks = gridPicks(ch, mode);
  let two: Ability | undefined;
  let i = 0;
  mode.columns.forEach((c, ci) => picks[ci].forEach((a) => { if (c.amount === 2) two = a; else ones[i++] = a; }));
  for (const f of mode.fixed) if (i < ones.length) ones[i++] = f.ability;
  return { two, ones };
}

/** The selections for the unified grid's ticks: the way they make, its columns filled, the other way's emptied. */
export function unifiedSelections(u: Unified, two: Ability | undefined, ones: (Ability | undefined)[]): Record<string, string[]> {
  // A fixed set's +1s are taken only when every one of them is ticked; anything less leaves the way open.
  const fixedSet = u.one.fixed.map((f) => f.ability);
  if (!two && fixedSet.length && !fixedSet.every((a) => ones.includes(a))) {
    const out: Record<string, string[]> = { [u.modeKey]: [] };
    for (const c of u.two.columns) out[c.key] = [];
    return out;
  }
  const target = two ? u.two : u.one;
  const out: Record<string, string[]> = { [u.modeKey]: [target.optionId!] };
  for (const c of [...u.two.columns, ...u.one.columns]) out[c.key] = [];
  const queue = ones.filter((a): a is Ability => !!a && a !== two);
  for (const c of target.columns) {
    const picks = c.amount === 2 ? (two ? [two] : []) : queue.splice(0, c.count);
    out[c.key] = picks.map((a) => c.options.get(a)).filter((x): x is string => !!x);
  }
  return out;
}

/**
 * The grid as Chris wants it (2026-10-28): only "+1" columns, as many as the way of +1s has; the same ability ticked in
 * two columns is the +2 ("if I want a plus two to one ability I just pick it twice"). The boxes, in column order.
 */
export function unifiedBoxes(ch: Character, u: Unified, chosenMode?: string): (Ability | undefined)[] {
  const p = unifiedPicks(ch, u, chosenMode);
  const boxes: (Ability | undefined)[] = Array.from({ length: u.ones }, () => undefined);
  const list = p.two ? [p.two, p.two, ...p.ones.filter(Boolean).slice(0, u.onesWithTwo)] : p.ones;
  list.forEach((a, i) => { if (i < boxes.length) boxes[i] = a; });
  return boxes;
}

/** The selections for the boxes: one ability in two boxes is the +2 way (the rest its +1s), else the +1 way. */
export function boxesSelections(u: Unified, boxes: (Ability | undefined)[]): Record<string, string[]> {
  const ticked = boxes.filter((a): a is Ability => !!a);
  const twice = ticked.find((a, i) => ticked.indexOf(a) !== i);
  if (twice) return unifiedSelections(u, twice, ticked.filter((a) => a !== twice));
  return unifiedSelections(u, undefined, ticked);
}

/** Ticks a box: an ability is in at most two boxes, and only one ability is doubled (that is the +2). */
export function tickUnified(boxes: (Ability | undefined)[], i: number, a: Ability | undefined, u: Unified): (Ability | undefined)[] {
  const next = [...boxes];
  next[i] = a;
  if (!a) return next;
  const count = (x: Ability) => next.filter((y) => y === x).length;
  // A third box of the same ability: the oldest other one goes.
  if (count(a) > 2) next[next.findIndex((x, j) => x === a && j !== i)] = undefined;
  // Two doubled abilities, or a +2 with more +1s than that way has: the other doubled one goes down to one box.
  const doubled = [...new Set(next.filter((x): x is Ability => !!x && count(x) === 2))];
  if (doubled.length > 1) { const other = doubled.find((x) => x !== a)!; next[next.findIndex((x, j) => x === other && j !== i)] = undefined; }
  const two = next.find((x) => !!x && count(x) === 2);
  if (two) {
    // The other +1s: the box just ticked stays, the oldest others go until the way's count is met.
    const others = next.map((x, j) => (x && x !== two ? j : -1)).filter((j) => j >= 0);
    let over = others.length - u.onesWithTwo;
    for (const j of others) { if (over <= 0) break; if (j !== i) { next[j] = undefined; over--; } }
  }
  return next;
}

/** The usual pair of ways for one set, as `unifiedOf` reads a grid. */
export const unifiedOfSet = (w: SetWays): Unified | undefined => unifiedOf({ anchor: undefined as never, keys: new Set(), modeKey: w.modeKey, modes: w.modes, others: [] });

/**
 * The set the ticked abilities belong to (C7.11): the one taken now when it holds them all, else the first that does;
 * none when no set allows that mix (the tick is refused).
 */
export function setForTicks(each: SetWays[], ticked: Ability[], current?: string): SetWays | undefined {
  const fits = (w: SetWays) => ticked.every((a) => w.abilities.has(a)) && !!unifiedOfSet(w);
  const cur = each.find((w) => w.id === current);
  return cur && fits(cur) ? cur : each.find(fits);
}

/**
 * The selections for boxes ticked across sets: the set that holds them, its old picks cleared when the set changes,
 * and the ticks as that set's way. Undefined when no set allows the ticks.
 */
export function setBoxesSelections(grid: Grid, boxes: (Ability | undefined)[]): Record<string, string[]> | undefined {
  const sets = grid.sets;
  if (!sets?.each) return undefined;
  const ticked = boxes.filter((a): a is Ability => !!a);
  const w = setForTicks(sets.each, ticked, sets.chosen);
  const u = w && unifiedOfSet(w);
  if (!w || !u) return undefined;
  const clear: Record<string, string[]> = {};
  for (const o of sets.each) if (o.id !== w.id) { clear[o.modeKey] = []; for (const m of o.modes) for (const c of m.columns) clear[c.key] = []; }
  return { ...clear, [sets.key]: ticked.length ? [w.id] : [], ...(ticked.length ? boxesSelections(u, boxes) : { [w.modeKey]: [] }) };
}
