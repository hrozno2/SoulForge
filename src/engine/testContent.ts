/** The real content for the engine's tests: Aurora's files and the 5e.tools data folder in the test cache. */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { nodeXml } from "../aurora/fixture";
import { parseElementsXml } from "../aurora/parse";
import { ARegistry } from "../aurora/registry";
import { beastsOnly } from "../aurora/content";
import { convertFiveTools } from "../aurora/fivetools";
import { newCharacter, type Character } from "../aurora/character";
import { resolve } from "../aurora/engine";
import type { AElement } from "../aurora/types";

export const walkDir = (d: string, ext: string, out: string[] = []): string[] => {
  for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walkDir(p, ext, out); else if (p.endsWith(ext)) out.push(p); }
  return out;
};

export function loadTestContent(cache: string): ARegistry {
  const reg = new ARegistry();
  for (const f of walkDir(join(cache, "elements-master"), ".xml").sort((a, b) => Number(/internal|ALE/.test(b)) - Number(/internal|ALE/.test(a)))) {
    try { reg.addFile(parseElementsXml(readFileSync(f, "utf8").replace(/^﻿/, ""), nodeXml, f)); } catch { /* not a content file */ }
  }
  const dir = join(cache, "5etools-data");
  const json: Record<string, unknown> = {};
  if (existsSync(dir)) for (const f of walkDir(dir, ".json")) { const rel = relative(dir, f); if (!/index\.json$/.test(rel) && !rel.startsWith("bestiary")) json[rel] = JSON.parse(readFileSync(f, "utf8")); }
  reg.addElements(convertFiveTools({ files: json as never }));
  reg.build();
  return reg;
}

/**
 * The content sets the tests run on (RULES_CONTENT). The release moves to "5etools" (with the SRD under it); "srd-5.1" and
 * "srd-5.2" are what a new install has; "aurora" is the test app's comparison source; "both" is what the test app loads.
 */
export type ContentSet = "aurora" | "5etools" | "srd" | "srd-5.1" | "srd-5.2" | "both";
export const CONTENT_SETS: ContentSet[] = ["5etools", "srd", "srd-5.1", "srd-5.2", "aurora", "both"];
export function loadContentSet(cache: string, set: ContentSet): ARegistry {
  if (set === "both") return loadTestContent(cache);
  const reg = new ARegistry();
  if (set === "aurora") {
    for (const f of walkDir(join(cache, "elements-master"), ".xml").sort((a, b) => Number(/internal|ALE/.test(b)) - Number(/internal|ALE/.test(a)))) {
      try { reg.addFile(parseElementsXml(readFileSync(f, "utf8").replace(/^\uFEFF/, ""), nodeXml, f)); } catch { /* not a content file */ }
    }
  } else if (set === "5etools") {
    const dir = join(cache, "5etools-data");
    const json: Record<string, unknown> = {};
    // As the app loads it: the bestiary's beasts only (Wild Shape's forms, companions).
    for (const f of walkDir(dir, ".json")) { const rel = relative(dir, f); if (/index\.json$/.test(rel) || /^bestiary\/(?:fluff|foundry|legendary)/.test(rel)) continue; const text = readFileSync(f, "utf8"); json[rel] = JSON.parse(rel.startsWith("bestiary/") ? beastsOnly(text) : text); }
    reg.addElements(convertFiveTools({ files: json as never }));
  } else {
    for (const v of set === "srd" ? ["5.1", "5.2"] : [set.replace("srd-", "")]) reg.addElements((JSON.parse(readFileSync(join("public", "srd", `srd-${v}.json`), "utf8")) as { elements: AElement[] }).elements);
  }
  reg.build();
  return reg;
}

// A wizard holds species, backgrounds and feats: it has the fewest proficiencies of its own to hide theirs.
const WIZARD_IDS = { modern: "ID_WOTC_PHB24_CLASS_WIZARD", classic: "ID_WOTC_PHB_CLASS_WIZARD" };
/** A wizard of those rules, in whichever content is loaded; failing that, any class. */
function holdingClass(reg: ARegistry, modern: boolean): string {
  const known = modern ? WIZARD_IDS.modern : WIZARD_IDS.classic;
  if (reg.get(known)) return known;
  const all = reg.ofType("Class");
  const wizards = all.filter((c) => c.name === "Wizard");
  return (wizards.find((c) => /2024/.test(c.source) === modern) ?? wizards[0] ?? all[0])?.id ?? known;
}

/** Which class (at 20) or species (at 1) offers each subclass and subrace, and in which choice. Worked out once. */
const OFFERS = new WeakMap<ARegistry, Map<string, { ch: Character; key: string }>>();
function offeredBy(reg: ARegistry) {
  let m = OFFERS.get(reg);
  if (m) return m;
  m = new Map();
  const ch = newCharacter();
  const roots: Character[] = [
    ...reg.ofType("Class").map((c) => ({ ...ch, classes: [{ classId: c.id, level: 20 }] })),
    ...reg.ofType("Race").map((rc) => ({ ...ch, race: rc.id, classes: [{ classId: holdingClass(reg, /2024/.test(rc.source)), level: 1 }] })),
  ];
  for (const c of roots) for (const s of resolve(c, reg).slots) if (s.rule.type === "Archetype" || s.rule.type === "Sub Race") for (const o of s.options) if (!m.has(o.id)) m.set(o.id, { ch: c, key: s.key });
  OFFERS.set(reg, m);
  return m;
}

/** A character that has the element, at a level where all of it is open. */
export function holder(reg: ARegistry, el: AElement): Character | undefined {
  const ch = newCharacter();
  const modern = /2024/.test(el.source);
  const fighter = holdingClass(reg, modern);
  if (el.type === "Race") return { ...ch, race: el.id, classes: [{ classId: fighter, level: 1 }] };
  if (el.type === "Background") return { ...ch, background: el.id, classes: [{ classId: fighter, level: 1 }] };
  if (el.type === "Class") return { ...ch, classes: [{ classId: el.id, level: 20 }] };
  if (el.type === "Feat") return { ...ch, classes: [{ classId: fighter, level: 8 }], extras: [el.id] };
  if (el.type === "Archetype" || el.type === "Sub Race") {
    const where = offeredBy(reg).get(el.id);
    if (!where) return undefined;
    return { ...where.ch, selections: { [where.key]: [el.id] } };
  }
  return undefined;
}

