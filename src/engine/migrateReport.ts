/**
 * Before and after a move to 5e.tools ids (D6): what a player reads off the sheet, what is gone and why, and whether
 * the moved character keeps the rules. Shared by the test tier (migrate.test.ts) and Soul Forge Test's "Move
 * characters to 5e.tools" action, so both say the same thing.
 */
import type { Character } from "../aurora/character";
import { resolve } from "../aurora/engine";
import type { ARegistry } from "../aurora/registry";
import { checkCharacter, type RefClass } from "../aurora/rulesCheck";
import { buildSheet } from "../aurora/sheet";
import { nameKey } from "./concepts";
import { migrateToFiveTools, type Migration } from "./migrate";

/** The numbers and names a player reads off the sheet. Names as either provider writes them (nameKey). */
export function sheetFacts(r: ReturnType<typeof resolve>, reg: ARegistry) {
  const sh = buildSheet(r);
  const names = (t: RegExp) => [...new Set(r.active.filter((a) => t.test(a.el.type)).map((a) => nameKey(a.el.name)))].sort();
  return {
    hp: sh.hp, ac: sh.ac.value, prof: sh.proficiency, speed: sh.speed, init: sh.initiative,
    scores: sh.abilities.map((a) => a.score), saves: sh.abilities.map((a) => a.save), skills: sh.skills.map((k) => k.bonus),
    // A feat by its name alone ("Magic Initiate (Cleric)" is 5e.tools' Magic Initiate), and the 2024 Ability Score
    // Improvement is no feat in Aurora's copy: neither is a change a player sees.
    feats: [...new Set(r.active.filter((a) => a.el.type === "Feat").map((a) => nameKey(a.el.name.replace(/\s*\(.*\)$/, ""))).filter((n) => !/^ability score improvement/.test(n)))].sort(),
    spells: [...new Set(sh.casting.flatMap((c) => [...c.cantripsKnown, ...c.spells, ...c.granted]).map((p) => nameKey(reg.get(p.id)?.name ?? p.id)))].sort(),
    languages: names(/^Language$/),
    // Gear as a count of entries that are on the sheet: the providers name items differently ("Rope, Hempen (50 feet)",
    // "Hempen Rope (50 feet)"); an item with no 5e.tools version is listed as dropped from the migration itself.
    gear: r.character.inventory.filter((it) => !it.id || !!reg.get(it.id)).length,
    companions: [...new Set(r.character.companions.map((c) => nameKey(c.id ? reg.get(c.id)?.name ?? c.name : c.name)))].sort(),
  };
}
export type SheetFacts = ReturnType<typeof sheetFacts>;

export interface MoveResult {
  name: string;
  migration: Migration;
  /** Fields that changed, as "field: before -> after" or "field: lost [..] gained [..]". */
  changed: string[];
  /** What the sheet had and no longer has, with why when the migration knows. */
  dropped: string[];
  /** Rules findings on the moved character (the app's rules check). */
  rules: string[];
}

