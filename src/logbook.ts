/**
 * Recent errors and warnings from the app, kept in memory for a bug report: console errors and warnings, uncaught
 * errors and rejected promises. Started before the app renders. Home folder paths are taken out when reported.
 */
const lines: string[] = [];
const MAX = 200;

function note(kind: string, parts: unknown[]) {
  const text = parts.map((p) => (p instanceof Error ? `${p.name}: ${p.message}` : typeof p === "string" ? p : (() => { try { return JSON.stringify(p); } catch { return String(p); } })())).join(" ");
  lines.push(`${new Date().toISOString().slice(11, 19)} ${kind} ${text.slice(0, 600)}`);
  if (lines.length > MAX) lines.splice(0, lines.length - MAX);
}

export function startLogbook(): void {
  if (typeof window === "undefined") return;
  const err = console.error.bind(console);
  const warn = console.warn.bind(console);
  console.error = (...a: unknown[]) => { note("error", a); err(...a); };
  console.warn = (...a: unknown[]) => { note("warn", a); warn(...a); };
  window.addEventListener("error", (e) => note("uncaught", [e.message, `${e.filename ?? ""}:${e.lineno ?? ""}`]));
  window.addEventListener("unhandledrejection", (e) => note("unhandled", [e.reason]));
}

export const logLines = (): string[] => lines.slice();
