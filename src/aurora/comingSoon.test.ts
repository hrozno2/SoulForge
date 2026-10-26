import { describe, expect, it } from "vitest";
import { markComingSoon } from "./comingSoon";
import type { AElement } from "./types";

const el = (id: string, type: string, grants: string[] = []): AElement => ({ id, name: id, type, source: "UA", supports: [], description: "", compendiumHidden: false, setters: {}, rules: grants.map((g) => ({ kind: "grant", type: "Class Feature", id: g })) });

describe("coming soon", () => {
  it("marks an unsupported feature and what grants it, nothing else", () => {
    const byId = new Map([el("CLASS", "Class", ["F1", "F2"]), el("F1", "Class Feature"), el("F2", "Class Feature"), el("OTHER", "Class", ["F2"])].map((e) => [e.id, e]));
    markComingSoon(byId, ["F1"]);
    expect([...byId.values()].filter((e) => e.comingSoon).map((e) => e.id).sort()).toEqual(["CLASS", "F1"]);
  });
});
