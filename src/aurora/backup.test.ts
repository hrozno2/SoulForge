import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { isBackup, makeBackup, restoreBackup, runAutoBackup } from "./backup";
import { newCharacter } from "./character";
import { backupStore, deleteCharacterRecord, listCharacters, saveCharacterRecord } from "./storage";

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
});
