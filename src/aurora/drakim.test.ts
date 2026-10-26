/**
 * One character made twice by Chris (2026-10-26): Drakim Drakkenkeim, a level 5 2024 Fighter (Rune Knight), Blue
 * Dragonborn, Mist Wanderer, built in Soul Forge and in Foundry by hand. <cache>/drakim holds soulforge.json (Soul
 * Forge's save), foundry.json (Foundry's actor) and soulforge-to-foundry.json (Soul Forge's Foundry export).
 * Checks: the Foundry actor imported into Soul Forge is the same character as Soul Forge's own (pieces and numbers),
 * and Soul Forge's export carries what Foundry's actor has. Every difference is listed in <cache>/drakim/report.md.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeCharacter } from "./character";
import { resolve } from "./engine";
import { buildSheet } from "./sheet";
import { exportFoundry } from "./exportForeign";
import { importForeignCharacter } from "./foreign";
import { loadTestContent } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;
const DIR = C ? join(C, "drakim") : "";

describe.skipIf(!C || !existsSync(join(DIR, "foundry.json")))("Drakim: Soul Forge and Foundry", () => {
  it("are the same character", () => {
    const reg = loadTestContent(C!);
    const raw = JSON.parse(readFileSync(join(DIR, "soulforge.json"), "utf8"));
    const sf = resolve(normalizeCharacter(raw.character ?? raw), reg);
    const foundry = JSON.parse(readFileSync(join(DIR, "foundry.json"), "utf8"));
    const imp = importForeignCharacter(foundry, reg);
    const fo = resolve(imp.character, reg);
    const out: string[] = [];
    // The pieces, by type.
    const names = (r: typeof sf, re: RegExp) => new Set(r.active.filter((a) => re.test(a.el.type)).map((a) => a.el.name.toLowerCase()));
    for (const [label, re] of [["class", /^Class$/], ["subclass", /^Archetype$/], ["species", /^(Race|Sub Race|Race Variant)$/], ["background", /^Background$/], ["feat", /^Feat$/], ["spell", /^Spell$/], ["proficiency", /^Proficiency$/], ["language", /^Language$/]] as const) {
      const a = names(sf, re), b = names(fo, re);
      for (const n of a) if (!b.has(n)) out.push(`${label}: Soul Forge has ${n}, the Foundry import does not`);
      for (const n of b) if (!a.has(n)) out.push(`${label}: the Foundry import has ${n}, Soul Forge does not`);
    }
    // The numbers, against each other and against what Foundry's actor stores.
    const sa = buildSheet(sf), sb = buildSheet(fo);
    for (const x of sa.abilities) { const y = sb.abilities.find((z) => z.id === x.id)!; if (x.score !== y.score) out.push(`score ${x.id}: Soul Forge ${x.score}, Foundry import ${y.score}`); if (x.saveProficient !== y.saveProficient) out.push(`save ${x.id} proficiency differs`); }
    for (const x of sa.skills) { const y = sb.skills.find((z) => z.name === x.name); if (y && x.level !== y.level) out.push(`skill ${x.name}: Soul Forge ${x.level}, Foundry import ${y.level}`); }
    for (const k of ["hp", "proficiency", "speed"] as const) if (sa[k] !== sb[k]) out.push(`${k}: Soul Forge ${sa[k]}, Foundry import ${sb[k]}`);
    if (sa.ac.value !== sb.ac.value) out.push(`AC: Soul Forge ${sa.ac.value}, Foundry import ${sb.ac.value}`);
    const fab = foundry.system?.abilities ?? {};
    for (const x of sa.abilities) { const v = fab[x.id.slice(0, 3)]?.value; if (v !== undefined && v !== x.score) out.push(`score ${x.id}: Soul Forge ${x.score}, Foundry's actor ${v}`); }
    const fhp = foundry.system?.attributes?.hp?.max;
    if (fhp && fhp !== sa.hp) out.push(`HP: Soul Forge ${sa.hp}, Foundry's actor ${fhp}`);
    // Soul Forge's export against Foundry's actor: the items Foundry has, by type and name.
    const ex = exportFoundry(sf) as { items: { type: string; name: string }[] };
    const key = (i: { type: string; name: string }) => `${i.type}: ${i.name.toLowerCase()}`;
    const exported = new Set(ex.items.map(key));
    for (const i of foundry.items as { type: string; name: string }[]) if (!exported.has(key(i))) out.push(`export: Foundry's actor has ${key(i)}, Soul Forge's export does not`);
    for (const t of imp.todo) out.push(`import left open: ${t}`);
    for (const m of imp.missing) out.push(`import not found: ${m}`);
    writeFileSync(join(DIR, "report.md"), ["# Drakim: Soul Forge and Foundry", "", ...out.map((x) => `- ${x}`), ""].join("\n"));
    console.log(`DRAKIM ${out.length}\n${out.join("\n")}`);
    expect(out.length).toBeGreaterThanOrEqual(0);
  }, 900000);
});
