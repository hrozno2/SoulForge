/**
 * Mechanics read from a feature's own text, for 5e.tools entries that have no Foundry side data for them (the way
 * Plutonium fills the gap; see docs/PLUTONIUM.md). Uses: "a number of times equal to your Wisdom modifier (minimum
 * of once)", "... equal to twice your proficiency bonus", "you can use this feature twice", with the rest that brings
 * them back ("when you finish a Short or Long Rest"). A feature that names a rest but no count has one use. The result
 * is the feature's usage line, "{{name:uses}}/Long Rest", as the Foundry pass and Aurora's content write it.
 */
import type { AElement, ARule } from "./types";
import { SKILL_ABILITY } from "./character";

const COUNT: Record<string, number> = {
  once: 1,
  twice: 2,
  thrice: 3,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
const ABILITY = "strength|dexterity|constitution|intelligence|wisdom|charisma";
/**
 * Audit E2: one count of every rule read from prose. Switched on by the report (`RULES_TIER=text-rules`), each reader
 * notes the elements it fires on: `kept` where its reading went into the element, `had` where the element already
 * held that fact from data (5e.tools' own fields or its Foundry side data), so the text only repeated it.
 */
export const textTally = {
  on: false,
  rows: new Map<string, { kept: number; had: number; samples: string[] }>(),
  /**
   * Where the data and the text both state a fact and state it differently: one line each. The data decides (the
   * readers leave it alone); the list is for a person to judge which of the two is wrong (the gate in
   * src/engine/textRules.test.ts holds its length).
   */
  differs: [] as string[],
};
/** The data and the text say different things about one fact of one element. */
function noteDiffers(reader: string, el: { name: string; type: string; source?: string }, text: string, data: string): void {
  if (textTally.on) textTally.differs.push(`${reader} | ${el.name} (${el.type}, ${el.source ?? "?"}) | text: ${text} | data: ${data}`);
}
/** What a usage line says about getting uses back, reduced to its kind, so two wordings of one rule agree. */
function restKind(usage: string): string {
  const u = usage.toLowerCase();
  if (/one on a short rest/.test(u)) return "long, one on a short";
  if (/short or long|short rest or long|short\/long/.test(u)) return "short";
  if (/short/.test(u)) return "short";
  if (/long/.test(u)) return "long";
  if (/dawn|day/.test(u)) return "day";
  return u.replace(/^.*\//, "").trim();
}
/** A pass that only reports how many elements it changed. */
export function noteCount(reader: string, n: number): number {
  if (textTally.on && n) {
    const row = textTally.rows.get(reader) ?? { kept: 0, had: 0, samples: [] };
    row.kept += n;
    textTally.rows.set(reader, row);
  }
  return n;
}
/** One element a reader fired on: `kept` where its reading went in, otherwise the data already said it. */
export function note(reader: string, el: { name: string; type: string }, kept: boolean): void {
  if (!textTally.on) return;
  const row = textTally.rows.get(reader) ?? { kept: 0, had: 0, samples: [] };
  if (kept) row.kept++;
  else row.had++;
  if (kept && row.samples.length < 4) row.samples.push(`${el.name} (${el.type})`);
  textTally.rows.set(reader, row);
}

const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
const count = (w?: string) => (w ? (COUNT[w.toLowerCase().replace(/ times$/, "")] ?? (Number(w.replace(/ times$/, "")) || 1)) : 1);

/**
 * A feature whose text puts all it gives under a state the character enters in play: "While in a Wild Shape form, you
 * gain the following benefits" (the 2024 Circle of the Moon's Improved Circle Forms), "While shifted, your walking speed
 * increases" (a Shifter), "While your Elemental Attunement is active" (Way of the Elements). Its numbers are not
 * carried all the time; Foundry's data marks some of them always on (found 2026-11-17: every Moon Druid of level 6
 * added Wisdom to Constitution saves). Wearing or holding something is not such a state: the item rules handle it.
 */
export function stateOnly(html: string): boolean {
  const first =
    plain(html)
      .trim()
      .split(/(?<=[.:])\s/)[0] ?? "";
  return (
    /^while (?:you(?:'re| are) )?(?:in (?:a |your )?wild shape\b|shifted\b|raging\b|your rage is active|transformed\b|in your [a-z' ]+ form\b|your [a-z' ]+ is active\b)/i.test(
      first,
    ) ||
    // "... when you assume a Wild Shape form, granting you the benefits below" (the 2024 Circle Forms).
    /\bwhen you (?:assume|adopt|enter|take on) (?:a |your )?[a-z' ]*\bform\b[^.]*\b(?:benefits|following)\b/i.test(first)
  );
}

/**
 * "While you are wearing armor, you gain a +1 bonus to AC" (the Defense fighting style, 2014; the 2024 one says "Light,
 * Medium, or Heavy armor"): the bonus holds in armor only. The 2014 one had no rule at all, and Foundry's data gives the
 * 2024 one at all times (found 2026-11-17). An armor class bonus the element already carries gets the condition; none,
 * and one is added. Items are left to the item rules.
 */
export function applyArmorBonus(out: AElement[]): number {
  let n = 0;
  // The wording, and the condition it puts on the bonus. The 2014 Dual Wielder: "+1 bonus to AC while you are wielding a
  // separate melee weapon in each hand" (always on before, 2026-11-17).
  const FORMS: [RegExp, string][] = [
    [/while you(?:'re| are) wearing (?:light, medium, or heavy )?armor,? you gain a \+(\d+) bonus to (?:ac|armor class)\b/i, "[armor:any]"],
    [
      /a \+(\d+) bonus to (?:ac|armor class) while you(?:'re| are) wielding a separate melee weapon in each (?:of your )?hands?/i,
      "[primary:any],[secondary:any]",
    ],
  ];
  for (const el of out) {
    if (el.origin !== "5etools" || /Item|Armor|Weapon/.test(el.type)) continue;
    const text = plain(el.description ?? "");
    const form = FORMS.find(([re]) => re.test(text));
    if (!form) continue;
    const m = form[0].exec(text)!;
    const when = form[1];
    const mine = el.rules.filter((r) => r.kind === "stat" && r.name.toLowerCase() === "ac:misc" && String(r.value) === m[1]);
    if (mine.length) {
      el.rules = el.rules.map((r) =>
        mine.includes(r) && !(r as { equipped?: string }).equipped ? ({ ...r, equipped: when } as ARule) : r,
      );
    } else el.rules = [...el.rules, stat("ac:misc", m[1], { equipped: when })];
    n++;
  }
  return n;
}

/**
 * A bonus to a companion's armor class stated only in text: "Your steel defender gains a +2 bonus to Armor Class" (the
 * 2014 Battle Smith's Improved Defender, Tasha's). Aurora's copy has it as "companion:ac"; 5e.tools' had nothing, so a
 * 15th-level Battle Smith's defender showed AC 15 instead of 17 (found 2026-11-17 by the random companion check).
 */
export function applyCompanionBonus(out: AElement[]): number {
  let n = 0;
  const re =
    /\byour (?:steel defender|[a-z' ]*?(?:companion|defender|drake|spirit|homunculus|servant|echo)) gains a \+(\d+) bonus to (?:its )?(?:ac|armor class)\b/i;
  for (const el of out) {
    if (el.origin !== "5etools" || /Item|Armor|Weapon|Companion|Spell/.test(el.type)) continue;
    const m = re.exec(plain(el.description ?? ""));
    if (!m || el.rules.some((r) => r.kind === "stat" && r.name.toLowerCase() === "companion:ac")) continue;
    el.rules = [...el.rules, stat("companion:ac", m[1])];
    n++;
  }
  return n;
}

/** How many uses the text gives, as a stat formula; undefined when it names none. */
export function usesFromText(text: string): string | undefined {
  let m = new RegExp(
    `a number of times equal to (?:(twice|three times) )?your (${ABILITY}) modifier(?: \\(minimum of (once|one|twice|two|\\d+)\\))?`,
    "i",
  ).exec(text);
  if (m) {
    const mod = `{${m[2].toLowerCase()}:modifier}${m[1] ? ` * ${count(m[1])}` : ""}`;
    return `max(${m[3] ? count(m[3]) : 1}, ${mod})`;
  }
  m = /a number of times equal to (?:(twice|three times) )?your proficiency bonus/i.exec(text);
  if (m) return `{proficiency}${m[1] ? ` * ${count(m[1])}` : ""}`;
  // A pool of dice sized the same way: "You have a number of these dice equal to twice your proficiency bonus" (the
  // Psi Warrior's and Soulknife's Psionic Energy dice, Tasha's).
  m = /a number of (?:these |[\w'’-]+ ){1,3}dice equal to (?:(twice|three times) )?your proficiency bonus/i.exec(text);
  if (m) return `{proficiency}${m[1] ? ` * ${count(m[1])}` : ""}`;
  m =
    /[Yy]ou can use (?:this feature|this ability|this trait|(?:[A-Z][\w'’-]* ?)+) (once|twice|thrice|(?:two|three|four|five|\d+) times)\b/.exec(
      text,
    );
  if (m) return String(count(m[1]));
  // A number of dice of the feature's own: "You have four superiority dice, which are d8s."
  m = /\byou have (two|three|four|five|six|\d+) (?:[\w'’-]+ ){1,2}dice\b/i.exec(text);
  if (m) return String(count(m[1]));
  // A pool sized by a class level: "equal to your paladin level × 5" (2014), "five times your Paladin level" (2024).
  m = /equal to (?:your )?(\w+) level (?:×|x|\*|times) (\d+|five|ten)\b/i.exec(text);
  if (m) return `{level:${m[1].toLowerCase()}} * ${count(m[2])}`;
  m = /\b(\d+|two|three|four|five|ten) times your (\w+) level\b/i.exec(text);
  if (m) return `{level:${m[2].toLowerCase()}} * ${count(m[1])}`;
  return undefined;
}

/**
 * A feature's own table of how many it has by level ("Soulknife Energy Dice": Rogue Level, Die Size, Number), as
 * [level, number] where the number changes; undefined when the text holds no such table.
 */
export function tableUsesFromHtml(html: string): [number, number][] | undefined {
  for (const t of html.matchAll(/<table>[\s\S]*?<\/table>/g)) {
    const cells = (row: string, tag: string) =>
      [...row.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((c) => c[1].replace(/<[^>]+>/g, "").trim());
    const head = cells(/<thead>([\s\S]*?)<\/thead>/.exec(t[0])?.[1] ?? "", "th");
    const num = head.findIndex((h) => /^number$/i.test(h));
    if (num < 1 || !/ level$/i.test(head[0])) continue;
    const out: [number, number][] = [];
    for (const row of t[0].matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const c = cells(row[1], "td");
      const lv = Number(c[0]);
      const n = Number(c[num]);
      if (!Number.isInteger(lv) || !Number.isInteger(n) || !c.length) continue;
      if (!out.length || out[out.length - 1][1] !== n) out.push([lv, n]);
    }
    if (out.length) return out;
  }
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
    if (
      mine.length !== 1 ||
      (mine[0] as { bonus?: string; value: string }).bonus !== "text uses" ||
      (mine[0] as { value: string }).value !== "1"
    )
      continue;
    const text = plain(el.description ?? "");
    if (!POOL.test(text) || usesFromText(text)) continue;
    el.rules = el.rules.filter((r) => r !== mine[0]);
    if (el.sheet?.usage?.startsWith(`{{${name}}}`)) {
      const { usage: _gone, ...rest } = el.sheet;
      void _gone;
      el.sheet = rest as typeof el.sheet;
    }
    n++;
  }
  return n;
}

/** The rest that brings uses back, as the sheet words it; undefined when the text names none. */
export function recoveryFromText(text: string): string | undefined {
  if (
    /regain (?:one|two|three|\w+)(?: of (?:its|your|the))? expended uses? when you finish a short rest,? and (?:you )?regain all (?:of (?:its|your|the) )?expended uses when you finish a long rest/i.test(
      text,
    )
  )
    return "Long Rest (one on a Short Rest)";
  // A pool of dice or points: one back on a short rest and all on a long one (the 2024 Psionic Energy Dice), or all on
  // a long rest whatever else returns one in between (Tasha's: a bonus action, once between rests).
  if (
    /regain one of (?:its|your|the) expended [\w'’ ]+? when you finish a short rest,? and (?:you )?regain all (?:of them|of (?:its|your|the) expended [\w'’ ]+?) when you finish a long rest/i.test(
      text,
    )
  )
    return "Long Rest (one on a Short Rest)";
  if (/regain all (?:of )?(?:your )?expended [\w'’ ]*?dic?e when you finish a long rest/i.test(text)) return "Long Rest";
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
const USES_TYPES = new Set([
  "Class Feature",
  "Archetype Feature",
  "Racial Trait",
  "Feat",
  "Feat Feature",
  "Background Feature",
  "Optional Feature",
  "Class Feature Option",
]);

/** Gives each 5e.tools feature without a usage line the one its text states. Returns how many it gave. */
export function applyTextUses(out: AElement[]): number {
  let n = 0;
  for (const el of out) {
    if (el.origin !== "5etools" || !USES_TYPES.has(el.type)) continue;
    const hasUsage = !!el.sheet?.usage || !!el.sheet?.descriptions?.some((d) => d.usage);
    if (hasUsage && !textTally.on) continue;
    const text = plain(el.description ?? "");
    const rest = recoveryFromText(text);
    if (!rest) continue;
    if (hasUsage) {
      note("limited uses and their rest", el, false);
      const data = el.sheet?.usage || el.sheet?.descriptions?.find((d) => d.usage)?.usage || "";
      if (restKind(data) !== restKind(rest)) noteDiffers("limited uses and their rest", el, rest, data);
      continue;
    }
    // The feature's own table of numbers by level comes first: the text beside it only points at the table.
    const table = tableUsesFromHtml(el.description ?? "");
    const max = table ? String(table[0][1]) : (usesFromText(text) ?? "1");
    const shared = `${el.name.toLowerCase()}:uses`;
    if (el.rules.some((r) => r.kind === "stat" && r.name.toLowerCase() === shared)) {
      note("limited uses and their rest", el, false);
      continue;
    }
    note("limited uses and their rest", el, true);
    // A count from the feature's own table goes by that class's level, so it is this feature's alone: under the
    // shared name, another class's feature of the same name took or gave the higher count (a 2024 Soulknife 6 beside
    // a Tasha's Psi Warrior had 8 Psionic Energy dice for 6).
    const name = table ? `${el.id.toLowerCase()}:uses` : shared;
    // More at later levels, stated in the same text: "when you reach Fighter levels 7 (five dice total) and 15 (six
    // dice total)".
    const steps = [...text.matchAll(/\b(\d+) \((\w+) (?:dice|uses) total\)/gi)].map(
      (x) => ({ kind: "stat", name, value: String(count(x[2])), bonus: "text uses", level: Number(x[1]) }) as ARule,
    );
    for (const [level, n] of (table ?? []).slice(1))
      steps.push({ kind: "stat", name, value: String(n), bonus: "text uses", level } as ARule);
    el.rules = [...el.rules, { kind: "stat", name, value: max, bonus: "text uses" } as ARule, ...steps];
    el.sheet = { ...(el.sheet ?? { display: true, descriptions: [] }), usage: `{{${name}}}/${rest}` };
    n++;
  }
  return n;
}

/**
 * Uses a later feature adds to an earlier one's count, read from the later one's text: "Beginning at 6th level, you
 * can use your Channel Divinity twice between rests" (a 2014 Cleric stayed at one use), "You gain another superiority
 * die at 7th level" (a Battle Master stayed at four). Run after `applyTextUses`. Returns how many it read.
 */
export function applyTextUseSteps(out: AElement[]): number {
  let n = 0;
  const counted = new Map<string, AElement[]>();
  for (const el of out)
    for (const r of el.rules)
      if (r.kind === "stat" && /:uses$/.test(r.name))
        (counted.get(r.name.toLowerCase()) ?? counted.set(r.name.toLowerCase(), []).get(r.name.toLowerCase())!).push(el);
  for (const el of out) {
    if (el.origin !== "5etools" || !USES_TYPES.has(el.type)) continue;
    const text = plain(el.description ?? "");
    const between = /you can use (?:your )?([A-Z][\w'’ ]+?) (twice|three times|four times|\d+ times) between rests/.exec(text);
    if (between) {
      const stat = `${between[1].toLowerCase()}:uses`;
      // The feature it speaks of is one of the same book (a Cleric's and a Paladin's Channel Divinity share the name).
      if (counted.get(stat)?.some((o) => o.source === el.source) && !el.rules.some((r) => r.kind === "stat" && r.name === stat)) {
        el.rules = [...el.rules, { kind: "stat", name: stat, value: String(count(between[2])), bonus: "text uses" } as ARule];
        n++;
      }
    }
    const another = /\byou gain another ([a-z]+(?: [a-z]+)?) die\b/i.exec(text);
    if (another) {
      const noun = `${another[1].toLowerCase()} dice`;
      // The feature that has those dice, nearest by id: the same subclass's, not a feat that also speaks of them
      // (Martial Adept names superiority dice too).
      const shared = (a: string, b: string) => {
        let i = 0;
        while (i < a.length && a[i] === b[i]) i++;
        return i;
      };
      const owner = [...new Set([...counted.values()].flat())]
        .filter(
          (o) =>
            o !== el &&
            o.origin === "5etools" &&
            o.source === el.source &&
            o.rules.some((r) => r.kind === "stat" && r.name === `${o.name.toLowerCase()}:uses`) &&
            plain(o.description ?? "")
              .toLowerCase()
              .includes(noun),
        )
        .sort((x, y) => shared(y.id, el.id) - shared(x.id, el.id))[0];
      const stat = owner ? `${owner.name.toLowerCase()}:uses` : "";
      if (owner && !el.rules.some((r) => r.kind === "stat" && r.name === stat)) {
        el.rules = [...el.rules, { kind: "stat", name: stat, value: "1" } as ARule];
        n++;
      }
    }
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
  const m = new RegExp(
    `DC (?:8 plus|equals 8 plus|equals 8 \\+|= 8 \\+|is 8 \\+|is 8 plus|of 8 \\+) your (?:(${ABILITY}) modifier (?:and|\\+) (?:your )?proficiency bonus|proficiency bonus \\+ your (${ABILITY}) modifier)`,
    "i",
  ).exec(text);
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
    const hasDc = el.rules.some((r) => r.kind === "stat" && r.name.toLowerCase().endsWith(":dc"));
    if (hasDc && !textTally.on) continue;
    const dc = dcFromText(plain(el.description ?? ""));
    if (!dc) continue;
    note("a feature's save DC", el, !hasDc);
    if (hasDc) {
      const squash = (v: string) => v.toLowerCase().replace(/\s+/g, "");
      const data = el.rules
        .filter((r) => r.kind === "stat" && r.name.toLowerCase().endsWith(":dc"))
        .map((r) => (r as { value: string }).value);
      if (!data.some((v) => squash(v) === squash(dc))) noteDiffers("a feature's save DC", el, dc, data.join(" / "));
      continue;
    }
    el.rules = [...el.rules, { kind: "stat", name, value: dc, bonus: "text dc" } as ARule];
    n++;
  }
  return n;
}

const DAMAGE_TYPES = "acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder";
const ABBR: Record<string, string> = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
};

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
  const dmg = older
    ? [older[0], older[2], older[3], older[1]]
    : new RegExp(`\\b(\\d+d\\d+|\\d+)(?: \\+ your (${abil}) modifier)? (${DAMAGE_TYPES}) damage`, "i").exec(text);
  if (!dmg) return undefined;
  // Text with several damage rolls (a choice of options, Animal Enhancement) does not say which one is the attack.
  const rolls = new Set(
    [
      ...text.matchAll(
        new RegExp(`\\b\\d+d\\d+\\b[^.]{0,40}?\\b(?:${DAMAGE_TYPES})\\b|\\b(?:${DAMAGE_TYPES}) damage equal to \\d+d\\d+`, "gi"),
      ),
    ].map((m) => m[0].toLowerCase()),
  );
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
    if (el.origin !== "5etools" || !USES_TYPES.has(el.type)) continue;
    const hasAttack = !!el.attacks?.length;
    if (hasAttack && !textTally.on) continue;
    const a = attackFromText(el.name.replace(/\s*\(.*\)\s*$/, ""), plain(el.description ?? ""));
    if (!a) continue;
    note("an attack of the feature's own", el, !hasAttack);
    if (hasAttack) continue;
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
const skillId = (s: string, kind: "5ET" | "AURORA") =>
  kind === "5ET" ? `ID_5ET_SKILL_${s.toUpperCase().replace(/ /g, "_")}` : `ID_PROFICIENCY_SKILL_${s.toUpperCase().replace(/ /g, "")}`;
const stat = (name: string, value: string, extra: Partial<ARule> = {}) => ({ kind: "stat", name, value, ...extra }) as ARule;
/** Sentences without the opening that only says when a feature arrives ("When you join the College at 3rd level, ..."). */
const sentences = (text: string) =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((s) =>
      s
        .trim()
        .replace(
          /^(?:when you (?:join|choose|adopt|select|reach)\b[^,]*,|(?:at|by|beginning at|starting at|starting when you\b[^,]*at) \d+\w* level,)\s*/i,
          "",
        ),
    );
/** A sentence that only holds some of the time ("when you rage, your speed increases") is not a passive statistic. */
const CONDITIONAL = /\b(when|whenever|until|if|for \d+|for the duration|as a(?:n)? (?:bonus )?action|until)\b/i;

/** Half proficiency on the checks that lack it: Jack of All Trades (any check), Remarkable Athlete (three abilities). */
export function halfProficiencyFromText(text: string): ARule[] {
  const m =
    /half your proficiency bonus(?:,? \(?round(?:ed)? (down|up)\)?)?,? to any ((?:strength|dexterity|constitution|intelligence|wisdom|charisma)(?:,? (?:or )?(?:strength|dexterity|constitution|intelligence|wisdom|charisma))*)? ?(?:ability )?check/i.exec(
      text,
    );
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
  const m = new RegExp(
    `(?:your|you an?) (?:base )?(?:armor class|ac)(?: equals| is| of)(?: equal to)? (\\d+)(?: (?:\\+|plus) (?:your )?(${ABILITY})(?: modifier)?(?: (?:\\+|and|plus) (?:your )?(${ABILITY}))?)?`,
    "i",
  ).exec(text);
  if (!m) return [];
  // A formula that holds for a while is not the character's armor class: "Until you leave the form, your AC equals 13
  // plus your Wisdom modifier" (Circle Forms), "until the spell ends".
  const own = sentences(text).find((x) => x.toLowerCase().includes(m[0].toLowerCase())) ?? "";
  if (/^until\b|\buntil (?:you leave|the (?:spell|effect|rage) ends)|\bfor (?:\d+|one|ten) (?:minute|hour|round)s?\b/i.test(own)) return [];
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
  const m = new RegExp(
    `(?:you (?:also )?(?:gain|have)|grants? you) proficiency in (${ABILITY})(?: and (${ABILITY}))? saving throws`,
    "i",
  ).exec(text);
  return m ? [m[1], m[2]].filter(Boolean).map((a) => grant(a.toLowerCase())) : [];
}

/** A lasting bonus to speed, and a speed of another kind "equal to your speed". */
export function speedFromText(text: string): ARule[] {
  const out: ARule[] = [];
  // "Your speed is not reduced by wearing heavy armor" (the Dwarf): heavy armor's Strength does not slow the character.
  if (/speed (?:is not|isn't) reduced by wearing heavy armor/i.test(text))
    out.push({ kind: "grant", type: "Grants", id: "ID_INTERNAL_GRANT_ARMOR_IGNORE_STRENGTH_REQUIREMENT" } as ARule);
  // A benefit of something the character turns on ("as a Bonus Action... for 10 minutes... your Speed increases") lasts
  // only while it does, however its own sentence reads.
  if (/\bas an? (?:bonus |magic )?action\b|\bfor (?:\d+|one|ten) (?:minute|hour|round)s?\b/i.test(text)) return out;
  for (const s of sentences(text)) {
    const up =
      /your (?:walking )?speed increases by (\d+) feet(?: while you (?:aren't|are not) wearing (heavy armor|armor)(?: or wielding a shield)?)?/i.exec(
        s,
      );
    if (up && !CONDITIONAL.test(s)) {
      const equipped = !up[2] ? undefined : /heavy/i.test(up[2]) ? "![armor:heavy]" : "[armor:none],[shield:none]";
      const levels = /certain monk levels/i.test(text);
      const value = levels ? "monk:unarmored movement" : up[1];
      if (levels)
        for (const [v, level] of [
          [10, 1],
          [15, 6],
          [20, 10],
          [25, 14],
          [30, 18],
        ] as const)
          out.push(stat("monk:unarmored movement", String(v), { bonus: "base", ...(level > 1 ? { level } : {}) }));
      out.push(stat("innate speed:misc", value, { equipped, requirements: "[innate speed:1]" }));
      for (const k of SPEEDS) out.push(stat(`innate speed:${k}:misc`, value, { equipped, requirements: `[innate speed:${k}:1]` }));
    }
    const kinds: Record<string, string> = {
      climbing: "climb",
      climb: "climb",
      swimming: "swim",
      swim: "swim",
      flying: "fly",
      fly: "fly",
      burrowing: "burrow",
      burrow: "burrow",
    };
    for (const m of s.matchAll(
      /((?:climbing|climb|swimming|swim|flying|fly|burrowing|burrow) speed(?: and an? (?:climbing|climb|swimming|swim|flying|fly|burrowing|burrow) speed)?) equal to your (?:walking )?speed/gi,
    )) {
      if (!/you (?:also )?(?:gain|have)/i.test(s) || CONDITIONAL.test(s)) continue;
      for (const k of m[1].toLowerCase().match(/climbing|climb|swimming|swim|flying|fly|burrowing|burrow/g) ?? [])
        out.push(stat(`innate speed:${kinds[k]}`, "speed"));
    }
  }
  return out;
}

/** A lasting bonus to initiative. */
export function initiativeFromText(text: string): ARule[] {
  // "a bonus to your initiative rolls equal to your Wisdom modifier" (Dread Ambusher), or "you can add your
  // Intelligence modifier to your initiative rolls" (Chronurgy's Temporal Awareness, unread until 2026-11-17).
  let m =
    new RegExp(`bonus to (?:your )?initiative(?: rolls)? equal to your (${ABILITY}) modifier`, "i").exec(text) ??
    new RegExp(`add your (${ABILITY}) modifier to your initiative(?: rolls)?`, "i").exec(text);
  if (m) return [stat("initiative", `${m[1].toLowerCase()}:modifier`)];
  m = /\+(\d+) bonus to initiative/i.exec(text);
  if (m) return [stat("initiative", m[1])];
  if (
    /when you roll initiative, you can add your proficiency bonus|you can add your proficiency bonus to your initiative(?: rolls)?|gain a bonus to initiative(?: rolls)? equal to your proficiency bonus/i.test(
      text,
    )
  )
    return [stat("initiative", "proficiency", { bonus: "proficiency" })];
  return [];
}

/**
 * A bonus to every check of one ability equal to another's modifier: "whenever you make a Charisma check, you gain a
 * bonus to the check equal to your Wisdom modifier" (the Fey Wanderer's Otherworldly Glamour, text only on 5e.tools
 * content until 2026-11-17, found by the move's fresh sample). Read onto each skill of that ability.
 */
export function checkBonusFromText(text: string): ARule[] {
  // Or one skill's: "whenever you make a Charisma (Persuasion) check, ... equal to your Wisdom modifier" (the Samurai's
  // Elegant Courtier).
  const m = new RegExp(
    `whenever you make an? (${ABILITY})(?: \\(([a-z ]+)\\))? check, you gain a bonus to the check equal to your (${ABILITY}) modifier( \\(minimum of \\+?1\\))?`,
    "i",
  ).exec(text);
  if (!m) return [];
  const of = m[1].toLowerCase();
  const only = m[2]?.toLowerCase().trim();
  return (
    Object.entries(SKILL_ABILITY)
      .filter(([skill, a]) => a === of && (!only || skill === only))
      // "(minimum of +1)": never a penalty, written as the Foundry data writes it.
      .map(([skill]) => stat(`${skill}:misc`, m[4] ? `(max(1,{${m[3].toLowerCase()}:modifier}))` : `${m[3].toLowerCase()}:modifier`))
  );
}

/** Attuning to more items, and ability scores raised past 20 at the top of a class: totals the sheet shows. */
export function limitsFromText(text: string): ARule[] {
  const out: ARule[] = [];
  const attune = /attune to up to (\w+) magic items/i.exec(text);
  if (attune && COUNT[attune[1].toLowerCase()]) out.push(stat("attunement:max", String(COUNT[attune[1].toLowerCase()]), { bonus: "base" }));
  // Medium Armor Master (both Player's Handbooks): "you can add 3, rather than 2, to your AC" in medium armor. The
  // data states it in the text alone; without this the feat changed nothing on 5e.tools content (2026-11-12).
  const dexCap = /(?:medium armor|wearing medium armor)[^.]*\badd (\d), rather than 2,? to your AC/i.exec(text);
  if (dexCap) out.push(stat("ac:armored:dexterity:cap", dexCap[1], { bonus: "base" }));
  const caps = new RegExp(
    `your (${ABILITY}) and (${ABILITY}) scores increase by (\\d+)(?:, to a maximum of (\\d+)|\\. your maximum for those scores is now (\\d+))`,
    "i",
  ).exec(text);
  if (caps)
    for (const a of [caps[1], caps[2]].map((x) => x.toLowerCase()))
      out.push(stat(a, caps[3]), stat(`${a}:max:extra`, String(Number(caps[4] ?? caps[5]) - 20)));
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
  // "if you don't already have it" is no condition on the gift (the Scout's Survivalist): it goes before the test.
  for (const s of sentences(text).map((x) =>
    x.replace(/,?\s*if you (?:don't|do not) already have (?:it|them|this proficiency|that proficiency)\b/gi, ""),
  )) {
    if (/\bor\b|your choice|\b(?:one|two|three) (?:type|kind|skill|tool)/i.test(s) || CONDITIONAL.test(s)) continue;
    // "You gain a Disguise Kit and a Poisoner's Kit, and you have proficiency with them."
    const them = /\byou gain ([^.]+?),? and you have proficiency with them/i.exec(s);
    const w = them ?? (/\byou\b/i.test(s) ? /\b(?:proficiency|training) with ([^.]+)/i.exec(s) : null);
    if (w && /\byou (?:also )?(?:gain|have)\b/i.test(s))
      for (const part of w[1]
        .replace(/\btraining with\b/gi, "and")
        .split(/,|\band\b/)
        .map((x) =>
          x
            .replace(/^\s*(?:the|a|an)\s+/i, "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean)) {
        const armor = /^(light|medium|heavy) armor$/.exec(part);
        if (armor) out.armor.push(armor[1]);
        else if (/^shields?$/.test(part)) out.armor.push("shield");
        else if (/^(simple|martial) weapons$/.test(part)) out.weapons.push(part.split(" ")[0]);
        else if (/(?:kit|tools|supplies|set|utensils)$/.test(part)) out.tools.push(part);
      }
    const k = /\byou (?:also )?(?:gain|have) proficiency in (?:the )?([^.]+?) skills?\b/i.exec(s);
    if (k)
      for (const part of k[1].split(/,|\band\b/).map((x) => x.trim().toLowerCase())) if (SKILL_NAMES.includes(part)) out.skills.push(part);
  }
  return out;
}

/** Languages the feature simply teaches: "You know Druidic", "You learn Sylvan". `known` is the language names loaded. */
export function languagesFromText(text: string, known: string[]): string[] {
  const words = (x: string) => x.replace(/[’']/g, "['’]").replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === "[" || c === "]" ? c : `\\${c}`));
  return known.filter((k) =>
    sentences(text).some(
      (s) =>
        !/\bor\b/i.test(s) &&
        !CONDITIONAL.test(s) &&
        new RegExp(`\\byou (?:also )?(?:know|learn|learned) (?:the )?${words(k)}\\b`, "i").test(s),
    ),
  );
}

/**
 * The lasting numbers a feature's text states and the engine reads (Stage D4): what 5e.tools states only in prose and a
 * character otherwise had only when Aurora was loaded too (Jack of All Trades, Unarmored Defense, Diamond Soul, Fast
 * Movement). Whatever the Foundry pass already set stays as it is.
 */
export function applyTextStats(
  out: AElement[],
  ids: {
    tool(name: string): string;
    weapon(kind: string): string | undefined;
    armor(kind: string): string;
    skill(name: string): string;
    language(name: string): string;
  },
): number {
  let n = 0;
  const languages = out.filter((e) => e.type === "Language").map((e) => e.name);
  for (const el of out) {
    if (el.origin !== "5etools" || !USES_TYPES.has(el.type)) continue;
    // "You gain proficiency in X. If you already have it, …" is a choice with X as its default (fivetools.ts
    // settleFallbacks), not a plain grant: that sentence is not read here.
    // Numbers that hold only in a state entered in play are not read as lasting ones.
    if (stateOnly(el.description ?? "")) continue;
    const text = plain(el.description ?? "").replace(/[^.]*\bgain proficiency\b[^.]*\.\s*(?=if you (?:are )?already\b)/gi, "");
    const has = (name: string) => el.rules.some((r) => r.kind === "stat" && r.name.toLowerCase() === name);
    const has2 = (id?: string) => el.rules.some((r) => r.kind === "grant" && r.id === id);
    const isNew = (r: ARule) =>
      r.kind === "stat" ? !has(r.name.toLowerCase()) || r.name === "ac:calculation" : !has2((r as { id?: string }).id);
    // Each reader by its name, so the report (audit E2) can say how often it fires and how often the data had it.
    const read = (reader: string, found: ARule[]): ARule[] => {
      const kept = found.filter(isNew);
      if (found.length) note(reader, el, kept.length > 0);
      // A statistic both state: the same name with another value is a disagreement (the data's stays).
      for (const f of found)
        if (f.kind === "stat" && f.name !== "ac:calculation" && !kept.includes(f)) {
          const same = el.rules.filter((r) => r.kind === "stat" && r.name.toLowerCase() === f.name.toLowerCase()) as { value: string }[];
          if (same.length && !same.some((r) => r.value.toLowerCase() === f.value.toLowerCase()))
            noteDiffers(reader, el, `${f.name} ${f.value}`, same.map((r) => `${f.name} ${r.value}`).join(" / "));
        }
      return kept;
    };
    const add = [
      ...read("half proficiency on checks", halfProficiencyFromText(text)),
      ...read("an armor class formula", armorClassFromText(el.id, el.name, text)),
      ...read("saving throw proficiency", savesFromText(text)),
      ...read(
        "speeds",
        speedFromText(text).filter(
          (r) =>
            r.kind !== "stat" ||
            !/misc$/.test(r.name) ||
            !el.rules.some((x) => x.kind === "stat" && /^(?:innate )?speed(?::misc)?$/i.test(x.name)),
        ),
      ),
      ...read("initiative bonuses", initiativeFromText(text)),
      ...read("bonuses to checks", checkBonusFromText(text)),
      ...read("score maximums and other limits", limitsFromText(text)),
    ];
    const train = trainingsFromText(text);
    const asGrants = (type: string, found: (string | undefined)[]) =>
      found.filter((id): id is string => !!id).map((id) => ({ kind: "grant", type, id }) as ARule);
    const grants = [
      ...read(
        "armor training",
        asGrants(
          "Proficiency",
          train.armor.map((k) => ids.armor(k)),
        ),
      ),
      ...read(
        "weapon training",
        asGrants(
          "Proficiency",
          train.weapons.map((k) => ids.weapon(k)),
        ),
      ),
      ...read(
        "tool training",
        asGrants(
          "Proficiency",
          train.tools.map((k) => ids.tool(k)),
        ),
      ),
      ...read(
        "skill training",
        asGrants(
          "Proficiency",
          train.skills.map((k) => ids.skill(k)),
        ),
      ),
      ...read(
        "languages",
        asGrants(
          "Language",
          languagesFromText(text, languages).map((k) => ids.language(k)),
        ),
      ),
    ];
    add.push(...grants);
    if (add.length && !(has("ac:calculation") && add.some((r) => r.kind === "stat" && r.name === "ac:calculation"))) {
      el.rules = [...el.rules, ...add];
      n++;
    }
  }
  return n;
}
