import { useCallback, useEffect, useState } from "react";
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

  const check = useCallback(async (manual: boolean) => {
    if (!inTauri()) {
      if (manual) setStatus("Updates apply to the installed desktop app.");
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
        setStatus(`You are on the latest version (${await getVersion()}).`);
      }
    } catch (e) {
      // Offline or no release yet: stay quiet unless the person asked.
      if (manual) setStatus(`Could not check for updates: ${String(e)}`);
    }
  }, []);

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

  return { found, status, busy, check, install };
}
