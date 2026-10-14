import { useEffect, useState } from "react";

/** Each theme is a base (dark or light, which the older rules key off) plus a palette skin. */
export const THEMES: Record<string, { label: string; base: "dark" | "light"; note: string }> = {
  obsidian: { label: "Obsidian", base: "dark", note: "Black and red, like D&D Beyond's dark mode" },
  leather: { label: "Leather", base: "dark", note: "Dark brown with gold" },
  slate: { label: "Slate and amber", base: "dark", note: "Cool grey with amber, after Aurora Builder" },
  tools: { label: "Tools blue", base: "dark", note: "Slate blue, in the spirit of 5e.tools" },
  daylight: { label: "Daylight", base: "light", note: "Clean light mode" },
  parchment: { label: "Printed book", base: "light", note: "Cream paper and crimson, like the printed books" },
};

const read = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};

/** The theme for anyone who has not picked one: slate and amber. */
export const DEFAULT_THEME = "slate";

const migrate = (v: string) => (THEMES[v] ? v : v === "light" ? "parchment" : DEFAULT_THEME);

/**
 * The saved theme. Obsidian was the default until slate and amber; the picker saved it without anyone choosing it, so
 * it moves to the new default once (a theme picked afterwards stays).
 */
function savedTheme(): string {
  let v = migrate(read("charforge.theme", DEFAULT_THEME));
  try {
    if (!localStorage.getItem("charforge.themeDefault") && v === "obsidian") v = DEFAULT_THEME;
    localStorage.setItem("charforge.themeDefault", DEFAULT_THEME);
    localStorage.setItem("charforge.theme", v);
  } catch {
    /* storage can be unavailable */
  }
  return v;
}

export function applyTheme(id: string): void {
  const t = THEMES[id] ?? THEMES[DEFAULT_THEME];
  const root = document.documentElement;
  root.setAttribute("data-theme", t.base);
  root.setAttribute("data-skin", id);
}

/** Palette switch in the top bar. Remembered between launches. */
export function ThemePicker() {
  const [id, setId] = useState(() => migrate(read("charforge.theme", DEFAULT_THEME)));
  useEffect(() => {
    applyTheme(id);
    try {
      localStorage.setItem("charforge.theme", id);
    } catch {
      /* storage can be unavailable */
    }
  }, [id]);
  return (
    <span className="theme noprint">
      <select value={id} onChange={(e) => setId(e.target.value)} title={THEMES[id]?.note ?? "Theme"} aria-label="Theme">
        {Object.entries(THEMES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
      </select>
    </span>
  );
}

// Apply the saved theme as soon as the file loads, so the first paint is not the wrong colour.
if (typeof document !== "undefined") applyTheme(savedTheme());
