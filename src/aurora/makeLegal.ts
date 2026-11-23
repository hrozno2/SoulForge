/**
 * "Make it legal" (Chris 2026-11-23): a character the rules check flags is brought within the rules, the player told
 * what changed. What has one safe answer is done for them; everything else is their call, with its options, and
 * nothing is chosen for them. A finding they keep on purpose is a table ruling: remembered on the character, shown
 * apart, never counted as a fault again. The changes can be written into the character's journal.
 */
import { uid, type Character, type JournalEntry } from "./character";
import type { Resolved } from "./engine";
import type { Finding } from "./rulesCheck";
import { applyFix } from "./findingFix";
import { BACKGROUND_2024_ID } from "../engine/backgroundOptions";

export const findingKey = (f: Pick<Finding, "rule" | "detail">) => `${f.rule}: ${f.detail}`;

export interface LegalOption {
  label: string;
  /** What the journal says when this option is taken. */
  says: string;
  apply: (c: Character) => Character;
}
export interface LegalCall {
  key: string;
  finding: Finding;
  options: LegalOption[];
}
export interface LegalPlan {
  /** Done for the player: one safe answer each. */
  auto: { says: string; apply: (c: Character) => Character }[];
  /** The player's to decide, each with its options. */
  calls: LegalCall[];
}

/** Leftovers nobody sees: cleared without asking. Everything else that has a fix is still the player's call. */
const AUTO = /^Earlier choices with no place now$/;

const accept = (f: Finding): LegalOption => ({
  label: "Keep it, as a table ruling",
  says: `Kept as a table ruling: ${findingKey(f)}`,
  apply: (c) => ({ ...c, acceptedFindings: [...new Set([...(c.acceptedFindings ?? []), findingKey(f)])] }),
});

export function planLegal(r: Resolved, findings: Finding[]): LegalPlan {
  const ch = r.character;
  const taken = new Set(ch.acceptedFindings ?? []);
  const plan: LegalPlan = { auto: [], calls: [] };
  for (const f of findings) {
    if (taken.has(findingKey(f))) continue;
    if (AUTO.test(f.rule) && f.fix) {
      const fix = f.fix;
      plan.auto.push({ says: `Cleared earlier choices that have no place now (${f.detail})`, apply: (c) => applyFix(c, fix) });
      continue;
    }
    const options: LegalOption[] = [];
    if (f.rule === "Origin editions mixed") {
      // The background's own optional choice: three points and an origin feat, as the 2024 rules give them.
      const slot = r.slots.find((s) => s.root === "background" && s.options.some((o) => o.id === BACKGROUND_2024_ID));
      const bg = ch.background ? r.reg.get(ch.background)?.name : "the background";
      if (slot)
        options.push({
          label: `Use the 2024 rules for ${bg}`,
          says: `${bg} now follows the 2024 rules: its ability score increases and origin feat are open on Build`,
          apply: (c) => ({
            ...c,
            selections: { ...c.selections, [slot.key]: [BACKGROUND_2024_ID] },
            declined: (c.declined ?? []).filter((k) => k !== slot.key),
          }),
        });
    } else if (f.rule === "More held than two hands can hold") {
      for (const it of ch.inventory.filter((i) => i.equipped && i.id && /^(Weapon|Armor)$/.test(r.reg.get(i.id)?.type ?? ""))) {
        const el = r.reg.get(it.id)!;
        if (el.type === "Armor" && !/shield/i.test(`${el.name} ${el.setters.armor?.value ?? ""}`)) continue;
        options.push({
          label: `Put away ${it.label || el.name}`,
          says: `Put away ${it.label || el.name} (more was held than two hands can hold)`,
          apply: (c) => ({ ...c, inventory: c.inventory.map((i) => (i.uid === it.uid ? { ...i, equipped: false, twoHanded: false } : i)) }),
        });
      }
    } else if (f.fix) {
      const fix = f.fix;
      options.push({
        label: fix.label,
        says: `${fix.label} (${findingKey(f)}): the choice is open again on Build`,
        apply: (c) => applyFix(c, fix),
      });
    }
    options.push(accept(f));
    plan.calls.push({ key: findingKey(f), finding: f, options });
  }
  return plan;
}

/** Applies what is done for the player and the options they picked (by call key); calls with no pick are left. */
export function applyLegal(ch: Character, plan: LegalPlan, picks: Record<string, number>): { character: Character; changes: string[] } {
  let character = ch;
  const changes: string[] = [];
  for (const a of plan.auto) {
    character = a.apply(character);
    changes.push(a.says);
  }
  for (const call of plan.calls) {
    const option = call.options[picks[call.key] ?? -1];
    if (!option) continue;
    character = option.apply(character);
    changes.push(option.says);
  }
  return { character, changes };
}

/** The changes as a journal entry, so they stay with the character. */
export function legalNote(changes: string[], date: string): JournalEntry {
  return { uid: uid(), date, title: "Rules changes", text: changes.map((c) => `- ${c}`).join("\n") };
}

/** A finding the player took back from the table rulings: it counts again. */
export function unaccept(ch: Character, key: string): Character {
  return { ...ch, acceptedFindings: (ch.acceptedFindings ?? []).filter((k) => k !== key) };
}
