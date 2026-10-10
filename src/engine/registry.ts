import { ABILITIES, type Element, type Pack, type Rule } from "./types";
import { collectVars, parseFormula } from "./formula";

/** Variables available inside formulas. */
export const FORMULA_VARS = new Set<string>([
  "level",
  "prof",
  ...ABILITIES,
  ...ABILITIES.map((a) => `${a}Mod`),
]);

export class Registry {
  private byId = new Map<string, Element>();
  readonly packs: Pack[] = [];

  /** Later packs override earlier ones with the same element id. */
  addPack(pack: Pack): void {
    this.packs.push(pack);
    for (const el of pack.elements) this.byId.set(el.id, el);
  }

  get(id: string): Element | undefined {
    return this.byId.get(id);
  }

  all(): Element[] {
    return [...this.byId.values()];
  }

  ofType(type: Element["type"]): Element[] {
    return this.all().filter((e) => e.type === type);
  }
}

const RULE_KINDS = new Set(["stat", "grant", "proficiency", "choose", "asi", "spellcasting"]);
const ELEMENT_TYPES = new Set(["species", "class", "background", "feat", "feature", "subclass", "spell", "item", "custom"]);

function checkFormula(value: unknown, where: string, errors: string[]): void {
  if (typeof value === "number") return;
  if (typeof value !== "string") {
    errors.push(`${where}: value must be a number or formula string`);
    return;
  }
  try {
    const vars = collectVars(parseFormula(value));
    for (const v of vars) {
      if (!FORMULA_VARS.has(v)) errors.push(`${where}: unknown variable "${v}"`);
    }
  } catch (e) {
    errors.push(`${where}: ${(e as Error).message}`);
  }
}

function checkRule(rule: Rule, where: string, errors: string[]): void {
  if (!rule || typeof rule !== "object" || !RULE_KINDS.has((rule as Rule).kind)) {
    errors.push(`${where}: unknown rule kind`);
    return;
  }
  switch (rule.kind) {
    case "stat":
      if (typeof rule.stat !== "string" || !rule.stat) errors.push(`${where}: stat needs a name`);
      checkFormula(rule.value, where, errors);
      break;
    case "grant":
      if (!Array.isArray(rule.ids)) errors.push(`${where}: grant needs an ids array`);
      break;
    case "proficiency":
      if (typeof rule.target !== "string" || !rule.target.includes(":")) {
        errors.push(`${where}: proficiency target looks like "skill:stealth"`);
      }
      break;
    case "choose":
      if (!rule.id || !Array.isArray(rule.options)) errors.push(`${where}: choose needs id and options`);
      break;
    case "spellcasting":
      if (!["str", "dex", "con", "int", "wis", "cha"].includes(rule.ability) || !["full", "half", "third", "pact"].includes(rule.caster))
        errors.push(`${where}: spellcasting needs ability and caster (full, half, third, pact)`);
      break;
    case "asi":
      if (!Array.isArray(rule.options) || rule.options.length < 2) errors.push(`${where}: asi needs options`);
      break;
  }
}

/** Returns a list of human readable problems. Empty means the pack is safe to load. */
export function validatePack(input: unknown): string[] {
  const errors: string[] = [];
  const pack = input as Pack;
  if (!pack || typeof pack !== "object") return ["Pack must be a JSON object"];
  if (typeof pack.id !== "string" || !pack.id) errors.push("Pack needs an id");
  if (typeof pack.name !== "string" || !pack.name) errors.push("Pack needs a name");
  if (!Array.isArray(pack.elements)) return [...errors, "Pack needs an elements array"];
  const seen = new Set<string>();
  pack.elements.forEach((el, i) => {
    const where = `elements[${i}]${el && el.id ? ` (${el.id})` : ""}`;
    if (!el || typeof el.id !== "string" || !el.id) return void errors.push(`${where}: missing id`);
    if (seen.has(el.id)) errors.push(`${where}: duplicate id inside pack`);
    seen.add(el.id);
    if (typeof el.name !== "string") errors.push(`${where}: missing name`);
    if (!ELEMENT_TYPES.has(el.type)) errors.push(`${where}: unknown type "${el.type}"`);
    (el.rules ?? []).forEach((r, j) => checkRule(r, `${where}.rules[${j}]`, errors));
  });
  return errors;
}
