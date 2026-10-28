import { describe, expect, it } from "vitest";
import { insertAt, moveTo } from "./favOrder";

const l = ["a", "b", "c", "d"].map((uid) => ({ uid }));
const ids = (x: { uid: string }[]) => x.map((y) => y.uid).join("");

describe("favorites order", () => {
  it("inserts a new favorite at the gap it was dropped in", () => {
    expect(ids(insertAt(l, { uid: "n" }, 0))).toBe("nabcd");
    expect(ids(insertAt(l, { uid: "n" }, 2))).toBe("abncd");
    expect(ids(insertAt(l, { uid: "n" }, 9))).toBe("abcdn");
  });
  it("moves a favorite to a gap before or after it", () => {
    expect(ids(moveTo(l, "a", 3))).toBe("bcad");
    expect(ids(moveTo(l, "d", 1))).toBe("adbc");
    expect(ids(moveTo(l, "b", 2))).toBe("abcd");
    expect(ids(moveTo(l, "c", 4))).toBe("abdc");
    expect(ids(moveTo(l, "x", 0))).toBe("abcd");
  });
});
