import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// The same policy the desktop app enforces, so the browser build and the tests run under it too.
const csp: string = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).app.security.csp;

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules/pdf-lib") || id.includes("@pdf-lib")) return "pdf";
          if (id.includes("node_modules/react")) return "react";
          if (id.includes("node_modules/jszip")) return "zip";
        },
      },
    },
  },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  preview: { port: 4173, strictPort: true, headers: { "Content-Security-Policy": csp } },
  test: { environment: "node", exclude: ["e2e/**", "node_modules/**", "dist/**", "src-tauri/**"] },
});
