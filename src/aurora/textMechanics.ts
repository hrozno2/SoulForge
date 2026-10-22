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
  m = /you can use (?:this feature|this ability|this trait|(?:[A-Z][\w'’-]* ?)+) (once|twice|thrice|(?:two|three|four|five|\d+) times)\b/.exec(text);
  if (m) return String(count(m[1]));
  return undefined;
}

/** The rest that brings uses back, as the sheet words it; undefined when the text names none. */
export function recoveryFromText(text: string): string | undefined {
  if (/regain (?:one|two|three|\w+) expended uses? when you finish a short rest,? and (?:you )?regain all expended uses when you finish a long rest/i.test(text)) return "Long Rest (one on a Short Rest)";
  if (/when(?:ever)? you finish a short rest, .* can't do so again until you finish a long rest/i.test(text)) return "Long Rest";
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
  const m = new RegExp(`DC (?:8 plus|equals 8 \\+|= 8 \\+|is 8 \\+|of 8 \\+) your (?:(${ABILITY}) modifier (?:and|\\+) (?:your )?proficiency bonus|proficiency bonus \\+ your (${ABILITY}) modifier)`, "i").exec(text);
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
