/**
 * Class skill lists checked against 5e.tools (A1.7). Aurora tags each skill with the classes that may choose it
 * ("Skill,PHB24 Fighter"); a tag left off drops the skill from that class's list (the 2024 Fighter has no Insight in
 * AuroraLegacy, though the Player's Handbook gives it). For every Aurora class with a twin in 5e.tools (same name and
 * edition), the skills 5e.tools offers that Aurora's list lacks get the class's tag. Skills only Aurora offers stay.
 */
import type { AElement } from "../aurora/types";
import { isModern } from "../aurora/edition";
import { matchesSupports, type ARegistry } from "../aurora/registry";
import { newCharacter } from "../aurora/character";
import { resolve } from "../aurora/engine";
import { conceptOf } from "./concepts";

/** Adds the missing tags; returns what was added ("Fighter (2024): Insight"), for the tests and the log. */
export function alignClassSkills(byId: Map<string, AElement>): string[] {
  const skills = [...byId.values()].filter((e) => e.type === "Proficiency" && e.origin !== "5etools" && e.supports.some((s) => s.trim() === "Skill"));
  const skillByName = new Map(skills.map((e) => [e.name.toLowerCase(), e]));
  const twins = new Map<string, AElement>();
  for (const el of byId.values()) if (el.type === "Class" && el.origin === "5etools") twins.set(`${el.name.toLowerCase()}|${isModern(el)}`, el);
  const added: string[] = [];
  for (const cls of byId.values()) {
    if (cls.type !== "Class" || cls.origin === "5etools") continue;
    const twin = twins.get(`${cls.name.toLowerCase()}|${isModern(cls)}`);
    const theirs = twin?.rules.find((r) => r.kind === "select" && r.type === "Proficiency" && /ID_5ET_SKILL_/.test(r.supports));
    if (!twin || theirs?.kind !== "select") continue;
    const want = theirs.supports.split("|").map((id) => byId.get(id.trim())?.name.toLowerCase()).filter((n): n is string => !!n);
    for (const r of cls.rules) {
      if (r.kind !== "select" || r.type !== "Proficiency") continue;
      const parts = r.supports.split(",").map((s) => s.trim());
      const tags = parts.filter((p) => p !== "Skill");
      if (!parts.includes("Skill") || tags.length !== 1 || r.number !== theirs.number) continue;
      const have = new Set(skills.filter((s) => matchesSupports(s, r.supports)).map((s) => s.name.toLowerCase()));
      for (const name of want) {
        const el = skillByName.get(name);
        if (have.has(name) || !el) continue;
        el.supports = [...el.supports, tags[0]];
        added.push(`${cls.name}${isModern(cls) ? " (2024)" : ""}: ${el.name}`);
      }
    }
  }
  return added;
}

/**
 * The standing check behind that fix: every Aurora class with a 5e.tools twin, at level 1, against its twin, by
 * concept (save:str, armor:light, weapon:martial, skill:insight, tool:...). What each grants outright and what its
 * skill choice offers must agree; a difference is a gap in one provider's content. The loader gate fails on any
 * difference that is neither fixed nor listed in CLASS_PROFICIENCY_ACCEPTED.
 */
/**
 * Differences that are not mistakes: 5e.tools counts the setting books' light martial weapons (the hooked shortspear,
 * the hoopak) under the 2024 Monk's and Rogue's "martial weapons that have the Light property", Aurora lists the core
 * ones; and the 2017 playtest Artificer differs between providers (docs/UA-UNSUPPORTED.md UA4).
 */
export const CLASS_PROFICIENCY_ACCEPTED: RegExp[] = [
  /^(Monk|Rogue) \(2024\) .*: 5e\.tools grants weapon:(hooked-shortspear|hoopak), Aurora does not$/,
  /^Artificer \[Unearthed Arcana: Artificer\]: /,
];

export function classProficiencyDiffs(reg: ARegistry): string[] {
  const out: string[] = [];
  const twins = new Map<string, AElement>();
  for (const el of reg.ofType("Class")) if (el.origin === "5etools") twins.set(`${el.name.toLowerCase()}|${isModern(el)}`, el);
  const view = (id: string) => {
    const ch = newCharacter();
    ch.classes = [{ classId: id, level: 1 }];
    const r = resolve(ch, reg);
    const KIND = /^(save|armor|weapon|skill|tool):/;
    // What the class grants itself: not the single weapons and armors Aurora's "simple weapons" grants in turn.
    const byCategory = (a: (typeof r.active)[number]) => !!a.from && r.reg.get(a.from)?.type === "Proficiency";
    const granted = new Set(r.active.filter((a) => !byCategory(a)).map((a) => conceptOf(a.el)).filter((c): c is string => !!c && KIND.test(c)));
    const choice = r.slots.find((s) => s.root.startsWith("class:") && s.rule.type === "Proficiency" && s.options.some((o) => conceptOf(o)?.startsWith("skill:")));
    const offers = new Set((choice?.options ?? []).map((o) => conceptOf(o)).filter((c): c is string => !!c?.startsWith("skill:")));
    return { granted, number: choice?.rule.number ?? 0, offers };
  };
  const diff = (a: Set<string>, b: Set<string>) => [...a].filter((x) => !b.has(x)).sort();
  for (const cls of reg.ofType("Class")) {
    if (cls.origin === "5etools" || cls.compendiumHidden || cls.comingSoon) continue;
    const twin = twins.get(`${cls.name.toLowerCase()}|${isModern(cls)}`);
    if (!twin) continue;
    const a = view(cls.id), f = view(twin.id);
    const label = `${cls.name}${isModern(cls) ? " (2024)" : ""} [${cls.source}]`;
    for (const x of diff(f.granted, a.granted)) out.push(`${label}: 5e.tools grants ${x}, Aurora does not`);
    for (const x of diff(a.granted, f.granted)) out.push(`${label}: Aurora grants ${x}, 5e.tools does not`);
    if (a.number !== f.number) out.push(`${label}: chooses ${a.number} skills in Aurora, ${f.number} in 5e.tools`);
    for (const x of diff(f.offers, a.offers)) out.push(`${label}: 5e.tools offers ${x}, Aurora does not`);
    for (const x of diff(a.offers, f.offers)) out.push(`${label}: Aurora offers ${x}, 5e.tools does not`);
  }
  return out;
}
