import JSZip from "jszip";

export interface UploadedXml {
  path: string;
  xml: string;
}

/** Accepts the GitHub "Download ZIP" of an elements repo, or loose .xml files. */
export async function readAuroraUpload(list: File[]): Promise<UploadedXml[]> {
  const out: UploadedXml[] = [];
  for (const file of list) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".zip")) {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const names = Object.keys(zip.files).filter((n) => n.toLowerCase().endsWith(".xml") && !zip.files[n].dir);
      for (const name of names) {
        // Drop the "elements-master/" wrapper folder GitHub adds.
        const path = name.split("/").slice(1).join("/") || name;
        out.push({ path, xml: await zip.files[name].async("string") });
      }
    } else if (lower.endsWith(".xml")) {
      out.push({ path: file.name, xml: await file.text() });
    }
  }
  return out;
}

/** Reads 5etools data: .json files, or a ZIP of the data folder. Paths are kept relative to the data folder. */
export async function readFiveToolsUpload(list: File[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
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
        out.set(path, await zip.files[name].async("string"));
      }
    } else if (lower.endsWith(".json")) {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
      const at = rel ? rel.indexOf("data/") : -1;
      out.set(at >= 0 ? rel!.slice(at + 5) : rel ? rel.split("/").slice(1).join("/") : file.name, await file.text());
    }
  }
  return out;
}
