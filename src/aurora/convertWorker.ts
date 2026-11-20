/**
 * Audit E4: the conversion of a 5e.tools source off the main thread. It is the one long step of a launch after an
 * update or a new import (8 to 10 seconds, measured in C1.7), and the window was frozen for all of it.
 */
import { convertTexts } from "./convertTexts";

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<{ texts: Record<string, string> }>) => void) | null;
  postMessage(m: unknown): void;
};
scope.onmessage = (e) => scope.postMessage(convertTexts(e.data.texts));
