import { afterEach, describe, expect, it } from "vitest";
import { LANGUAGES, setLanguage, t } from "./i18n";

describe("interface language", () => {
  afterEach(() => setLanguage("en"));
  it("translates known text and falls back to English", () => {
    setLanguage("de");
    expect(t("Long rest")).toBe("Lange Rast");
    expect(t("Something new")).toBe("Something new");
    setLanguage("en");
    expect(t("Long rest")).toBe("Long rest");
  });
  it("covers the same text in every language", () => {
    const keys = ["Home", "Build", "Magic", "Equipment", "Manage", "Play", "Sheet", "Content", "Heal", "Damage", "Short rest", "Long rest", "Hit Points"];
    for (const { code } of LANGUAGES) {
      setLanguage(code);
      for (const k of keys) expect(t(k), `${code} ${k}`).toBeTruthy();
      if (code !== "en") for (const k of keys) expect(t(k) === k && !["Magic"].includes(k) ? `${code}:${k}` : "").toBe("");
    }
  });
});
