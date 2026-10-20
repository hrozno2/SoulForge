/**
 * Checks a built character against the rules from an independent source, so the builder cannot pass its own
 * mistakes: the class tables (hit dice, saving throws, spell slots, cantrips, prepared spells, feat levels,
 * multiclass requirements, features by level) come from the 5e.tools class data (scripts/rules-cache.mjs), and the
 * rest (proficiency bonus, hit points, armor class, attack bonuses, armor and hands) are written out here from the
 * Player's Handbooks. Every finding names the rule it breaks.
 */
import { conceptOf } from "../engine/concepts";
import type { Resolved } from "./engine";
import { preparePool, type SheetData } from "./sheet";
import type { AElement } from "./types";
import type { AbilityId } from "./character";
import { meets } from "./requirements";
import { reqCtx, stillToChoose } from "./engine";
import { isModern } from "./edition";

export interface RefFeature { name: string; level: number; optional?: boolean; subclass?: boolean }
export interface RefClass {
  name: string;
  source: string;
  edition: "classic" | "one";
  hd: number;
  saves: AbilityId[];
  caster: string | null;
  cantrips: number[] | null;
  prepared: number[] | null;
  preparedFormula: string | null;
  known: number[] | null;
  slots: number[][] | null;
  pact: { slots: number[]; level: number[] } | null;
  features: RefFeature[];
  subclassLevel: number | null;
  /** What the class trains at first level (5e.tools startingProficiencies). */
  startArmor?: string[];
  startWeapons?: string[];
  startTools?: string[];
  asiLevels: number[];
  epicBoon: number | null;
  multiclass: Partial<Record<AbilityId, number>> | null;
  multiclassOr: Partial<Record<AbilityId, number>>[] | null;
  primaryAbility: AbilityId[][] | null;
  subclasses: { name: string; shortName: string; source: string; caster: string | null; features: RefFeature[] }[];
}

export interface Finding { rule: string; detail: string }

