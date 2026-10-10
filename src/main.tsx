import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/700.css";
import "@fontsource/roboto-condensed/400.css";
import "@fontsource/roboto-condensed/700.css";
import "@fontsource/crimson-pro/400.css";
import "@fontsource/crimson-pro/400-italic.css";
import "@fontsource/crimson-pro/600.css";
import { App } from "./ui/App";
import "./ui/styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
