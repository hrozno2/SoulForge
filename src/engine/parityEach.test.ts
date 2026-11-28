/**
 * Every borrowed mechanic, one by one (Chris 2026-11-28: the engine works out every item, feature and spell on its
 * own). The release reads no Aurora content, so whatever a 5e.tools feature takes from its Aurora twin when both are
 * loaded (src/engine/mechanics.ts) is missing there unless 5e.tools' own data or text gives it. The random sample in
 * parityEffect.test.ts meets most features; this meets each: a character that has the feature is built on 5e.tools
 * alone and with Aurora loaded, and the two sheets are compared. RULES_TIER=parity-each; the report is
 * <cache>/engine/parity-each.md; a feature whose sheet differs for a reason not listed below fails the test.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { autoFill } from "../aurora/autofill";
import type { Character } from "../aurora/character";
import { resolve } from "../aurora/engine";
import type { ARegistry } from "../aurora/registry";
import { buildSheet } from "../aurora/sheet";
import type { AElement } from "../aurora/types";
import { holder, loadContentSet, loadTestContent } from "./testContent";

const C = process.env.SOULFORGE_RULES;
/**
 * Differences that are not a mechanic the release lacks, each read on 2026-11-28. Anything else fails the test.
 */
const EXPLAINED: [RegExp, string][] = [
  [
    /proficiencies\.weapons: only with Aurora: "Weapon Proficiency \((?:Musket|Pistol)\)"/,
    "Aurora lists each firearm; 5e.tools gives firearms as one training",
  ],
  [
    /proficiencies\.armor: only with Aurora: "Armor Proficiency \(Spiked Armor\)"/,
    "the Battlerager's text gives no training with spiked armor; Aurora adds one",
  ],
  [/vision: only with Aurora: "Truesight 120 ft"/, "Mortal Bulwark's truesight lasts a minute; Aurora shows it always"],
  [/vision: only with Aurora: "Superior Darkvision"/, "the same 120 feet, which 5e.tools' text gives as Darkvision 120 ft"],
  [/features\[Font of Magic\]\.usage: undefined ->/, "5e.tools counts the points on the Sorcery Points feature, Aurora on Font of Magic"],
];

const ROOTS = new Set(["Class", "Archetype", "Race", "Sub Race", "Background", "Feat"]);

/** The 5e.tools elements a feature comes with (class, subclass, species, background or feat), nearest first. */
function rootsOf(reg: ARegistry, id: string): AElement[] {
  const parents = new Map<string, string[]>();
  for (const el of reg.all()) {
    if (el.origin !== "5etools") continue;
    for (const r of el.rules) {
      if (r.kind === "grant" && r.id) parents.set(r.id, [...(parents.get(r.id) ?? []), el.id]);
      if (r.kind === "select" && r.supports)
        for (const o of String(r.supports).split("|")) if (o.startsWith("ID_")) parents.set(o, [...(parents.get(o) ?? []), el.id]);
    }
  }
  const out: AElement[] = [];
  const seen = new Set<string>([id]);
  let layer = [id];
  for (let depth = 0; depth < 8 && layer.length; depth++) {
    const next: string[] = [];
    for (const x of layer)
      for (const p of parents.get(x) ?? []) {
        if (seen.has(p)) continue;
        seen.add(p);
        const pe = reg.get(p);
        if (!pe) continue;
        if (ROOTS.has(pe.type)) out.push(pe);
        else next.push(p);
      }
    layer = next;
  }
  const self = reg.get(id);
  return self && ROOTS.has(self.type) ? [self, ...out] : out;
}

