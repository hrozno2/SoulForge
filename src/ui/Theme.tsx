import { useEffect, useState } from "react";

const ACCENTS: Record<string, [string, string]> = {
  Red: ["#c53131", "#9b2020"],
  Gold: ["#b8902f", "#8a6a24"],
  Blue: ["#3f78b8", "#2c5d93"],
  Green: ["#3f8f5c", "#2f7d4f"],
  Purple: ["#7d5cc0", "#5b3f99"],
};

const read = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};

/** Light or dark, plus an accent colour. Remembered between launches. */
export function ThemePicker() {
  const [mode, setMode] = useState(() => read("charforge.theme", "auto"));
  const [accent, setAccent] = useState(() => read("charforge.accent", "Red"));
  useEffect(() => {
    const root = document.documentElement;
    if (mode === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", mode);
    const dark = mode === "dark" || (mode === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const [d, l] = ACCENTS[accent] ?? ACCENTS.Red;
    root.style.setProperty("--accent", dark ? d : l);
    try {
      localStorage.setItem("charforge.theme", mode);
      localStorage.setItem("charforge.accent", accent);
    } catch {
      /* storage can be unavailable */
    }
  }, [mode, accent]);
  return (
    <span className="theme noprint">
      <select value={mode} onChange={(e) => setMode(e.target.value)} title="Theme">
        <option value="auto">Auto</option><option value="dark">Dark</option><option value="light">Light</option>
      </select>
      <select value={accent} onChange={(e) => setAccent(e.target.value)} title="Accent colour">
        {Object.keys(ACCENTS).map((a) => <option key={a}>{a}</option>)}
      </select>
    </span>
  );
}
