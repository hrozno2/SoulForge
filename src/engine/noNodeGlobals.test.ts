/**
 * App code runs in the browser, where Node's `process` does not exist: a `process.env` read there throws
 * ("process is not defined"). Found 2026-11-18: the move's trace switch broke the player's Move to 5e.tools. Only tests,
 * and code that checks `typeof process` first, may read it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { walkDir } from "./testContent";

it("app code never reads process.env unguarded", () => {
  const root = join(__dirname, "..");
  const bad = [...walkDir(root, ".ts"), ...walkDir(root, ".tsx")]
    .filter((p) => !/\.test\.tsx?$/.test(p))
    .filter((f) => {
      const text = readFileSync(f, "utf8");
      return /process\.env/.test(text) && !/typeof process/.test(text);
    })
    .map((f) => f.slice(root.length + 1));
  expect(bad).toEqual([]);
});
