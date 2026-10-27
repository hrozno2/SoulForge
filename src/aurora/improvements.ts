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

export interface Grid {
  /** The choice the grid stands for (the first of a sibling group). */
  anchor: Slot;
  /** Every choice the grid fills, so the list does not show them again. */
  keys: Set<string>;
  /** Choices of sets: the outer choice's key and its options (null when there is no set level). */
  sets?: { key: string; options: { id: string; label: string }[]; chosen?: string };
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
      out.push({ anchor: s, keys, sets: { key: s.key, options: s.options.map((o) => ({ id: o.id, label: o.name })), chosen }, modeKey: cur?.inner!.key, modes, others: [], chosenMode: modeChosen });
      keys.forEach((k) => used.add(k));
      continue;
    }
    // Packages (and options that are not, such as a feat instead).
    const modes = s.options.map((o) => ({ o, m: modeOf(r, o) }));
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
  return out;
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
