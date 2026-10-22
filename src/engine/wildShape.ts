/**
 * Wild Shape forms as choices, so a druid's beasts are picked in the builder and their stat blocks print with the
 * sheet (as companions do). Every creature from either provider is tagged by what Wild Shape asks of it: a beast, each
 * CR limit it fits ("ws cap8 4" on every beast of CR 1/2 or lower: the limit times 8, a whole number), and whether it
 * flies or swims. The limits are statistics, so they follow the druid's current level and anything that raises them:
 * "wild shape:cap8" (the CR limit times 8), "wild shape:fly" and "wild shape:swim" (1 when allowed). The Druid class
 * sets them from its Wild Shape CR scale (Plutonium's Foundry data: 1/4 from level 2, 1/2 from 4, 1 from 8); flying
 * comes at 8, swimming at 4 in the 2014 rules. Circle of the Moon raises the limit to the druid level divided by 3
 * (at least 1). The choice filter reads them with "$(stat:...)".
 *
 * One choice per step of the Known Forms scale (4 forms from level 2, 6 from 4, 8 from 8). The forms can be changed
 * later, so the filter is the current level's. The choices are optional in both rule sets: the 2014 rules let a druid
 * use any beast seen, and characters imported from other tools carry no forms; the forms picked print.
 */
import type { AElement, ARule } from "../aurora/types";
import { isModern } from "../aurora/edition";

/** The 2024 Druid's table, used when no Foundry data gives the scales. */
const FALLBACK = { forms: [{ at: 2, value: 4 }, { at: 4, value: 6 }, { at: 8, value: 8 }], cr: [{ at: 2, value: 0.25 }, { at: 4, value: 0.5 }, { at: 8, value: 1 }] };
const CAPS = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)];

function challenge(el: AElement): number | undefined {
  const t = String(el.setters.challenge?.value ?? "").trim();
  const m = /^(\d+)(?:\/(\d+))?/.exec(t);
  return m ? Number(m[1]) / (m[2] ? Number(m[2]) : 1) : undefined;
}

export function wildShapeChoices(byId: Map<string, AElement>): number {
  let beasts = 0;
  for (const el of byId.values()) {
    if (el.type !== "Companion" || !/beast/i.test(el.setters.type?.value ?? "")) continue;
    const cr = challenge(el);
    if (cr === undefined) continue;
    const speed = String(el.setters.speed?.value ?? "").toLowerCase();
    const fly = /\bfly\b/.test(speed), swim = /\bswim\b/.test(speed);
    // "ws allow 1": every beast has it, so "(!ws fly||ws allow $(stat:wild shape:fly))" lets flyers in at 1 only.
    const tags = ["ws beast", "ws allow 1", ...CAPS.filter((c) => c >= cr).map((c) => `ws cap8 ${c * 8}`), ...(fly ? ["ws fly"] : []), ...(swim ? ["ws swim"] : [])];
    el.supports = [...el.supports.filter((s) => !s.startsWith("ws ")), ...tags];
    beasts++;
  }
  if (!beasts) return 0;
  const druids = [...byId.values()].filter((e) => e.type === "Class" && e.name === "Druid");
  const scaled = druids.find((d) => d.scales?.["known-forms"] && d.scales?.["wild-shape"]);
  const forms = scaled?.scales?.["known-forms"] ?? FALLBACK.forms;
  const crs = scaled?.scales?.["wild-shape"] ?? FALLBACK.cr;
  const stat = (name: string, value: string, level: number, bonus: string): ARule => ({ kind: "stat", name, value, level, bonus } as ARule);
  const supports = "ws beast,ws cap8 $(stat:wild shape:cap8),(!ws fly||ws allow $(stat:wild shape:fly)),(!ws swim||ws allow $(stat:wild shape:swim))";
  let added = 0;
  for (const cls of druids) {
    if (cls.rules.some((r) => r.kind === "select" && r.type === "Companion" && /^Wild Shape forms/.test(r.name))) continue;
    const modern = isModern(cls);
    const limits: ARule[] = [
      ...crs.map((c) => stat("wild shape:cap8", String(c.value * 8), c.at, "wild shape cap")),
      stat("wild shape:fly", "1", 8, "wild shape fly"),
      stat("wild shape:swim", "1", modern ? forms[0]?.at ?? 2 : 4, "wild shape swim"),
    ];
    const selects: ARule[] = [];
    let had = 0;
    for (const step of forms) {
      const number = step.value - had;
      had = step.value;
      if (number <= 0) continue;
      selects.push({ kind: "select", type: "Companion", name: `Wild Shape forms (level ${step.at})`, supports, number, level: step.at, optional: true, allowReplace: true } as ARule);
    }
    cls.rules = [...cls.rules, ...limits, ...selects];
    added += selects.length;
  }
  // Circle of the Moon (both rule sets, either provider): the CR limit is the druid level divided by 3, at least 1.
  for (const sub of byId.values()) {
    if (sub.type !== "Archetype" || !/^circle of the moon$/i.test(sub.name)) continue;
    if (sub.rules.some((r) => r.kind === "stat" && r.name === "wild shape:cap8")) continue;
    sub.rules = [...sub.rules, { kind: "stat", name: "wild shape:cap8", value: "max(8, floor({level:druid} / 3) * 8)", bonus: "wild shape cap" } as ARule];
  }
  return added;
}
