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

const migrate = (v: string) => (THEMES[v] ? v : v === "light" ? "parchment" : "obsidian");

export function applyTheme(id: string): void {
  const t = THEMES[id] ?? THEMES.obsidian;
  const root = document.documentElement;
  root.setAttribute("data-theme", t.base);
  root.setAttribute("data-skin", id);
}

/** Palette switch in the top bar. Remembered between launches. */
export function ThemePicker() {
  const [id, setId] = useState(() => migrate(read("charforge.theme", "obsidian")));
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
if (typeof document !== "undefined") applyTheme(migrate(read("charforge.theme", "obsidian")));
