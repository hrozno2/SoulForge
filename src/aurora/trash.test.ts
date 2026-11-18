/**
 * E3.4, the library's safety net: deleting a character puts it in "Recently deleted" for 30 days, from where it can be
 * restored; the delete and the trash are one step, so a failed write never loses the character.
 */
import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { newCharacter } from "./character";
import { listCharacters, listTrash, purgeTrashed, restoreTrashed, saveCharacterRecord, trashCharacter, TRASH_DAYS } from "./storage";

const rec = (id: string, name: string) => ({ id, name, summary: "", updated: 100, data: { ...newCharacter(), name } });

it("keeps a deleted character for 30 days, and restores it", async () => {
  await saveCharacterRecord(rec("a", "Ada"));
  await saveCharacterRecord(rec("b", "Bo"));
  await trashCharacter("a");
  expect((await listCharacters()).map((c) => c.name)).toEqual(["Bo"]);
  const trash = await listTrash();
  expect(trash.map((t) => t.rec.name)).toEqual(["Ada"]);
  await restoreTrashed("a");
  expect((await listCharacters()).map((c) => c.name).sort()).toEqual(["Ada", "Bo"]);
  expect(await listTrash()).toEqual([]);
});

it("forgets a deleted character only when asked, or after 30 days", async () => {
  await saveCharacterRecord(rec("c", "Cy"));
  await trashCharacter("c");
  await purgeTrashed("c");
  expect(await listTrash()).toEqual([]);
  await saveCharacterRecord(rec("d", "Di"));
  await trashCharacter("d", Date.now() - (TRASH_DAYS + 1) * 86400000);
  await saveCharacterRecord(rec("e", "Ed"));
  await trashCharacter("e");
  expect((await listTrash()).map((t) => t.rec.name)).toEqual(["Ed"]);
});
