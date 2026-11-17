/**
 * D6 (docs/PLAN-5ETOOLS.md): saved characters moved to 5e.tools ids (RULES_TIER=migrate). Each saved character of the
 * test cache's runs is resolved with both providers, moved (migrate.ts) and resolved with 5e.tools alone; the sheets
 * are compared, what is dropped is listed with why, and the moved character goes through the rules check
 * (migrateReport.ts, the same comparison Soul Forge Test's "Move characters to 5e.tools" makes). The report is
 * <cache>/engine/migrate.md; the gate allows no more changed sheets, drops or rules findings than the last accepted
 * counts (RULES_SNAPSHOT=1 accepts).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { normalizeCharacter, type Character } from "../aurora/character";
import type { ARegistry } from "../aurora/registry";
import { resolve } from "../aurora/engine";
import { randomCharacter } from "../aurora/randomCharacter";
import type { RefClass } from "../aurora/rulesCheck";
import { buildSheet } from "../aurora/sheet";
import { moveAndCompare, moveReport, type MoveResult } from "./migrateReport";
import { loadContentSet, loadTestContent } from "./testContent";

const CACHE = process.env.SOULFORGE_RULES;
const walkDir = (d: string, test: (f: string) => boolean, out: string[] = [], depth = 0): string[] => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) {
      if (depth < 3) walkDir(p, test, out, depth + 1);
    } else if (test(p)) out.push(p);
  }
  return out;
};

it.skipIf(!CACHE || process.env.RULES_TIER !== "migrate")(
  "saved characters moved to 5e.tools ids keep their sheets and the rules",
  () => {
    const both = loadTestContent(CACHE!);
    const five = loadContentSet(CACHE!, "5etools");
    const ref: RefClass[] = existsSync(join(CACHE!, "rules-ref.json"))
      ? JSON.parse(readFileSync(join(CACHE!, "rules-ref.json"), "utf8"))
      : [];
    const files = walkDir(join(CACHE!, "runs"), (p) => p.endsWith("-character.json") && !/import_|big-|full-|rerun-/.test(p)).sort();
    const max = Number(process.env.RULES_DIFF_MAX) || 400;
    const step = Math.max(1, Math.floor(files.length / max));
    // MIGRATE_ONLY=<part of a file name>: just those characters, to a report of their own, without the gate.
    const only = process.env.MIGRATE_ONLY;
    const picked = only
      ? files.filter((f) => only.split(",").some((o) => f.includes(o))).slice(0, max)
      : files.filter((_, i) => i % step === 0).slice(0, max);
    const results: MoveResult[] = [];
    // MIGRATE_FRESH=<count>: characters made now, by the random builder on Aurora's content alone (what a library from
    // before 5e.tools holds), every one within the rules before the move. The saved runs hold many made by older builds
    // that were never legal; on fresh ones every change is the move's.
    if (process.env.MIGRATE_TRACE) (globalThis as { __trace?: string[] }).__trace = [];
    const fresh = Number(process.env.MIGRATE_FRESH) || 0;
    const detail: string[] = [];
    // MIGRATE_DETAIL=3,17 (fresh characters by number, library characters by name): every choice before and after, to
    // <cache>/engine/migrate-detail.txt.
    const wantDetail = (process.env.MIGRATE_DETAIL ?? "").split(",").filter(Boolean);
    const detailFor = (label: string, ch: Character, r: MoveResult) => {
      if (!wantDetail.some((w) => w === label || (!/^\d+$/.test(w) && label.includes(w)))) return;
      const dump = (tag: string, c: Character, reg: ARegistry) => {
        const rr = resolve(c, reg);
        const sh = buildSheet(rr);
        const lines = [
          `  ${tag} scores ${JSON.stringify(sh.abilities.map((a) => a.score))} ac ${sh.ac.value} ${JSON.stringify(sh.ac.parts ?? "")} race ${reg.get(c.race ?? "")?.name} (${reg.get(c.race ?? "")?.source}) bg ${reg.get(c.background ?? "")?.name} (${reg.get(c.background ?? "")?.source}) options ${JSON.stringify(c.options)} extras ${JSON.stringify(c.extras)} prepared ${JSON.stringify(Object.fromEntries(Object.entries(c.prepared ?? {}).map(([k, v]) => [k, (v as string[]).length])))}`,
          `    skills ${JSON.stringify(sh.skills.map((k) => `${k.name} ${k.bonus}${k.level === "expertise" ? "E" : k.level === "proficient" ? "P" : ""}`))}`,
          `    saves ${JSON.stringify(sh.abilities.map((a) => a.save))}`,
          `    worn: ${c.inventory
            .filter((it: Character["inventory"][number]) => it.equipped)
            .map((it: Character["inventory"][number]) => reg.get(it.id)?.name ?? it.custom?.name ?? it.id)
            .join("; ")}`,
        ];
        for (const x of rr.slots)
          lines.push(
            `    [${x.at}] ${x.owner.name} (${x.owner.source}) / ${x.rule.name} <${x.rule.type}> n=${x.rule.number}${x.rule.optional ? " opt" : ""}: ${x.chosen.map((id) => reg.get(id)?.name ?? id).join("; ") || "-"}${x.chosen.some((id) => x.blocked.has(id)) ? " BLOCKED" : ""} | ${x.options.length} options`,
          );
        lines.push(
          `    spells: ${sh.casting.map((c2) => `${c2.name}: ${[...c2.cantripsKnown, ...c2.spells, ...c2.granted].map((p) => reg.get(p.id)?.name ?? p.id).join(", ")}`).join(" || ")}`,
        );
        return lines.join("\n");
      };
      detail.push(
        `CHARACTER ${label}`,
        dump("OLD", ch, both),
        dump("NEW", r.migration.ch, five),
        `  kept ${JSON.stringify(r.migration.kept)} filled ${JSON.stringify(r.migration.filled)} unplaced ${JSON.stringify(r.migration.unplaced)} noTwin ${JSON.stringify(r.migration.noTwin.map((x) => x.name))}`,
        "",
      );
    };
    if (fresh) {
      const aurora = loadContentSet(CACHE!, "aurora");
      let seed = Number(process.env.RULES_SEED) || 20261112;
      const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < fresh; i++) {
        const level = 1 + Math.floor(rng() * 20);
        const ch = normalizeCharacter(
          randomCharacter(aurora, level, { legacy: true, playtest: false, unusual: i % 3 === 0, scifi: false, modern: false }, rng, {
            randomGear: true,
          }),
        );
        const r0 = resolve(ch, aurora);
        const cls = ch.classes.map((c) => `${aurora.get(c.classId)?.name} ${c.level}`).join("/");
        const r = moveAndCompare(ch, both, five, ref);
        detailFor(String(i + 1), ch, r);
        results.push({
          ...r,
          name: `fresh ${i + 1}: ${aurora.get(ch.race ?? "")?.name ?? "?"} ${cls} (${aurora.get(ch.classes[0]?.classId)?.source ?? ""}), ${aurora.get(ch.background ?? "")?.name ?? "?"}; ${r0.slots.length} choices`,
        });
      }
    } else if (process.env.MIGRATE_LIBRARY) {
      // MIGRATE_LIBRARY=<a Soul Forge backup file>: a player's own library (D6's exit check), each character as stored.
      const backup = JSON.parse(readFileSync(process.env.MIGRATE_LIBRARY, "utf8")) as { characters?: { name: string; data: unknown }[] };
      for (const rec of backup.characters ?? []) {
        const ch = normalizeCharacter(rec.data as never);
        const cls = ch.classes.map((c) => `${both.get(c.classId)?.name} ${c.level}`).join("/");
        const r = moveAndCompare(ch, both, five, ref);
        detailFor(rec.name, ch, r);
        results.push({
          ...r,
          name: `${rec.name}: ${both.get(ch.race ?? "")?.name ?? "?"} ${cls}, ${both.get(ch.background ?? "")?.name ?? "?"}`,
        });
      }
    } else
      for (const f of picked) {
        let ch;
        try {
          ch = normalizeCharacter(JSON.parse(readFileSync(f, "utf8")));
        } catch {
          continue;
        }
        const r = moveAndCompare(ch, both, five, ref);
        detailFor(f.split("/").slice(-3).join("/"), ch, r);
        results.push({ ...r, name: f.split("/").slice(-3).join("/") });
      }
    const dir = join(CACHE!, "engine");
    mkdirSync(dir, { recursive: true });
    if (detail.length) writeFileSync(join(dir, "migrate-detail.txt"), detail.join("\n"));
    if (process.env.MIGRATE_TRACE)
      writeFileSync(join(dir, "migrate-trace.txt"), ((globalThis as { __trace?: string[] }).__trace ?? []).join("\n"));
    // A smaller sample (RULES_DIFF_MAX) reports to a file of its own and is not held against the accepted counts.
    const tag = fresh
      ? `-fresh-${fresh}`
      : process.env.MIGRATE_LIBRARY
        ? "-library"
        : only
          ? "-only"
          : process.env.RULES_DIFF_MAX
            ? `-${max}`
            : "";
    writeFileSync(join(dir, `migrate${tag}.md`), moveReport(results));
    if (tag) {
      console.log(
        `MIGRATE${tag} ${results.length}: changed ${results.filter((r) => r.changed.length).length}, dropped ${results.filter((r) => r.dropped.length).length}, rules ${results.filter((r) => r.rules.length).length}, new rules ${results.filter((r) => r.newRules > 0).length}`,
      );
      return;
    }
    const now = {
      changed: results.filter((r) => r.changed.length).length,
      dropped: results.filter((r) => r.dropped.length).length,
      rules: results.filter((r) => r.rules.some((x) => !/kept as built/.test(x))).length,
      newRules: results.filter((r) => r.newRules > 0).length,
    };
    const base = join(dir, "migrate-count.json");
    const was = existsSync(base) ? (JSON.parse(readFileSync(base, "utf8")) as Partial<typeof now>) : {};
    if (!existsSync(base) || process.env.RULES_SNAPSHOT) writeFileSync(base, JSON.stringify(now));
    console.log(
      `MIGRATE ${results.length} characters; changed ${now.changed}, dropped ${now.dropped}, rules ${now.rules} (accepted ${JSON.stringify(was)})`,
    );
    for (const k of Object.keys(now) as (keyof typeof now)[])
      if (typeof was[k] === "number") expect(now[k], k).toBeLessThanOrEqual(was[k]!);
  },
  7200000,
);
