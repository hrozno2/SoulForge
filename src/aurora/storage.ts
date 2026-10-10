import type { Character } from "./character";
import type { FileCache, SourceConfig } from "./sources";

const DB_NAME = "charforge";
const DB_VERSION = 6;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const tx = req.transaction!;
      if (!db.objectStoreNames.contains("packs")) db.createObjectStore("packs", { keyPath: "id" });
      if (!db.objectStoreNames.contains("sources")) db.createObjectStore("sources", { keyPath: "url" });
      if (!db.objectStoreNames.contains("files")) {
        const files = db.createObjectStore("files", { keyPath: "url" });
        files.createIndex("root", "root");
      }
      if (!db.objectStoreNames.contains("characters")) db.createObjectStore("characters", { keyPath: "id" });
      if (!db.objectStoreNames.contains("templates")) db.createObjectStore("templates", { keyPath: "id" });
      if (!db.objectStoreNames.contains("translations")) db.createObjectStore("translations");
      if (!db.objectStoreNames.contains("backups")) db.createObjectStore("backups");
      // PDF bytes live in their own store so listing templates stays light.
      if (!db.objectStoreNames.contains("templateBytes")) {
        db.createObjectStore("templateBytes");
        const meta = tx.objectStore("templates");
        const bytes = tx.objectStore("templateBytes");
        meta.openCursor().onsuccess = (ev) => {
          const cur = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (!cur) return;
          const rec = cur.value as TemplateRecord & { bytes?: ArrayBuffer };
          if (rec.bytes) {
            bytes.put(rec.bytes, rec.id);
            const { bytes: _drop, ...light } = rec;
            void _drop;
            cur.update(light);
          }
          cur.continue();
        };
      }
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

/** A sheet PDF the player loaded. The file itself is kept on this computer only. */
export interface TemplateRecord {
  id: string;
  name: string;
  kind: "dldm5e24" | "companion" | "wotc2024";
  /** For DLDM sheets, the page styles it contains. For companion sheets, the layout. */
  pages: string[];
  size: number;
  added: number;
}

export async function listTemplates(): Promise<TemplateRecord[]> {
  try {
    const db = await openDb();
    const all = (await wrap(db.transaction("templates").objectStore("templates").getAll())) as TemplateRecord[];
    return all.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function templateBytes(id: string): Promise<ArrayBuffer> {
  const db = await openDb();
  return (await wrap(db.transaction("templateBytes").objectStore("templateBytes").get(id))) as ArrayBuffer;
}

export async function saveTemplate(rec: TemplateRecord, bytes: ArrayBuffer): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(["templates", "templateBytes"], "readwrite");
  tx.objectStore("templates").put(rec);
  tx.objectStore("templateBytes").put(bytes, rec.id);
  await done(tx);
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(["templates", "templateBytes"], "readwrite");
  tx.objectStore("templates").delete(id);
  tx.objectStore("templateBytes").delete(id);
  await done(tx);
}

/** Cache of translated strings, keyed by language and source text. */
export const translationCache = {
  async get(key: string): Promise<string | undefined> {
    try {
      const db = await openDb();
      return (await wrap(db.transaction("translations").objectStore("translations").get(key))) as string | undefined;
    } catch {
      return undefined;
    }
  },
  async put(key: string, value: string): Promise<void> {
    try {
      const db = await openDb();
      const tx = db.transaction("translations", "readwrite");
      tx.objectStore("translations").put(value, key);
      await done(tx);
    } catch {
      /* the cache is optional */
    }
  },
};

/** Automatic backups, one per day, kept by date. */
export const backupStore = {
  async put(date: string, json: string): Promise<void> {
    const db = await openDb();
    const tx = db.transaction("backups", "readwrite");
    tx.objectStore("backups").put(json, date);
    await done(tx);
  },
  async get(date: string): Promise<string | undefined> {
    const db = await openDb();
    return (await wrap(db.transaction("backups").objectStore("backups").get(date))) as string | undefined;
  },
  async dates(): Promise<string[]> {
    try {
      const db = await openDb();
      return ((await wrap(db.transaction("backups").objectStore("backups").getAllKeys())) as string[]).sort().reverse();
    } catch {
      return [];
    }
  },
  async remove(date: string): Promise<void> {
    const db = await openDb();
    const tx = db.transaction("backups", "readwrite");
    tx.objectStore("backups").delete(date);
    await done(tx);
  },
};
