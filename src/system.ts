/**
 * The machine Soul Forge runs on (C5.7), written to the log at every start so a lag or crash report says what it is:
 * the desktop app's diagnostics (OS, session, CPU, memory, graphics drivers, NVIDIA and its fast-drawing switch), plus
 * what the page sees (screen, scale, WebKit). Also tells the desktop app the window has drawn (the NVIDIA switch's
 * crash guard, src-tauri/src/main.rs).
 */
import { logEvent } from "./logbook";

const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function pageSpecs(): string {
  const webkit = /AppleWebKit\/([\d.]+)/.exec(navigator.userAgent)?.[1];
  return [
    `screen: ${window.screen.width}x${window.screen.height} @${window.devicePixelRatio}x, window ${window.innerWidth}x${window.innerHeight}`,
    webkit ? `webkit: ${webkit}` : `browser: ${navigator.userAgent.slice(0, 120)}`,
    `cpu threads seen by the page: ${navigator.hardwareConcurrency ?? "?"}`,
  ].join("\n");
}

/** Logs the specs once per start; on the desktop, after the window has drawn, also clears the NVIDIA "trying" mark. */
export async function logSystemOnce(): Promise<void> {
  let desktop = "";
  if (inTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      desktop = await invoke<string>("diagnostics");
      await invoke("gpu_started");
    } catch (e) {
      desktop = `diagnostics unavailable: ${String(e)}`;
    }
  }
  logEvent("system", [desktop, pageSpecs()].filter(Boolean).join(" | ").replace(/\n/g, " | "));
}

/** Whether the NVIDIA fast-drawing switch applies here, and whether it is on. */
export async function gpuStatus(): Promise<{ applies: boolean; on: boolean }> {
  if (!inTauri()) return { applies: false, on: false };
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const [applies, on] = await invoke<[boolean, boolean]>("gpu_status");
    return { applies, on };
  } catch {
    return { applies: false, on: false };
  }
}

export async function setGpuFast(on: boolean): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("gpu_fast", { on });
  logEvent("system", `NVIDIA fast drawing turned ${on ? "on" : "off"} (from the next start)`);
}
