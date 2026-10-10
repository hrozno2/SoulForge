/** Opens a link in the system browser inside Tauri, or a new tab in dev. */
export async function openExternal(url: string): Promise<void> {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Saves bytes with a native Save dialog in Tauri, or a normal download in a browser. */
export async function saveFile(name: string, data: Uint8Array, mime: string): Promise<boolean> {
  const ext = name.split(".").pop() ?? "";
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ defaultPath: name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (!path) return false;
    await writeFile(path, data);
    return true;
  } catch {
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }
}

const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Opens the system file picker. In the desktop app this is the native dialog, which opens at once; a web
 * file input can stall for seconds on macOS. Returns null outside the desktop app so callers fall back to an input.
 */
export async function pickFiles(extensions: string[], multiple = false): Promise<File[] | null> {
  if (!inTauri()) return null;
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const chosen = await open({ multiple, directory: false, filters: [{ name: extensions.join(", "), extensions }] });
    if (!chosen) return [];
    const paths = Array.isArray(chosen) ? chosen : [chosen];
    return await Promise.all(paths.map(async (path) => new File([(await readFile(path)) as BlobPart], path.split(/[\\/]/).pop() ?? "file")));
  } catch {
    return null;
  }
}

/** Lets the browser paint a message before a long synchronous job starts. */
export const nextFrame = () => new Promise<void>((r) => setTimeout(r, 30));
