import { describe, expect, it } from "vitest";
import { parseLink } from "./fiveToolsPicker";

describe("5e.tools links", () => {
  it("reads a spell link with filters", () => {
    expect(parseLink("https://5e.tools/spells.html#hunter%20sense_grimhollowpg24,flstlevel:0=1,flstclass:druid=1")).toEqual({ kind: "spell", name: "hunter sense", source: "grimhollowpg24" });
  });
  it("reads item, feat and bestiary pages", () => {
    expect(parseLink("https://5e.tools/items.html#longsword_phb")).toEqual({ kind: "item", name: "longsword", source: "phb" });
    expect(parseLink("https://5e.tools/feats.html#alert_xphb")).toMatchObject({ kind: "feat" });
    expect(parseLink("https://5e.tools/bestiary.html#goblin_mm")).toMatchObject({ kind: "monster" });
  });
  it("flags pages it cannot import and non links", () => {
    expect(parseLink("https://5e.tools/classes.html#wizard_phb")).toBe("unsupported");
    expect(parseLink("hello")).toBeNull();
  });
});
