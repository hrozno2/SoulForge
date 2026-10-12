/** A random character that makes sense: books the player shows, the best scores where the class needs them, starting gear on. */
import { autoFill } from "./autofill";
import { ABILITY_IDS, newCharacter, type AbilityId, type Character } from "./character";
import { BookIndex, hiddenBy, type ContentFilters } from "./books";
import type { ARegistry } from "./registry";
import type { AElement } from "./types";
import { ItemIndex, addToInventory, autoEquip, ledgerOf, startingPlans, variantItems } from "./startingEquipment";

const SHORT: Record<string, AbilityId> = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" };
const modern = (e?: AElement) => !!e && /PHB24|2024|XPHB/i.test(`${e.id} ${e.source}`);

/** The abilities a class leans on, most important first: its multiclass prerequisite, then its saving throws, then Constitution and Dexterity. */
export function classPriorities(cls: AElement): AbilityId[] {
  const out: AbilityId[] = [];
  const add = (a?: AbilityId) => a && !out.includes(a) && out.push(a);
  for (const m of (cls.multiclass?.requirements ?? "").matchAll(/\[(str|dex|con|int|wis|cha)\w*:\d+\]/gi)) add(SHORT[m[1].toLowerCase()]);
  for (const r of cls.rules) {
    if (r.kind !== "grant") continue;
    const m = /SAVINGTHROW_(STRENGTH|DEXTERITY|CONSTITUTION|INTELLIGENCE|WISDOM|CHARISMA)/i.exec(r.id);
    if (m) add(m[1].toLowerCase() as AbilityId);
  }
  add("constitution");
  add("dexterity");
  return out;
}

export function randomCharacter(reg: ARegistry, level: number, filters: ContentFilters, rng: () => number = Math.random): Character {
  const books = new BookIndex(reg);
  const shown = (e: AElement) => !e.compendiumHidden && !hiddenBy(books.info(e.source), e.source, filters);
  const pick = <T,>(a: T[]): T | undefined => a[Math.floor(rng() * a.length)];
  const pool = (type: string) => {
    // "Custom Background" and "Custom Lineage" are build-your-own templates, not something to roll.
    const all = reg.ofType(type).filter((e) => !e.compendiumHidden && !/^custom\b/i.test(e.name));
    const vis = all.filter(shown);
    return vis.length ? vis : all;
  };
  const cls = pick(pool("Class"));
  // Species and background mostly from the same edition as the class, so the pieces fit together.
  const sameEdition = (type: string) => {
    const p = pool(type);
    const same = p.filter((e) => modern(e) === modern(cls));
    return rng() < 0.8 && same.length ? same : p;
  };
  let c = newCharacter();
  c.race = pick(sameEdition("Race"))?.id;
  c.background = pick(sameEdition("Background"))?.id;
  if (cls) c.classes = [{ classId: cls.id, level: Math.max(1, Math.min(20, Math.floor(level) || 1)) }];
  c.abilityMethod = "standard";
  const first = cls ? classPriorities(cls) : [];
  const rest = ABILITY_IDS.filter((a) => !first.includes(a)).sort(() => rng() - 0.5);
  [...first, ...rest].forEach((a, i) => (c.abilityBase[a] = [15, 14, 13, 12, 10, 8][i]));
  c = autoFill(c, reg, () => rng(), shown);
  // Starting equipment: the first option of the class and of the background, worn and wielded.
  const idx = new ItemIndex(reg);
  const prefer = cls?.source ?? "";
  for (const plan of startingPlans(c, reg)) {
    const v = plan.variants.find((x) => x.choices.length === 0 && x.label && !/gold|gp only/i.test(x.label)) ?? plan.variants[0];
    if (!v) continue;
    const items = variantItems(v, [], idx, prefer, true);
    const label = `${plan.title}, ${v.label.toLowerCase()}`;
    c = addToInventory(c, items, v.gp);
    c = { ...c, equipmentAdded: [...(c.equipmentAdded ?? []), label], equipmentLedger: { ...(c.equipmentLedger ?? {}), [label]: ledgerOf(items, v.gp) } };
  }
  c = autoEquip(c, reg);
  c.name = "Random adventurer";
  return c;
}
