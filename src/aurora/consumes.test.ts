/** Features that spend another's uses link to it on the sheet (Turn Undead spends Channel Divinity). SOULFORGE_RULES=<folder>. */
import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { buildSheet } from "./sheet";
import { loadTestContent } from "../engine/testContent";

const C = process.env.SOULFORGE_RULES;

describe.skipIf(!C)("features that spend another's uses", () => {
  const reg = C ? loadTestContent(C) : undefined!;
  const sheetFor = (classId: string, level: number) => { const ch = newCharacter(); ch.classes = [{ classId, level }]; return buildSheet(resolve(ch, reg)); };
  it.each([["ID_WOTC_PHB_CLASS_CLERIC", "Aurora 2014, by name"], ["ID_5ET_CLASS_XPHB_CLERIC", "5e.tools 2024, by consumes"]])("%s (%s)", (classId) => {
    if (!reg.get(classId)) return;
    const sh = sheetFor(classId, 2);
    const turn = sh.features.find((f) => /turn undead/i.test(f.name));
    expect(turn, "Turn Undead on the sheet").toBeTruthy();
    expect(turn!.consumes?.name).toMatch(/^Channel Divinity$/i);
    expect(sh.features.find((f) => f.id === turn!.consumes!.id)?.usage).toBeTruthy();
  }, 600000);
});
