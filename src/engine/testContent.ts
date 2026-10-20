/** The real content for the engine's tests: Aurora's files and the 5e.tools data folder in the test cache. */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { nodeXml } from "../aurora/fixture";
import { parseElementsXml } from "../aurora/parse";
import { ARegistry } from "../aurora/registry";
import { convertFiveTools } from "../aurora/fivetools";

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
