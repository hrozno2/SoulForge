import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import type { Plugin } from "vite";

/**
 * Dev server only: the test cache's content (Aurora's element files and the 5e.tools data folder) for the browser
 * test run, so the app in a browser can load the same content the tests use (Test tools, "Load test content").
 * GET /__testcontent/list gives the file lists; /__testcontent/file?p=... one file, only from inside the cache.
 */
function testContent(): Plugin {
  const root = resolve(process.env.SOULFORGE_RULES ?? join(homedir(), ".soulforge-test"));
  const walk = (d: string, ext: string, out: string[] = []): string[] => {
    if (!existsSync(d)) return out;
    for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p, ext, out); else if (p.endsWith(ext)) out.push(p); }
    return out;
  };
  return {
    name: "soulforge-test-content",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__testcontent", (req, res) => {
        const url = new URL(req.url ?? "/", "http://x");
        if (url.pathname === "/list") {
          const aurora = walk(join(root, "elements-master"), ".xml").map((p) => relative(root, p));
          const fivetools = walk(join(root, "5etools-data"), ".json").map((p) => relative(join(root, "5etools-data"), p)).filter((p) => !/index\.json$/.test(p) && !p.startsWith("bestiary"));
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ aurora, fivetools }));
          return;
        }
        if (url.pathname === "/file") {
          const want = url.searchParams.get("p") ?? "";
          const base = url.searchParams.get("set") === "5etools" ? join(root, "5etools-data") : root;
          const full = resolve(base, want);
          if (!full.startsWith(base + sep) || !existsSync(full)) { res.statusCode = 404; res.end(); return; }
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(readFileSync(full, "utf8"));
          return;
        }
        res.statusCode = 404;
        res.end();
      });
    },
  };
}

// The same policy the desktop app enforces, so the browser build and the tests run under it too.
const csp: string = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).app.security.csp;

/**
 * The converter's own code, hashed: the 5e.tools converter and every module it imports (C1.7, Chris 2026-10-29:
 * launches after an update were slow). Converted content is kept while this stays the same, so an update that does not
 * touch the converter, or switching between the released app and the test app, reuses it instead of converting again.
 */
function converterId(): string {
  const seen = new Set<string>();
  const queue = [resolve("src/aurora/fivetools.ts")];
  const hash = createHash("sha1");
  while (queue.length) {
    const f = queue.shift()!;
    if (seen.has(f) || !existsSync(f)) continue;
    seen.add(f);
    const text = readFileSync(f, "utf8");
    hash.update(text);
    for (const m of text.matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)) {
      const base = resolve(dirname(f), m[1]);
      for (const cand of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) if (existsSync(cand) && statSync(cand).isFile()) { queue.push(cand); break; }
    }
  }
  return hash.digest("hex").slice(0, 16);
}

export default defineConfig({
  plugins: [react(), testContent()],
  // One id per build (per start of the development server), so caches of converted content are redone after an
  // update: the converter's output depends on the code.
  define: {
    __BUILD_ID__: JSON.stringify(`${JSON.parse(readFileSync("package.json", "utf8")).version}-${Date.now()}`),
    __CONVERTER_ID__: JSON.stringify(converterId()),
    // The version a character was last checked in (src/aurora/olderBuild.ts).
    __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync("package.json", "utf8")).version),
  },
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
