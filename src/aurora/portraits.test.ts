/**
 * Audit E6, second half, step one of two: the `portraits` store. A character whose record holds no picture gets the
 * one kept for its id; a record that holds its own keeps it. Writing stays in the record for now, so an older build
 * never opens a character without its picture; the release after this one moves the writing.
 */
import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { newCharacter } from "./character";
import { DB_VERSION, closeDb, listCharacters, portraitStore, saveCharacterRecord } from "./storage";

const rec = (id: string, name: string, portrait?: string) => ({
  id,
  name,
  summary: "",
  updated: 100,
  data: { ...newCharacter(), name, portrait },
});

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
  await saveCharacterRecord(rec("both", "Both", "data:image/png;base64,RECORD"));
  await portraitStore.put("both", "data:image/png;base64,STORED");
  expect((await listCharacters()).find((c) => c.id === "both")!.data.portrait).toBe("data:image/png;base64,RECORD");
});

it("leaves a character with no picture anywhere as it is, and forgets a stored picture when asked", async () => {
  await saveCharacterRecord(rec("none", "None"));
  expect((await listCharacters()).find((c) => c.id === "none")!.data.portrait).toBeUndefined();
  await portraitStore.remove("bare");
  expect((await listCharacters()).find((c) => c.id === "bare")!.data.portrait).toBeUndefined();
  await closeDb();
});
