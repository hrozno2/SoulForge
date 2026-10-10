import {
  ABILITIES,
  SKILLS,
  type Ability,
  type Character,
  type Element,
  type PendingChoice,
  type Rule,
  type Sheet,
  type Spellcasting,
} from "./types";
import { evaluate } from "./formula";
import type { Registry } from "./registry";

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
export const POINT_BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUY_BUDGET = 27;

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

export function pointBuySpent(scores: Record<Ability, number>): number {
  return ABILITIES.reduce((sum, a) => sum + (POINT_BUY_COST[scores[a]] ?? 99), 0);
}

/** Slots per spell level (index 0 = level 1) by effective caster level, from the standard multiclass table. */
const FULL_SLOTS: number[][] = [
  [], [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];
/** Warlock-style pact magic: [slots, slot level] by class level. */
const PACT: [number, number][] = [
  [0, 0], [1, 1], [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4], [2, 4], [2, 5], [2, 5],
  [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 5], [4, 5], [4, 5], [4, 5],
];

export function spellSlots(caster: "full" | "half" | "third" | "pact", level: number): { slots: number[]; pactLevel?: number } {
  const lvl = Math.min(20, Math.max(1, level));
  if (caster === "pact") {
    const [n, sl] = PACT[lvl];
    return { slots: n ? Array.from({ length: sl }, (_, i) => (i === sl - 1 ? n : 0)) : [], pactLevel: n ? sl : undefined };
  }
  // Half and third casters start casting at level 1 (2024 paladin and ranger) and 3.
  const eff = caster === "full" ? lvl : caster === "half" ? Math.ceil(lvl / 2) : lvl < 3 ? 0 : Math.ceil(lvl / 3);
  return { slots: FULL_SLOTS[eff] ?? [] };
}

export function newCharacter(): Character {
  return {
    name: "",
    level: 1,
    abilityBase: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
    extras: [],
    choices: {},
  };
}

/** Walk the elements a character has, following grants and chosen elements. */
function collectElements(ch: Character, reg: Registry, warnings: string[], level: number): Element[] {
  const out: Element[] = [];
  const seen = new Set<string>();

  const visit = (id: string | undefined): void => {
    if (!id || seen.has(id)) return;
    const el = reg.get(id);
    if (!el) {
      warnings.push(`Missing element "${id}"`);
      return;
    }
    seen.add(id);
    out.push(el);
    for (const rule of el.rules ?? []) {
      if ((rule.minLevel ?? 1) > level) continue;
      if (rule.kind === "grant") rule.ids.forEach(visit);
      if (rule.kind === "choose" && rule.as === "element") {
        (ch.choices[rule.id] ?? []).filter((p) => rule.options.includes(p)).forEach(visit);
      }
    }
  };

  visit(ch.species);
  visit(ch.class);
  visit(ch.background);
  ch.extras.forEach(visit);
  return out;
}

export function computeSheet(ch: Character, reg: Registry): Sheet {
  const warnings: string[] = [];
  const level = Math.min(20, Math.max(1, ch.level));
  const elements = collectElements(ch, reg, warnings, level);
  const rules: { rule: Rule; from: Element }[] = elements.flatMap((el) =>
    (el.rules ?? []).filter((r) => (r.minLevel ?? 1) <= level).map((rule) => ({ rule, from: el })),
  );
  const prof = proficiencyBonus(level);
  const pending: PendingChoice[] = [];

  // Proficiencies: explicit rules plus picks from choose rules.
  const profLevels = new Map<string, "proficient" | "expertise">();
  const grantProf = (target: string, lvl: "proficient" | "expertise" = "proficient") => {
    if (profLevels.get(target) === "expertise") return;
    profLevels.set(target, lvl);
  };

  for (const { rule } of rules) {
    if (rule.kind === "proficiency") grantProf(rule.target, rule.level);
    if (rule.kind === "choose") {
      const picks = (ch.choices[rule.id] ?? []).filter((p) => rule.options.includes(p));
      const count = rule.count ?? 1;
      if (rule.as !== "element") picks.slice(0, count).forEach((p) => grantProf(`${rule.as}:${p}`));
      if (picks.length < count) {
        pending.push({
          id: rule.id,
          label: rule.label,
          as: rule.as,
          options: rule.options,
          count,
          picked: picks.length,
        });
      }
    }
  }

  // Ability scores: base, then 2024 background increase, then stat rules.
  const scores = { ...ch.abilityBase };
  const asiRule = rules.find((r) => r.rule.kind === "asi")?.rule;
  if (asiRule && asiRule.kind === "asi") {
    const choice = ch.backgroundAsi;
    if (!choice) {
      pending.push({
        id: "background-asi",
        label: "Background ability score increase",
        as: "element",
        options: asiRule.options,
        count: 1,
        picked: 0,
      });
    } else if (choice.mode === "included") {
      // Imported scores already contain the increase.
    } else if (choice.mode === "1/1/1") {
      asiRule.options.forEach((a) => (scores[a] += 1));
    } else if (
      asiRule.options.includes(choice.plus2) &&
      asiRule.options.includes(choice.plus1) &&
      choice.plus2 !== choice.plus1
    ) {
      scores[choice.plus2] += 2;
      scores[choice.plus1] += 1;
    } else {
      warnings.push("Background ability increase does not match the background's options");
    }
  }

  const statRules = rules.filter((r) => r.rule.kind === "stat") as {
    rule: Extract<Rule, { kind: "stat" }>;
    from: Element;
  }[];

  const applyStat = (stat: string, base: number, ctx: Record<string, number>): number => {
    const mine = statRules.filter((r) => r.rule.stat === stat).map((r) => r.rule);
    let value = base;
    const calc = (r: (typeof mine)[number]): number | undefined => {
      try {
        return evaluate(r.value, ctx);
      } catch (e) {
        warnings.push(`Formula error on ${stat}: ${(e as Error).message}`);
        return undefined;
      }
    };
    for (const op of ["set", "max", "min", "add"] as const) {
      for (const r of mine.filter((m) => (m.op ?? "add") === op)) {
        const v = calc(r);
        if (v === undefined) continue;
        if (op === "set") value = v;
        else if (op === "max") value = Math.max(value, v);
        else if (op === "min") value = Math.min(value, v);
        else value += v;
      }
    }
    return value;
  };

  // Ability stat rules may only use level and prof, so they resolve first.
  const earlyCtx: Record<string, number> = { level, prof };
  for (const a of ABILITIES) scores[a] = applyStat(a, scores[a], earlyCtx);

  const ctx: Record<string, number> = { level, prof };
  const abilities = {} as Sheet["abilities"];
  for (const a of ABILITIES) {
    const mod = abilityMod(scores[a]);
    abilities[a] = { score: scores[a], mod };
    ctx[a] = scores[a];
    ctx[`${a}Mod`] = mod;
  }

  const saves = {} as Sheet["saves"];
  for (const a of ABILITIES) {
    const lvl = profLevels.get(`save:${a}`);
    const proficient = !!lvl;
    saves[a] = {
      proficient,
      bonus: applyStat(`save.${a}`, abilities[a].mod + (lvl === "expertise" ? prof * 2 : proficient ? prof : 0), ctx),
    };
  }

  const skills: Sheet["skills"] = {};
  for (const [skill, ability] of Object.entries(SKILLS)) {
    const lvl = profLevels.get(`skill:${skill}`);
    const mult = lvl === "expertise" ? 2 : lvl ? 1 : 0;
    skills[skill] = {
      level: lvl ?? "none",
      bonus: applyStat(`skill.${skill}`, abilities[ability].mod + prof * mult, ctx),
    };
  }

  const classEl = ch.class ? reg.get(ch.class) : undefined;
  const die = classEl?.hitDie ?? 0;
  const conMod = abilities.con.mod;
  const baseHp = die ? die + conMod + (level - 1) * (Math.floor(die / 2) + 1 + conMod) : 0;
  const hp = Math.max(die ? 1 : 0, applyStat("hp", baseHp, ctx));

  const ac = applyStat("ac", 10 + abilities.dex.mod, ctx);
  const speed = applyStat("speed", 30, ctx);
  const initiative = applyStat("initiative", abilities.dex.mod, ctx);
  const passivePerception = applyStat("passivePerception", 10 + skills.perception.bonus, ctx);

  let spellcasting: Spellcasting | undefined;
  const sc = rules.find((r) => r.rule.kind === "spellcasting")?.rule;
  if (sc && sc.kind === "spellcasting") {
    const mod = abilities[sc.ability].mod;
    spellcasting = {
      ability: sc.ability,
      saveDC: applyStat("spell.dc", 8 + prof + mod, ctx),
      attackBonus: applyStat("spell.attack", prof + mod, ctx),
      ...spellSlots(sc.caster, level),
    };
  }

  // Any custom stat keys that homebrew invented, so they show up too.
  const known = new Set<string>([
    ...ABILITIES,
    "hp",
    "ac",
    "speed",
    "initiative",
    "passivePerception",
    "spell.dc",
    "spell.attack",
    ...ABILITIES.map((a) => `save.${a}`),
    ...Object.keys(SKILLS).map((s) => `skill.${s}`),
  ]);
  const stats: Record<string, number> = {};
  for (const key of new Set(statRules.map((r) => r.rule.stat))) {
    // Keys with a colon are internal to imported content, so they are not shown.
    if (!known.has(key) && !key.includes(":")) stats[key] = applyStat(key, 0, ctx);
  }

  return {
    abilities,
    proficiencyBonus: prof,
    saves,
    skills,
    hp,
    ac,
    speed,
    initiative,
    passivePerception,
    proficiencies: [...profLevels.keys()].sort(),
    elements,
    spellcasting,
    stats,
    pending,
    warnings,
  };
}
