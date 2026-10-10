/**
 * 2014 and 2024 content loaded together: ability scores and feats must not be counted twice.
 *   AURORA_FIXTURES_2014=<folder>  AURORA_FIXTURES_2024=<folder>
 */
import { describe, expect, it } from "vitest";
import { loadRegistries } from "./fixture";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { autoFill } from "./autofill";

const A = process.env.AURORA_FIXTURES_2014;
const B = process.env.AURORA_FIXTURES_2024;

describe.skipIf(!A || !B)("2014 and 2024 content together", () => {
  const reg = A && B ? loadRegistries([A, B]) : undefined;
  const build = (race: string, background: string) => {
    const ch = newCharacter();
    ch.race = race;
    ch.background = background;
    ch.classes = [{ classId: "ID_WOTC_PHB24_CLASS_FIGHTER", level: 1 }];
    return resolve(autoFill(ch, reg!), reg!);
  };

  it("keeps a 2014 species' increase when the background is 2014 too", () => {
    expect(build("ID_RACE_ELF", "ID_BACKGROUND_SAGE").stats.get("dexterity")).toBe(10);
  });

  it("drops the 2014 species' increase when a 2024 background gives its own", () => {
    const r = build("ID_RACE_ELF", "ID_WOTC_PHB24_BACKGROUND_NOBLE");
    expect(r.stats.get("dexterity")).toBe(8);
    // Noble's own +2 and +1 are counted once: 8 + 2 and 8 + 1
    expect(r.stats.get("strength")).toBe(10);
    expect(r.stats.get("intelligence")).toBe(9);
  });

  it("does the same for a human's +1 to everything", () => {
    const r = build("ID_RACE_HUMAN", "ID_WOTC_PHB24_BACKGROUND_NOBLE");
    expect(r.stats.get("constitution")).toBe(8);
    expect(r.stats.get("wisdom")).toBe(8);
  });

  it("does not offer a feat twice", () => {
    const ch = newCharacter();
    ch.race = "ID_RACE_HUMAN";
    ch.background = "ID_WOTC_PHB24_BACKGROUND_NOBLE";
    ch.classes = [{ classId: "ID_WOTC_PHB24_CLASS_FIGHTER", level: 1 }];
    const r = resolve(ch, reg!);
    const taken = [...r.ids].filter((i) => reg!.get(i)?.type === "Feat");
    const feat = r.slots.filter((s) => s.rule.type === "Feat");
    for (const s of feat) for (const id of taken) if (!s.chosen.includes(id) && s.options.some((o) => o.id === id)) expect(s.blocked.has(id)).toBe(true);
  });
});
