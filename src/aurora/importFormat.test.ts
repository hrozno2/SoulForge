import { describe, expect, it } from "vitest";
import { beastsOnly, outdatedFiveTools, FIVETOOLS_IMPORT_FORMAT } from "./content";
import type { SourceConfig } from "./sources";

const src = (files: string[], extra: Partial<SourceConfig> = {}): SourceConfig => ({
  url: "5etools://x",
  name: "x",
  kind: "local",
  format: "5etools",
  disabled: [],
  versions: {},
  lastChecked: 0,
  fileCount: files.length,
  tree: {
    url: "5etools://x",
    name: "x",
    description: "",
    version: "local",
    files: [],
    children: [
      {
        url: "5etools://x#core",
        name: "core",
        description: "",
        version: "local",
        files: files.map((f) => `5etools://x/${f}`),
        children: [],
      },
    ],
  },
  ...extra,
});

describe("outdated 5e.tools imports", () => {
  it("asks for a fresh import of a full import made before the current format", () => {
    expect(outdatedFiveTools([src(["races.json", "items.json"])])).toHaveLength(1);
  });
  it("an unstamped import is out of date: its bestiary was cut to beasts (format 4 keeps the summoned creatures)", () => {
    expect(outdatedFiveTools([src(["races.json", "magicvariants.json", "foundry-races.json", "adventures.json"])])).toHaveLength(1);
    expect(outdatedFiveTools([src(["races.json", "magicvariants.json", "foundry-races.json"])])).toHaveLength(1);
  });
  it("keeps the beasts and the creatures a class or spell calls, not the rest of the bestiary", () => {
    const text = JSON.stringify({
      monster: [
        { name: "Wolf", type: "beast" },
        { name: "Steel Defender", type: "construct", summonedByClass: "Artificer|TCE" },
        { name: "Fey Spirit", type: "fey", summonedBySpell: "Summon Fey|TCE" },
        { name: "Lich", type: "undead" },
      ],
    });
    expect((JSON.parse(beastsOnly(text)).monster as { name: string }[]).map((m) => m.name)).toEqual([
      "Wolf",
      "Steel Defender",
      "Fey Spirit",
    ]);
  });
  it("trusts the stamp, ignores picked entries, Aurora sources and switched-off sources", () => {
    expect(outdatedFiveTools([src(["races.json"], { importFormat: FIVETOOLS_IMPORT_FORMAT })])).toHaveLength(0);
    expect(outdatedFiveTools([src(["picked/background.json"])])).toHaveLength(0);
    expect(outdatedFiveTools([src(["races.json"], { format: "aurora" })])).toHaveLength(0);
    expect(outdatedFiveTools([src(["races.json"], { disabled: ["5etools://x"] })])).toHaveLength(0);
  });
});
