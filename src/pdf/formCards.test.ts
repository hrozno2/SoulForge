/** Wild Shape forms and companions print as cards worked out for the character (C5.3). SOULFORGE_RULES=<test content>. */
import { describe, expect, it } from "vitest";
import { newCharacter } from "../aurora/character";
import { resolve } from "../aurora/engine";
import { buildSheet } from "../aurora/sheet";
import { formStats } from "../aurora/forms";
import { cardSources } from "./exportPdf";
import { loadTestContent } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;

describe.skipIf(!C)("form cards", () => {
  it("lists a 2024 druid's picked Wild Shape form, worked out with the druid's own hit points", () => {
    const reg = loadTestContent(C!);
    let ch = newCharacter();
    ch.classes = [{ classId: "ID_WOTC_PHB24_CLASS_DRUID", level: 4 }];
    const slot = resolve(ch, reg).slots.find((s) => s.rule.type === "Companion" && /ws beast/.test(s.rule.supports ?? ""))!;
    expect(slot, "a Wild Shape forms choice").toBeTruthy();
    const beast = slot.options.find((o) => !slot.blocked.has(o.id))!;
    ch = { ...ch, selections: { ...ch.selections, [slot.key]: [beast.id] }, taken: [slot.key] };
    const r = resolve(ch, reg);
    const src = cardSources(r, buildSheet(r));
    expect(src.forms.map((f) => [f.el.id, f.kind])).toContainEqual([beast.id, "wild shape"]);
    const b = formStats(r, beast, "wild shape");
    expect(b.rules).toBe("2024");
    expect(b.hp).toBe(buildSheet(r).hp);
    expect(b.tempHp).toBe(4);
  }, 600000);
});
