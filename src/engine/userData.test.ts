/**
 * Chris's own data (Stage B step 3): the content and saved characters extracted from the app's storage into a folder
 * (USER_DATA=<folder> with elements-master/, 5etools-data/, characters/ and rules-ref.json). Every character is
 * resolved and checked against the rules; findings are listed in <folder>/check.md.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "vitest";
import { loadTestContent } from "./testContent";
import { normalizeCharacter } from "../aurora/character";
import { resolve } from "../aurora/engine";
import { buildSheet } from "../aurora/sheet";
import { checkCharacter, type RefClass } from "../aurora/rulesCheck";

const U = process.env.USER_DATA;

it.skipIf(!U || !existsSync(join(U ?? "", "characters")))("Chris's saved characters on his content", () => {
  const reg = loadTestContent(U!);
  const ref: RefClass[] = JSON.parse(readFileSync(join(U!, "rules-ref.json"), "utf8"));
  const out = [`# Saved characters on Chris's content`, "", `${reg.all().length} elements loaded.`, ""];
  let total = 0;
  for (const f of readdirSync(join(U!, "characters")).filter((x) => x.endsWith(".json")).sort()) {
    const ch = normalizeCharacter(JSON.parse(readFileSync(join(U!, "characters", f), "utf8")));
    const r = resolve(ch, reg);
    const found = checkCharacter(r, buildSheet(r), ref);
    total += found.length;
    out.push(`## ${ch.name || f} (${ch.classes.map((c) => `${reg.get(c.classId)?.name ?? c.classId} ${c.level}`).join("/")})`, "", ...(found.length ? found.map((x) => `- ${x.rule}: ${x.detail}`) : ["Nothing found."]), "");
  }
  writeFileSync(join(U!, "check.md"), out.join("\n"));
  console.log(`USERDATA ${total} findings`);
}, 1800000);
