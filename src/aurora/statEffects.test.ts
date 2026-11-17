/**
 * Statistics the W3 measurement (src/engine/statEffect.test.ts) found changing nothing, each now read: the Monk's
 * "ki:dc" (a feature name of two letters was never matched, so Ki showed no save DC), and the range of every sense,
 * not darkvision's alone (a feature extending blindsight or tremorsense changed nothing).
 */
import { expect, it } from "vitest";
import { newCharacter } from "./character";
import { resolve } from "./engine";
import { ARegistry } from "./registry";
import { buildSheet } from "./sheet";
import type { AElement } from "./types";

const el = (id: string, name: string, type: string, extra: Partial<AElement> = {}): AElement => ({
  id,
  name,
  type,
  source: "Test",
  supports: [],
  description: `<p>${name} text.</p>`,
  compendiumHidden: false,
  setters: {},
  rules: [],
  ...extra,
});

it("shows the Ki save DC and a sense's range from its statistic", () => {
  const reg = new ARegistry();
  reg.addElements([
    el("CLS", "Monk", "Class", {
      setters: { hd: { value: "d8", attrs: {} } },
      rules: [
        { kind: "grant", type: "Class Feature", id: "KI" },
        { kind: "grant", type: "Vision", id: "BLIND" },
        { kind: "stat", name: "blindsight:range", value: "10" },
      ],
    }),
    el("KI", "Ki", "Class Feature", { rules: [{ kind: "stat", name: "ki:dc", value: "13" }] }),
    el("BLIND", "Blindsight", "Vision"),
  ]);
  reg.build();
  const ch = {
    ...newCharacter(),
    classes: [{ classId: "CLS", level: 2 }],
    customStats: [{ id: "x", stat: "blindsight:range", value: 20 }],
  };
  const sh = buildSheet(resolve(ch, reg));
  expect(sh.features.find((f) => f.name === "Ki")?.text).toContain("DC 13");
  expect(sh.vision).toContain("Blindsight 30 ft");
});
