import { describe, expect, it } from "vitest";
import { outdatedFiveTools, FIVETOOLS_IMPORT_FORMAT } from "./content";
import type { SourceConfig } from "./sources";

const src = (files: string[], extra: Partial<SourceConfig> = {}): SourceConfig => ({
  url: "5etools://x", name: "x", kind: "local", format: "5etools", disabled: [], versions: {}, lastChecked: 0, fileCount: files.length,
  tree: { url: "5etools://x", name: "x", description: "", version: "local", files: [], children: [{ url: "5etools://x#core", name: "core", description: "", version: "local", files: files.map((f) => `5etools://x/${f}`), children: [] }] },
  ...extra,
});

describe("outdated 5e.tools imports", () => {
  it("asks for a fresh import of a full import made before the current format", () => {
    expect(outdatedFiveTools([src(["races.json", "items.json"])])).toHaveLength(1);
  });
  it("counts an unstamped import that already has the new files as current", () => {
    expect(outdatedFiveTools([src(["races.json", "magicvariants.json", "foundry-races.json"])])).toHaveLength(0);
  });
  it("trusts the stamp, ignores picked entries, Aurora sources and switched-off sources", () => {
    expect(outdatedFiveTools([src(["races.json"], { importFormat: FIVETOOLS_IMPORT_FORMAT })])).toHaveLength(0);
    expect(outdatedFiveTools([src(["picked/background.json"])])).toHaveLength(0);
    expect(outdatedFiveTools([src(["races.json"], { format: "aurora" })])).toHaveLength(0);
    expect(outdatedFiveTools([src(["races.json"], { disabled: ["5etools://x"] })])).toHaveLength(0);
  });
});
