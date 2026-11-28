import type { Character } from "./character";
import type { FileCache, SourceConfig } from "./sources";

const DB_NAME = "charforge";
/** 8 (2026-11-24): the `portraits` store, audit E6. A version only ever adds stores (see the VersionError path). */
export const DB_VERSION = 8;

/**
 * One connection for the session (the audit's S4: every read and write opened its own and none was closed, and Home
 * reads the library every few seconds). It is let go when another window needs to upgrade the database, or when the
 * browser closes it, and opened again at the next use.
 */
let connection: Promise<IDBDatabase> | undefined;
function openDb(): Promise<IDBDatabase> {
  if (connection) return connection;
  const mine: Promise<IDBDatabase> = openNew().then((db) => {
    const drop = () => {
      if (connection === mine) connection = undefined;
    };
    db.onversionchange = () => {
      db.close();
      drop();
    };
    db.onclose = drop;
    return db;
  });
  connection = mine;
  // A failed open is not kept: the next call tries again.
  mine.catch(() => {
    if (connection === mine) connection = undefined;
  });
  return mine;
}

/** Closes the session's connection (tests, and before the database is deleted). */
export async function closeDb(): Promise<void> {
  const c = connection;
  connection = undefined;
  if (c) (await c.catch(() => undefined))?.close();
}

