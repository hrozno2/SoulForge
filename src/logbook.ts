/**
 * Recent errors and warnings from the app, kept in memory for a bug report: console errors and warnings, uncaught
 * errors and rejected promises. Started before the app renders. Home folder paths are taken out when reported.
 * Also the app's own events (A2.11, `logEvent`): content loading, imports, exports, slow work, rules findings; short
 * lines, kept with the errors and written to the log file a few seconds later, so they cost almost nothing.
 */
const lines: string[] = [];
const MAX = 400;

function note(kind: string, parts: unknown[]) {
  const text = parts.map((p) => (p instanceof Error ? `${p.name}: ${p.message}` : typeof p === "string" ? p : (() => { try { return JSON.stringify(p); } catch { return String(p); } })())).join(" ");
  lines.push(`${new Date().toISOString().slice(11, 19)} ${kind} ${text.slice(0, 600)}`);
  if (lines.length > MAX) { const cut = lines.length - MAX; lines.splice(0, cut); written = Math.max(0, written - cut); }
  flushSoon();
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

/**
 * An event worth knowing when something goes wrong: `area` names the part of the app ("content", "import",
 * "export", "rules", "engine"), `message` says what happened, with the numbers that matter. Kept short; never call
 * it on every keystroke (use `timed`, which logs only slow work).
 */
export function logEvent(area: string, message: string): void {
  note(area, [message]);
}

/** Runs `fn`; when it takes longer than `slowMs`, logs it with `what` (a function, so nothing is built when fast). */
export function timed<T>(area: string, label: string, fn: () => T, slowMs = 50, what?: () => string): T {
  const t = performance.now();
  try {
    return fn();
  } finally {
    const ms = performance.now() - t;
    if (ms > slowMs) logEvent(area, `slow: ${label} took ${Math.round(ms)} ms${what ? ` (${what()})` : ""}`);
  }
}

// ---------------------------------------------------------------- the log file (desktop)

/**
 * On the desktop the same lines go to soul-forge.log in the app's log folder, a few seconds after they happen, so they
 * outlive a crash or a restart (A2.7, GitHub #4). At start the last session's file becomes soul-forge.previous.log,
 * which a bug report can include. Home folder paths are taken out when reported, as for the lines in memory.
 */
const LOG = "soul-forge.log";
const PREVIOUS = "soul-forge.previous.log";
const MAX_FILE = 512 * 1024;
let written = 0;
let pending: ReturnType<typeof setTimeout> | undefined;
const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function fs() {
  const m = await import("@tauri-apps/plugin-fs");
  return { m, dir: { baseDir: m.BaseDirectory.AppLog } };
}

/** Starts the file: the previous session's log is kept once, and this session's begins with a header. */
export async function startLogFile(version: string): Promise<void> {
  if (!inTauri()) return;
  try {
    const { m, dir } = await fs();
    const { appLogDir } = await import("@tauri-apps/api/path");
    await m.mkdir(await appLogDir(), { recursive: true }).catch(() => undefined);
    if (await m.exists(LOG, dir)) {
      if (await m.exists(PREVIOUS, dir)) await m.remove(PREVIOUS, dir);
      await m.rename(LOG, PREVIOUS, { oldPathBaseDir: dir.baseDir, newPathBaseDir: dir.baseDir });
    }
    await m.writeTextFile(LOG, `Soul Forge ${version}, session started ${new Date().toISOString()}\n`, dir);
    flushSoon();
  } catch {
    // No log file: the lines in memory still go into a bug report.
  }
}

function flushSoon(): void {
  if (!inTauri() || pending) return;
  pending = setTimeout(async () => {
    pending = undefined;
    const fresh = lines.slice(written);
    if (!fresh.length) return;
    written = lines.length;
    try {
      const { m, dir } = await fs();
      const size = (await m.stat(LOG, dir).catch(() => undefined))?.size ?? 0;
      if (size < MAX_FILE) await m.writeTextFile(LOG, fresh.join("\n") + "\n", { ...dir, append: true });
    } catch {
      // Writing failed (no permission, disk full): the lines stay in memory.
    }
  }, 3000);
}

/** The previous session's log file, for a bug report; empty when there is none. */
export async function previousLog(): Promise<string> {
  if (!inTauri()) return "";
  try {
    const { m, dir } = await fs();
    return (await m.exists(PREVIOUS, dir)) ? await m.readTextFile(PREVIOUS, dir) : "";
  } catch {
    return "";
  }
}
