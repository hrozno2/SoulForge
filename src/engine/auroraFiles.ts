import JSZip from "jszip";
import type { AuroraFile } from "./aurora";

export interface AuroraGroup {
  key: string;
  files: AuroraFile[];
}

/** Accepts the GitHub "Download ZIP" of the elements repo, or loose .xml files. */
export async function readAuroraUpload(list: File[]): Promise<AuroraFile[]> {
  const out: AuroraFile[] = [];
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

/** Group by book folder so the user can pick, for example, only the 2024 handbook. */
export function groupAuroraFiles(files: AuroraFile[]): AuroraGroup[] {
  const groups = new Map<string, AuroraFile[]>();
  for (const f of files) {
    const parts = f.path.split("/");
    const key = parts.length >= 3 ? parts.slice(0, 2).join("/") : parts.length === 2 ? parts[0] : "loose files";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(f);
  }
  return [...groups.entries()]
    .map(([key, list]) => ({ key, files: list }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export const DEFAULT_GROUP = "core/players-handbook-2024";
