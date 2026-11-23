/**
 * One word per thing in the interface text (Chris 2026-11-23, plan item 8). The words the player reads:
 *
 * - species: never "race" (the engine's type names "Race" and "Sub Race" are ids, not text).
 * - space: the place on the board a card goes; never "tile" (a class name in the styles only).
 * - choice: a decision the rules give; pick: what was chosen for it; option: something a list offers. The engine's
 *   word "element" is not said to the player, apart from Aurora's own files on the Content tab and in homebrew.
 * - "What this table uses": the content switches, never "content filters".
 *
 * This reads the interface's source for prose (text between tags, and quoted text with a space in it) and fails on
 * a word that belongs to another thing, so the next string written keeps to the list.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(__dirname);

/** The prose on each line of a file: quoted text holding a space, and text between tags. Comments are left out. */
function prose(file: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  let block = false;
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((raw, i) => {
      let l = raw;
      if (block) {
        if (!l.includes("*/")) return;
        block = false;
        l = l.slice(l.indexOf("*/") + 2);
      }
      if (/^\s*(\/\/|\*|\/\*)/.test(l)) {
        if (l.includes("/*") && !l.includes("*/")) block = true;
        return;
      }
      l = l.replace(/\s\/\/ .*$/, "").replace(/\{\/\*.*?\*\/\}/g, "");
      if (/^\s*import /.test(l)) return;
      for (const m of l.matchAll(/"([^"]*)"|`([^`]*)`/g)) {
        const t = m[1] ?? m[2] ?? "";
        if (/\s/.test(t.trim()) && !/className=\{?$/.test(l.slice(0, m.index))) out.push({ line: i + 1, text: t });
      }
      const bare = l.replace(/"[^"]*"|`[^`]*`|\{[^{}]*\}/g, " ");
      for (const m of bare.matchAll(/>([^<>{}]+)</g)) out.push({ line: i + 1, text: m[1] });
      // A line of running text inside a tag: no code punctuation on it.
      if (/^\s*[A-Za-z].*[a-z.,:;]\s*$/.test(bare) && !/[=;{}()[\]]|=>/.test(bare)) out.push({ line: i + 1, text: bare.trim() });
    });
  return out;
}

const files = readdirSync(DIR).filter((f) => /\.tsx$/.test(f) && !/\.test\./.test(f));

/** Words that belong to another thing, with the files where the word is the right one. */
const RULES: { word: RegExp; say: string; except?: RegExp; allow?: RegExp }[] = [
  { word: /\braces?\b/i, say: "species", allow: /races\.json|\$\{|[a-z]\.race\b|race:/ },
  { word: /\btiles?\b/i, say: "space", allow: /[a-z]-tile\b|tile-/ },
  { word: /\belements?\b/i, say: "option", except: /^(ContentTab|HomebrewBuilder)\.tsx$/ },
  { word: /\bcontent filters?\b/i, say: "what this table uses" },
];

describe("one word per thing in the interface text", () => {
  it("finds prose to read", () => {
    expect(files.length).toBeGreaterThan(40);
    expect(prose(join(DIR, "Journal.tsx")).some((p) => /New entry/.test(p.text))).toBe(true);
  });
  for (const rule of RULES)
    it(`says "${rule.say}", not ${rule.word.source}`, () => {
      const found: string[] = [];
      for (const f of files) {
        if (rule.except?.test(f)) continue;
        for (const p of prose(join(DIR, f)))
          if (rule.word.test(p.text) && !rule.allow?.test(p.text)) found.push(`${f}:${p.line}: ${p.text.trim().slice(0, 120)}`);
      }
      expect(found).toEqual([]);
    });
});
