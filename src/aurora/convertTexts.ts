/**
 * The 5e.tools files of one source, as text, turned into elements: parsed, then converted together (classes refer to
 * features and spell lists in other files). One function for both places it runs: the worker (convertWorker.ts), so
 * the window stays alive during the seconds it takes, and the calling thread where there is no worker (tests, an
 * older webview).
 */
import { convertFiveTools } from "./fivetools";
import type { AElement } from "./types";

export interface ConvertResult {
  elements: AElement[];
  /** Files that could not be read, as "name: why". */
  errors: string[];
  /** Why the conversion itself failed, when it did; `elements` is then empty. */
  failed?: string;
}

export function convertTexts(texts: Record<string, string>): ConvertResult {
  const errors: string[] = [];
  const files: Record<string, unknown> = {};
  for (const [name, text] of Object.entries(texts)) {
    try {
      files[name] = JSON.parse(text);
    } catch (e) {
      errors.push(`${name.split("/").pop()}: ${(e as Error).message}`);
    }
  }
  try {
    return { elements: convertFiveTools({ files: files as never }), errors };
  } catch (e) {
    return { elements: [], errors, failed: (e as Error).message };
  }
}