function openNew(): Promise<IDBDatabase> {
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
      // Small downloaded reference data, by key (the condensed 5e.tools rules reference).
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      // A character's picture by the character's id (audit E6): read when the record holds none.
      if (!db.objectStoreNames.contains("portraits")) db.createObjectStore("portraits");
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
    req.onblocked = () =>
      reject(
        new Error("Soul Forge is open in another window that holds an older version of its data. Close the other window and try again."),
      );
    req.onerror = () => {
      // A newer Soul Forge (the test build shares this data) may have raised the version. New versions only ever
      // add stores, so open it at whatever version it has rather than failing with no content at all.
      if (req.error?.name === "VersionError") {
        const any = indexedDB.open(DB_NAME);
        any.onsuccess = () => resolve(any.result);
        any.onerror = () => reject(any.error);
      } else reject(req.error);
    };
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

/**
 * Every saved character, newest first. Throws when the library cannot be read: an empty list would say "no
 * characters" to the player, and to a restore that compares with what is here (the audit's S3).
 */
export async function listCharacters(): Promise<CharacterRecord[]> {
  const db = await openDb();
  const all = (await wrap(db.transaction("characters").objectStore("characters").getAll())) as CharacterRecord[];
  // Audit E6: a record with no picture gets the one kept for its id in the portraits store (where a save puts it).
  const bare = all.filter((r) => r.data && !r.data.portrait);
  if (bare.length && db.objectStoreNames.contains("portraits")) {
    const store = db.transaction("portraits").objectStore("portraits");
    const kept = await Promise.all(bare.map((r) => wrap(store.get(r.id)) as Promise<unknown>));
    bare.forEach((r, i) => {
      const p = kept[i];
      if (typeof p === "string" && p) r.data = { ...r.data, portrait: p };
    });
  }
  return all.sort((a, b) => b.updated - a.updated);
}

/**
 * Pictures kept apart from the character records (audit E6: a portrait is a long data URL that rode along in every
 * autosave). Step one, v0.28.0: the store exists and is read. Step two, after it: a save writes the picture here and
 * the record without it (saveCharacterRecord). Never both in one release: a build that does not read this store
 * would open the characters without their pictures.
 */
export const portraitStore = {
  async get(id: string): Promise<string | undefined> {
    const db = await openDb();
    if (!db.objectStoreNames.contains("portraits")) return undefined;
    const p = (await wrap(db.transaction("portraits").objectStore("portraits").get(id))) as unknown;
    return typeof p === "string" && p ? p : undefined;
  },
  async put(id: string, dataUrl: string): Promise<void> {
    const db = await openDb();
    if (!db.objectStoreNames.contains("portraits")) return;
    const tx = db.transaction("portraits", "readwrite");
    tx.objectStore("portraits").put(dataUrl, id);
    await done(tx);
  },
  async remove(id: string): Promise<void> {
    const db = await openDb();
    if (!db.objectStoreNames.contains("portraits")) return;
    const tx = db.transaction("portraits", "readwrite");
    tx.objectStore("portraits").delete(id);
    await done(tx);
  },
};

/** The stores a character's record and picture are in; a database from before the portraits store has only one. */
const characterStores = (db: IDBDatabase): string[] =>
  db.objectStoreNames.contains("portraits") ? ["characters", "portraits"] : ["characters"];

/**
 * Puts a record into the library within `tx`: the picture into the portraits store and the record without it, or the
 * record whole where there is no such store. A picture already stored is not written again (it is long, and a save
 * follows every edit); a character with no picture has none kept for it either. `rec` itself is not changed.
 */
async function putCharacter(tx: IDBTransaction, rec: CharacterRecord): Promise<void> {
  const chars = tx.objectStore("characters");
  if (!tx.objectStoreNames.contains("portraits") || !rec.data) {
    chars.put(rec);
    return;
  }
  const portraits = tx.objectStore("portraits");
  const picture = rec.data.portrait;
  const kept = (await wrap(portraits.get(rec.id))) as unknown;
  if (picture) {
    if (kept !== picture) portraits.put(picture, rec.id);
  } else if (kept !== undefined) portraits.delete(rec.id);
  chars.put(picture ? { ...rec, data: { ...rec.data, portrait: undefined } } : rec);
}

/** A record as the characters store holds it, with its picture from the portraits store when it has none itself. */
async function takeCharacter(tx: IDBTransaction, id: string): Promise<CharacterRecord | undefined> {
  const rec = (await wrap(tx.objectStore("characters").get(id))) as CharacterRecord | undefined;
  if (!rec?.data || rec.data.portrait || !tx.objectStoreNames.contains("portraits")) return rec;
  const kept = (await wrap(tx.objectStore("portraits").get(id))) as unknown;
  return typeof kept === "string" && kept ? { ...rec, data: { ...rec.data, portrait: kept } } : rec;
}

/** Takes a record and its picture out of the library within `tx`. */
function dropCharacter(tx: IDBTransaction, id: string): void {
  tx.objectStore("characters").delete(id);
  if (tx.objectStoreNames.contains("portraits")) tx.objectStore("portraits").delete(id);
}

export async function saveCharacterRecord(rec: CharacterRecord): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(characterStores(db), "readwrite");
  const finished = done(tx);
  await putCharacter(tx, rec);
  await finished;
}

export async function deleteCharacterRecord(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(characterStores(db), "readwrite");
  dropCharacter(tx, id);
  await done(tx);
}

/** A deleted character, kept in "Recently deleted" (E3.4) with the time it was deleted. */
export interface TrashedRecord {
  rec: CharacterRecord;
  deleted: number;
}
export const TRASH_DAYS = 30;
const TRASH_KEY = "trash";
const fresh = (t: TrashedRecord[], now = Date.now()) => t.filter((x) => now - x.deleted < TRASH_DAYS * 86400000);

/**
 * Deletes a character into "Recently deleted": the record leaves the library and joins the trash in one transaction,
 * so a failure leaves it where it was. Entries older than TRASH_DAYS are forgotten. `at` is for tests.
 */
export async function trashCharacter(id: string, at = Date.now()): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([...characterStores(db), "meta"], "readwrite");
  const finished = done(tx);
  const meta = tx.objectStore("meta");
  // Whole, with its picture: the trash is where it lives until it is restored or forgotten.
  const rec = await takeCharacter(tx, id);
  const trash = ((await wrap(meta.get(TRASH_KEY))) as TrashedRecord[] | undefined) ?? [];
  if (rec) {
    meta.put(fresh([{ rec, deleted: at }, ...trash.filter((x) => x.rec.id !== id)]), TRASH_KEY);
    dropCharacter(tx, id);
  }
  await finished;
}

