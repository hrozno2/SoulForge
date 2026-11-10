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

/** The local date: a backup made at half past midnight belongs to today, not to UTC's yesterday. */
export const localDate = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => localDate();
export const KEEP_BACKUPS = 7;
/** Files kept on disk: two weeks, since they are the copy that outlives the app's database. */
export const KEEP_DISK_BACKUPS = 14;

/** Where backup files go besides the app's database (the desktop app's data folder; src/diskBackup.ts). */
export interface BackupDisk {
  write(name: string, text: string): Promise<void>;
  names(): Promise<string[]>;
  remove(name: string): Promise<void>;
}
const diskName = (date: string) => `soul-forge-backup-${date}.json`;
const DISK_NAME = /^soul-forge-backup-\d{4}-\d{2}-\d{2}\.json$/;

/**
 * Makes today's backup if there is none yet and there is something to save. Old ones beyond the last week are
 * dropped. With a disk, today's backup is also written there as a file (and the oldest files beyond two weeks
 * removed); a disk that fails does not fail the backup, its error is handed to `onDiskError`.
 */
export async function runAutoBackup(enabled: boolean, disk?: BackupDisk | null, onDiskError?: (e: unknown) => void): Promise<string | null> {
  if (!enabled) return null;
  const date = today();
  let json = await backupStore.get(date);
  let made: string | null = null;
  if (!json) {
    const b = await makeBackup();
    if (!b.characters.length) return null;
    json = JSON.stringify(b);
    await backupStore.put(date, json);
    const dates = await backupStore.dates();
    for (const d of dates.slice(KEEP_BACKUPS)) await backupStore.remove(d);
    made = date;
  }
  if (disk) {
    try {
      const names = (await disk.names()).filter((n) => DISK_NAME.test(n));
      if (!names.includes(diskName(date))) {
        await disk.write(diskName(date), json);
        names.push(diskName(date));
      }
      for (const old of names.sort().reverse().slice(KEEP_DISK_BACKUPS)) await disk.remove(old);
    } catch (e) {
      onDiskError?.(e);
    }
  }
  return made;
}

export function backupFileName(): string {
  return `soul-forge-backup-${today()}.json`;
}

export { SETTING_KEYS };
