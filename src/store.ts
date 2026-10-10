import type { Character, Pack } from "./engine/types";
import { newCharacter } from "./engine/compute";

const CHAR_KEY = "charforge.character.v1";

export function loadCharacter(): Character {
  try {
    const raw = localStorage.getItem(CHAR_KEY);
    if (raw) return { ...newCharacter(), ...(JSON.parse(raw) as Character) };
  } catch {
    /* fall through to a fresh character */
  }
  return newCharacter();
}

export function saveCharacter(ch: Character): void {
  try {
    localStorage.setItem(CHAR_KEY, JSON.stringify(ch));
  } catch {
    /* storage can be unavailable; the app still works */
  }
}

/** Imported packs can be several MB, so they live in IndexedDB rather than localStorage. */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("charforge", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("packs", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadPacks(): Promise<Pack[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction("packs").objectStore("packs").getAll();
      req.onsuccess = () => resolve(req.result as Pack[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function savePack(pack: Pack): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("packs", "readwrite");
    tx.objectStore("packs").put(pack);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deletePack(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("packs", "readwrite");
    tx.objectStore("packs").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Opens a link in the system browser inside Tauri, or a new tab in dev. */
export async function openExternal(url: string): Promise<void> {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Saves bytes with a native Save dialog in Tauri, or a normal download in a browser. */
export async function saveFile(name: string, data: Uint8Array, mime: string): Promise<boolean> {
  const ext = name.split(".").pop() ?? "";
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ defaultPath: name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (!path) return false;
    await writeFile(path, data);
    return true;
  } catch {
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }
}
