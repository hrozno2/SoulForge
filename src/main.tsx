import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/700.css";
import "@fontsource/roboto-condensed/400.css";
import "@fontsource/roboto-condensed/700.css";
import "@fontsource/crimson-pro/400.css";
import "@fontsource/crimson-pro/400-italic.css";
import "@fontsource/crimson-pro/600.css";
import "@fontsource/alegreya-sans/400.css";
import "@fontsource/alegreya-sans/400-italic.css";
import "@fontsource/alegreya-sans/700.css";
import "@fontsource/cinzel-decorative/700.css";
import { App } from "./ui/App";
import { openExternal } from "./store";
import "./ui/styles.css";

// Web links open in the system browser. Without this, a link (or the right-click "Open link") loads inside the app window and replaces it.
const externalLink = (e: Event): HTMLAnchorElement | null => {
  const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  return a && /^https?:/i.test(a.getAttribute("href") ?? "") ? a : null;
};
document.addEventListener("click", (e) => {
  if (e.defaultPrevented) return; // a component already handled it
  const a = externalLink(e);
  if (!a) return;
  e.preventDefault();
  void openExternal(a.href);
});
// The browser's own link menu would navigate the app window, so links get no native menu.
document.addEventListener("contextmenu", (e) => {
  if (externalLink(e)) e.preventDefault();
});
document.addEventListener("auxclick", (e) => {
  const a = externalLink(e);
  if (!a) return;
  e.preventDefault();
  void openExternal(a.href);
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
