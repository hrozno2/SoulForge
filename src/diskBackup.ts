/**
 * The daily backup as a file on disk, in the desktop app (docs/AUDIT-2026-11-10.md, S5): the backups in the app's
 * database share its fate, so a lost or damaged database took them along. Files live in the app's data folder,
 * under "backups"; a file opens from Home ("Open file") or Settings ("Restore...") like any library file.
 */
import type { BackupDisk } from "./aurora/backup";

const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const FOLDER = "backups";

/** The app data folder's backups, or null outside the desktop app. */
export async function appDataDisk(): Promise<BackupDisk | null> {
  if (!inTauri()) return null;
  const m = await import("@tauri-apps/plugin-fs");
  const dir = { baseDir: m.BaseDirectory.AppData };
  const ready = async () => { if (!(await m.exists(FOLDER, dir))) await m.mkdir(FOLDER, { ...dir, recursive: true }); };
  return {
    async write(name, text) { await ready(); await m.writeTextFile(`${FOLDER}/${name}`, text, dir); },
    async names() { await ready(); return (await m.readDir(FOLDER, dir)).filter((e) => e.isFile).map((e) => e.name); },
    async remove(name) { await m.remove(`${FOLDER}/${name}`, dir); },
  };
}

/** The folder's full path, to show and to open; empty outside the desktop app. */
export async function backupFolder(): Promise<string> {
  if (!inTauri()) return "";
  try {
    const { appDataDir, join } = await import("@tauri-apps/api/path");
    return await join(await appDataDir(), FOLDER);
  } catch {
    return "";
  }
}
