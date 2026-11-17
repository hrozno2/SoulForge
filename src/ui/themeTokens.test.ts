/**
 * Themed components take their colours from the theme's tokens only (C6.7: the spell scrolls had hard-coded bright
 * parchment and no theme reached them). A rule for one of these selectors with a fixed colour fails here; black and
 * white (#000, #fff, rgba(0,0,0,…)) are fine, as they darken whatever theme is on.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const THEMED = [/\.scroll-/, /\.float-/, /\.bag-/, /\.card-window/, /\.class-tab/];
const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("themed components use the theme's tokens", () => {
  it("has no fixed colours in their rules", () => {
    const bad: string[] = [];
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].trim();
      if (!THEMED.some((r) => r.test(sel))) continue;
      const fixed = m[2].replace(/#000\b|#fff\b/gi, "").match(/#[0-9a-f]{3,8}\b|rgba?\((?!0,\s*0,\s*0|255,\s*255,\s*255)[^)]*\)/gi);
      if (fixed) bad.push(`${sel}: ${fixed.join(", ")}`);
    }
    expect(bad).toEqual([]);
  });
});

/**
 * A fixed dark background with the theme's ink on it is dark on dark in a light theme (Chris 2026-11-13: in light themes
 * icons became unreadable and cards stayed dark). Such a rule takes the theme's paper (var(--panel)), or keeps its dark
 * face with fixed light ink. Rules inside a part that is dark in every theme (the top bar, Play's hero header) are fine.
 */
describe("light themes", () => {
  it("no fixed dark background under the theme's ink", () => {
    const DARK_SCOPE = /\.topbar|\.csearch|\.play-head|\.hero|\.lock-note|data-theme="dark"|data-skin=/;
    const darkBg =
      /background(?:-color)?:[^;]*(?:rgba\(\s*[0-2]?\d\s*,\s*[0-2]?\d\s*,\s*[0-2]?\d\s*,\s*0?\.[3-9]\d*\)|#[01][0-9a-f]{5}\b|#[01][0-9a-f]{2}\b)/i;
    const themeInk = /(?<![-\w])color:\s*var\(--(?:text|muted|gold|gold2|ink)\)/;
    const bad: string[] = [];
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].trim();
      if (DARK_SCOPE.test(sel) || sel.startsWith("@")) continue;
      if (darkBg.test(m[2]) && themeInk.test(m[2])) bad.push(sel.replace(/\s+/g, " "));
    }
    expect(bad).toEqual([]);
  });
});