function diff(a: unknown, b: unknown, path: string, out: string[]) {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    const key = (x: unknown) => (x && typeof x === "object" && "name" in x ? String((x as { name: unknown }).name) : JSON.stringify(x));
    const am = new Map(a.map((x) => [key(x), x])),
      bm = new Map(b.map((x) => [key(x), x]));
    for (const [k, x] of am) {
      if (bm.has(k)) diff(x, bm.get(k), `${path}[${k}]`, out);
      else out.push(`${path}: only alone: ${k}`);
    }
    for (const k of bm.keys()) if (!am.has(k)) out.push(`${path}: only with Aurora: ${k}`);
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
      diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, out);
    return;
  }
  // A DC, attack or damage note beside a feature's text is Aurora's own; it changes no number.
  const strip = (s: unknown) => String(s).replace(/\s*\((?:DC|attack|damage) [^)]*\)/g, "");
  if (/\.text$/.test(path) && strip(a) === strip(b)) return;
  const [x, y] = [String(JSON.stringify(a)), String(JSON.stringify(b))];
  let at = 0;
  while (at < x.length && x[at] === y[at]) at++;
  out.push(`${path}: ${x.slice(Math.max(0, at - 30), at + 70)} -> ${y.slice(Math.max(0, at - 30), at + 70)}`);
}

it.skipIf(!C || process.env.RULES_TIER !== "parity-each")(
  "each feature that borrows from Aurora gives the same sheet without it",
  () => {
    const alone = loadContentSet(C!, "5etools");
    const both = loadTestContent(C!);
    const differs: string[] = [];
    const unreached: string[] = [];
    const explained = new Map<string, number>();
    let same = 0;
    // A character per root is built once; several features share one.
    const built = new Map<string, Character | undefined>();
    const characterWith = (root: AElement): Character | undefined => {
      if (!built.has(root.id)) {
        const el = alone.get(root.id);
        const base = el ? holder(alone, el) : undefined;
        let seed = 41;
        const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        built.set(root.id, base ? autoFill(base, alone, () => rng()) : undefined);
      }
      return built.get(root.id);
    };
    for (const b of both.mechanics.borrowed) {
      const label = `${b.name} (${alone.get(b.id)?.source ?? "?"}, ${b.id})`;
      let ch: Character | undefined;
      for (const root of rootsOf(alone, b.id)) {
        const c = characterWith(root);
        if (c && resolve(c, alone).ids.has(b.id)) {
          ch = c;
          break;
        }
      }
      if (!ch) {
        unreached.push(`- ${label}: ${b.rules.join(", ")}`);
        continue;
      }
      const out: string[] = [];
      const [sa, sb] = [buildSheet(resolve(ch, alone)), buildSheet(resolve(ch, both))];
      // A speed both give, larger with Aurora: its twin's speed is added to the one 5e.tools' own text or data gives
      // (the Owlin's flight, Gift of the Sea). The release has the one.
      const speeds = (x: typeof sa) => new Map((x.otherSpeeds ?? []).map((o) => [o.kind, o.value] as const));
      const doubled = [...speeds(sb)].filter(([k, v]) => speeds(sa).has(k) && v > speeds(sa).get(k)!).map(([k]) => k);
      const all: string[] = [];
      diff(sa, sb, "sheet", all);
      for (const d of all) {
        const why = doubled.some((k) => d.includes(`"kind":"${k}"`))
          ? "a speed Aurora's twin adds on top of 5e.tools' own"
          : EXPLAINED.find(([re]) => re.test(d))?.[1];
        if (why) explained.set(why, (explained.get(why) ?? 0) + 1);
        else out.push(d);
      }
      if (!out.length) same++;
      else
        differs.push(
          `### ${label}\nBorrowed: ${b.rules.join(", ")}\n${out
            .slice(0, 8)
            .map((x) => `- ${x}`)
            .join("\n")}`,
        );
    }
    const total = both.mechanics.borrowed.length;
    writeFileSync(
      join(C!, "engine", "parity-each.md"),
      [
        "# Each borrowed mechanic, with and without Aurora",
        "",
        `${total} features borrow from Aurora when it is loaded: ${same} give the same sheet without it, ${differs.length} differ, ${unreached.length} were not reached by a test character.`,
        "",
        `## The sheet differs (${differs.length})`,
        ...differs,
        "",
        "## Explained differences (not counted)",
        ...[...explained].map(([why, n]) => `- ${why} (${n})`),
        "",
        `## Not reached (${unreached.length})`,
        ...unreached,
        "",
      ].join("\n"),
    );
    console.log(`${total} borrowed: ${same} same, ${differs.length} differ, ${unreached.length} not reached`);
    expect(differs.map((d) => d.split("\n")[0])).toEqual([]);
  },
  3_600_000,
);
