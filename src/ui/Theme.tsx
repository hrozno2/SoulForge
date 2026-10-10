import { useEffect, useState } from "react";

const ACCENTS: Record<string, [string, string]> = {
  Gold: ["#d4a24c", "#9a6a12"],
  Blue: ["#5b9bd5", "#2c6aa8"],
  Green: ["#6fb98a", "#2f7d4f"],
  Purple: ["#a78bd6", "#6b4aa8"],
  Red: ["#e07a5f", "#b03a1f"],
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
  const [accent, setAccent] = useState(() => read("charforge.accent", "Gold"));
  useEffect(() => {
    const root = document.documentElement;
    if (mode === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", mode);
    const dark = mode === "dark" || (mode === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const [d, l] = ACCENTS[accent] ?? ACCENTS.Gold;
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
