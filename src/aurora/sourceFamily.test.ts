/** Whose content a source holds: the one test the move to 5e.tools and the Aurora-free app go by. */
import { describe, expect, it } from "vitest";
import { newLinkSource } from "./content";
import { holdsAurora, sourceFamily, withoutAurora } from "./sourceFamily";
import type { SourceConfig } from "./sources";

const local = (url: string, fileCount = 1, format?: SourceConfig["format"]): SourceConfig => ({
  url,
  name: url,
  kind: "local",
  format,
  disabled: [],
  versions: {},
  lastChecked: 0,
  fileCount,
});

describe("whose content a source holds", () => {
  it("counts a player's own Aurora index link as Aurora's, though it carries no format", () => {
    const link = newLinkSource("https://raw.githubusercontent.com/AuroraLegacy/elements/master/AuroraLegacy.index");
    expect(link.format).toBeUndefined();
    expect(sourceFamily(link)).toBe("aurora");
  });
  it("tells 5e.tools, homebrew and Aurora files apart", () => {
    expect(sourceFamily(local("local://5etools", 300, "5etools"))).toBe("5etools");
    expect(sourceFamily(local("local://test-aurora", 2000, "aurora"))).toBe("aurora");
    expect(sourceFamily(local("local://builder"))).toBe("homebrew");
    expect(sourceFamily(local("local://custom/My homebrew"))).toBe("homebrew");
    // Imported from this computer: one file is somebody's homebrew, a repository's ZIP is Aurora's content.
    expect(sourceFamily(local("local://my-subclass"))).toBe("homebrew");
    expect(sourceFamily(local("local://elements-master", 1400))).toBe("aurora");
  });
  it("leaves 5e.tools and homebrew for an Aurora-free app, in their order", () => {
    const list = [
      newLinkSource("https://example.org/AuroraLegacy.index"),
      local("local://5etools", 300, "5etools"),
      local("local://elements-master", 1400),
      local("local://builder"),
    ];
    expect(withoutAurora(list).map((s) => s.url)).toEqual(["local://5etools", "local://builder"]);
    expect(holdsAurora(list)).toBe(true);
    expect(holdsAurora(withoutAurora(list))).toBe(false);
  });
});
