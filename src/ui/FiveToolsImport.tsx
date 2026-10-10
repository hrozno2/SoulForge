import { useMemo, useState } from "react";
import { KINDS, loadCategory, resolveLinks, savePicks, type Entry, type Kind } from "../aurora/fiveToolsPicker";
import type { ContentState } from "./useContent";

/** A public copy of the 5etools data on GitHub. It is only used when the player presses the button for it. */
const MIRROR = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";

const key = (e: Entry) => `${e.kind}|${e.name}|${e.source}`;
const lvl = (n?: number) => (n === undefined ? "" : n === 0 ? "C" : String(n));

/** Search a 5etools data folder and import only the entries you pick, or paste 5e.tools links. */
export function FiveToolsImport({ content, baseUrl, setBaseUrl }: { content: ContentState; baseUrl: string; setBaseUrl: (u: string) => void }) {
  const [kind, setKind] = useState<Kind>("spell");
  const [cache, setCache] = useState<Partial<Record<Kind, Entry[]>>>({});
  const [q, setQ] = useState("");
  const [src, setSrc] = useState("");
  const [picked, setPicked] = useState<Map<string, Entry>>(new Map());
  const [links, setLinks] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const list = cache[kind];

  const load = async (k: Kind = kind) => {
    if (cache[k] || !baseUrl.trim()) return;
    setBusy(true);
    setMsg("Loading the list...");
    try {
      const entries = await loadCategory(baseUrl, k, (d, t) => setMsg(`Loading ${d} of ${t} files...`));
      setCache((c) => ({ ...c, [k]: entries }));
      setMsg(entries.length ? "" : `Nothing came back from ${baseUrl}. It should be the folder that holds races.json and the spells folder.`);
    } catch (e) {
      setMsg(`Could not load from ${baseUrl}: ${(e as Error).message}. Check the address, or use the GitHub button.`);
    } finally {
      setBusy(false);
    }
  };

  const sources = useMemo(() => [...new Set((list ?? []).map((e) => e.source))].sort(), [list]);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (list ?? []).filter((e) => (!src || e.source === src) && (!n || e.name.toLowerCase().includes(n))).sort((a, b) => a.name.localeCompare(b.name));
  }, [list, q, src]);

  const toggle = (e: Entry) => setPicked((p) => {
    const m = new Map(p);
    if (m.has(key(e))) m.delete(key(e));
    else m.set(key(e), e);
    return m;
  });

  const commit = async (entries: Entry[]) => {
    if (!entries.length) return;
    setBusy(true);
    try {
      const { cfg, added } = await savePicks(baseUrl, entries);
      await content.addLocal(cfg);
      setMsg(`Imported ${added} new ${added === 1 ? "entry" : "entries"}. They are in the lists now.`);
      setPicked(new Map());
    } catch (e) {
      setMsg(`Could not import: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const importLinks = async () => {
    setBusy(true);
    setMsg("Reading links...");
    try {
      const { found, problems } = await resolveLinks(baseUrl, links.split(/\s+/));
      if (found.length) await commit(found);
      if (problems.length) setMsg((m) => `${found.length ? m + " " : ""}${problems.join(" ")}`);
      else if (found.length) setLinks("");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="subcard">
      <h3>Import from 5etools or Plutonium</h3>
      <h4>Step 1. Where the data comes from</h4>
      <div className="row">
        <input style={{ flex: 1 }} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="Address of the 5etools data folder" aria-label="Data address" />
      </div>
      <div className="row">
        <button disabled={baseUrl === MIRROR} onClick={() => setBaseUrl(MIRROR)}>Use the public 5etools copy on GitHub</button>
        <small className="muted">Fills in the address for you. Entries you pick are downloaded and kept on this computer.</small>
      </div>
      <details className="tip">
        <summary>Where do I get this address?</summary>
        <p className="muted">
          Plutonium reads the same data from a data source you set up in Foundry. Use that address here: a 5etools copy you host or have access to, which serves its <code>data</code> folder.
          5e.tools itself blocks apps, so its own address will not work. The button above uses a public copy of the same data on GitHub run by the 5etools community; you are responsible for having the right to use the content it holds. If you only have the files, use "Data folder or ZIP" below to import them from disk, no address needed.
        </p>
      </details>

      <h4>Step 2. Pick what you want</h4>
      <div className="row">
        {KINDS.map((k) => <button key={k.kind} className={kind === k.kind ? "pill active" : "pill"} onClick={() => { setKind(k.kind); load(k.kind); }}>{k.label}</button>)}
      </div>
      {!list ? (
        <div className="row"><button disabled={busy || !baseUrl.trim()} onClick={() => load()}>{baseUrl.trim() ? `Load ${KINDS.find((k) => k.kind === kind)!.label.toLowerCase()}` : "Set the address above first"}</button></div>
      ) : (
        <>
          <div className="row">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" style={{ flex: 1 }} />
            <select value={src} onChange={(e) => setSrc(e.target.value)} aria-label="Book">
              <option value="">All books</option>
              {sources.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <small className="muted">{shown.length} shown{shown.length > 150 ? ", first 150 listed" : ""}</small>
          <ul className="pick-list">
            {shown.slice(0, 150).map((e) => (
              <li key={key(e)}>
                <label className="check">
                  <input type="checkbox" checked={picked.has(key(e))} onChange={() => toggle(e)} />
                  {e.kind === "spell" && <b className="lvl">{lvl(e.level)}</b>} {e.name} <small className="muted">{e.source}</small>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      <details className="tip">
        <summary>Or paste a link from 5e.tools</summary>
        <ol className="muted">
          <li>On 5e.tools, open the page (for example Spells) in your browser.</li>
          <li>Click the entry's name in the list so its details open on the right.</li>
          <li>Copy the address from the browser's address bar. It ends in something like <code>#fireball_xphb</code>. A link that ends at <code>spells.html</code> with no <code>#</code> part points at the whole list, not one entry.</li>
          <li>Paste it below, one per line, and press Import links.</li>
        </ol>
        <textarea className="code" rows={3} value={links} onChange={(e) => setLinks(e.target.value)} placeholder="https://5e.tools/spells.html#hunter%20sense_grimhollowpg24 (one per line)" />
        <div className="row"><button className="primary" disabled={busy || !baseUrl.trim() || !links.trim()} onClick={importLinks}>Import links</button></div>
      </details>
      {picked.size > 0 && <div className="row"><button className="primary" disabled={busy} onClick={() => commit([...picked.values()])}>Import {picked.size} selected</button><button onClick={() => setPicked(new Map())}>Clear</button></div>}
      {msg && <p className="notice">{msg}</p>}
    </div>
  );
}
