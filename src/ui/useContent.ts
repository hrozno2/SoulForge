import { useCallback, useEffect, useRef, useState } from "react";
import { ARegistry } from "../aurora/registry";
import { AUTO_UPDATE_MS, buildRegistry, newLinkSource, updateSource, DEFAULT_LINK } from "../aurora/content";
import { deleteSource, listSources, saveSource } from "../aurora/storage";
import type { Progress, SourceConfig } from "../aurora/sources";
import { countFiles } from "../aurora/sources";

export interface ContentState {
  reg: ARegistry;
  sources: SourceConfig[];
  /** Short status line, empty when idle. */
  status: string;
  busy: boolean;
  progress: Progress | null;
  errors: string[];
  ready: boolean;
  addLink(url: string): Promise<void>;
  update(url: string, force?: boolean): Promise<void>;
  remove(url: string): Promise<void>;
  toggleIndex(sourceUrl: string, indexUrl: string): Promise<void>;
  reload(): Promise<void>;
  /** Register files stored in the cache by another importer. */
  addLocal(cfg: SourceConfig): Promise<void>;
}

const emptyReg = (() => {
  const r = new ARegistry();
  r.build();
  return r;
})();

export function useContent(): ContentState {
  const [reg, setReg] = useState<ARegistry>(emptyReg);
  const [sources, setSources] = useState<SourceConfig[]>([]);
  const [status, setStatus] = useState("Loading content...");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const sourcesRef = useRef<SourceConfig[]>([]);
  sourcesRef.current = sources;

  const rebuild = useCallback(async (list: SourceConfig[]) => {
    setBusy(true);
    setStatus("Reading content...");
    try {
      const { reg: next, errors: errs } = await buildRegistry(list, undefined, (d, t) => setProgress({ phase: "files", done: d, total: t }));
      setReg(next);
      setErrors(errs);
      setStatus("");
    } catch (e) {
      setStatus(`Could not read content: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      setProgress(null);
      setReady(true);
    }
  }, []);

  const reload = useCallback(async () => {
    const list = await listSources().catch(() => []);
    setSources(list);
    await rebuild(list);
  }, [rebuild]);

  const syncOne = useCallback(
    async (cfg: SourceConfig, force: boolean, quietWhenCurrent: boolean) => {
      setBusy(true);
      setStatus(`Checking ${cfg.name} for updates...`);
      try {
        const res = await updateSource(cfg, { force, onProgress: (p) => setProgress(p) });
        const list = (await listSources()).sort((a, b) => a.name.localeCompare(b.name));
        setSources(list);
        if (res.downloaded > 0 || force) await rebuild(list);
        const note = res.failed.length ? ` ${res.failed.length} files could not be fetched.` : "";
        setStatus(res.downloaded > 0 ? `${cfg.name}: updated ${res.downloaded} files.${note}` : quietWhenCurrent ? "" : `${cfg.name} is up to date.${note}`);
      } catch (e) {
        setStatus(`Could not update ${cfg.name}: ${(e as Error).message}. Using the saved copy.`);
      } finally {
        setBusy(false);
        setProgress(null);
      }
    },
    [rebuild],
  );

  // On launch: load what is cached, then check links that have not been checked for a while.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listSources().catch(() => []);
      if (cancelled) return;
      setSources(list);
      await rebuild(list);
      for (const s of list) {
        if (s.kind === "link" && Date.now() - s.lastChecked > AUTO_UPDATE_MS && navigator.onLine) await syncOne(s, false, true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rebuild, syncOne]);

  const addLink = useCallback(
    async (url: string) => {
      const clean = url.trim() || DEFAULT_LINK;
      if (sourcesRef.current.some((s) => s.url === clean)) {
        setStatus("That link is already added.");
        return;
      }
      const cfg = newLinkSource(clean);
      await saveSource(cfg);
      await syncOne(cfg, true, false);
    },
    [syncOne],
  );

  const update = useCallback(
    async (url: string, force = false) => {
      const cfg = sourcesRef.current.find((s) => s.url === url);
      if (cfg) await syncOne(cfg, force, false);
    },
    [syncOne],
  );

  const remove = useCallback(
    async (url: string) => {
      await deleteSource(url);
      await reload();
    },
    [reload],
  );

  const toggleIndex = useCallback(
    async (sourceUrl: string, indexUrl: string) => {
      const cfg = sourcesRef.current.find((s) => s.url === sourceUrl);
      if (!cfg) return;
      const disabled = cfg.disabled.includes(indexUrl) ? cfg.disabled.filter((d) => d !== indexUrl) : [...cfg.disabled, indexUrl];
      const next = { ...cfg, disabled, fileCount: cfg.tree ? countFiles(cfg.tree, new Set(disabled)) : cfg.fileCount };
      await saveSource(next);
      const list = sourcesRef.current.map((s) => (s.url === sourceUrl ? next : s));
      setSources(list);
      // Newly enabled indexes may not be cached yet.
      if (cfg.kind === "link" && cfg.disabled.includes(indexUrl)) await syncOne(next, false, false);
      else await rebuild(list);
    },
    [rebuild, syncOne],
  );

  const addLocal = useCallback(
    async (cfg: SourceConfig) => {
      await saveSource(cfg);
      await reload();
    },
    [reload],
  );

  return { reg, sources, status, busy, progress, errors, ready, addLink, update, remove, toggleIndex, reload, addLocal };
}
