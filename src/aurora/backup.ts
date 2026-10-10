/** Backing up and restoring every character, by hand or automatically once a day. */
import { normalizeCharacter, type Character } from "./character";
import { backupStore, listCharacters, saveCharacterRecord, type CharacterRecord } from "./storage";

export interface BackupFile {
  app: "Soul Forge";
  kind: "backup";
  version: 1;
  created: number;
  characters: { id: string; name: string; summary: string; updated: number; data: Character }[];
}

/** Settings worth carrying along. Anything that holds a key or password is left out. */
const SETTING_KEYS = ["charforge.settings", "charforge.theme"];

export async function makeBackup(): Promise<BackupFile> {
  const list = await listCharacters();
  return {
    app: "Soul Forge",
    kind: "backup",
    version: 1,
    created: Date.now(),
    characters: list.map((c) => ({ id: c.id, name: c.name, summary: c.summary, updated: c.updated, data: c.data })),
  };
}

export function isBackup(v: unknown): v is BackupFile {
  const b = v as BackupFile;
  return !!b && b.app === "Soul Forge" && b.kind === "backup" && Array.isArray(b.characters);
}

export interface RestoreResult {
  added: number;
  updated: number;
  kept: number;
}

/**
 * Puts a backup's characters back. With "merge" a character already here is replaced only if the backup's copy is
 * newer; with "replace" every backed-up character overwrites its copy. Nothing is ever deleted.
 */
export async function restoreBackup(file: BackupFile, mode: "merge" | "replace" = "merge"): Promise<RestoreResult> {
  const here = new Map((await listCharacters()).map((c) => [c.id, c] as const));
  const out: RestoreResult = { added: 0, updated: 0, kept: 0 };
  for (const c of file.characters) {
    const existing = here.get(c.id);
    if (existing && mode === "merge" && existing.updated >= c.updated) {
      out.kept++;
      continue;
    }
    const rec: CharacterRecord = { id: c.id, name: c.name, summary: c.summary, updated: mode === "replace" ? Date.now() : c.updated, data: normalizeCharacter(c.data) };
    await saveCharacterRecord(rec);
    if (existing) out.updated++;
    else out.added++;
  }
  return out;
}

const today = () => new Date().toISOString().slice(0, 10);
export const KEEP_BACKUPS = 7;

/** Makes today's backup if there is none yet and there is something to save. Old ones beyond the last week are dropped. */
export async function runAutoBackup(enabled: boolean): Promise<string | null> {
  if (!enabled) return null;
  const date = today();
  if (await backupStore.get(date)) return null;
  const b = await makeBackup();
  if (!b.characters.length) return null;
  await backupStore.put(date, JSON.stringify(b));
  const dates = await backupStore.dates();
  for (const d of dates.slice(KEEP_BACKUPS)) await backupStore.remove(d);
  return date;
}

export function backupFileName(): string {
  return `soul-forge-backup-${today()}.json`;
}

export { SETTING_KEYS };
