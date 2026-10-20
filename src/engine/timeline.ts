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
import { meets } from "../aurora/requirements";
import { totalLevel, type Character } from "../aurora/character";
import type { ARegistry } from "../aurora/registry";
import { replaceable } from "./replace";
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
    let options = reg.find(s.rule.type, filter);
    if (restricted.size) options = options.filter((e) => !e.source || restricted.has(bookKey(e.source)) || s.chosen.includes(e.id));
    const ctx = makeCtx(then, thenSlot.ownerLevel, atLevel(ch, st.level), reg, then.stats);
    const blocked = new Set<string>();
    const nowCtx = changeable ? makeCtx(final, s.ownerLevel, ch, reg, final.stats) : undefined;
    for (const e of options) if (!meets(e.requirements, ctx) && !(nowCtx && meets(e.requirements, nowCtx))) blocked.add(e.id);
    // A feat the character has from another choice or grant, at any level, is not offered again.
    if (s.rule.type === "Feat") for (const e of options) if (final.ids.has(e.id) && !s.chosen.includes(e.id)) blocked.add(e.id);
    return { ...s, options, blocked, filter };
  });

  const classLevels: Record<string, number> = {};
  for (const c of ch.classes) {
    const el = reg.get(c.classId);
    if (el) classLevels[lc(el.name)] = (classLevels[lc(el.name)] ?? 0) + c.level;
  }
  return { ...final, warnings: [...final.warnings, ...findings], character: ch, slots, totalLevel: total, classLevels, reg, timeline, findings };
}
