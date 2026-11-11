/**
 * Mechanics read from a feature's own text, for 5e.tools entries that have no Foundry side data for them (the way
 * Plutonium fills the gap; see docs/PLUTONIUM.md). Uses: "a number of times equal to your Wisdom modifier (minimum
 * of once)", "... equal to twice your proficiency bonus", "you can use this feature twice", with the rest that brings
 * them back ("when you finish a Short or Long Rest"). A feature that names a rest but no count has one use. The result
 * is the feature's usage line, "{{name:uses}}/Long Rest", as the Foundry pass and Aurora's content write it.
 */
import type { AElement, ARule } from "./types";

const COUNT: Record<string, number> = { once: 1, twice: 2, thrice: 3, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const ABILITY = "strength|dexterity|constitution|intelligence|wisdom|charisma";
const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const count = (w?: string) => (w ? COUNT[w.toLowerCase().replace(/ times$/, "")] ?? (Number(w.replace(/ times$/, "")) || 1) : 1);

/** How many uses the text gives, as a stat formula; undefined when it names none. */
export function usesFromText(text: string): string | undefined {
  let m = new RegExp(`a number of times equal to (?:(twice|three times) )?your (${ABILITY}) modifier(?: \\(minimum of (once|one|twice|two|\\d+)\\))?`, "i").exec(text);
  if (m) {
    const mod = `{${m[2].toLowerCase()}:modifier}${m[1] ? ` * ${count(m[1])}` : ""}`;
    return `max(${m[3] ? count(m[3]) : 1}, ${mod})`;
  }
  m = /a number of times equal to (?:(twice|three times) )?your proficiency bonus/i.exec(text);
  if (m) return `{proficiency}${m[1] ? ` * ${count(m[1])}` : ""}`;
  m = /[Yy]ou can use (?:this feature|this ability|this trait|(?:[A-Z][\w'’-]* ?)+) (once|twice|thrice|(?:two|three|four|five|\d+) times)\b/.exec(text);
  if (m) return String(count(m[1]));
  // A pool sized by a class level: "equal to your paladin level × 5" (2014), "five times your Paladin level" (2024).
  m = /equal to (?:your )?(\w+) level (?:×|x|\*|times) (\d+|five|ten)\b/i.exec(text);
  if (m) return `{level:${m[1].toLowerCase()}} * ${count(m[2])}`;
  m = /\b(\d+|two|three|four|five|ten) times your (\w+) level\b/i.exec(text);
  if (m) return `{level:${m[2].toLowerCase()}} * ${count(m[1])}`;
  return undefined;
}

/**
 * A pool the text sizes elsewhere (spell slots from the class table, points from a table column), not a feature used
 * once: "regain all expended spell slots", "regain all expended sorcery points", "a pool of healing power".
 */
const POOL = /regain(?:s)? all (?:of (?:your|the) )?(?:your )?expended (?!uses?\b)[\w'’ ]*?(?:slots?|points?|dice|die)\b|\bpool of\b/i;

/**
 * Takes back the single use `applyTextUses` gives by default where the text describes a pool and nothing sized it
 * (the class table's column, a count in the text): Spellcasting was "1 use a long rest" on the sheet, because its text
 * says spell slots return on a long rest. Run after the class tables are read. Returns how many it took back.
 */
export function dropPoolDefaults(out: AElement[]): number {
  let n = 0;
  for (const el of out) {
    if (el.origin !== "5etools") continue;
    const name = `${el.name.toLowerCase()}:uses`;
    const mine = el.rules.filter((r) => r.kind === "stat" && r.name.toLowerCase() === name);
    if (mine.length !== 1 || (mine[0] as { bonus?: string; value: string }).bonus !== "text uses" || (mine[0] as { value: string }).value !== "1") continue;
    const text = plain(el.description ?? "");
    if (!POOL.test(text) || usesFromText(text)) continue;
    el.rules = el.rules.filter((r) => r !== mine[0]);
    if (el.sheet?.usage?.startsWith(`{{${name}}}`)) { const { usage: _gone, ...rest } = el.sheet; void _gone; el.sheet = rest as typeof el.sheet; }
    n++;
  }
  return n;
}

/** The rest that brings uses back, as the sheet words it; undefined when the text names none. */
export function recoveryFromText(text: string): string | undefined {
  if (/regain (?:one|two|three|\w+) expended uses? when you finish a short rest,? and (?:you )?regain all expended uses when you finish a long rest/i.test(text)) return "Long Rest (one on a Short Rest)";
  if (/when(?:ever)? you finish a short rest, .* can't do so again until you finish a long rest/i.test(text)) return "Long Rest";
  // "Once per day when you finish a short rest, you can..." (Arcane Recovery): the short rest is when it is used.
  if (/\bonce per day\b/i.test(text)) return "Long Rest";
  // "Whenever you finish a Short Rest, ..." describes something else happening on a rest, not the uses coming back.
  if (/(?<!whenever you )(?:finish|complete) a short (?:or long )?rest(?! the \w+ resets)/i.test(text)) return "Short Rest";
  if (/(?<!whenever you )(?:finish|complete) a long rest(?! the \w+ resets)/i.test(text)) return "Long Rest";
  if (/\bat dawn\b|\beach day at dawn\b/i.test(text)) return "Dawn";
  return undefined;
}

const RESERVED = new RegExp(`^(spellcasting|${ABILITY}|proficiency|level|ac|hp|speed|initiative)$`, "i");
const USES_TYPES = new Set(["Class Feature", "Archetype Feature", "Racial Trait", "Feat", "Feat Feature", "Background Feature", "Optional Feature", "Class Feature Option"]);

/** Gives each 5e.tools feature without a usage line the one its text states. Returns how many it gave. */
export function applyTextUses(out: AElement[]): number {
  let n = 0;
  for (const el of out) {
    if (el.origin !== "5etools" || !USES_TYPES.has(el.type)) continue;
    if (el.sheet?.usage || el.sheet?.descriptions?.some((d) => d.usage)) continue;
    const text = plain(el.description ?? "");
    const rest = recoveryFromText(text);
    if (!rest) continue;
    const max = usesFromText(text) ?? "1";
    const name = `${el.name.toLowerCase()}:uses`;
    if (el.rules.some((r) => r.kind === "stat" && r.name.toLowerCase() === name)) continue;
    el.rules = [...el.rules, { kind: "stat", name, value: max, bonus: "text uses" } as ARule];
    el.sheet = { ...(el.sheet ?? { display: true, descriptions: [] }), usage: `{{${name}}}/${rest}` };
    n++;
  }
  return n;
}

/**
 * The save DC a feature's text states as a formula: "a Dexterity saving throw (DC 8 plus your Constitution modifier
 * and Proficiency Bonus)" (2024) or "the DC for this saving throw equals 8 + your Constitution modifier + your
 * proficiency bonus" (2014). Undefined when it states none ("against your spell save DC" is the class's own DC,
 * which the sheet already shows).
 */
export function dcFromText(text: string): string | undefined {
  const m = new RegExp(`DC (?:8 plus|equals 8 plus|equals 8 \\+|= 8 \\+|is 8 \\+|is 8 plus|of 8 \\+) your (?:(${ABILITY}) modifier (?:and|\\+) (?:your )?proficiency bonus|proficiency bonus \\+ your (${ABILITY}) modifier)`, "i").exec(text);
  const ability = m?.[1] ?? m?.[2];
  return ability ? `8 + {proficiency} + {${ability.toLowerCase()}:modifier}` : undefined;
}

/** Gives each 5e.tools feature without a DC the one its text states ("<feature>:dc", shown with the feature). */
export function applyTextDc(out: AElement[]): number {
  let n = 0;
  for (const el of out) {
    if (el.origin !== "5etools" || !USES_TYPES.has(el.type)) continue;
    const owner = el.name.toLowerCase().replace(/\s*\(.*\)\s*$/, "");
    // A name the engine already uses for its own statistic ("spellcasting:dc" adds to every spell DC) is not a
    // feature's own DC.
    if (RESERVED.test(owner)) continue;
    const name = `${owner}:dc`;
    if (el.rules.some((r) => r.kind === "stat" && r.name.toLowerCase().endsWith(":dc"))) continue;
    const dc = dcFromText(plain(el.description ?? ""));
    if (!dc) continue;
    el.rules = [...el.rules, { kind: "stat", name, value: dc, bonus: "text dc" } as ARule];
    n++;
  }
  return n;
}

const DAMAGE_TYPES = "acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder";
const ABBR: Record<string, string> = { strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha" };

/**
 * An attack a feature's text gives (as Plutonium reads one when the side data has none): a natural weapon used for
 * unarmed strikes ("your claws... when you hit with them, the strike deals 1d6 + your Strength modifier slashing
 * damage") or a spell attack of the feature's own ("make a ranged spell attack... 1d10 force damage"). Undefined when
 * the text states no die and damage type for one.
 */
export function attackFromText(name: string, text: string): NonNullable<AElement["attacks"]>[number] | undefined {
  const natural = /\b(?:unarmed strikes?|natural weapons?)\b/i.test(text);
  const spell = /\bmake an? (melee|ranged) spell attack\b/i.exec(text);
  if (!natural && !spell) return undefined;
  const abil = Object.keys(ABBR).join("|");
  // "1d6 + your Strength modifier slashing damage" (2024, MPMM), or "slashing damage equal to 1d4 + your Strength
  // modifier" (2014), read into the same order: die, ability, type.
  const older = new RegExp(`\\b(${DAMAGE_TYPES}) damage equal to (\\d+d\\d+|\\d+) \\+ your (${abil}) modifier`, "i").exec(text);
  const dmg = older ? [older[0], older[2], older[3], older[1]] : new RegExp(`\\b(\\d+d\\d+|\\d+)(?: \\+ your (${abil}) modifier)? (${DAMAGE_TYPES}) damage`, "i").exec(text);
  if (!dmg) return undefined;
  // Text with several damage rolls (a choice of options, Animal Enhancement) does not say which one is the attack.
  const rolls = new Set([...text.matchAll(new RegExp(`\\b\\d+d\\d+\\b[^.]{0,40}?\\b(?:${DAMAGE_TYPES})\\b|\\b(?:${DAMAGE_TYPES}) damage equal to \\d+d\\d+`, "gi"))].map((m) => m[0].toLowerCase()));
  if (rolls.size > 1) return undefined;
  // A natural weapon states the strike's own damage: with an ability modifier, or in place of an unarmed strike's
  // usual damage. Extra damage on a hit (Radiant Strikes) or a save effect (Quivering Palm) is not an attack.
  if (!spell && !dmg[2] && !/instead of the bludgeoning damage normal for an unarmed strike/i.test(text)) return undefined;
  const die = dmg[1];
  if (spell) return { name, die, damageType: dmg[3].toLowerCase(), ability: "spellcasting", ranged: spell[1].toLowerCase() === "ranged" };
  return { name, die, damageType: dmg[3].toLowerCase(), ability: dmg[2] ? ABBR[dmg[2].toLowerCase()] : "", ranged: false };
}

/** Gives each 5e.tools feature without an attack the one its text states. Returns how many it gave. */
export function applyTextAttacks(out: AElement[]): number {
  let n = 0;
  for (const el of out) {
    if (el.origin !== "5etools" || !USES_TYPES.has(el.type) || el.attacks?.length) continue;
    const a = attackFromText(el.name.replace(/\s*\(.*\)\s*$/, ""), plain(el.description ?? ""));
    if (!a) continue;
    el.attacks = [a];
    n++;
  }
  return n;
}

const ABILITIES = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
const SKILLS_OF: Record<string, string[]> = {
  strength: ["athletics"],
  dexterity: ["acrobatics", "sleight of hand", "stealth"],
  constitution: [],
  intelligence: ["arcana", "history", "investigation", "nature", "religion"],
  wisdom: ["animal handling", "insight", "medicine", "perception", "survival"],
  charisma: ["deception", "intimidation", "performance", "persuasion"],
};
const SPEEDS = ["climb", "fly", "swim", "burrow"];
const skillId = (s: string, kind: "5ET" | "AURORA") => (kind === "5ET" ? `ID_5ET_SKILL_${s.toUpperCase().replace(/ /g, "_")}` : `ID_PROFICIENCY_SKILL_${s.toUpperCase().replace(/ /g, "")}`);
const stat = (name: string, value: string, extra: Partial<ARule> = {}) => ({ kind: "stat", name, value, ...extra }) as ARule;
/** Sentences without the opening that only says when a feature arrives ("When you join the College at 3rd level, ..."). */
const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).map((s) => s.replace(/^(?:when you (?:join|choose|adopt|select|reach)\b[^,]*,|(?:at|by|beginning at|starting at|starting when you\b[^,]*at) \d+\w* level,)\s*/i, ""));
/** A sentence that only holds some of the time ("when you rage, your speed increases") is not a passive statistic. */
const CONDITIONAL = /\b(when|whenever|until|if|for \d+|for the duration|as a(?:n)? (?:bonus )?action|until)\b/i;

/** Half proficiency on the checks that lack it: Jack of All Trades (any check), Remarkable Athlete (three abilities). */
export function halfProficiencyFromText(text: string): ARule[] {
  const m = /half your proficiency bonus(?:,? \(?round(?:ed)? (down|up)\)?)?,? to any ((?:strength|dexterity|constitution|intelligence|wisdom|charisma)(?:,? (?:or )?(?:strength|dexterity|constitution|intelligence|wisdom|charisma))*)? ?(?:ability )?check/i.exec(text);
  if (!m) return [];
  const value = m[1]?.toLowerCase() === "up" ? "proficiency:half:up" : "proficiency:half";
  const named = (m[2] ?? "").toLowerCase().match(new RegExp(ABILITY, "g"));
  const skills = (named ?? ABILITIES).flatMap((a) => SKILLS_OF[a]);
  const out = skills.map((s) => stat(`${s}:misc`, value, { requirements: `!${skillId(s, "5ET")},!${skillId(s, "AURORA")}` }));
  // The 2014 wording is any ability check, and initiative is one; the 2024 wording is checks that use a skill.
  if (!named && !/uses a skill/i.test(text)) out.push(stat("initiative", value, { bonus: "proficiency" }));
  return out;
}

/** An armor class formula of the character's own: "your AC equals 10 + your Dexterity modifier + your Wisdom modifier". */
export function armorClassFromText(id: string, name: string, text: string): ARule[] {
  const m = new RegExp(`your (?:base )?(?:armor class|ac)(?: equals| is| of)(?: equal to)? (\\d+)(?: (?:\\+|plus) (?:your )?(${ABILITY})(?: modifier)?(?: (?:\\+|and|plus) (?:your )?(${ABILITY}))?)?`, "i").exec(text);
  if (!m) return [];
  const calc = `ac:${name.toLowerCase()} ${id.toLowerCase()}`;
  const parts = [stat(calc, m[1], { bonus: "base" })];
  if (m[2]) parts.push(stat(calc, `${m[2].toLowerCase()}:modifier`, { bonus: "primary ability" }));
  if (m[3]) parts.push(stat(calc, `${m[3].toLowerCase()}:modifier`, { bonus: "secondary ability" }));
  const equipped = /(?:or|and not) wielding a shield/i.test(text) ? "[armor:none],[shield:none]" : "[armor:none]";
  return [...parts, stat("ac:calculation", calc, { bonus: "calculation", equipped, alt: name })];
}

/** Saving throw proficiencies the feature simply gives. "Wisdom or Charisma" is a choice, and is left to the choice's own rule. */
export function savesFromText(text: string): ARule[] {
  const grant = (a: string) => ({ kind: "grant", type: "Proficiency", id: `ID_5ET_SAVE_${a.toUpperCase()}` }) as ARule;
  if (/(?:you (?:also )?(?:gain|have)|grants? you) proficiency in all saving throws/i.test(text)) return ABILITIES.map(grant);
  const m = new RegExp(`(?:you (?:also )?(?:gain|have)|grants? you) proficiency in (${ABILITY})(?: and (${ABILITY}))? saving throws`, "i").exec(text);
  return m ? [m[1], m[2]].filter(Boolean).map((a) => grant(a.toLowerCase())) : [];
}

/** A lasting bonus to speed, and a speed of another kind "equal to your speed". */
export function speedFromText(text: string): ARule[] {
  const out: ARule[] = [];
  // "Your speed is not reduced by wearing heavy armor" (the Dwarf): heavy armor's Strength does not slow the character.
  if (/speed (?:is not|isn't) reduced by wearing heavy armor/i.test(text)) out.push({ kind: "grant", type: "Grants", id: "ID_INTERNAL_GRANT_ARMOR_IGNORE_STRENGTH_REQUIREMENT" } as ARule);
  // A benefit of something the character turns on ("as a Bonus Action... for 10 minutes... your Speed increases") lasts
  // only while it does, however its own sentence reads.
  if (/\bas an? (?:bonus |magic )?action\b|\bfor (?:\d+|one|ten) (?:minute|hour|round)s?\b/i.test(text)) return out;
  for (const s of sentences(text)) {
    const up = /your (?:walking )?speed increases by (\d+) feet(?: while you (?:aren't|are not) wearing (heavy armor|armor)(?: or wielding a shield)?)?/i.exec(s);
    if (up && !CONDITIONAL.test(s)) {
      const equipped = !up[2] ? undefined : /heavy/i.test(up[2]) ? "![armor:heavy]" : "[armor:none],[shield:none]";
      const levels = /certain monk levels/i.test(text);
      const value = levels ? "monk:unarmored movement" : up[1];
      if (levels) for (const [v, level] of [[10, 1], [15, 6], [20, 10], [25, 14], [30, 18]] as const) out.push(stat("monk:unarmored movement", String(v), { bonus: "base", ...(level > 1 ? { level } : {}) }));
      out.push(stat("innate speed:misc", value, { equipped, requirements: "[innate speed:1]" }));
      for (const k of SPEEDS) out.push(stat(`innate speed:${k}:misc`, value, { equipped, requirements: `[innate speed:${k}:1]` }));
    }
    const kinds: Record<string, string> = { climbing: "climb", climb: "climb", swimming: "swim", swim: "swim", flying: "fly", fly: "fly", burrowing: "burrow", burrow: "burrow" };
    for (const m of s.matchAll(/((?:climbing|climb|swimming|swim|flying|fly|burrowing|burrow) speed(?: and an? (?:climbing|climb|swimming|swim|flying|fly|burrowing|burrow) speed)?) equal to your (?:walking )?speed/gi)) {
      if (!/you (?:also )?(?:gain|have)/i.test(s) || CONDITIONAL.test(s)) continue;
      for (const k of m[1].toLowerCase().match(/climbing|climb|swimming|swim|flying|fly|burrowing|burrow/g) ?? []) out.push(stat(`innate speed:${kinds[k]}`, "speed"));
    }
  }
  return out;
}

/** A lasting bonus to initiative. */
export function initiativeFromText(text: string): ARule[] {
  let m = new RegExp(`bonus to (?:your )?initiative(?: rolls)? equal to your (${ABILITY}) modifier`, "i").exec(text);
  if (m) return [stat("initiative", `${m[1].toLowerCase()}:modifier`)];
  m = /\+(\d+) bonus to initiative/i.exec(text);
  if (m) return [stat("initiative", m[1])];
  if (/when you roll initiative, you can add your proficiency bonus/i.test(text)) return [stat("initiative", "proficiency", { bonus: "proficiency" })];
  return [];
}

/** Attuning to more items, and ability scores raised past 20 at the top of a class: totals the sheet shows. */
export function limitsFromText(text: string): ARule[] {
  const out: ARule[] = [];
  const attune = /attune to up to (\w+) magic items/i.exec(text);
  if (attune && COUNT[attune[1].toLowerCase()]) out.push(stat("attunement:max", String(COUNT[attune[1].toLowerCase()]), { bonus: "base" }));
  const caps = new RegExp(`your (${ABILITY}) and (${ABILITY}) scores increase by (\\d+)(?:, to a maximum of (\\d+)|\\. your maximum for those scores is now (\\d+))`, "i").exec(text);
  if (caps) for (const a of [caps[1], caps[2]].map((x) => x.toLowerCase())) out.push(stat(a, caps[3]), stat(`${a}:max:extra`, String(Number(caps[4] ?? caps[5]) - 20)));
  return out;
}

const SKILL_NAMES = Object.values(SKILLS_OF).flat();

/**
 * Trainings the feature simply gives, by kind: "You gain proficiency with medium armor, shields, and martial weapons",
 * "with the disguise kit and the poisoner's kit", "in the Insight and Medicine skills". A sentence offering a choice
 * ("or", "of your choice") or holding only sometimes is left out, as is one about another creature.
 */
export function trainingsFromText(text: string): { armor: string[]; weapons: string[]; tools: string[]; skills: string[] } {
  const out = { armor: [] as string[], weapons: [] as string[], tools: [] as string[], skills: [] as string[] };
  for (const s of sentences(text)) {
    if (/\bor\b|your choice|\b(?:one|two|three) (?:type|kind|skill|tool)/i.test(s) || CONDITIONAL.test(s)) continue;
    // "You gain a Disguise Kit and a Poisoner's Kit, and you have proficiency with them."
    const them = /\byou gain ([^.]+?),? and you have proficiency with them/i.exec(s);
    const w = them ?? (/\byou\b/i.test(s) ? /\b(?:proficiency|training) with ([^.]+)/i.exec(s) : null);
    if (w && /\byou (?:also )?(?:gain|have)\b/i.test(s)) for (const part of w[1].replace(/\btraining with\b/gi, "and").split(/,|\band\b/).map((x) => x.replace(/^\s*(?:the|a|an)\s+/i, "").trim().toLowerCase()).filter(Boolean)) {
      const armor = /^(light|medium|heavy) armor$/.exec(part);
      if (armor) out.armor.push(armor[1]);
      else if (/^shields?$/.test(part)) out.armor.push("shield");
      else if (/^(simple|martial) weapons$/.test(part)) out.weapons.push(part.split(" ")[0]);
      else if (/(?:kit|tools|supplies|set|utensils)$/.test(part)) out.tools.push(part);
    }
    const k = /\byou (?:also )?(?:gain|have) proficiency in (?:the )?([^.]+?) skills?\b/i.exec(s);
    if (k) for (const part of k[1].split(/,|\band\b/).map((x) => x.trim().toLowerCase())) if (SKILL_NAMES.includes(part)) out.skills.push(part);
  }
  return out;
}

/** Languages the feature simply teaches: "You know Druidic", "You learn Sylvan". `known` is the language names loaded. */
export function languagesFromText(text: string, known: string[]): string[] {
  const words = (x: string) => x.replace(/[’']/g, "['’]").replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === "[" || c === "]" ? c : `\\${c}`));
  return known.filter((k) => sentences(text).some((s) => !/\bor\b/i.test(s) && !CONDITIONAL.test(s) && new RegExp(`\\byou (?:also )?(?:know|learn|learned) (?:the )?${words(k)}\\b`, "i").test(s)));
}

/**
 * The lasting numbers a feature's text states and the engine reads (Stage D4): what 5e.tools states only in prose and a
 * character otherwise had only when Aurora was loaded too (Jack of All Trades, Unarmored Defense, Diamond Soul, Fast
 * Movement). Whatever the Foundry pass already set stays as it is.
 */
export function applyTextStats(out: AElement[], ids: { tool(name: string): string; weapon(kind: string): string | undefined; armor(kind: string): string; skill(name: string): string; language(name: string): string }): number {
  let n = 0;
  const languages = out.filter((e) => e.type === "Language").map((e) => e.name);
  for (const el of out) {
    if (el.origin !== "5etools" || !USES_TYPES.has(el.type)) continue;
    // "You gain proficiency in X. If you already have it, …" is a choice with X as its default (fivetools.ts
    // settleFallbacks), not a plain grant: that sentence is not read here.
    const text = plain(el.description ?? "").replace(/[^.]*\bgain proficiency\b[^.]*\.\s*(?=if you (?:are )?already\b)/gi, "");
    const has = (name: string) => el.rules.some((r) => r.kind === "stat" && r.name.toLowerCase() === name);
    const has2 = (id?: string) => el.rules.some((r) => r.kind === "grant" && r.id === id);
    const add = [...halfProficiencyFromText(text), ...armorClassFromText(el.id, el.name, text), ...savesFromText(text), ...speedFromText(text).filter((r) => r.kind !== "stat" || !/misc$/.test(r.name) || !el.rules.some((x) => x.kind === "stat" && /^(?:innate )?speed(?::misc)?$/i.test(x.name))), ...initiativeFromText(text), ...limitsFromText(text)]
      .filter((r) => (r.kind === "stat" ? !has(r.name.toLowerCase()) || r.name === "ac:calculation" : !has2((r as { id?: string }).id)));
    const train = trainingsFromText(text);
    const grants = [
      ...train.armor.map((k) => ["Proficiency", ids.armor(k)]),
      ...train.weapons.map((k) => ["Proficiency", ids.weapon(k)]),
      ...train.tools.map((k) => ["Proficiency", ids.tool(k)]),
      ...train.skills.map((k) => ["Proficiency", ids.skill(k)]),
      ...languagesFromText(text, languages).map((k) => ["Language", ids.language(k)]),
    ].filter(([, id]) => id && !has2(id)).map(([type, id]) => ({ kind: "grant", type, id }) as ARule);
    add.push(...grants);
    if (add.length && !(has("ac:calculation") && add.some((r) => r.kind === "stat" && r.name === "ac:calculation"))) { el.rules = [...el.rules, ...add]; n++; }
  }
  return n;
}
