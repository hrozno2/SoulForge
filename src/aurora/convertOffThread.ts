/**
 * Runs `convertTexts` in a worker and gives its result; on the calling thread where no worker can be made or the
 * worker fails to start (tests, an older webview), so content always loads.
 */
import { convertTexts, type ConvertResult } from "./convertTexts";

type MakeWorker = () => Worker;
const viteWorker: MakeWorker = () => new Worker(new URL("./convertWorker.ts", import.meta.url), { type: "module" });

export function convertOffThread(
  texts: Record<string, string>,
  make: MakeWorker | undefined = typeof Worker === "undefined" ? undefined : viteWorker,
): Promise<ConvertResult & { offThread: boolean }> {
  if (!make) return Promise.resolve({ ...convertTexts(texts), offThread: false });
  return new Promise((done) => {
    let worker: Worker;
    const here = () => done({ ...convertTexts(texts), offThread: false });
    try {
      worker = make();
    } catch {
      return here();
    }
    worker.onmessage = (e: MessageEvent<ConvertResult>) => {
      worker.terminate();
      done({ ...e.data, offThread: true });
    };
    // The worker's own script failing to load or run is not the content's fault: convert here instead.
    worker.onerror = () => {
      worker.terminate();
      here();
    };
    worker.postMessage({ texts });
  });
}