const lc = (s: string) => s.toLowerCase();
const norm = (s: string) => lc(s).replace(/^\s*level\s+\d+\s*:\s*/, "").replace(/\s*\(.*?\)\s*/g, " ").replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
const FULL = [[], [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]];
/** Eldritch Knight and Arcane Trickster slots by class level (their own table, not the full caster one). */
const THIRD: number[][] = [[], [], [], [2], [3], [3], [3], [4, 2], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3], [4, 3, 2], [4, 3, 2], [4, 3, 2], [4, 3, 3], [4, 3, 3], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 1]];
function edits(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const prof = (level: number) => 2 + Math.floor((Math.max(1, level) - 1) / 4);

/** Base armor from the equipment tables (2014 and 2024 agree). Dex cap: undefined = full, 0 = none. */
const ARMOR: [RegExp, number, number | undefined, number?][] = [
  [/^padded/i, 11, undefined], [/^leather/i, 11, undefined], [/^studded/i, 12, undefined],
  [/^hide/i, 12, 2], [/^chain shirt/i, 13, 2], [/^scale/i, 14, 2], [/^breastplate/i, 14, 2], [/^half.?plate/i, 15, 2],
  [/^ring/i, 14, 0], [/^chain mail/i, 16, 0, 13], [/^splint/i, 17, 0, 15], [/^plate/i, 18, 0, 15],
];

/** Which reference class a class element is: same name, same edition. */
export function refFor(ref: RefClass[], cls: AElement): RefClass | undefined {
  const name = cls.name.replace(/\s*\(.*\)$/, "");
  const same = ref.filter((c) => lc(c.name) === lc(name));
  return same.find((c) => (c.edition === "one") === isModern(cls)) ?? same[0];
}

export function checkCharacter(r: Resolved, sh: SheetData, ref: RefClass[]): Finding[] {
  const out: Finding[] = [];
  const add = (rule: string, detail: string) => out.push({ rule, detail });
  const ch = r.character;
  const reg = r.reg;
  const names = new Set(r.active.map((a) => norm(a.el.name)));
  // Content spells some names differently ("Persistant Rage"): a name one or two letters off still counts.
  // Channel Divinity options are named with or without the "Channel Divinity:" prefix. A subclass can replace a
  // feature with its own version ("Wild Shape Feature Replacement", "Animal and Nature Speaker"), which counts too.
  const cd = (x: string) => x.replace(/^channel divinity /, "");
  const short = new Set([...names].map(cd));
  // Features the content names differently from 5e.tools (the 2024 Light Domain's "Improved Flare").
  const ALIAS: Record<string, string> = { [norm("Improved Warding Flare")]: norm("Improved Flare") };
  const near = (want0: string) => {
    const want = ALIAS[cd(want0)] ?? cd(want0);
    if (short.has(want)) return true;
    if ([...short].some((n) => Math.abs(n.length - want.length) <= 2 && edits(n, want) <= 2)) return true;
    if (want.length >= 8 && [...short].some((n) => n.includes(want) || n === `${want} feature replacement`)) return true;
    return false;
  };
  const level = ch.classes.reduce((n, c) => n + c.level, 0);
  const score = (a: AbilityId) => sh.abilities.find((x) => x.id === a)!;
  const mod = (a: AbilityId) => score(a).mod;

  // Completeness: every choice the rules ask for is made, none is impossible, nothing points at missing content.
  for (const s of r.slots) {
    if (s.rule.optional) continue;
    if (!s.options.length) add("A required choice has no options", `${s.rule.name} [${s.rule.type}]`);
    else if (stillToChoose(s, r)) add("A required choice is not made", `${s.rule.name}: ${s.chosen.length} of ${s.rule.number}`);
    for (const id of s.chosen) if (s.blocked.has(id)) add("A choice does not meet its requirements", `${s.rule.name}: ${reg.get(id)?.name}`);
    // A skill, tool or language picked here that the character already has from elsewhere counts once: the pick
    // is wasted and the character ends up a proficiency short (issue #3: Perception from Skillful and the Ranger).
    // Only when something new was left to pick: a Fighter taking Weapon Master already has every weapon, so any pick repeats.
    const hasOther = s.options.some((o) => !s.chosen.includes(o.id) && !s.blocked.has(o.id) && !r.ids.has(o.id));
    if ((s.rule.type === "Proficiency" || s.rule.type === "Language") && hasOther) {
      for (const id of s.chosen) {
        const got = r.active.find((a) => a.el.id === id);
        if (got && got.from && got.from !== s.owner.id) add("A choice repeats something the character already has", `${s.rule.name}: ${reg.get(id)?.name} (already from ${reg.get(got.from)?.name ?? "another choice"}); choose another`);
      }
    }
  }
  for (const w of r.warnings) add("Content refers to something missing", w);
  const inLines = new Set(sh.casting.flatMap((l) => [...l.cantripsKnown, ...l.spells, ...l.granted].map((p) => p.id)));
  for (const p of r.spellPicks) if (!inLines.has(p.id)) add("A spell is not castable (no spellcasting line)", reg.get(p.id)?.name ?? p.id);

  // Proficiency bonus by total level.
  if (sh.proficiency !== prof(level)) add("Proficiency bonus by level", `${sh.proficiency}, should be ${prof(level)} at level ${level}`);

  const refs = ch.classes.map((c) => ({ c, el: reg.get(c.classId)!, ref: reg.get(c.classId) ? refFor(ref, reg.get(c.classId)!) : undefined }));
  for (const x of refs) if (!x.ref) add("Class not in the rules reference", x.el?.name ?? x.c.classId);

  // Hit dice and hit points (average rule): first level the full die, then half the die + 1, Constitution each level.
  const con = mod("constitution");
  let hp = 0;
  let n = 0;
  for (const x of refs) {
    const die = x.ref?.hd ?? 0;
    const hd = sh.hitDice.find((h) => h.classId === x.c.classId);
    if (x.ref && hd && (hd.die !== die || hd.count !== x.c.level)) add("Hit dice", `${x.el.name}: ${hd.count}d${hd.die}, should be ${x.c.level}d${die}`);
    for (let i = 0; i < x.c.level; i++) {
      n++;
      const roll = ch.hpMode === "roll" ? ch.hpRolls[String(n)] : undefined;
      hp += (n === 1 ? die : (roll ?? Math.floor(die / 2) + 1)) + con;
    }
  }
  // What features add (Tough, Dwarven Toughness, Draconic Resilience, a custom bonus) comes as named parts of the
  // stat; the hit dice and Constitution are the class table's. The sheet's number is exactly their sum.
  const hpParts = r.stats.parts("hp");
  const fromParts = hpParts.reduce((t, p) => t + p.value, 0);
  if (refs.every((x) => x.ref) && sh.hp !== hp + fromParts) add("Hit points", `${sh.hp}, the rules give ${hp + fromParts} (${hp} from hit dice and Constitution${hpParts.length ? ` + ${hpParts.map((p) => `${p.value} from ${p.from}`).join(" + ")}` : ""})`);

  // Saving throws: the first class gives two; multiclassing gives none. Features that add more are listed.
  const first = refs[0]?.ref;
  if (first) {
    // The first class gives its two saving throws (the class table). Any other proficiency comes from an element
    // the character has (a feat, a feature, the species), which provenance shows; one granted by a later class
    // itself is the multiclass mistake: a second class gives no saving throws.
    for (const a of sh.abilities) if (!a.saveProficient && first.saves.includes(a.id)) add("Missing saving throw proficiency", `${a.id} from ${first.name}`);
    const later = new Map<string, string>();
    for (const x of refs.slice(1)) { later.set(x.c.classId, x.el.name); if (x.el.multiclass?.id) later.set(x.el.multiclass.id, x.el.name); }
    for (const act of r.active) {
      const k = conceptOf(act.el);
      if (!k?.startsWith("save:") || !later.has(act.from)) continue;
      add("Saving throw proficiency without a rule giving it", `${act.el.name} from ${later.get(act.from)} (first class ${first.name} gives ${first.saves.join(" and ")}; a second class gives none)`);
    }
    // The first class's training (a multiclass gains less, so only the first class is checked): armor, weapon
    // categories and named tools, as the class table gives them.
    const tight = (x: string) => x.toLowerCase().replace(/[^a-z]/g, "");
    const own = (list: string[], want: string) => list.some((x) => tight(x).includes(tight(want)));
    const ARMOR_NAME: Record<string, string> = { light: "light armor", medium: "medium armor", heavy: "heavy armor", shield: "shield" };
    for (const a of first.startArmor ?? []) if (!own(sh.proficiencies.armor, ARMOR_NAME[a])) add("Missing class training", `${ARMOR_NAME[a]} from ${first.name}`);
    for (const w of first.startWeapons ?? []) if (!own(sh.proficiencies.weapons, `${w} weapons`)) add("Missing class training", `${w} weapons from ${first.name}`);
    for (const t of first.startTools ?? []) if (!own(sh.proficiencies.tools, t)) add("Missing class training", `${t} from ${first.name}`);
    {
    }
  }

  // Ability scores: no higher than 20 unless a feature or an item raises the limit.
  // A score above 20 needs a named part that raises the maximum (Primal Champion, an Epic Boon) or sets the score (a
  // Belt of Giant Strength); the stat book already stops increases at the maximum, so this catches a bypass.
  for (const a of sh.abilities) {
    const max = 20 + r.stats.parts(`${a.id}:max`).reduce((t, p) => t + p.value, 0);
    const set = r.stats.parts(`${a.id}:score:set`).reduce((t, p) => Math.max(t, p.value), 0);
    if (a.score > Math.max(max, set, ch.abilityBase[a.id])) add("Ability score above its maximum", `${a.id} ${a.score} (maximum ${max}${set ? `, set to ${set}` : ""})`);
  }
  for (const a of sh.abilities) if (a.score < 1) add("Ability score below 1", `${a.id} ${a.score}`);

  // Multiclass requirements: 13 in the abilities each class names (2014), or in its primary ability (2024).
  if (ch.classes.length > 1) {
    for (const x of refs) {
      const rf = x.ref;
      if (!rf) continue;
      let ok = true;
      let need = "";
      if (rf.primaryAbility) {
        ok = rf.primaryAbility.some((group) => group.every((a) => score(a).score >= 13));
        need = rf.primaryAbility.map((g) => g.join(" and ")).join(" or ") + " 13";
      } else {
        const all = Object.entries(rf.multiclass ?? {}) as [AbilityId, number][];
        const alt = rf.multiclassOr ?? [];
        // An "or" group in the 5e.tools data means any one of its abilities (Fighter: Strength 13 or Dexterity 13).
        ok = all.every(([a, v]) => score(a).score >= v) && (!alt.length || alt.every((o) => (Object.entries(o) as [AbilityId, number][]).some(([a, v]) => score(a).score >= v)));
        need = [...all.map(([a, v]) => `${a} ${v}`), ...alt.map((o) => Object.entries(o).map(([a, v]) => `${a} ${v}`).join(" or "))].join(", ");
      }
      if (!ok) add("Multiclass requirement not met", `${x.el.name} needs ${need}`);
    }
  }

  // Subclass: chosen at the level the class gets it, not before; one per class.
  for (const x of refs) {
    if (!x.ref?.subclassLevel) continue;
    const subs = r.active.filter((a) => a.el.type === "Archetype" && a.root === `class:${x.c.classId}`);
    if (x.c.level >= x.ref.subclassLevel && subs.length !== 1) add("Subclass", `${x.el.name} ${x.c.level} should have one subclass (from level ${x.ref.subclassLevel}), has ${subs.length}`);
    if (x.c.level < x.ref.subclassLevel && subs.length) add("Subclass taken too early", `${x.el.name} ${x.c.level}: ${subs.map((s) => s.el.name).join(", ")} (rules: level ${x.ref.subclassLevel})`);
  }

  // Class and subclass features by level, against the reference. Optional features (Tasha's) and the ones that
  // are only a heading for something else are not required.
  // "Extra Elemental Discipline" is one more discipline choice, which the completeness check above already covers.
  const skip = /^(ability score improvement|epic boon|subclass feature|extra elemental discipline|additional .*|.* options|optional rule.*|.* improvements|.* subclass|.* feature|.* improvement|proficiencies|.* versatility|primal knowledge|martial versatility|cantrip formulas|cantrip versatility|optional class features|.*\bdivine domain|.*\bsacred oath|.*\barcane tradition|.*\bdruid circle|.*\bmonastic tradition|.*\bmartial archetype|.*\branger archetype|.*\broguish archetype|.*\bsorcerous origin|.*\botherworldly patron|.*\bbard college|.*\bprimal path|.*\bartificer specialist)$/i;
  for (const x of refs) {
    if (!x.ref) continue;
    for (const f of x.ref.features) {
      if (f.level > x.c.level || f.optional || skip.test(f.name)) continue;
      if (!near(norm(f.name))) add("Class feature missing", `${x.el.name} ${f.level}: ${f.name}`);
    }
    const sub = r.active.find((a) => a.el.type === "Archetype" && a.root === `class:${x.c.classId}`)?.el;
    if (!sub) continue;
    // Whole words only: "Twilight Domain" must not match the "Light" domain.
    const word = (hay: string, needle: string) => new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(hay);
    const exact = x.ref.subclasses.filter((s) => [s.name, s.shortName].some((n) => norm(n) === norm(sub.name)));
    const subMatches = exact.length ? exact : x.ref.subclasses.filter((s) => [s.name, s.shortName].some((n) => word(norm(sub.name), norm(n)) || word(norm(n), norm(sub.name))));
    const subEd = isModern(sub) ? ["XPHB", "EFA"] : [];
    const refSub = subMatches.find((s) => subEd.length ? subEd.includes(s.source) : !["XPHB", "EFA"].includes(s.source)) ?? subMatches[0] ?? x.ref.subclasses.find((s) => [s.name, s.shortName].some((n) => norm(n) === norm(sub.name) || norm(sub.name).includes(norm(n)) || norm(n).includes(norm(sub.name))));
    if (!refSub) continue;
    for (const f of refSub.features) {
      if (f.level > x.c.level || f.optional || skip.test(f.name) || norm(f.name) === norm(refSub.name) || norm(f.name) === norm(refSub.shortName)) continue;
      if (!near(norm(f.name))) add("Subclass feature missing", `${sub.name} ${f.level}: ${f.name}`);
    }
  }

  // Feats from level choices: one at each Ability Score Improvement level the class has reached, and the Epic Boon.
  for (const x of refs) {
    if (!x.ref) continue;
    const want = x.ref.asiLevels.filter((l) => l <= x.c.level).length + (x.ref.epicBoon && x.c.level >= x.ref.epicBoon ? 1 : 0);
    const got = r.slots.filter((s) => s.root === `class:${x.c.classId}` && s.ownerLevel <= x.c.level && /ability score improvement|improvement option|epic boon|^feat \(/i.test(s.rule.name) && s.owner.type !== "Feat" && !/custom|\+[12]/i.test(s.rule.name)).length;
    if (want && got && got !== want) add("Feats or ability improvements by level", `${x.el.name} ${x.c.level}: ${got} choices, the rules give ${want}`);
  }

  // Feats: requirements met; 2024 General feats from level 4, Epic Boons from level 19; no feat twice unless repeatable.
  const ctx = reqCtx(r);
  const seenFeats = new Map<string, number>();
  for (const a of r.active.filter((x) => x.el.type === "Feat")) {
    seenFeats.set(a.el.name, (seenFeats.get(a.el.name) ?? 0) + 1);
    if (a.el.requirements && !meets(a.el.requirements, ctx)) add("Feat requirements not met", a.el.name);
    const tags = a.el.supports.map(lc);
    if (tags.includes("epic boon") && level < 19) add("Epic Boon before level 19", a.el.name);
    if (tags.includes("general") && level < 4 && !/race|background/.test(a.root)) add("General feat before level 4", a.el.name);
  }
  for (const [name, count] of seenFeats) if (count > 1 && !/repeatable|elemental adept|ability score improvement/i.test(name) && !r.reg.ofType("Feat").find((f) => f.name === name)?.setters["allow duplicate"]) add("Same feat twice", name);

  // Spellcasting: slots by the class tables or the multiclass table; cantrips and prepared spells by the class table;
  // spell levels within what the class can cast; DC and attack bonus by the formula.
  const casters = refs.filter((x) => x.ref && (x.ref.caster || x.ref.subclasses.some((s) => s.caster && r.active.some((a) => a.el.type === "Archetype" && norm(a.el.name).includes(norm(s.shortName))))));
  const casterLevel = (x: (typeof refs)[number]) => {
    const c = x.ref!.caster ?? x.ref!.subclasses.find((s) => s.caster && r.active.some((a) => a.el.type === "Archetype" && norm(a.el.name).includes(norm(s.shortName))))?.caster;
    const modern = x.ref!.edition === "one";
    if (c === "full") return x.c.level;
    if (c === "1/2") return modern ? Math.ceil(x.c.level / 2) : Math.floor(x.c.level / 2);
    if (c === "artificer") return Math.ceil(x.c.level / 2);
    if (c === "1/3") return Math.floor(x.c.level / 3);
    return 0;
  };
  const nonPact = casters.filter((x) => x.ref!.caster !== "pact");
  const slotRow = (row: number[]) => row.filter((v) => v > 0).join("/");
  const ours = (line: (typeof sh.casting)[number]) => slotRow(line.slots.map((s) => s.total));
  if (nonPact.length === 1) {
    const x = nonPact[0];
    const line = sh.casting.find((l) => norm(l.name).includes(norm(x.el.name)) || norm(x.el.name).includes(norm(l.name))) ?? sh.casting.find((l) => l.slots.length && !l.pactLevel);
    const want = x.ref!.slots ? slotRow(x.ref!.slots[x.c.level - 1] ?? []) : slotRow(THIRD[x.c.level] ?? []);
    if (line && want !== ours(line)) add("Spell slots", `${x.el.name} ${x.c.level}: ${ours(line) || "none"}, the class table gives ${want || "none"}`);
    if (!line && want) add("Spell slots", `${x.el.name} ${x.c.level} has no spellcasting line; the table gives ${want}`);
  } else if (nonPact.length > 1) {
    const mc = nonPact.reduce((t, x) => t + casterLevel(x), 0);
    const want = slotRow(FULL[Math.min(20, mc)] ?? []);
    for (const line of sh.casting.filter((l) => l.slots.length && !l.pactLevel)) if (ours(line) !== want) add("Multiclass spell slots", `${line.name}: ${ours(line)}, the multiclass table gives ${want} (caster level ${mc})`);
  }
  for (const x of casters.filter((y) => y.ref!.caster === "pact" && y.ref!.pact)) {
    const line = sh.casting.find((l) => l.pactLevel);
    const want = { n: x.ref!.pact!.slots[x.c.level - 1], lv: x.ref!.pact!.level[x.c.level - 1] };
    const got = line?.slots.find((s) => s.total > 0);
    if (!line || !got || got.total !== want.n || (line.pactLevel ?? got.level) !== want.lv) add("Pact Magic slots", `${x.el.name} ${x.c.level}: ${got ? `${got.total} at level ${line?.pactLevel ?? got.level}` : "none"}, the table gives ${want.n} at level ${want.lv}`);
  }
  for (const x of refs) {
    if (!x.ref?.cantrips) continue;
    const want = x.ref.cantrips[x.c.level - 1];
    const own = r.slots.filter((s) => s.root === `class:${x.c.classId}` && s.rule.type === "Spell" && /cantrip/i.test(s.rule.name) && (s.owner.id === x.c.classId || /spellcasting|pact magic/i.test(s.owner.name)));
    const got = own.reduce((t, s) => t + s.chosen.length, 0);
    if (own.length && got !== want) add("Cantrips known", `${x.el.name} ${x.c.level}: ${got}, the class table gives ${want}`);
  }
  for (const x of refs) {
    if (!x.ref) continue;
    const table = x.ref.prepared ?? x.ref.known;
    const line = sh.casting.find((l) => norm(l.name) === norm(x.el.name));
    if (!table || !line) continue;
    const want = table[x.c.level - 1];
    // Mystic Arcanum: one spell each of levels 6 to 9 at Warlock levels 11, 13, 15 and 17, outside the known spells.
    const arcanum = x.ref.pact ? [11, 13, 15, 17].filter((l) => x.c.level >= l).map((_, i) => i + 6) : [];
    const levelOf = (id: string) => Number(reg.get(id)?.setters.level?.value ?? 0);
    if (line.prepare) {
      if (line.prepareMax && line.prepareMax !== want && x.ref.prepared) add("Prepared spells", `${x.el.name} ${x.c.level}: may prepare ${line.prepareMax}, the class table gives ${want}`);
      // The list to prepare from must hold at least as many spells as may be prepared.
      const pool = preparePool(r, line).length;
      if (line.prepareMax && pool < line.prepareMax) add("Too few spells to prepare from", `${x.el.name} ${x.c.level}: ${pool} on the list, ${line.prepareMax} may be prepared`);
    } else {
      // Only the class's own spellcasting choices count; a subclass's extra spells (Magical Secrets) are on top.
      const own = r.slots.filter((s) => s.root === `class:${x.c.classId}` && s.rule.type === "Spell" && !/cantrip/i.test(s.rule.name) && /spellcasting|pact magic|^magical secrets$/i.test(s.owner.name.replace(/^level \d+: /i, "")) && !/arcanum/i.test(s.rule.name));
      // A cantrip taken with Magical Secrets still counts against the spells known.
      const got = own.reduce((t, s) => t + s.chosen.filter((id) => (levelOf(id) > 0 || /magical secrets/i.test(s.owner.name)) && !arcanum.includes(levelOf(id))).length, 0);
      if (own.length && got !== want) add("Spells known or prepared", `${x.el.name} ${x.c.level}: ${got}, the class table gives ${want}`);
    }
    const maxLv = x.ref.slots ? (x.ref.slots[x.c.level - 1] ?? []).filter((v) => v > 0).length : x.ref.pact ? x.ref.pact.level[x.c.level - 1] : 9;
    for (const p of line.spells) {
      const lv = levelOf(p.id);
      if (lv > maxLv && !arcanum.includes(lv)) add("Spell above the level the class can cast", `${x.el.name} ${x.c.level}: ${reg.get(p.id)?.name} (level ${lv}, max ${maxLv})`);
    }
  }
  for (const line of sh.casting) {
    const m = line.ability ? mod(line.ability as AbilityId) : NaN;
    if (Number.isFinite(m) && (line.dc !== 8 + sh.proficiency + m || line.attack !== sh.proficiency + m)) {
      // Magic items and features (Robe of the Archmagi, a +1 focus) can add to these.
      const items = ch.inventory.some((i) => i.attuned || /\+\d/.test(reg.get(i.id)?.name ?? ""));
      if (!items) add("Spell save DC or attack", `${line.name}: DC ${line.dc}, attack ${line.attack}; the formula gives DC ${8 + sh.proficiency + m}, attack ${sh.proficiency + m}`);
    }
  }

  // Armor class with the armor tables, Dexterity caps, shields and unarmored defenses.
  const worn = ch.inventory.filter((i) => i.equipped && i.id).map((i) => ({ i, el: reg.get(i.id)! })).filter((x) => x.el?.type === "Armor");
  const body = worn.find((x) => !/shield/i.test(x.el.name) && !/shield/i.test(x.el.setters.armor?.value ?? ""));
  const shield = worn.find((x) => /shield/i.test(x.el.name) || /shield/i.test(x.el.setters.armor?.value ?? ""));
  const dex = mod("dexterity");
  // Worn armor: its base and Dexterity cap from the armor table, not from the content. Everything else that changes
  // AC (an unarmored defense, natural armor, a shield, a fighting style, an item) is a named part of a stat; AC above
  // what the table gives, with no part explaining it, is the finding.
  const misc = [...r.stats.parts("ac:misc"), ...r.stats.parts("ac")];
  const shieldAc = shield ? 2 + (shield.i.magic ?? 0) : 0;
  const miscSum = misc.reduce((t, p) => t + p.value, 0);
  if (body) {
    const row = ARMOR.find(([re]) => re.test(body.el.name.replace(/^\+\d\s*/, "")));
    if (row) {
      const [, base, cap] = row;
      const dexPart = cap === undefined ? dex : cap === 0 ? 0 : Math.min(cap === 2 ? Math.max(2, r.stats.get("ac:armored:dexterity:cap")) : cap, dex);
      const want = base + dexPart + (body.i.magic ?? 0) + (Number(body.el.setters.armorClassBonus?.value) || 0) + r.stats.get("ac:armored:enhancement") + r.stats.get("ac:armored:misc") + shieldAc + miscSum;
      if (sh.ac.value !== want) add("Armor class", `${sh.ac.value}, the armor table gives ${want} (${body.el.name} ${base}, Dex ${dexPart}${shieldAc ? `, shield ${shieldAc}` : ""}${misc.map((p) => `, ${p.from} ${p.value}`).join("")})`);
    }
  } else {
    const calc = r.stats.parts("ac:calculation");
    const floor = 10 + dex + shieldAc + miscSum;
    const best = Math.max(10 + dex, r.stats.get("ac:calculation")) + shieldAc + miscSum;
    if (sh.ac.value < floor) add("Armor class", `${sh.ac.value}, below 10 + Dex${shieldAc ? " + shield" : ""} (${floor})`);
    else if (sh.ac.value > floor && !calc.length) add("Armor class", `${sh.ac.value} with no armor and nothing giving another calculation (10 + Dex gives ${floor})`);
    else if (sh.ac.value !== best) add("Armor class", `${sh.ac.value}, the parts give ${best} (${calc.map((p) => `${p.from} ${p.value}`).join(", ") || `10 + Dex ${10 + dex}`})`);
  }
  if (body) {
    const kind = lc(body.el.setters.armor?.value ?? "");
    const trained = sh.proficiencies.armor.join(" ").toLowerCase();
    if (kind && !/shield/.test(kind) && !trained.includes(kind) && !trained.includes("all armor")) add("Wearing armor without training", `${body.el.name} (${kind})`);
  }

  // Hands: a two-handed weapon and a shield, or more than two weapons, cannot be held at once.
  const weapons = ch.inventory.filter((i) => i.equipped && i.id && reg.get(i.id)?.type === "Weapon");
  const twoHanded = weapons.filter((i) => reg.get(i.id)!.supports.some((t) => /two.?handed/i.test(t)) || i.twoHanded);
  if ((twoHanded.length && shield) || twoHanded.length > 1 || weapons.length > 2 || (twoHanded.length && weapons.length > 1)) add("More held than two hands can hold", weapons.map((i) => reg.get(i.id)?.name).join(", ") + (shield ? ", shield" : ""));

  // Attacks from weapons: ability modifier, proficiency if trained, magic bonus.
  for (const a of sh.attacks.filter((x) => x.auto && x.elId)) {
    const el = reg.get(a.elId!)!;
    const it = ch.inventory.find((i) => i.uid === a.id);
    const tags = el.supports.map(lc);
    const ranged = tags.some((t) => t.includes("ranged"));
    const finesse = tags.some((t) => t.includes("finesse"));
    const m = finesse ? Math.max(dex, mod("strength")) : ranged ? dex : mod("strength");
    const proficient = !/not proficient/.test(a.notes);
    const magic = (it?.magic ?? 0) + (Number(el.setters.attackBonus?.value) || 0);
    // Fighting styles, features and items add to every attack of a kind: named parts of "ranged:attack",
    // "melee:attack" and "attack".
    const parts = [...r.stats.parts(`${ranged ? "ranged" : "melee"}:attack`), ...r.stats.parts("attack")];
    const want = m + (proficient ? sh.proficiency : 0) + magic + parts.reduce((t, p) => t + p.value, 0);
    if (a.bonus !== want && !(a.id && ch.attackEdits?.[a.id]?.bonusAdjust)) add("Weapon attack bonus", `${a.name}: +${a.bonus}, the rules give +${want}${parts.length ? ` (with ${parts.map((p) => `${p.from} ${p.value}`).join(", ")})` : ""}`);
  }
  return out;
}
