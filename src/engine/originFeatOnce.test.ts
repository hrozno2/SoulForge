/**
 * A 2014 background gives the origin feat once (C7.4): its Variant Feature's "Origin Feat" and the 2024-rules package
 * each block the other. SOULFORGE_RULES=<folder>.
 */
import { describe, expect, it } from "vitest";
import { newCharacter } from "../aurora/character";
import { resolve } from "../aurora/engine";
import { loadTestContent } from "./testContent";
import { BACKGROUND_2024_ID } from "./backgroundOptions";

const C = process.env.SOULFORGE_RULES;
const ORIGIN = "ID_WOTC_PHB24_BACKGROUND_FEATURE_ORIGIN_FEAT";

describe.skipIf(!C)("one origin feat per background", () => {
  const reg = C ? loadTestContent(C) : undefined!;
  const withBg = () => {
    const bg = reg.ofType("Background").find((b) => b.rules.some((r) => r.kind === "select" && r.name === "Variant Feature" && (r as { supports?: string }).supports === "Optional Background Feature"))!;
    const ch = newCharacter(); ch.background = bg.id; ch.classes = [{ classId: "ID_WOTC_PHB_CLASS_FIGHTER", level: 1 }];
    return ch;
  };
  const slot = (r: ReturnType<typeof resolve>, test: (n: string) => boolean) => r.slots.find((s) => s.root === "background" && test(s.rule.name))!;

  it("blocks the 2024 package once the Variant Feature's origin feat is taken, and the other way round", () => {
    const ch = withBg();
    let r = resolve(ch, reg);
    const variant = slot(r, (n) => n === "Variant Feature");
    expect(variant.options.some((o) => o.id === ORIGIN)).toBe(true);
    ch.selections[variant.key] = [ORIGIN];
    ch.taken = [...(ch.taken ?? []), variant.key];
    r = resolve(ch, reg);
    const pkg = slot(r, (n) => /^2024 rules/.test(n));
    expect(pkg.blocked.has(BACKGROUND_2024_ID)).toBe(true);

    const ch2 = withBg();
    let r2 = resolve(ch2, reg);
    const pkg2 = slot(r2, (n) => /^2024 rules/.test(n));
    ch2.selections[pkg2.key] = [BACKGROUND_2024_ID];
    ch2.taken = [...(ch2.taken ?? []), pkg2.key];
    r2 = resolve(ch2, reg);
    expect(slot(r2, (n) => n === "Variant Feature").blocked.has(ORIGIN)).toBe(true);
  }, 600000);
});