/** Moves one character and compares it. `from` holds both providers, `to` 5e.tools alone; `ref` is the rules reference. */
export function moveAndCompare(ch: Character, from: ARegistry, to: ARegistry, ref: RefClass[]): MoveResult {
  const r0 = resolve(ch, from);
  const before = sheetFacts(r0, from);
  const migration = migrateToFiveTools(ch, from, to);
  const r1 = resolve(migration.ch, to);
  const after = sheetFacts(r1, to);
  const changed: string[] = [];
  const dropped: string[] = [];
  const why = new Map<string, string>();
  for (const x of migration.noTwin) why.set(nameKey(x.name), `no 5e.tools version (${x.type})`);
  for (const x of migration.noTwin) if (/item|armor|weapon/i.test(x.type)) dropped.push(`gear: ${nameKey(x.name)} (no 5e.tools version)`);
  for (const x of migration.unplaced) why.set(nameKey(x.name), `no 5e.tools choice takes it (was in ${x.choice})`);
  for (const k of Object.keys(before) as (keyof SheetFacts)[]) {
    const a = before[k], b = after[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (Array.isArray(a) && Array.isArray(b) && (typeof a[0] === "string" || typeof b[0] === "string")) {
      const lost = (a as string[]).filter((x) => !(b as string[]).includes(x));
      const got = (b as string[]).filter((x) => !(a as string[]).includes(x));
      changed.push(`${k}: lost [${lost.join(", ")}] gained [${got.join(", ")}]`);
      for (const x of lost) dropped.push(`${k}: ${x}${why.has(x) ? ` (${why.get(x)})` : ""}`);
    } else changed.push(`${k}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
  }
  const rules = [
    ...checkCharacter(r1, buildSheet(r1), ref).map((f) => `${f.rule}: ${f.detail}`),
    ...migration.againstRules.map((x) => `Kept against the 5e.tools rules: ${x}`),
  ];
  return { name: ch.name || "(unnamed)", migration, changed, dropped, rules };
}

/** A readable report over many moved characters: totals first, then each character with anything to say. */
export function moveReport(results: MoveResult[]): string {
  const count = (pick: (r: MoveResult) => string[]) => {
    const m = new Map<string, number>();
    for (const r of results) for (const x of new Set(pick(r).map((s) => s.replace(/ \(.*$/, "")))) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => `- ${k} (${v})`);
  };
  const fieldOf = (s: string) => s.replace(/:.*$/, "");
  const clean = results.filter((r) => !r.changed.length && !r.rules.length).length;
  const lines = [
    "# Characters moved to 5e.tools", "",
    `${results.length} characters: ${clean} unchanged and within the rules, ${results.filter((r) => r.changed.length).length} with a changed sheet, ${results.filter((r) => r.dropped.length).length} with something dropped, ${results.filter((r) => r.rules.length).length} with a rules finding.`,
    "", "The originals are untouched; each moved character is a new copy.", "",
    "## Changed fields", ...count((r) => r.changed.map(fieldOf)), "",
    "## Dropped", ...count((r) => r.dropped), "",
    "## Rules findings", ...count((r) => r.rules.map((x) => x.replace(/: .*$/, ""))), "",
    "## Each character", "",
  ];
  for (const r of results) {
    if (!r.changed.length && !r.rules.length) continue;
    lines.push(`### ${r.name}`);
    if (r.dropped.length) lines.push("Dropped:", ...r.dropped.map((x) => `- ${x}`));
    if (r.changed.length) lines.push("Changed:", ...r.changed.map((x) => `- ${x}`));
    if (r.rules.length) lines.push("Rules:", ...r.rules.map((x) => `- ${x}`));
    lines.push("");
  }
  return lines.join("\n");
}

/** What a moved character's notes say about the move: the older-build notice's "what moved". */
export function moveNote(r: MoveResult): string {
  const parts = [`Moved to 5e.tools content (${new Date().toISOString().slice(0, 10)}).`];
  if (r.migration.moved) parts.push(`${r.migration.moved} entries now point at their 5e.tools versions.`);
  if (r.dropped.length) parts.push("No longer on the sheet:", ...r.dropped.map((x) => `- ${x}`));
  const other = r.changed.filter((c) => !/^(feats|spells|languages|gear|companions):/.test(c));
  if (other.length) parts.push("Numbers that changed:", ...other.map((x) => `- ${x}`));
  if (r.migration.unplaced.length) parts.push("Earlier picks no choice takes now:", ...r.migration.unplaced.map((u) => `- ${u.choice}: ${u.name}`));
  if (r.migration.filled.length) parts.push("Chosen for you, to look over (change them on Build):", ...r.migration.filled.map((x) => `- ${x}`));
  if (r.rules.length) parts.push("Rules to check:", ...r.rules.map((x) => `- ${x}`));
  return parts.join("\n");
}
