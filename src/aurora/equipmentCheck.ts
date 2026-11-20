/**
 * W5 (E2.1): starting equipment within what the first class and the background give, judged from the record each take
 * leaves (`equipmentLedger`) against the content as it is now. A character takes the equipment of its first class
 * and of its background, each once, the gear or the gold (PHB 2014 chapter 5, "Starting Equipment"; PHB 2024 chapter
 * 2, "Choose Starting Equipment"); multiclassing gives none (both Player's Handbooks, Multiclassing). The player's own
 * additions (a pack or gear added by hand) carry no such record and are theirs.
 */
import type { Character } from "./character";
import type { ARegistry } from "./registry";
import { anyWeaponKind, expandPack, ItemIndex, resolveRef, startingPlans, weaponChoices, type EquipVariant } from "./startingEquipment";

export interface EquipmentFinding {
  rule: string;
  detail: string;
}

const RULE = "Starting equipment";
const lc = (s: string) => s.toLowerCase();

/** The most gold a variant gives: its own, or the highest roll of its dice. */
function maxGold(v: EquipVariant): number {
  if (!v.goldRoll) return v.gp;
  const m = /^(\d+)d(\d+)$/.exec(v.goldRoll.dice);
  return m ? Number(m[1]) * Number(m[2]) * v.goldRoll.times : Infinity;
}

export function checkStartingEquipment(ch: Character, reg: ARegistry): EquipmentFinding[] {
  const ledger = ch.equipmentLedger ?? {};
  const labels = Object.keys(ledger);
  if (!labels.length) return [];
  const out: EquipmentFinding[] = [];
  const plans = startingPlans(ch, reg);
  const mine = new Set(plans.map((p) => lc(p.title)));
  const titleOf = (label: string) => label.replace(/, [^,]*$/, "");
  // Equipment of a class or background that is not this character's first class or background.
  const given = new Set([...reg.ofType("Class"), ...reg.ofType("Background")].map((e) => lc(e.name)));
  for (const label of labels) {
    const t = lc(titleOf(label));
    if (label.includes(", ") && given.has(t) && !mine.has(t)) {
      const later = ch.classes.slice(1).some((c) => lc(reg.get(c.classId)?.name ?? "") === t);
      out.push({
        rule: RULE,
        detail: `${titleOf(label)}'s starting equipment${later ? ": a class taken by multiclassing gives none" : ", which is neither this character's first class nor its background"}`,
      });
    }
  }
  let idx: ItemIndex | undefined;
  const prefer = ch.classes[0] ? (reg.get(ch.classes[0].classId)?.source ?? "") : "";
  for (const plan of plans) {
    const taken = labels.filter((l) => lc(l).startsWith(`${lc(plan.title)}, `));
    if (taken.length > 1)
      out.push({ rule: RULE, detail: `${plan.title}'s starting equipment taken ${taken.length} times (${taken.join("; ")})` });
    for (const label of taken) {
      const v = plan.variants.find((x) => lc(`${plan.title}, ${x.label}`) === lc(label));
      // A take the content no longer names (an option renamed since) cannot be judged.
      if (!v) continue;
      const entry = ledger[label];
      if (entry.gp > maxGold(v)) out.push({ rule: RULE, detail: `${label}: ${entry.gp} gp, the most it gives is ${maxGold(v)} gp` });
      // Weapons and armor are among those the option names (a named one, one of a kind it lets the player pick, or
      // one inside a pack it gives).
      const arms = entry.items.filter((i) => i.id && /^(Weapon|Armor)$/.test(reg.get(i.id)?.type ?? ""));
      if (!arms.length) continue;
      idx ??= new ItemIndex(reg);
      const allowed = new Set<string>();
      const allow = (id: string | undefined) => id && allowed.add(id);
      for (const ref of [...v.fixed, ...v.choices.flatMap((g) => g.options.flat())]) {
        const kind = anyWeaponKind(ref.text);
        if (kind) for (const w of weaponChoices(reg, kind)) allow(w.id);
        const got = resolveRef(ref, idx, prefer);
        allow(got.el?.id);
        if (got.el?.extract?.length) for (const x of expandPack(got.el, reg)) allow(x.el?.id);
      }
      if (v.packId && reg.get(v.packId)) for (const x of expandPack(reg.get(v.packId)!, reg)) allow(x.el?.id);
      // The same item under another book's id (a longsword is a longsword) counts by name.
      const names = new Set([...allowed].map((id) => lc(reg.get(id)?.name ?? "")));
      for (const i of arms)
        if (!allowed.has(i.id) && !names.has(lc(reg.get(i.id)?.name ?? "")))
          out.push({ rule: RULE, detail: `${label}: ${i.name} is not among what it gives` });
    }
  }
  return out;
}
