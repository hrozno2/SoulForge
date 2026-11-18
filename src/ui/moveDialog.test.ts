/** E1.3: the Move to 5e.tools button shows for a character built on Aurora's class, species or background only. */
import { expect, it } from "vitest";
import { newCharacter } from "../aurora/character";
import { ARegistry } from "../aurora/registry";
import type { AElement } from "../aurora/types";
import { usesAurora } from "./MoveDialog";

const el = (id: string, type: string, extra: Partial<AElement> = {}): AElement => ({
  id,
  name: id,
  type,
  source: "Player's Handbook",
  supports: [],
  description: "",
  compendiumHidden: false,
  setters: {},
  rules: [],
  ...extra,
});

it("offers the move for Aurora's classes, species and backgrounds, not for 5e.tools', the SRD's or additions", () => {
  const reg = new ARegistry();
  reg.addElements([
    el("ID_WOTC_PHB_CLASS_WARLOCK", "Class"),
    el("ID_5ET_CLASS_PHB_WARLOCK", "Class", { origin: "5etools" }),
    el("ID_SRD_RACE_DWARF", "Race", { source: "SRD 5.1" }),
    el("ID_RACE_HALFELF", "Race"),
  ]);
  reg.build();
  const ch = (classId: string, race?: string) => ({ ...newCharacter(), classes: [{ classId, level: 1 }], race });
  expect(usesAurora(ch("ID_WOTC_PHB_CLASS_WARLOCK"), reg)).toBe(true);
  expect(usesAurora(ch("ID_5ET_CLASS_PHB_WARLOCK"), reg)).toBe(false);
  expect(usesAurora(ch("ID_5ET_CLASS_PHB_WARLOCK", "ID_SRD_RACE_DWARF"), reg)).toBe(false);
  expect(usesAurora(ch("ID_5ET_CLASS_PHB_WARLOCK", "ID_RACE_HALFELF"), reg)).toBe(true);
});
