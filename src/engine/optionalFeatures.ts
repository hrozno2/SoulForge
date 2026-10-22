/**
 * Optional class features (Tasha's Cauldron of Everything) as choices. Aurora's content delivers them as hidden
 * inventory items ("Ranger, LV01: Deft Explorer", category "Optional Class Features") that grant the feature when
 * worn, so a builder never sees them. Here each becomes an optional choice on the class it belongs to, at the level
 * its grant names ([level:ranger:1]). Taking it grants the feature, which turns off the feature it replaces the way
 * Aurora's content already does (Natural Explorer requires the replacement marker Deft Explorer grants). 5e.tools'
 * optional features are made choices by the converter. Only 2014 classes: the 2024 classes have none.
 */
import type { AElement, ARule } from "../aurora/types";
import { isModern } from "../aurora/edition";

export function optionalFeatureChoices(byId: Map<string, AElement>): number {
  const classes = new Map<string, AElement[]>();
  for (const el of byId.values()) if (el.type === "Class" && el.origin !== "5etools" && !isModern(el)) (classes.get(el.name.toLowerCase()) ?? classes.set(el.name.toLowerCase(), []).get(el.name.toLowerCase())!).push(el);
  let added = 0;
  for (const item of byId.values()) {
    if (!/optional class features/i.test(item.setters.category?.value ?? "")) continue;
    for (const g of item.rules) {
      if (g.kind !== "grant" || !g.id) continue;
      const m = /\[level:([a-z ]+):(\d+)\]/i.exec(g.requirements ?? "");
      const feature = byId.get(g.id);
      if (!m || !feature) continue;
      const level = Number(m[2]);
      for (const cls of classes.get(m[1].toLowerCase()) ?? []) {
        // The package is the option: it grants the feature and the marker that turns the replaced feature off.
        const name = `Optional class feature: ${feature.name} (${cls.name} ${level})`;
        if (cls.rules.some((r) => r.kind === "select" && r.name === name)) continue;
        cls.rules = [...cls.rules, { kind: "select", type: item.type, name, supports: item.id, number: 1, level, optional: true } as ARule];
        added++;
      }
    }
  }
  return added;
}
