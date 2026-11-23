/** A character built on Aurora content, in an app that no longer reads it (D7): the move is still offered. */
import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import type { AElement } from "./types";
import { moveOffered, standsOnUnreadAurora, usesAurora } from "./auroraLeft";

const el = (id: string, source: string, origin?: "5etools") => ({ id, name: id, type: "Class", source, origin }) as unknown as AElement;
const reg = (...els: AElement[]) => ({ get: (id: string) => els.find((e) => e.id === id) });
const fighter = (classId: string) => ({ ...newCharacter(), classes: [{ classId, level: 3 }] });

describe("a character on Aurora content the app does not read", () => {
  const auroraId = "ID_WOTC_PHB_CLASS_FIGHTER";
  it("is known by a class that is not loaded while Aurora's files are on the computer", () => {
    expect(standsOnUnreadAurora(fighter(auroraId), reg(), true)).toBe(true);
    expect(moveOffered(fighter(auroraId), reg(), true)).toBe(true);
  });
  it("is not claimed when there are no Aurora files to move from", () => {
    expect(moveOffered(fighter(auroraId), reg(), false)).toBe(false);
  });
  it("is not claimed for 5e.tools' own ids, loaded or missing", () => {
    expect(moveOffered(fighter("ID_5ET_CLASS_FIGHTER_XPHB"), reg(), true)).toBe(false);
    expect(
      moveOffered(fighter("ID_5ET_CLASS_FIGHTER_XPHB"), reg(el("ID_5ET_CLASS_FIGHTER_XPHB", "Player's Handbook (2024)", "5etools")), true),
    ).toBe(false);
    expect(moveOffered(fighter("ID_SF_SOMETHING"), reg(), true)).toBe(false);
  });
  it("still offers the move where Aurora's content is loaded (the test app)", () => {
    const r = reg(el(auroraId, "Player's Handbook"));
    expect(usesAurora(fighter(auroraId), r)).toBe(true);
    expect(moveOffered(fighter(auroraId), r, false)).toBe(true);
  });
  it("asks nothing of an empty character", () => {
    expect(moveOffered(newCharacter(), reg(), true)).toBe(false);
  });
});
