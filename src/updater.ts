import { useCallback, useEffect, useRef, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";

export type InstallKind = "app" | "appimage" | "package" | "package-arch";

export interface UpdateState {
  version: string;
  kind: InstallKind;
  update: Update;
}

const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Self-updating kinds can replace their own files; package installs must use the package manager. */
export const canSelfUpdate = (kind: InstallKind) => kind === "app" || kind === "appimage";

export function useUpdater() {
  const [found, setFound] = useState<UpdateState | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** Shows a message that clears itself, so "you are up to date" does not stay on screen. */
  const flash = useCallback((msg: string, ms = 5000) => {
    setStatus(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(""), ms);
  }, []);

  const check = useCallback(async (manual: boolean) => {
    // The test build installs next to the released app; an update would replace it with the release.
    if (import.meta.env.VITE_TEST_TOOLS === "1") {
      if (manual) flash("The test build does not update itself. Rebuild it with npm run test-app.");
      return;
    }
    if (!inTauri()) {
      if (manual) flash("Updates apply to the installed desktop app.");
      return;
    }
    try {
      const [{ check: checkUpdate }, { invoke }] = await Promise.all([
        import("@tauri-apps/plugin-updater"),
        import("@tauri-apps/api/core"),
      ]);
      const kind = await invoke<InstallKind>("install_kind");
      const update = await checkUpdate();
      if (update) setFound({ version: update.version, kind, update });
      else if (manual) {
        const { getVersion } = await import("@tauri-apps/api/app");
        flash(`You are on the latest version (${await getVersion()}).`);
      }
    } catch (e) {
      // Offline or no release yet: stay quiet unless the person asked.
      if (manual) flash(`Could not check for updates: ${String(e)}`, 12000);
    }
  }, [flash]);

  // Check shortly after launch so startup stays fast.
  useEffect(() => {
    const t = setTimeout(() => void check(false), 4000);
    return () => clearTimeout(t);
  }, [check]);

  const install = useCallback(async () => {
    if (!found) return;
    setBusy(true);
    setStatus("Downloading update...");
    try {
      let total = 0;
      let done = 0;
      await found.update.downloadAndInstall((ev) => {
        if (ev.event === "Started") total = ev.data.contentLength ?? 0;
        if (ev.event === "Progress") {
          done += ev.data.chunkLength;
          if (total) setStatus(`Downloading update... ${Math.round((done / total) * 100)}%`);
        }
        if (ev.event === "Finished") setStatus("Installing...");
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      setStatus(`Update failed: ${String(e)}`);
      setBusy(false);
    }
  }, [found]);

  const dismiss = useCallback(() => { clearTimeout(timer.current); setStatus(""); }, []);
  return { found, status, busy, check, install, dismiss };
}
