/**
 * The whole character library as one file (C5.8), to carry it to another device: the backup Settings always made,
 * now also on Home. A file of either kind can be opened from Home: a character opens, a library restores.
 */
import { backupFileName, isBackup, makeBackup, restoreBackup } from "../aurora/backup";
import { saveFile } from "../store";
import { allLayouts, restoreLayouts, type FloatWindow } from "./Floating";

/** Saves every character in one file; says what happened. */
export async function exportLibrary(): Promise<string> {
  // The characters, and each one's card layout (C4), which is kept outside the character itself.
  const backup = { ...(await makeBackup()), layouts: allLayouts() };
  const ok = await saveFile(backupFileName(), new TextEncoder().encode(JSON.stringify(backup, null, 2)), "application/json");
  return ok ? `Saved ${backup.characters.length} ${backup.characters.length === 1 ? "character" : "characters"} in one file.` : "Cancelled.";
}

/** Restores a library file's characters next to the ones here (a newer copy wins); says what happened. */
export async function importLibrary(value: unknown): Promise<string> {
  if (!isBackup(value)) throw new Error("That is not a Soul Forge library file.");
  const r = await restoreBackup(value, "merge");
  restoreLayouts((value as { layouts?: Record<string, FloatWindow[]> }).layouts);
  return `Library restored: ${r.added} added, ${r.updated} updated, ${r.kept} already newer here.`;
}

export { isBackup };
