/**
 * Audit E1, the proof: a character's old position-keyed picks, upgraded once at the door, resolve to the same
 * character the walk made when it read those keys itself. Over the saved test runs (thousands of characters older
 * builds saved under position keys), the import corpus and the copy of the user's library when present.
 * RULES_TIER=selections; SELECTIONS_N=<characters from the runs> (default 1500).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { normalizeCharacter, type Character } from "../aurora/character";
import { legacyReads, resolve } from "../aurora/engine";
import { clearTimelineCache } from "./timeline";
import { loadTestContent, walkDir } from "./testContent";

const C = process.env.SOULFORGE_RULES;

it.skipIf(!C || process.env.RULES_TIER !== "selections")(
  "old position keys upgraded at the door resolve as the walk read them",
  () => {
    const reg = loadTestContent(C!);
    const hasOld = (ch: Character) => Object.keys(ch.selections).some((k) => /\|\d+$/.test(k));
    const chars: { from: string; ch: Character }[] = [];
    const add = (from: string, raw: unknown) => {
      try {
        const ch = normalizeCharacter(raw as never);
        if (hasOld(ch)) chars.push({ from, ch });
      } catch {
        /* not a character */
      }
    };
    const runs = walkDir(join(C!, "runs"), ".json")
      .filter((p) => p.endsWith("-character.json"))
      .sort();
    const N = Number(process.env.SELECTIONS_N ?? 1500);
    const step = Math.max(1, Math.floor(runs.length / (N * 2)));
    for (let i = 0; i < runs.length && chars.length < N; i += step)
      add(runs[i].slice(C!.length + 1), JSON.parse(readFileSync(runs[i], "utf8")));
    const userlib = join("node_modules", ".userlib.json");
    if (existsSync(userlib)) {
      const lib = JSON.parse(readFileSync(userlib, "utf8")) as
        { characters?: { name?: string; data?: unknown }[] } | { name?: string; data?: unknown }[];
      for (const rec of Array.isArray(lib) ? lib : (lib.characters ?? [])) add(`library: ${rec.name ?? "?"}`, rec.data ?? rec);
    }
    const view = (ch: Character) => {
      clearTimelineCache(reg);
      const r = resolve(ch, reg);
      return JSON.stringify({
        ids: [...r.ids].sort(),
        slots: r.slots.map((s) => [s.key, s.chosen]),
        picks: r.spellPicks.map((p) => p.id).sort(),
        warnings: r.warnings,
      });
    };
    const differ: string[] = [];
    for (const { from, ch } of chars) {
      legacyReads.on = true;
      let before: string;
      try {
        before = view(ch);
      } finally {
        legacyReads.on = false;
      }
      const after = view(ch);
      if (after !== before) {
        const a = JSON.parse(before) as { slots: [string, string[]][]; ids: string[] };
        const b = JSON.parse(after) as { slots: [string, string[]][]; ids: string[] };
        const bm = new Map(b.slots);
        const lost = a.slots.filter(([k, v]) => JSON.stringify(bm.get(k)) !== JSON.stringify(v)).slice(0, 3);
        differ.push(
          `${from}: ${lost.map(([k, v]) => `${k} was ${v.join(",")} now ${(bm.get(k) ?? ["(no slot)"]).join(",")}`).join(" ; ")} | keys: ${Object.keys(
            ch.selections,
          )
            .filter((k) => lost.some(([lk]) => k.startsWith(lk.split("#")[0] + "|")))
            .join(",")}`,
        );
      }
    }
    clearTimelineCache(reg);
    const fromLibrary = chars.filter((c) => c.from.startsWith("library: ")).length;
    writeFileSync(
      join(C!, "engine", "selections.md"),
      `# Old position keys upgraded at the door (audit E1)\n\n${chars.length} characters with position keys (${fromLibrary} from the copy of the user's library), ${differ.length} resolve differently from the walk that read the keys itself.\n\n${differ.map((d) => `- ${d}`).join("\n")}\n`,
    );
    expect(chars.length).toBeGreaterThan(100);
    expect(differ.slice(0, 20)).toEqual([]);
  },
  3600000,
);
