/**
 * The edition rule for choices (docs/ENGINE-PLAN.md, edition handling). A choice belongs to the edition of its owner,
 * or of the class, species or background it comes from when the owner is an internal or neutral entry. Then:
 * 1. Versions: where an option exists in the choice's edition, only that version is offered (Fireball, Careful
 *    Spell, Commander's Strike, the Champion, a familiar's Cat).
 * 2. No forward mixing: a 2014 choice offers no option that exists only in the 2024 rules; they did not exist yet.
 * 3. Backward mixing is allowed: a 2024 choice may take a 2014-only option, as the 2024 Player's Handbook allows older
 *    content. (The Legacy content filter can still hide it from lists.)
 * Edition-neutral options (skills, languages, tools, sizes, internal entries) are never touched. A pick already made
 * that the rule leaves out stays visible and is marked as against the rules.
 */
import { BACKGROUND_2024_ID } from "./backgroundOptions";
import type { AElement } from "../aurora/types";
import type { Character } from "../aurora/character";
import type { ARegistry } from "../aurora/registry";
import { isModern } from "../aurora/edition";
import { filterNeutral } from "../aurora/books";

export type Ed = "2014" | "2024" | "none";

const ED = new WeakMap<object, Ed>();
export function editionOfElement(e: Pick<AElement, "id" | "source" | "type">): Ed {
  let v = ED.get(e);
  if (v === undefined) {
    v = filterNeutral(e.type, e.source) || /^(Grants|Information|Rule|Item|Weapon|Armor)$/.test(e.type) ? "none" : isModern(e) ? "2024" : "2014";
    ED.set(e, v);
  }
  return v;
}

/**
 * The edition a choice belongs to: that of the class, species or background it comes from, the rules the character
 * is built under there (a 2014 subclass on a 2024 class chooses under the 2024 rules: Aurora gives it 2024 options for
 * that case); the owner's own edition only when the root has none (a feat added on its own).
 */
export function choiceEdition(owner: AElement, root: string, ch: Character, reg: ARegistry): Ed {
  const rootId = root.startsWith("class:") ? root.slice(6) : root === "race" ? ch.race : root === "background" ? ch.background : undefined;
  const el = rootId ? reg.get(rootId) : undefined;
  const fromRoot = el ? editionOfElement(el) : "none";
  // A 2014 background taken with the 2024 rules (backgroundOptions.ts) chooses under them: its origin feat is a 2024
  // one, and its own 2014 options stay (a 2024 choice keeps options that have no 2024 version).
  if (root === "background" && fromRoot === "2014" && Object.values(ch.selections).some((ids) => ids.includes(BACKGROUND_2024_ID))) return "2024";
  // A 2024 element taken under a 2014 background (Aurora's "Origin Feat" variant feature, written for 2014
  // backgrounds) makes its own choices under its rules: the origin feat is a 2024 one.
  if (root === "background" && fromRoot === "2014" && editionOfElement(owner) === "2024") return "2024";
  return fromRoot !== "none" ? fromRoot : editionOfElement(owner);
}

/**
 * Options written to be offered in a choice of the other edition: a background feature (Aurora's 2024 "Origin Feat"
 * as a 2014 background's variant feature). The one place the policy, the rules check and the edition gate read it.
 */
export const offeredAcrossEditions = (o: AElement) => o.type === "Background Feature";

const versionName = (n: string) => n.toLowerCase().replace(/[’‘`]/g, "'").replace(/\s*\((?:20\d\d|legacy|2014|2024)\)\s*$/, "").replace(/\s+/g, " ").trim();

/** The options a choice of edition `ed` offers, and the picks already made that the rule leaves out. */
export function byEdition<T extends AElement>(options: T[], ed: Ed, chosen: string[]): { options: T[]; outOfEdition: Set<string> } {
  const outOfEdition = new Set<string>();
  if (ed === "none") return { options, outOfEdition };
  const inEdition = new Set(options.filter((o) => editionOfElement(o) === ed).map((o) => `${o.type}|${versionName(o.name)}`));
  const keep = options.filter((o) => {
    const oe = editionOfElement(o);
    if (oe === "none" || oe === ed) return true;
    if (offeredAcrossEditions(o)) return true;
    const ok = !inEdition.has(`${o.type}|${versionName(o.name)}`) && ed === "2024";
    if (!ok && chosen.includes(o.id)) { outOfEdition.add(o.id); return true; }
    return ok;
  });
  return { options: keep, outOfEdition };
}

const ABILITY_STATS = new Set(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]);
const SPECIES_TYPES = /^(Race|Sub Race|Race Variant|Racial Trait)$/;

/**
 * Edition rules applied to the content when it loads. Under the 2024 rules a species gives no ability score
 * increase; the background does (PHB 2024, Character Origins). Content that bridges the editions by letting a 2024
 * species raise scores when the background does not (Aurora's "Ability Score Improvement Option") loses that choice.
 * Returns the ids changed.
 */
export function applyEditionPolicy(byId: Map<string, AElement>): string[] {
  const changed: string[] = [];
  for (const el of byId.values()) {
    if (!SPECIES_TYPES.test(el.type) || editionOfElement(el) !== "2024") continue;
    const rules = el.rules.filter((r) => !((r.kind === "select" && r.type === "Ability Score Improvement") || (r.kind === "stat" && ABILITY_STATS.has(r.name.toLowerCase()))));
    if (rules.length !== el.rules.length) { el.rules = rules; changed.push(el.id); }
  }
  return changed;
}
