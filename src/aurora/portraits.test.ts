/**
 * Audit E6, second half: the `portraits` store. Step one (v0.28.0): a character whose record holds no picture gets
 * the one kept for its id; a record that still holds its own keeps it. Step two (after v0.28.0, which reads the
 * store): a save writes the picture to the store and the record without it, in one transaction, and everything that
 * takes a character out of the library (the list, the trash) hands it over whole.
 */
import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { newCharacter } from "./character";
import {
  DB_VERSION,
  closeDb,
  deleteCharacterRecord,
  listCharacters,
  listTrash,
  portraitStore,
  restoreTrashed,
  saveCharacterRecord,
  trashCharacter,
} from "./storage";

const rec = (id: string, name: string, portrait?: string) => ({
  id,
  name,
  summary: "",
  updated: 100,
  data: { ...newCharacter(), name, portrait },
});

// The record exactly as the characters store holds it, and a record put there as an older build wrote it.
const open = () =>
  new Promise<IDBDatabase>((ok, no) => {
    const req = indexedDB.open("charforge");
    req.onsuccess = () => ok(req.result);
    req.onerror = () => no(req.error);
  });
const raw = async (id: string) => {
  const db = await open();
  const got = await new Promise<{ data: { portrait?: string } } | undefined>((ok, no) => {
    const q = db.transaction("characters").objectStore("characters").get(id);
    q.onsuccess = () => ok(q.result as { data: { portrait?: string } } | undefined);
    q.onerror = () => no(q.error);
  });
  db.close();
  return got;
};
const putRaw = async (r: ReturnType<typeof rec>) => {
  const db = await open();
  await new Promise<void>((ok, no) => {
    const tx = db.transaction("characters", "readwrite");
    tx.objectStore("characters").put(r);
    tx.oncomplete = () => ok();
    tx.onerror = () => no(tx.error);
  });
  db.close();
};
const whole = async (id: string) => (await listCharacters()).find((c) => c.id === id)?.data.portrait;

it("a library made by the version before opens with everything in it, and gains the portraits store", async () => {
  // Version 7, as released: the stores it had, one character with its picture in the record.
  await new Promise<void>((ok, no) => {
    const req = indexedDB.open("charforge", 7);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("characters", { keyPath: "id" });
      db.createObjectStore("meta");
      req.transaction!.objectStore("characters").put(rec("old", "Old Guard", "data:image/png;base64,OLD"));
    };
    req.onsuccess = () => {
      req.result.close();
      ok();
    };
    req.onerror = () => no(req.error);
  });
  expect(DB_VERSION).toBe(8);
  const all = await listCharacters();
  expect(all.map((c) => [c.name, c.data.portrait])).toEqual([["Old Guard", "data:image/png;base64,OLD"]]);
  expect(await portraitStore.get("old")).toBeUndefined();
});

it("reads a picture from the portraits store when the record has none", async () => {
  await saveCharacterRecord(rec("bare", "Bare"));
  await portraitStore.put("bare", "data:image/png;base64,STORED");
  const got = (await listCharacters()).find((c) => c.id === "bare")!;
  expect(got.data.portrait).toBe("data:image/png;base64,STORED");
});

it("keeps the record's own picture when both exist", async () => {
  await putRaw(rec("both", "Both", "data:image/png;base64,RECORD"));
  await portraitStore.put("both", "data:image/png;base64,STORED");
  expect((await listCharacters()).find((c) => c.id === "both")!.data.portrait).toBe("data:image/png;base64,RECORD");
});

it("leaves a character with no picture anywhere as it is, and forgets a stored picture when asked", async () => {
  await saveCharacterRecord(rec("none", "None"));
  expect((await listCharacters()).find((c) => c.id === "none")!.data.portrait).toBeUndefined();
  await portraitStore.remove("bare");
  expect((await listCharacters()).find((c) => c.id === "bare")!.data.portrait).toBeUndefined();
});

it("a save keeps the picture in the portraits store and the record without it", async () => {
  await saveCharacterRecord(rec("s1", "Saved", "data:image/png;base64,ONE"));
  expect((await raw("s1"))?.data.portrait).toBeUndefined();
  expect(await portraitStore.get("s1")).toBe("data:image/png;base64,ONE");
  expect(await whole("s1")).toBe("data:image/png;base64,ONE");
  // The record handed in is the open character: it is not changed.
  const mine = rec("s1", "Saved", "data:image/png;base64,TWO");
  await saveCharacterRecord(mine);
  expect(mine.data.portrait).toBe("data:image/png;base64,TWO");
  expect(await whole("s1")).toBe("data:image/png;base64,TWO");
  // The picture taken off the character is gone from the store too, not put back at the next start.
  await saveCharacterRecord(rec("s1", "Saved"));
  expect(await portraitStore.get("s1")).toBeUndefined();
  expect(await whole("s1")).toBeUndefined();
});

it("a record an older build wrote with its picture moves the picture at its next save", async () => {
  await putRaw(rec("old2", "Older", "data:image/png;base64,INSIDE"));
  const got = (await listCharacters()).find((c) => c.id === "old2")!;
  await saveCharacterRecord({ ...got, updated: 200 });
  expect((await raw("old2"))?.data.portrait).toBeUndefined();
  expect(await whole("old2")).toBe("data:image/png;base64,INSIDE");
});

it("a deleted character takes its picture with it, and comes back from the trash with it", async () => {
  await saveCharacterRecord(rec("d1", "Deleted", "data:image/png;base64,D"));
  await deleteCharacterRecord("d1");
  expect(await portraitStore.get("d1")).toBeUndefined();

  await saveCharacterRecord(rec("t1", "Trashed", "data:image/png;base64,T"));
  await trashCharacter("t1");
  expect(await portraitStore.get("t1")).toBeUndefined();
  expect((await listTrash()).find((x) => x.rec.id === "t1")?.rec.data.portrait).toBe("data:image/png;base64,T");
  await restoreTrashed("t1");
  expect(await whole("t1")).toBe("data:image/png;base64,T");
  expect((await raw("t1"))?.data.portrait).toBeUndefined();
  await closeDb();
});