/** "Recently deleted", newest first. */
export async function listTrash(): Promise<TrashedRecord[]> {
  const db = await openDb();
  const trash = ((await wrap(db.transaction("meta").objectStore("meta").get(TRASH_KEY))) as TrashedRecord[] | undefined) ?? [];
  return fresh(trash).sort((a, b) => b.deleted - a.deleted);
}

/** Puts a deleted character back in the library (and out of the trash), in one transaction. */
export async function restoreTrashed(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([...characterStores(db), "meta"], "readwrite");
  const finished = done(tx);
  const meta = tx.objectStore("meta");
  const trash = ((await wrap(meta.get(TRASH_KEY))) as TrashedRecord[] | undefined) ?? [];
  const hit = trash.find((x) => x.rec.id === id);
  if (hit) {
    await putCharacter(tx, hit.rec);
    meta.put(
      trash.filter((x) => x.rec.id !== id),
      TRASH_KEY,
    );
  }
  await finished;
}

/** Forgets a deleted character for good. */
export async function purgeTrashed(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("meta", "readwrite");
  const meta = tx.objectStore("meta");
  const trash = ((await wrap(meta.get(TRASH_KEY))) as TrashedRecord[] | undefined) ?? [];
  meta.put(
    trash.filter((x) => x.rec.id !== id),
    TRASH_KEY,
  );
  await done(tx);
}

/** A sheet PDF the player loaded. The file itself is kept on this computer only. */
export interface TemplateRecord {
  id: string;
  name: string;
  kind: "dldm5e24" | "companion" | "official" | "auto" | "wotc2024" | "wotc2024form" | "wotc2014form" | "wotc2014";
  /** For DLDM sheets, the page styles it contains. For companion sheets, the layout. */
  pages: string[];
  size: number;
  added: number;
  /** SHA-256 of the file, so the same file is never kept twice. */
  hash?: string;
  /** For official sheets: which known layout it is, and whether the boxes are real form fields. */
  layout?: string;
  form?: boolean;
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

// The last sheets read, kept for the session: a 16 MB template was read from the database for every preview (C7.8).
const tplCache = new Map<string, ArrayBuffer>();
export async function templateBytes(id: string): Promise<ArrayBuffer> {
  const hit = tplCache.get(id);
  if (hit) return hit;
  const db = await openDb();
  const bytes = (await wrap(db.transaction("templateBytes").objectStore("templateBytes").get(id))) as ArrayBuffer;
  if (bytes) {
    if (tplCache.size >= 3) tplCache.delete(tplCache.keys().next().value!);
    tplCache.set(id, bytes);
  }
  return bytes;
}

export async function saveTemplate(rec: TemplateRecord, bytes: ArrayBuffer): Promise<void> {
  tplCache.delete(rec.id);
  const db = await openDb();
  const tx = db.transaction(["templates", "templateBytes"], "readwrite");
  tx.objectStore("templates").put(rec);
  tx.objectStore("templateBytes").put(bytes, rec.id);
  await done(tx);
}

export async function deleteTemplate(id: string): Promise<void> {
  tplCache.delete(id);
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

/** Small downloaded data kept between sessions (the rules reference). */
export const metaStore = {
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const db = await openDb();
      return (await wrap(db.transaction("meta").objectStore("meta").get(key))) as T | undefined;
    } catch {
      return undefined;
    }
  },
  async put(key: string, value: unknown): Promise<void> {
    try {
      const db = await openDb();
      const tx = db.transaction("meta", "readwrite");
      tx.objectStore("meta").put(value, key);
      await done(tx);
    } catch {
      /* optional */
    }
  },
};
