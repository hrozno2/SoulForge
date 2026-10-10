import type { Character } from "./character";
import type { FileCache, SourceConfig } from "./sources";

const DB_NAME = "charforge";
const DB_VERSION = 2;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("packs")) db.createObjectStore("packs", { keyPath: "id" });
      if (!db.objectStoreNames.contains("sources")) db.createObjectStore("sources", { keyPath: "url" });
      if (!db.objectStoreNames.contains("files")) {
        const files = db.createObjectStore("files", { keyPath: "url" });
        files.createIndex("root", "root");
      }
      if (!db.objectStoreNames.contains("characters")) db.createObjectStore("characters", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const wrap = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

export async function listSources(): Promise<SourceConfig[]> {
  const db = await openDb();
  const all = await wrap(db.transaction("sources").objectStore("sources").getAll());
  return (all as SourceConfig[]).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveSource(cfg: SourceConfig): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("sources", "readwrite");
  tx.objectStore("sources").put(cfg);
  await done(tx);
}

export async function deleteSource(url: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(["sources", "files"], "readwrite");
  tx.objectStore("sources").delete(url);
  const files = tx.objectStore("files");
  const keys = await wrap(files.index("root").getAllKeys(url));
  for (const k of keys) files.delete(k as IDBValidKey);
  await done(tx);
}

interface FileRecord {
  url: string;
  text: string;
  root: string;
}

export const idbFileCache: FileCache = {
  async get(url) {
    const db = await openDb();
    const rec = (await wrap(db.transaction("files").objectStore("files").get(url))) as FileRecord | undefined;
    return rec?.text;
  },
  async put(url, text, root) {
    const db = await openDb();
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put({ url, text, root } satisfies FileRecord);
    await done(tx);
  },
  async keys(root) {
    const db = await openDb();
    return (await wrap(db.transaction("files").objectStore("files").index("root").getAllKeys(root))) as string[];
  },
  async remove(url) {
    const db = await openDb();
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").delete(url);
    await done(tx);
  },
};

/** Reads cached files for a list of urls in one transaction. */
export async function readFiles(urls: string[]): Promise<Map<string, string>> {
  const db = await openDb();
  const store = db.transaction("files").objectStore("files");
  const out = new Map<string, string>();
  await Promise.all(
    urls.map(async (u) => {
      const rec = (await wrap(store.get(u))) as FileRecord | undefined;
      if (rec) out.set(u, rec.text);
    }),
  );
  return out;
}

export interface CharacterRecord {
  id: string;
  name: string;
  summary: string;
  updated: number;
  data: Character;
}

export async function listCharacters(): Promise<CharacterRecord[]> {
  try {
    const db = await openDb();
    const all = (await wrap(db.transaction("characters").objectStore("characters").getAll())) as CharacterRecord[];
    return all.sort((a, b) => b.updated - a.updated);
  } catch {
    return [];
  }
}

export async function saveCharacterRecord(rec: CharacterRecord): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("characters", "readwrite");
  tx.objectStore("characters").put(rec);
  await done(tx);
}

export async function deleteCharacterRecord(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("characters", "readwrite");
  tx.objectStore("characters").delete(id);
  await done(tx);
}
