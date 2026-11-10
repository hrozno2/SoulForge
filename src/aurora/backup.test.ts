import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { isBackup, localDate, makeBackup, restoreBackup, runAutoBackup, type BackupDisk } from "./backup";
import { newCharacter } from "./character";
import { backupStore, closeDb, deleteCharacterRecord, listCharacters, saveCharacterRecord } from "./storage";

const rec = (id: string, name: string, updated: number) => ({ id, name, summary: "", updated, data: { ...newCharacter(), name } });

describe("backups", () => {
  it("round-trips characters and never deletes anything on restore", async () => {
    await saveCharacterRecord(rec("a", "Ada", 100));
    await saveCharacterRecord(rec("b", "Bo", 100));
    const backup = await makeBackup();
    expect(isBackup(backup)).toBe(true);
    expect(backup.characters.map((c) => c.name).sort()).toEqual(["Ada", "Bo"]);

    await deleteCharacterRecord("a");
    await saveCharacterRecord(rec("b", "Bo (newer)", 500));
    const r = await restoreBackup(backup, "merge");
    expect(r).toEqual({ added: 1, updated: 0, kept: 1 });
    const names = (await listCharacters()).map((c) => c.name).sort();
    expect(names).toEqual(["Ada", "Bo (newer)"]);

    const r2 = await restoreBackup(backup, "replace");
    expect(r2.updated).toBe(2);
    expect((await listCharacters()).map((c) => c.name).sort()).toEqual(["Ada", "Bo"]);
  });

  it("refuses files that are not backups", () => {
    expect(isBackup({ kind: "backup" })).toBe(false);
    expect(isBackup(null)).toBe(false);
  });

  it("makes one automatic backup a day and keeps a week", async () => {
    expect(await runAutoBackup(false)).toBeNull();
    const first = await runAutoBackup(true);
    expect(first).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await runAutoBackup(true)).toBeNull();
    for (let i = 1; i <= 9; i++) await backupStore.put(`2020-01-0${i}`, "{}");
    await backupStore.remove(first!);
    await runAutoBackup(true);
    expect((await backupStore.dates()).length).toBeLessThanOrEqual(7);
  });

  it("files a backup under the local date", () => {
    // Half past midnight on the 2nd, local time, whatever the zone: UTC's date may still be the 1st.
    expect(localDate(new Date(2026, 10, 2, 0, 30))).toBe("2026-11-02");
  });

  it("also writes today's backup as a file, once, and keeps two weeks of files", async () => {
    const files = new Map<string, string>();
    for (let i = 1; i <= 16; i++) files.set(`soul-forge-backup-2020-01-${String(i).padStart(2, "0")}.json`, "{}");
    files.set("notes.txt", "mine");
    const disk: BackupDisk = { write: async (n, t) => void files.set(n, t), names: async () => [...files.keys()], remove: async (n) => void files.delete(n) };
    await runAutoBackup(true, disk);
    const today = `soul-forge-backup-${localDate()}.json`;
    expect(isBackup(JSON.parse(files.get(today)!))).toBe(true);
    expect([...files.keys()].filter((n) => n.startsWith("soul-forge-backup-")).length).toBe(14);
    expect(files.has("soul-forge-backup-2020-01-01.json")).toBe(false);
    // Files that are not backups are never touched.
    expect(files.get("notes.txt")).toBe("mine");
    const write = vi.fn(disk.write);
    await runAutoBackup(true, { ...disk, write });
    expect(write).not.toHaveBeenCalled();
  });

  it("a disk that fails does not fail the backup", async () => {
    const errors: unknown[] = [];
    const disk: BackupDisk = { write: async () => { throw new Error("read-only"); }, names: async () => [], remove: async () => undefined };
    await expect(runAutoBackup(true, disk, (e) => errors.push(e))).resolves.toBeNull();
    expect(errors.length).toBe(1);
  });

  // The audit's S3: an unreadable library read as empty, so a merge restore wrote older copies over newer ones.
  it("stops a restore when the library cannot be read, and reads again afterwards", async () => {
    await saveCharacterRecord(rec("n", "Newer here", 900));
    const backup = { app: "Soul Forge" as const, kind: "backup" as const, version: 1 as const, created: 1, characters: [rec("n", "Older in the file", 100)] };
    await closeDb();
    const spy = vi.spyOn(indexedDB, "open").mockImplementation(() => {
      const req = { error: new Error("storage broken") } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => (req.onerror as unknown as () => void)?.());
      return req;
    });
    await expect(listCharacters()).rejects.toThrow("storage broken");
    await expect(restoreBackup(backup, "merge")).rejects.toThrow("storage broken");
    spy.mockRestore();
    expect((await listCharacters()).find((c) => c.id === "n")?.name).toBe("Newer here");
  });
});
