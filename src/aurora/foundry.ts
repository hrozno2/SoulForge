/**
 * Mechanics from 5e.tools' Foundry data (foundry-feats.json, foundry-races.json, foundry-items.json,
 * foundry-optionalfeatures.json, class/foundry.json: the files the Plutonium module reads). They state as data what
 * the 5e.tools entries say only in prose: Foundry "Active Effects" (a change to a path such as
 * system.attributes.ac.bonus, with a mode and a value formula) and "activities" (an attack, a save).
 *
 * Each entry is matched to the element the converter made for it, by the converter's own ids. Effects that are
 * always on (transfer) become stat and grant rules; effects applied when a feature is used (Rage) are not passive and
 * stay in the text; spells' effects apply when cast and are left out. Attack activities become attacks on the sheet,
 * save activities a DC with the feature. A rule is added only when the element (or the species it belongs to) does
 * not already set that statistic. Every path is either mapped here or listed as display in DISPLAY_PATHS, so a new
 * Foundry path shows up in the report instead of being dropped.
 */
import type { AElement, ARule } from "./types";

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ABIL: Record<string, string> = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" };
const SKILL: Record<string, string> = {
  acr: "acrobatics", ani: "animal handling", arc: "arcana", ath: "athletics", dec: "deception", his: "history", ins: "insight", itm: "intimidation",
  inv: "investigation", med: "medicine", nat: "nature", prc: "perception", prf: "performance", per: "persuasion", rel: "religion", slt: "sleight of hand",
  ste: "stealth", sur: "survival",
};
const SKILL_ABILITY: Record<string, string> = { acrobatics: "dex", "animal handling": "wis", arcana: "int", athletics: "str", deception: "cha", history: "int", insight: "wis", intimidation: "cha", investigation: "int", medicine: "wis", nature: "int", perception: "wis", performance: "cha", persuasion: "cha", religion: "int", "sleight of hand": "dex", stealth: "dex", survival: "wis" };
const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");

