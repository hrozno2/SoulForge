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
  const info: RollInfo = { saves: [], damage: [], healing: [], cantripScaling: /when you reach (?:5th|level 5)/i.test(text) };
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
