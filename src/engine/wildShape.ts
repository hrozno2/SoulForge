/**
 * Wild Shape forms as choices, so a druid's beasts are picked in the builder and their stat blocks print with the
 * sheet (as companions do). Every creature from either provider is tagged by what Wild Shape asks of it: a beast, its
 * challenge rating against each limit ("ws cr 1/2" on every beast of CR 1/2 or lower), and whether it flies or swims.
 * Each Druid class gets one choice per step of its Known Forms scale (Plutonium's Foundry data: 4 forms from level 2,
 * 6 from 4, 8 from 8), limited to the Wild Shape CR of that level and without flying before level 8 (and, in the
 * 2014 rules, swimming before level 4). The choices are optional in both rule sets: the 2014 rules let a druid use
 * any beast seen, and characters imported from other tools carry no forms, so a missing pick is never an open choice;
 * the forms picked are the ones whose stat blocks print.
 */
import type { AElement, ARule } from "../aurora/types";
import { isModern } from "../aurora/edition";

/** The 2024 Druid's table, used when no Foundry data gives the scales. */
const FALLBACK = { forms: [{ at: 2, value: 4 }, { at: 4, value: 6 }, { at: 8, value: 8 }], cr: [{ at: 2, value: 0.25 }, { at: 4, value: 0.5 }, { at: 8, value: 1 }] };
const CAPS = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)];
const crText = (n: number) => (n === 0.125 ? "1/8" : n === 0.25 ? "1/4" : n === 0.5 ? "1/2" : String(n));

function challenge(el: AElement): number | undefined {
  const t = String(el.setters.challenge?.value ?? "").trim();
  const m = /^(\d+)(?:\/(\d+))?/.exec(t);
  return m ? Number(m[1]) / (m[2] ? Number(m[2]) : 1) : undefined;
}

export function wildShapeChoices(byId: Map<string, AElement>): number {
  const beasts: { cr: number; fly: boolean; swim: boolean }[] = [];
  for (const el of byId.values()) {
    if (el.type !== "Companion" || !/beast/i.test(el.setters.type?.value ?? "")) continue;
    const cr = challenge(el);
    if (cr === undefined) continue;
    const speed = String(el.setters.speed?.value ?? "").toLowerCase();
    const fly = /\bfly\b/.test(speed), swim = /\bswim\b/.test(speed);
    const tags = ["ws beast", ...CAPS.filter((c) => c >= cr).map((c) => `ws cr ${crText(c)}`), ...(fly ? ["ws fly"] : []), ...(swim ? ["ws swim"] : [])];
    el.supports = [...el.supports.filter((s) => !s.startsWith("ws ")), ...tags];
    beasts.push({ cr, fly, swim });
  }
  if (!beasts.length) return 0;
  const druids = [...byId.values()].filter((e) => e.type === "Class" && e.name === "Druid");
  const scaled = druids.find((d) => d.scales?.["known-forms"] && d.scales?.["wild-shape"]);
  const forms = scaled?.scales?.["known-forms"] ?? FALLBACK.forms;
  const crs = scaled?.scales?.["wild-shape"] ?? FALLBACK.cr;
  const at = (steps: { at: number; value: number }[], level: number) => [...steps].reverse().find((s) => s.at <= level)?.value ?? 0;
  let added = 0;
  for (const cls of druids) {
    const modern = isModern(cls);
    let had = 0;
    for (const step of forms) {
      const cap = at(crs, step.at);
      const noFly = step.at < 8, noSwim = !modern && step.at < 4;
      const number = step.value - had;
      had = step.value;
      if (number <= 0) continue;
      const name = `Wild Shape forms (level ${step.at})`;
      if (cls.rules.some((r) => r.kind === "select" && r.name === name)) continue;
      const supports = ["ws beast", `ws cr ${crText(cap)}`, ...(noFly ? ["!ws fly"] : []), ...(noSwim ? ["!ws swim"] : [])].join(",");
      cls.rules = [...cls.rules, { kind: "select", type: "Companion", name, supports, number, level: step.at, optional: true } as ARule];
      added++;
    }
  }
  return added;
}
