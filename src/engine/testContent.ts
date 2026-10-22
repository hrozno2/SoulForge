/** The real content for the engine's tests: Aurora's files and the 5e.tools data folder in the test cache. */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { nodeXml } from "../aurora/fixture";
import { parseElementsXml } from "../aurora/parse";
import { ARegistry } from "../aurora/registry";
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

// A wizard holds species, backgrounds and feats: it has the fewest proficiencies of its own to hide theirs.
const CLASS_24 = "ID_WOTC_PHB24_CLASS_WIZARD";
const CLASS_14 = "ID_WOTC_PHB_CLASS_WIZARD";

/** Which class (at 20) or species (at 1) offers each subclass and subrace, and in which choice. Worked out once. */
const OFFERS = new WeakMap<ARegistry, Map<string, { ch: Character; key: string }>>();
function offeredBy(reg: ARegistry) {
  let m = OFFERS.get(reg);
  if (m) return m;
  m = new Map();
  const ch = newCharacter();
  const roots: Character[] = [
    ...reg.ofType("Class").map((c) => ({ ...ch, classes: [{ classId: c.id, level: 20 }] })),
    ...reg.ofType("Race").map((rc) => ({ ...ch, race: rc.id, classes: [{ classId: /2024/.test(rc.source) ? CLASS_24 : CLASS_14, level: 1 }] })),
  ];
  for (const c of roots) for (const s of resolve(c, reg).slots) if (s.rule.type === "Archetype" || s.rule.type === "Sub Race") for (const o of s.options) if (!m.has(o.id)) m.set(o.id, { ch: c, key: s.key });
  OFFERS.set(reg, m);
  return m;
}

/** A character that has the element, at a level where all of it is open. */
export function holder(reg: ARegistry, el: AElement): Character | undefined {
  const ch = newCharacter();
  const modern = /2024/.test(el.source);
  const fighter = modern ? CLASS_24 : CLASS_14;
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

