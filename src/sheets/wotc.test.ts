import { describe, expect, it } from "vitest";
import { looksLikeWotc2024 } from "./wotc";

describe("official 2024 sheet recognition", () => {
  it("takes the plain print version and a fillable copy with the same layout", () => {
    expect(looksLikeWotc2024(603, 774, 2, 0, "DnD_2024_Character-Sheet.pdf")).toBe(true);
    expect(looksLikeWotc2024(603, 774, 2, 140, "DnD_2024_Character-Sheet-Fillable.pdf")).toBe(true);
  });
  it("does not take other two page sheets with fields or other sizes", () => {
    expect(looksLikeWotc2024(603, 774, 2, 140, "some-other-sheet.pdf")).toBe(false);
    expect(looksLikeWotc2024(612, 792, 2, 0, "DnD_2024_Character-Sheet.pdf")).toBe(false);
    expect(looksLikeWotc2024(603, 774, 5, 0, "DnD_2024_Character-Sheet.pdf")).toBe(false);
  });
});

import { isEditable } from "./forms";

describe("which sheets stay editable", () => {
  it("only the plain print sheets are drawn text", () => {
    expect(isEditable("wotc2024")).toBe(false);
    expect(isEditable("wotc2014")).toBe(false);
    for (const k of ["wotc2024form", "wotc2014form", "dldm5e24", "companion", "auto"]) expect(isEditable(k), k).toBe(true);
  });
});
