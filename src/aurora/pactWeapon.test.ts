/**
 * The 2024 Pact of the Blade's Charisma is for the bonded weapon, "a Simple or Martial Melee weapon" or a magic weapon
 * (Plutonium restricts it to melee weapons as well): never a plain ranged weapon. Found by the FastCharacter run
 * (fc145, 2026-11-18): a Pact of the Blade warlock's Light Crossbow attacked with Charisma.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importFastCharacter } from "./foreign";
import { resolve } from "./engine";
import { buildSheet } from "./sheet";
import { loadTestContent } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;

describe.skipIf(!C)("Pact of the Blade", () => {
  it("lends Charisma to melee weapons, not to a plain ranged one", () => {
    const reg = loadTestContent(C!);
    const res = importFastCharacter(readFileSync(join(C!, "fastcharacter", "raw", "fc145.txt"), "utf8"), reg);
    const sh = buildSheet(resolve(res.character, reg));
    const mod = (id: string) => sh.abilities.find((a) => a.id === id)!.mod;
    const line = (n: string) => sh.attacksCarried.find((a) => a.name === n)!;
    expect(line("Light Crossbow").bonus).toBe(mod("dexterity") + sh.proficiency);
    expect(line("Dagger").bonus).toBe(Math.max(mod("dexterity"), mod("charisma")) + sh.proficiency);
  }, 600000);

  // A list of options is not a feature the character has: the SRD 5.2 Warlock's "Eldritch Invocation Options" lists
  // Pact of the Blade's text, and a Sorcerer/Warlock who never took it attacked with Charisma (big batch, 2026-11-18).
  // The rules check reads the same rule, so the two agree.
  it("is not read from a list of options the character did not take", async () => {
    const { loadContentSet } = await import("../engine/testContent");
    const { normalizeCharacter } = await import("./character");
    const { checkCharacter } = await import("./rulesCheck");
    const reg = loadContentSet("", "srd");
    const ch = normalizeCharacter(JSON.parse(readFileSync(join(__dirname, "fixtures/sorcerer-warlock-srd.json"), "utf8")));
    const r = resolve(ch, reg);
    const sh = buildSheet(r);
    const dex = sh.abilities.find((a) => a.id === "dexterity")!.mod;
    expect(sh.attacksCarried.find((a) => a.name === "Light Crossbow")!.bonus).toBe(dex + sh.proficiency);
    expect(checkCharacter(r, sh, []).filter((f) => /^Weapon/.test(f.rule))).toEqual([]);
  }, 600000);
});
