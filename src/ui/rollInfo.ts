/**
 * Pulls the rollable parts out of a description: attack rolls, damage and healing dice, saving throws and DCs.
 * It reads plain English text, so it finds what the usual wording says and nothing else.
 */
export interface RollInfo {
  attack?: "spell" | "weapon";
  saves: { ability: string; dc?: number }[];
  damage: { expr: string; type: string }[];
  healing: string[];
  /** Extra dice per slot level above the spell's own level. */
  upcast?: { dice: string; perLevel: boolean };
  /** True when the text says the damage grows at 5th, 11th and 17th level. */
  cantripScaling: boolean;
}

const ABILITIES = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];

export interface DcContext {
  spellDc?: number;
  proficiency: number;
  /** Ability modifiers by full name, lower case. */
  mods: Record<string, number>;
  /** The character's level, for dice the text raises by level ("increases to 3d6 at 6th level"). */
  level?: number;
}

/**
 * Dice a feature's text raises at set character levels: "The damage increases to 3d6 at 6th level, 4d6 at 11th level,
 * and 5d6 at 16th level" (the 2014 Dragonborn's breath), or "when you reach character levels 5 (2d10), 11 (3d10), and
 * 17 (4d10)" (2024). A level-9 Dragonborn's breath showed its first-level 2d6.
 */
export function levelSteps(text: string): { level: number; expr: string }[] {
  const out: { level: number; expr: string }[] = [];
  const a = /increases? to ((?:\d+d\d+ at \d+(?:st|nd|rd|th) level(?:, (?:and )?| and )?)+)/i.exec(text);
  if (a) for (const m of a[1].matchAll(/(\d+d\d+) at (\d+)(?:st|nd|rd|th) level/gi)) out.push({ level: Number(m[2]), expr: m[1] });
  const b = /(?:character )?levels? ((?:\d+ \(\d+d\d+\)(?:, (?:and )?| and )?)+)/i.exec(text);
  if (b) for (const m of b[1].matchAll(/(\d+) \((\d+d\d+)\)/g)) out.push({ level: Number(m[1]), expr: m[2] });
  return out.sort((x, y) => x.level - y.level);
}

export function plain(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** The DC the text names, or one worked out from "8 + your proficiency bonus + your X modifier". */
export function findDc(text: string, ctx: DcContext): number | undefined {
  const fixed = /\bDC\s*(\d{1,2})\b/i.exec(text);
  if (fixed) return Number(fixed[1]);
  const calc = /8\s*\+\s*your proficiency bonus\s*\+\s*your (\w+) modifier/i.exec(text);
  if (calc) return 8 + ctx.proficiency + (ctx.mods[calc[1].toLowerCase()] ?? 0);
  if (/your (?:spell save DC|spellcasting save DC)/i.test(text) && ctx.spellDc !== undefined) return ctx.spellDc;
  return undefined;
}

export function parseRollInfo(html: string, ctx: DcContext): RollInfo {
  const text = plain(html);
  const info: RollInfo = { saves: [], damage: [], healing: [], cantripScaling: /when you reach (?:5th|levels? 5)/i.test(text) };
  if (/spell attack/i.test(text)) info.attack = "spell";
  else if (/weapon attack/i.test(text)) info.attack = "weapon";
  const dc = findDc(text, ctx);
  const seen = new Set<string>();
  for (const m of text.matchAll(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+(?:saving throw|save)/gi)) {
    const a = ABILITIES.find((x) => x.toLowerCase() === m[1].toLowerCase())!;
    if (!seen.has(a)) {
      seen.add(a);
      info.saves.push({ ability: a, dc });
    }
  }
  const dmgSeen = new Set<string>();
  for (const m of text.matchAll(/(\d+d\d+(?:\s*\+\s*\d+)?)\s+(?:([a-z]+)\s+)?damage/gi)) {
    const expr = m[1].replace(/\s+/g, "");
    const type = (m[2] ?? "").toLowerCase();
    const key = `${expr}|${type}`;
    if (!dmgSeen.has(key) && !/^(additional|extra|more|of)$/.test(type)) {
      dmgSeen.add(key);
      info.damage.push({ expr, type });
    }
  }
  // The dice the text raises by character level replace the first-level dice of the same size.
  const steps = levelSteps(text);
  if (steps.length && ctx.level !== undefined) {
    const now = [...steps].reverse().find((x) => x.level <= ctx.level!);
    const size = /d\d+/.exec(steps[0].expr)?.[0];
    const stepExprs = new Set(steps.map((x) => x.expr));
    // The steps themselves are named in the text as damage ("3d6 at 6th level"): they are not rolls of their own.
    info.damage = info.damage.filter((d, i) => i === info.damage.findIndex((x) => x.expr.endsWith(size ?? "?") && !stepExprs.has(x.expr)) || !stepExprs.has(d.expr));
    const first = info.damage.find((d) => size && new RegExp(`^\\d+${size}$`).test(d.expr));
    if (now && first) first.expr = now.expr;
    // The steps are applied: a cantrip whose text lists them ("levels 5 (2d10), 11 (3d10)") is not scaled a second time.
    info.cantripScaling = false;
  }
  for (const m of text.matchAll(/(?:regains?|restores?|heals?|hit points equal to|gains?)\s+(?:a number of hit points equal to\s+|(?:temporary )?hit points equal to\s+)?(\d+d\d+(?:\s*\+\s*\d+)?)/gi)) info.healing.push(m[1].replace(/\s+/g, ""));
  const up = /(?:damage|healing)[^.]*?(?:increases?|extra)[^.]*?by\s+(\d+d\d+)[^.]*?(?:each|every)[^.]*?(?:slot )?level above/i.exec(text) ?? /(\d+d\d+)\s+for each (?:slot )?level above/i.exec(text);
  if (up) info.upcast = { dice: up[1], perLevel: true };
  return info;
}

/** Applies cantrip tiers and slot upcasting to a dice expression. */
export function scaleDamage(expr: string, o: { cantrip: boolean; cantripScaling: boolean; characterLevel: number; castLevel: number; spellLevel: number; upcast?: RollInfo["upcast"] }): string {
  const m = /^(\d+)d(\d+)(.*)$/.exec(expr);
  if (!m) return expr;
  let count = Number(m[1]);
  if (o.cantrip && o.cantripScaling) count *= 1 + (o.characterLevel >= 5 ? 1 : 0) + (o.characterLevel >= 11 ? 1 : 0) + (o.characterLevel >= 17 ? 1 : 0);
  if (!o.cantrip && o.upcast && o.castLevel > o.spellLevel) {
    const u = /^(\d+)d(\d+)$/.exec(o.upcast.dice);
    if (u && u[2] === m[2]) count += Number(u[1]) * (o.castLevel - o.spellLevel);
  }
  return `${count}d${m[2]}${m[3]}`;
}
