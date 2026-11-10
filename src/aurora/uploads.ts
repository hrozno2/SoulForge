import JSZip from "jszip";

/**
 * Limits on what an upload may unpack to (docs/AUDIT-2026-11-10.md, X3): a ZIP a few kilobytes small can unpack to
 * gigabytes and take the app down with it. The real sets are far below these (5e.tools' data folder is about 200 MB
 * in 1,500 files, its largest file under 20 MB).
 */
export const UPLOAD_LIMITS = { files: 20_000, fileBytes: 96 * 1024 * 1024, totalBytes: 1024 * 1024 * 1024 };

/** Counts what an upload has unpacked so far and stops it, in words, past a limit. */
export function uploadBudget(limits = UPLOAD_LIMITS) {
  let files = 0;
  let total = 0;
  const mb = (n: number) => `${Math.round(n / (1024 * 1024))} MB`;
  return {
    /** Before unpacking: the size the archive states for a file, when it states one. */
    declared(name: string, bytes: number | undefined) {
      if (bytes !== undefined && bytes > limits.fileBytes) throw new Error(`${name} unpacks to ${mb(bytes)}, more than the ${mb(limits.fileBytes)} a content file may have. Nothing was added.`);
      if (bytes !== undefined && total + bytes > limits.totalBytes) throw new Error(`This upload unpacks to more than ${mb(limits.totalBytes)}. Nothing was added.`);
    },
    /** After reading a file: its real size. */
    took(name: string, bytes: number) {
      files++;
      total += bytes;
      if (files > limits.files) throw new Error(`This upload has more than ${limits.files} files. Nothing was added.`);
      if (bytes > limits.fileBytes) throw new Error(`${name} is ${mb(bytes)}, more than the ${mb(limits.fileBytes)} a content file may have. Nothing was added.`);
      if (total > limits.totalBytes) throw new Error(`This upload unpacks to more than ${mb(limits.totalBytes)}. Nothing was added.`);
    },
  };
}
/** The unpacked size a ZIP states for an entry (not part of jszip's public types). */
const statedSize = (entry: unknown): number | undefined => (entry as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;

export interface UploadedXml {
  path: string;
  xml: string;
}

/** Accepts the GitHub "Download ZIP" of an elements repo, or loose .xml files. */
export async function readAuroraUpload(list: File[]): Promise<UploadedXml[]> {
  const out: UploadedXml[] = [];
  const budget = uploadBudget();
  for (const file of list) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".zip")) {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const names = Object.keys(zip.files).filter((n) => n.toLowerCase().endsWith(".xml") && !zip.files[n].dir);
      for (const name of names) {
        // Drop the "elements-master/" wrapper folder GitHub adds.
        const path = name.split("/").slice(1).join("/") || name;
        budget.declared(name, statedSize(zip.files[name]));
        const xml = await zip.files[name].async("string");
        budget.took(name, xml.length);
        out.push({ path, xml });
      }
    } else if (lower.endsWith(".xml")) {
      budget.declared(file.name, file.size);
      const xml = await file.text();
      budget.took(file.name, xml.length);
      out.push({ path: file.name, xml });
    }
  }
  return out;
}

/** Reads 5etools data: .json files, or a ZIP of the data folder. Paths are kept relative to the data folder. */
export async function readFiveToolsUpload(list: File[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const budget = uploadBudget();
  for (const file of list) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".zip")) {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const names = Object.keys(zip.files).filter((n) => n.toLowerCase().endsWith(".json") && !zip.files[n].dir);
      // Keep the part after a "data/" folder when there is one, otherwise drop the wrapper folder.
      for (const name of names) {
        const at = name.indexOf("data/");
        const path = at >= 0 ? name.slice(at + 5) : name.split("/").slice(1).join("/") || name;
        if (/^(fluff|generated|bestiary\/fluff|roll20|foundry)/.test(path) || /fluff/.test(path)) continue;
        budget.declared(name, statedSize(zip.files[name]));
        const text = await zip.files[name].async("string");
        budget.took(name, text.length);
        out.set(path, text);
      }
    } else if (lower.endsWith(".json")) {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
      const at = rel ? rel.indexOf("data/") : -1;
      budget.declared(file.name, file.size);
      const text = await file.text();
      budget.took(file.name, text.length);
      out.set(at >= 0 ? rel!.slice(at + 5) : rel ? rel.split("/").slice(1).join("/") : file.name, text);
    }
  }
  return out;
}