/** Paths that are not character mechanics this sheet keeps: rolls with advantage, light, item data, text. */
export const DISPLAY_PATHS: RegExp[] = [
  /\.roll\.mode$/, /^token\./, /^name$/, /^macro\./, /^flags\./, /^system\.description\./, /^system\.(properties|damage|range|type|attunement|magicalBonus|mastery|uses|activation|target|duration|weight|price|rarity|equipped|identified|quantity|armor|strength|stealth|attack|level|school|materials|components|preparation|source|hd|spellcasting|capacity|container|consume|recharge|formula|ability|actionType|chatFlavor|critical|save|summons|enchant|identifier|activities|crewed|cover)\b/,
  /^system\.attributes\.(hp\.tempmax|death|concentration|exhaustion|attunement\.max|encumbrance|ac\.(armor|min|flat|shield|cover))\b/,
  /^system\.traits\.(dm|da|dr\.bypasses|di\.bypasses|dr\.custom|di\.custom|ci\.custom|size|weaponProf\.mastery|languages\.custom|languages\.communication)\b/,
  /^system\.attributes\.movement\.(hover|units|ignoredDifficultTerrain|bonus|speed)$/, /^system\.details\./, /^system\.attributes\.(prof|bonus|hp\.max|init\.total)$/, /^system\.attributes\.senses\.(special|units)$/, /^system\.bonuses\.(heal|abilities\.skill)/, /^system\.scale\./, /^activities\[/,
];

export interface FoundryReport { applied: number; unmatched: string[]; unknownPaths: Map<string, number>; untranslatable: Map<string, number> }
export const lastFoundryReport: FoundryReport = { applied: 0, unmatched: [], unknownPaths: new Map(), untranslatable: new Map() };

/**
 * Scale values: Foundry's per-level numbers (Rages, Sneak Attack dice, Wild Shape CR, Known Forms), from the
 * "ScaleValue" advancements of classes, subclasses, features and species. A formula names one as
 * "@scale.<owner>.<identifier>" (".number", ".faces" for dice). Each becomes a formula on the owner's level that steps
 * at the levels the scale lists, so it needs no state: min(1, max(0, L - k + 1)) is 1 from level k on.
 */
export interface Scale { level: string; steps: { at: number; value: number; faces?: number }[]; type: string }
export const SCALES = new Map<string, Scale>();
const kebab = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function collectScales(files: [string, J][]): void {
  SCALES.clear();
  for (const [, json] of files) {
    for (const [kind, list] of Object.entries(json ?? {})) {
      if (!Array.isArray(list)) continue;
      for (const e of list as J[]) {
        const advs = ((e.advancement as J[]) ?? []).filter((a) => a?.type === "ScaleValue" && a.configuration?.scale);
        if (!advs.length) continue;
        // The owner's level: a class's own, a subclass's or feature's class, a species' character level.
        const cls = kind === "class" ? e.name : e.className;
        const level = kind === "race" || kind === "raceFeature" || !cls ? "{level}" : `{level:${String(cls).toLowerCase()}}`;
        const owner = kebab(kind === "race" ? String(e.name).replace(/^(.+?) \((.+)\)$/, "$1 $2") : e.name);
        for (const a of advs) {
          const id = a.configuration.identifier || kebab(a.title ?? "");
          const key = `${owner}.${id}`;
          if (SCALES.has(key)) continue;
          const steps = Object.entries(a.configuration.scale as J).map(([at, v]: [string, J]) => ({ at: Math.max(1, Number(at)), value: Number(v.value ?? v.number ?? v.n ?? 1), faces: v.faces ?? v.die }))
            .filter((x) => !Number.isNaN(x.at)).sort((x, y) => x.at - y.at);
          SCALES.set(key, { level, steps, type: String(a.configuration.type ?? "number") });
        }
      }
    }
  }
}

/** A scale as a formula on its owner's level; part "faces" gives a die's size. */
function scaleFormula(sc: Scale, part: "value" | "faces"): string | undefined {
  let prev = 0;
  const terms: string[] = [];
  for (const s of sc.steps) {
    const v = part === "faces" ? Number(s.faces) : s.value;
    if (Number.isNaN(v)) return undefined;
    if (v !== prev) terms.push(`(${v - prev}) * min(1, max(0, ${sc.level} - ${s.at - 1}))`);
    prev = v;
  }
  return terms.length ? `(${terms.join(" + ")})` : "0";
}

/** A Foundry formula as a stat formula ("2 * @details.level" to "2 * {level}"); undefined when it uses roll data this sheet does not keep. */
export function translateFormula(v: unknown): string | undefined {
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  let s = String(v ?? "").trim();
  if (!s) return undefined;
  let bad = false;
  s = s.replace(/@[\w.]+/g, (t) => {
    const m = t.slice(1);
    let x: RegExpExecArray | null;
    if ((x = /^abilities\.(\w+)\.mod$/.exec(m)) && ABIL[x[1]]) return `{${ABIL[x[1]]}:modifier}`;
    if ((x = /^abilities\.(\w+)\.value$/.exec(m)) && ABIL[x[1]]) return `{${ABIL[x[1]]}}`;
    if (m === "prof" || m === "attributes.prof") return "{proficiency}";
    if ((x = /^scale\.([\w-]+)\.([\w-]+)(?:\.(number|faces|value))?$/.exec(m))) {
      const sc = SCALES.get(`${x[1]}.${x[2]}`);
      // A die ("1d8") is no number; its count (".number") and size (".faces") are.
      const part = x[3] === "faces" ? "faces" : "value";
      const f = sc && (sc.type !== "dice" || x[3]) ? scaleFormula(sc, part) : undefined;
      if (f) return f;
    }
    if (m === "details.level") return "{level}";
    if ((x = /^classes\.([\w-]+)\.levels$/.exec(m))) return `{level:${x[1].replace(/-/g, " ")}}`;
    if (m === "attributes.movement.walk" || m === "attributes.movement.speed") return "{speed}";
    if ((x = /^attributes\.movement\.(fly|swim|climb|burrow)$/.exec(m))) return `{speed:${x[1]}}`;
    bad = true;
    return "0";
  });
  if (bad) return undefined;
  if (/^-?\d+(\.\d+)?$/.test(s)) return s;
  return /^[\d\s+\-*/().{}:a-z,]+$/i.test(s) ? s : undefined;
}

/** Foundry's recovery periods, as the sheet words them. */
const RECOVERY: Record<string, string> = { lr: "Long Rest", sr: "Short Rest", day: "Long Rest", dawn: "Long Rest" };

const stat = (name: string, value: string, bonus?: string): ARule => ({ kind: "stat", name, value, ...(bonus ? { bonus } : {}) });

/** One effect change as rules; "display" for a path this sheet does not keep; undefined for one not understood. */
function changeRules(key: string, mode: string, value: unknown, out: AElement[]): ARule[] | "display" | undefined {
  if (DISPLAY_PATHS.some((re) => re.test(key))) return "display";
  const v = () => translateFormula(value);
  const add = mode === "ADD" || mode === "2" || mode === "DND5E.BONUS";
  const set = mode === "OVERRIDE" || mode === "UPGRADE" || mode === "5" || mode === "4";
  let m: RegExpExecArray | null;
  const val = v();
  // Newer dnd5e paths for the same things: damage bonuses, sense ranges, tool proficiency.
  if ((m = /^system\.rolls\.damage\.(mwak|rwak|msak|rsak)\.bonus$/.exec(key))) return changeRules(`system.bonuses.${m[1]}.damage`, mode, value, out);
  if ((m = /^system\.attributes\.senses\.ranges\.(\w+)$/.exec(key))) return changeRules(`system.attributes.senses.${m[1]}`, mode, value, out);
  if ((m = /^system\.tools\.(\w+)(?:\.value)?$/.exec(key))) {
    const TOOL: Record<string, string> = { mason: "mason's tools", brewer: "brewer's supplies", smith: "smith's tools", thief: "thieves' tools", herb: "herbalism kit", alchemist: "alchemist's supplies", carpenter: "carpenter's tools", cook: "cook's utensils", tinker: "tinker's tools", disg: "disguise kit", forg: "forgery kit", pois: "poisoner's kit", navg: "navigator's tools" };
    const t = TOOL[m[1]];
    return t && Number(value) > 0 ? [{ kind: "grant", type: "Proficiency", id: `ID_5ET_TOOL_${slug(t)}` }] : "display";
  }
  if (mode === "MULTIPLY" || mode === "1" || mode === "DOWNGRADE" || mode === "3" || mode === "CUSTOM" || mode === "0") return "display"; // halving, capping: not passive bonuses
  if (key === "system.attributes.ac.bonus" && val) return [stat("ac:misc", val)];
  if (key === "system.attributes.ac.calc") {
    const f = String(value);
    const formula = f === "unarmoredMonk" ? "10 + {dexterity:modifier} + {wisdom:modifier}" : f === "unarmoredBarb" ? "10 + {dexterity:modifier} + {constitution:modifier}" : f === "draconic" ? "13 + {dexterity:modifier}" : f === "mage" ? "13 + {dexterity:modifier}" : undefined;
    return formula ? [stat("ac:calculation", formula, "calculation")] : "display"; // "custom" comes with system.attributes.ac.formula
  }
  if (key === "system.attributes.ac.formula" && val) return [stat("ac:calculation", val, "calculation")];
  if ((m = /^system\.attributes\.movement\.(walk|fly|swim|climb|burrow)$/.exec(key)) && val) {
    const mode1 = m[1];
    if (add) return [stat(mode1 === "walk" ? "innate speed:misc" : `innate speed:${mode1}:misc`, val)];
    if (set) return [stat(mode1 === "walk" ? "innate speed" : `innate speed:${mode1}`, val, `speed ${mode1}`)];
  }
  if (key === "system.attributes.init.bonus" && val) return [stat("initiative", val)];
  if (key === "flags.dnd5e.initiativeAlert") return "display";
  if (key === "system.attributes.hp.bonuses.overall" && val) return [stat("hp", val)];
  if (key === "system.attributes.hp.bonuses.level" && val) return [stat("hp", `({level}) * (${val})`)];
  if ((m = /^system\.attributes\.senses\.(darkvision|blindsight|tremorsense|truesight)$/.exec(key)) && val) {
    const range = Number(val) || 0;
    const rules: ARule[] = [stat(`${m[1]}:range`, val, `${m[1]} range`)];
    if (range) {
      const vid = `ID_5ET_SENSE_${slug(m[1])}_${range}`;
      if (!out.some((o) => o.id === vid)) out.push({ id: vid, name: `${m[1].charAt(0).toUpperCase()}${m[1].slice(1)} (${range} ft.)`, type: "Vision", source: "5etools", supports: [], description: "", compendiumHidden: true, setters: {}, rules: [], origin: "5etools" });
      rules.push({ kind: "grant", type: "Vision", id: vid });
    }
    return rules;
  }
  if ((m = /^system\.abilities\.(\w+)\.(value|max)$/.exec(key)) && ABIL[m[1]] && val) {
    if (m[2] === "max") return [stat(`${ABIL[m[1]]}:max`, val)];
    return add ? [stat(ABIL[m[1]], val)] : [stat(`${ABIL[m[1]]}:score:set`, val)];
  }
  if ((m = /^system\.abilities\.(\w+)\.bonuses\.(save|check)$/.exec(key)) && ABIL[m[1]] && val) {
    if (m[2] === "save") return [stat(`${ABIL[m[1]]}:save:misc`, val)];
    return Object.entries(SKILL_ABILITY).filter(([, a]) => a === m![1]).map(([sk]) => stat(`${sk}:misc`, val));
  }
  if ((m = /^system\.abilities\.(\w+)\.proficient$/.exec(key)) && ABIL[m[1]]) return Number(value) > 0 ? [{ kind: "grant", type: "Proficiency", id: `ID_5ET_SAVE_${slug(ABIL[m[1]])}` }] : "display";
  if (key === "system.bonuses.abilities.save" && val) return Object.values(ABIL).map((a) => stat(`${a}:save:misc`, val));
  if (key === "system.bonuses.abilities.check" && val) return [...Object.keys(SKILL_ABILITY).map((sk) => stat(`${sk}:misc`, val)), stat("initiative", val)];
  if ((m = /^system\.skills\.(\w+)\.value$/.exec(key)) && SKILL[m[1]]) {
    const n = Number(value);
    if (n >= 2) return [{ kind: "grant", type: "Proficiency", id: `ID_5ET_EXPERTISE_${slug(SKILL[m[1]])}` }];
    if (n >= 1) return [{ kind: "grant", type: "Proficiency", id: `ID_5ET_SKILL_${slug(SKILL[m[1]])}` }];
    return "display";
  }
  if ((m = /^system\.skills\.(\w+)\.bonuses\.(check|passive)$/.exec(key)) && SKILL[m[1]] && val) return [stat(m[2] === "passive" ? `${SKILL[m[1]]}:passive` : `${SKILL[m[1]]}:misc`, val)];
  if ((m = /^system\.bonuses\.(mwak|rwak|msak|rsak)\.(attack|damage)$/.exec(key)) && val) {
    if (m[1] === "rsak") return "display"; // the same bonus as msak: one spell attack line
    return [stat(m[1] === "mwak" ? `melee:${m[2]}` : m[1] === "rwak" ? `ranged:${m[2]}` : `spellcasting:${m[2]}`, val)];
  }
  if (key === "system.bonuses.spell.dc" && val) return [stat("spellcasting:dc", val)];
  if (key === "attributes.senses.darkvision") return changeRules("system.attributes.senses.darkvision", mode, value, out);
  if (key === "system.attributes.movement.multiplier") return "display";
  if ((m = /^system\.traits\.(dr|di|dv|ci)$/.exec(key))) return changeRules(`system.traits.${m[1]}.value`, mode, (value as J)?.value ?? value, out);
  if ((m = /^system\.traits\.(dr|di|dv|ci)\.value$/.exec(key))) {
    const kind = { dr: "DAMAGE_RESISTANCE", di: "DAMAGE_IMMUNITY", dv: "DAMAGE_VULNERABILITY", ci: "CONDITION_IMMUNITY" }[m[1]]!;
    const list = (Array.isArray(value) ? value : String(value).split(/[,;]/)).map((x) => String(x).trim()).filter(Boolean);
    return list.map((t) => ({ kind: "grant", type: "Condition", id: `ID_INTERNAL_CONDITION_${kind}_${slug(t)}` }) as ARule);
  }
  if (key === "system.traits.languages.value") {
    const list = (Array.isArray(value) ? value : String(value).split(/[,;]/)).map((x) => String(x).trim()).filter(Boolean);
    return list.map((l) => ({ kind: "grant", type: "Language", id: `ID_5ET_LANGUAGE_${slug(l)}` }) as ARule);
  }
  if ((m = /^system\.traits\.(armorProf|weaponProf)\.value$/.exec(key))) {
    const list = (Array.isArray(value) ? value : String(value).split(/[,;]/)).map((x) => String(x).trim()).filter(Boolean);
    const ids = list.map((x) => ({ lgt: "ID_5ET_PROF_ARMOR_LIGHT", med: "ID_5ET_PROF_ARMOR_MEDIUM", hvy: "ID_5ET_PROF_ARMOR_HEAVY", shl: "ID_5ET_PROF_ARMOR_SHIELD", sim: "ID_5ET_PROF_WEAPON_SIMPLE", mar: "ID_5ET_PROF_WEAPON_MARTIAL" })[x]).filter(Boolean) as string[];
    return ids.length ? ids.map((id) => ({ kind: "grant", type: "Proficiency", id }) as ARule) : "display";
  }
  return undefined;
}

/** The element ids a Foundry entry describes, by the converter's own id rules (ftId). */
function targetIds(kind: string, e: J, ftId: (k: string, n: string, s: string, x?: string) => string): string[] {
  switch (kind) {
    case "feat": return [ftId("FEAT", e.name, e.source)];
    // "Dragonborn (Black)" is a version of the Dragonborn, under its own id.
    case "race": { const v = /^(.+?) \((.+)\)$/.exec(e.name); return v ? [ftId("RACEVERSION", `${v[1]} ${v[2]}`, e.source), ftId("RACEVERSION", `${v[1]} ${e.name}`, e.source), ftId("SUBRACE", `${v[1]} ${v[2]}`, e.source), ftId("SUBRACE", `${v[2]} ${v[1]}`, e.source), ftId("RACE", e.name, e.source)] : [ftId("RACE", e.name, e.source)]; }
    case "raceFeature": return e.raceName ? [`${ftId("RACE", e.raceName, e.raceSource ?? e.source)}_T_${slug(e.name)}`] : [];
    case "classFeature": return [ftId("CF", `${e.className} ${e.name}`, e.source, String(e.level))];
    // The converter adds the feature's header number to its level ("3" and header 1 give "_31").
    case "subclassFeature": return ["", "1", "2", "3", "4"].map((h) => ftId("SF", `${e.subclassShortName} ${e.name}`, e.source, `${e.level}${h}`));
    case "optionalfeature": return [ftId("OPT", e.name, e.source)];
    case "item": case "baseitem": return [ftId("ITEM", e.name, e.source)];
    default: return [];
  }
}

/** Stats an element (and, for a species trait, its species) already sets: Foundry adds only what is missing. */
function setBy(el: AElement, byId: Map<string, AElement>): Set<string> {
  const names = new Set(el.rules.filter((r) => r.kind === "stat").map((r) => (r as { name: string }).name.toLowerCase()));
  const parent = /_T_/.test(el.id) ? byId.get(el.id.replace(/_T_.*$/, "")) : undefined;
  for (const r of parent?.rules ?? []) if (r.kind === "stat") names.add(r.name.toLowerCase());
  return names;
}

/**
 * Applies the Foundry files (path to parsed JSON) to the converted elements. `ftId` is the converter's id function.
 * Returns the report (also kept in lastFoundryReport for the tests).
 */
export function applyFoundry(files: [string, J][], out: AElement[], ftId: (k: string, n: string, s: string, x?: string) => string): FoundryReport {
  const report: FoundryReport = { applied: 0, unmatched: [], unknownPaths: new Map(), untranslatable: new Map() };
  collectScales(files);
  const byId = new Map(out.map((e) => [e.id, e]));
  // Each class keeps its own scales (Known Forms, Wild Shape CR) for the engine's passes to read.
  for (const [, json] of files) for (const c of ((json?.class as J[]) ?? [])) {
    const el = byId.get(ftId("CLASS", c.name, c.source));
    if (!el) continue;
    for (const [key, sc] of SCALES) if (key.startsWith(`${kebab(c.name)}.`) && sc.level === `{level:${c.name.toLowerCase()}}`) (el.scales ??= {})[key.slice(kebab(c.name).length + 1)] = sc.steps.map((x) => ({ at: x.at, value: x.value }));
  }
  for (const [, json] of files) {
    for (const [kind, list] of Object.entries(json ?? {})) {
      if (!Array.isArray(list) || kind === "spell" || kind === "class" || kind === "subclass" || kind === "action") continue;
      for (const e of list as J[]) {
        const ids = targetIds(kind, e, ftId);
        let targets = ids.flatMap((id) => [...out.filter((o) => o.id === id || o.id.startsWith(`${id}_`) && /_\d+$/.test(o.id))]);
        // A generic magic variant ("Flame Tongue"): every item built from it.
        if (kind === "magicvariant") targets = out.filter((o) => o.supports.includes(`5et variant ${String(e.name).toLowerCase()}|${String(e.source ?? "").toLowerCase()}`));
        // A species trait: the trait of that name within the species, as Plutonium finds it. "Goblin (Zendikar; Grotag
        // Tribe)" is tried whole, then as "Goblin (Zendikar)", then as the base "Goblin", always in the trait's book.
        if (!targets.length && kind === "raceFeature" && e.raceName) {
          const m = /^(.+?) \((.+)\)$/.exec(String(e.raceName));
          const parts = m ? m[2].split(";").map((x) => x.trim()) : [];
          const tries = m ? [[m[1], ...parts], [m[1], parts[0]], [m[1]]] : [[String(e.raceName)]];
          const book = slug(String(e.raceSource ?? e.source));
          for (const words of tries) {
            const keys = words.map(slug);
            targets = out.filter((o) => o.id.endsWith(`_T_${slug(e.name)}`) && o.id.includes(`_${book}_`) && keys.every((k) => o.id.includes(k)));
            if (targets.length) break;
          }
          // A subrace from another book ("Dragonborn (Draconblood; Black)", EGW) keeps its species' own trait, which
          // that species' entry already gives: nothing left to apply.
          if (!targets.length && m && out.some((o) => o.id.endsWith(`_T_${slug(e.name)}`) && o.id.includes(`_${slug(m[1])}_`))) continue;
        }
        if (!targets.length) { if (ids.length || kind === "magicvariant") report.unmatched.push(`${kind} ${e.name} (${e.source})`); continue; }
        for (const el of targets) {
          const already = setBy(el, byId);
          const added: ARule[] = [];
          for (const eff of (e.effects as J[]) ?? []) {
            if (eff.transfer === false || eff.disabled) continue; // applied when used, not always on
            for (const c of (eff.changes as J[]) ?? []) {
              const key = String(c.key ?? "");
              const r = changeRules(key, String(c.mode ?? "ADD"), c.value, out);
              if (r === "display") continue;
              if (!r) {
                const known = /^system\./.test(key) || /^flags\./.test(key);
                const map = translateFormula(c.value) === undefined && known ? report.untranslatable : report.unknownPaths;
                map.set(key, (map.get(key) ?? 0) + 1);
                continue;
              }
              for (const rule of r) if (rule.kind !== "stat" || !already.has(rule.name.toLowerCase())) added.push(rule);
            }
          }
          // Activities: an attack becomes an attack line on the sheet; a save, a DC shown with the feature.
          const attacks: NonNullable<AElement["attacks"]> = [];
          for (const a of (e.activities as J[]) ?? []) {
            if (a.type === "attack" && kind !== "item" && kind !== "magicvariant" && kind !== "baseitem") {
              const part = ((a.damage?.parts as J[]) ?? [])[0];
              if (!part?.denomination) continue;
              attacks.push({ name: a.name || e.name, die: `${part.number ?? 1}d${part.denomination}`, damageType: ((part.types as string[]) ?? [])[0] ?? "", ability: a.attack?.ability ? String(a.attack.ability) : "", ranged: a.attack?.type?.value === "ranged" });
            }
            if (a.type === "save") {
              const abil = String(a.save?.dc?.calculation ?? "");
              const featureStat = `${e.name.toLowerCase().replace(/\s*\(.*\)\s*$/, "")}:dc`;
              if (ABIL[abil] && !already.has(featureStat)) added.push(stat(featureStat, `8 + {proficiency} + {${ABIL[abil]}:modifier}`, "foundry dc"));
            }
          }
          if (attacks.length) el.attacks = [...(el.attacks ?? []), ...attacks];
          // Limited uses ("@prof" a long rest): the feature's usage line, when its own text gives none.
          // Foundry writes system data nested ({uses: {max}}) or flat ({"uses.max"}).
          const sys = (e.system ?? {}) as J;
          const max = translateFormula(sys["uses.max"] ?? sys.uses?.max);
          const period = RECOVERY[String((((sys["uses.recovery"] ?? sys.uses?.recovery) as J[]) ?? [])[0]?.period ?? "")];
          let usage = false;
          if (max && max !== "0" && period && !el.sheet?.usage && !el.sheet?.descriptions?.some((d) => d.usage)) {
            const name = `${el.name.toLowerCase()}:uses`;
            // A bonus group: two elements of the same name (a species and its version) count once.
            if (!already.has(name)) added.push(stat(name, max, "foundry uses"));
            el.sheet = { ...(el.sheet ?? { display: true, descriptions: [] }), usage: `{{${name}}}/${period}` };
            usage = true;
          }
          if (added.length || attacks.length || usage) { el.rules = [...el.rules, ...added]; report.applied++; }
        }
      }
    }
  }
  Object.assign(lastFoundryReport, report);
  return report;
}
