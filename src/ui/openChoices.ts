/**
 * What is still open on a character: the one list behind the Build board's status panel and the top bar's Build badge,
 * so the two can never disagree (C7.21: the badge said 2 where the panel said 3, and could say 0 with spells unprepared).
 */
import { stillToChoose, type Resolved } from "../aurora/engine";
import { hpConfigured, type Character } from "../aurora/character";
import { prepareTarget, type SheetData } from "../aurora/sheet";
import { startingPlans, type EquipPlan } from "../aurora/startingEquipment";
import { tabOfSlot } from "./Slots";

export type BoardKind = "race" | "class" | "background" | "magic" | "equipment";

export interface OpenChoice {
  kind: BoardKind;
  text: string;
  /** The way there opens the kind's list (a missing pick), not its card. */
  list: boolean;
  /** Its line goes somewhere of its own rather than to the kind's card. */
  target?: "prepare" | "hp";
  label?: string;
}

/** How far along the starting gear is, 0 to 1, for the backpack. */
export function packFillOf(ch: Character, plans: EquipPlan[]): number {
  const added = ch.equipmentAdded ?? [];
  const have = new Set(ch.inventory.map((i) => i.id));
  // What each pack put in that is still in the bag.
  const kept = (label: string) => {
    const items = ch.equipmentLedger?.[label]?.items ?? [];
    return items.length ? items.filter((i) => have.has(i.id)).length / items.length : 1;
  };
  if (plans.length) {
    const per = plans.map((p) => { const mine = added.filter((l) => l.startsWith(`${p.title}, `)); return mine.length ? Math.max(...mine.map(kept)) : 0; });
    const extra = Math.min(0.15, ch.inventory.filter((i) => !added.some((l) => (ch.equipmentLedger?.[l]?.items ?? []).some((x) => x.id === i.id))).length * 0.03);
    return Math.min(1, per.reduce((a, b) => a + b, 0) / plans.length + extra);
  }
  return Math.min(1, ch.inventory.length / 12);
}

/** Spells to prepare, against what the caster classes allow. */
export function preparedCount(r: Resolved, sheet: SheetData): { have: number; need: number } {
  const preparing = sheet.casting.filter((c) => c.prepare && c.prepareMax > 0);
  return {
    need: preparing.reduce((n, c) => n + prepareTarget(r, c), 0),
    have: preparing.reduce((n, c) => n + Math.min(prepareTarget(r, c), (r.character.prepared[c.name] ?? []).length), 0),
  };
}

export function openChoices(r: Resolved, sheet: SheetData): OpenChoice[] {
  const ch = r.character;
  const kindOfSlot = (sl: Resolved["slots"][number]): BoardKind => (tabOfSlot(sl) === "magic" ? "magic" : sl.root === "race" ? "race" : sl.root === "background" ? "background" : "class");
  const { have, need } = preparedCount(r, sheet);
  const plans = startingPlans(ch, r.reg);
  // Missing picks first, then each open choice.
  return [
    ...(!ch.race ? [{ kind: "race" as const, text: "Choose a species", list: true }] : []),
    ...(!ch.classes.length ? [{ kind: "class" as const, text: "Choose a class", list: true }] : []),
    ...(!ch.background ? [{ kind: "background" as const, text: "Choose a background", list: true }] : []),
    ...r.slots.filter((sl) => stillToChoose(sl, r)).map((sl) => ({ kind: kindOfSlot(sl), text: `${sl.rule.name}: ${sl.rule.number - sl.chosen.length} to choose`, list: false })),
    // Spells to prepare: the build is not ready to play while a caster has none prepared (C7.18: "every choice is
    // made" stood beside a spellbook missing its prepared spells). The line opens the prepare list.
    ...(have < need ? [{ kind: "magic" as const, text: `Prepare spells: ${have} of ${need}`, list: false, target: "prepare" as const }] : []),
    // Hit points: fixed or rolled, until the player picks (C7.10).
    ...(ch.classes.length && !hpConfigured(ch) ? [{ kind: "class" as const, text: "Hit points: choose fixed or rolled", list: false, label: "Hit points", target: "hp" as const }] : []),
    ...(plans.length && packFillOf(ch, plans) < 1 && !plans.every((p) => (ch.equipmentAdded ?? []).some((l) => l.startsWith(`${p.title}, `))) ? [{ kind: "equipment" as const, text: "Starting equipment", list: false }] : []),
  ];
}
