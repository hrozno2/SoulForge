import { useRef, useState } from "react";
import type { ContentState } from "./useContent";
import { DEFAULT_LINK } from "../aurora/content";
import type { IndexNode, SourceConfig } from "../aurora/sources";
import { idbFileCache } from "../aurora/storage";
import { readAuroraUpload, readFiveToolsUpload } from "../aurora/uploads";
import { fetchFiveTools, storeFiveTools } from "../aurora/content";
import { FiveToolsImport } from "./FiveToolsImport";
import { HomebrewBuilder } from "./HomebrewBuilder";
import { openExternal } from "../store";
import type { AElement } from "../aurora/types";

const TEMPLATE = `<?xml version="1.0" encoding="utf-8"?>
<elements>
  <element name="Stone Cunning" type="Racial Trait" source="My Homebrew" id="ID_HOMEBREW_TRAIT_STONE_CUNNING">
    <description><p>You have advantage on Intelligence (History) checks about stonework.</p></description>
    <sheet><description>Advantage on History checks about stonework.</description></sheet>
    <rules>
      <stat name="history:misc" value="1" />
    </rules>
  </element>
</elements>
`;

function ago(ms: number): string {
  if (!ms) return "never";
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

function Tree({ node, source, content, depth }: { node: IndexNode; source: SourceConfig; content: ContentState; depth: number }) {
  const off = source.disabled.includes(node.url);
  const [open, setOpen] = useState(depth < 1);
  const total = (n: IndexNode): number => n.files.length + n.children.reduce((s, c) => s + total(c), 0);
  return (
    <div className="tree-node" style={{ marginLeft: depth ? 16 : 0 }}>
      <div className="check">
        {node.children.length > 0 ? <button className="more tiny" onClick={() => setOpen(!open)}>{open ? "▾" : "▸"}</button> : <span style={{ width: 22 }} />}
        <label className="check">
          <input type="checkbox" checked={!off} disabled={content.busy} onChange={() => content.toggleIndex(source.url, node.url)} />
          {node.name} <small className="muted">{total(node)} files · v{node.version}</small>
        </label>
      </div>
      {open && !off && node.children.map((c) => <Tree key={c.url} node={c} source={source} content={content} depth={depth + 1} />)}
    </div>
  );
}

function Compendium({ content, onDetail }: { content: ContentState; onDetail: (e: AElement) => void }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const results = content.reg.search(q, type || undefined, 80);
  const types = content.reg.types().sort();
  return (
    <section className="card">
      <h2>Browse content</h2>
      <p className="muted">{content.reg.size.toLocaleString()} elements loaded.</p>
      <div className="row">
        <input style={{ flex: 1 }} placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <ul className="options boxed">
        {results.map((e) => (
          <li key={e.id}><button onMouseEnter={() => onDetail(e)} onClick={() => onDetail(e)}><span className="tick" /><span className="opt-name">{e.name}</span><span className="opt-meta">{e.type}</span><span className="opt-src">{e.source}</span></button></li>
        ))}
      </ul>
    </section>
  );
}

export function ContentTab({ content, onDetail }: { content: ContentState; onDetail: (e: AElement) => void }) {
  const [link, setLink] = useState(DEFAULT_LINK);
  const [xmlName, setXmlName] = useState("My homebrew");
  const [xml, setXml] = useState(TEMPLATE);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [ftUrl, setFtUrlRaw] = useState(() => {
    try {
      return localStorage.getItem("charforge.5etools.base") ?? "";
    } catch {
      return "";
    }
  });
  const setFtUrl = (u: string) => {
    setFtUrlRaw(u);
    try {
      localStorage.setItem("charforge.5etools.base", u);
    } catch {
      /* storage can be unavailable */
    }
  };
  const [ftMsg, setFtMsg] = useState("");
  const [ftBusy, setFtBusy] = useState(false);
  const pct = content.progress && content.progress.total ? Math.round((content.progress.done / content.progress.total) * 100) : 0;

  const importFiles = async (list: FileList | null) => {
    if (!list || !list.length) return;
    setMsg("Reading files...");
    try {
      const files = await readAuroraUpload([...list]);
      if (!files.length) {
        setMsg("No .xml files found in that selection.");
        return;
      }
      const name = list.length === 1 ? list[0].name.replace(/\.(zip|xml)$/i, "") : `${list.length} files`;
      const root = `local://${name}`;
      for (const f of files) await idbFileCache.put(`${root}/${f.path}`, f.xml, root);
      const node: IndexNode = { url: root, name, description: "Imported from this computer", version: "local", files: files.map((f) => `${root}/${f.path}`), children: [] };
      await content.addLocal({ url: root, name, kind: "local", tree: node, disabled: [], versions: {}, lastChecked: Date.now(), fileCount: files.length });
      setMsg(`Imported ${files.length} files.`);
    } catch (e) {
      setMsg(`Could not import: ${(e as Error).message}`);
    }
  };

  const ftStore = async (name: string, files: Map<string, string>, baseUrl?: string) => {
    const cfg = await storeFiveTools(name, files, baseUrl);
    await content.addLocal(cfg);
    setFtMsg(`Imported ${files.size} files from ${name}.`);
  };
  const ftFetch = async (url: string) => {
    setFtBusy(true);
    setFtMsg("Fetching...");
    try {
      const { files, failed } = await fetchFiveTools(url, (p) => setFtMsg(`Fetching ${p.note ?? ""} (${p.done})`));
      await ftStore(url.replace(/^https?:\/\//, "").replace(/\/+$/, ""), files, url);
      if (failed.length) setFtMsg((m) => `${m} ${failed.length} optional files were not found.`);
    } catch (e) {
      setFtMsg(`Could not fetch from that address: ${(e as Error).message}. If it blocks apps, download the data folder and use Import files instead.`);
    } finally {
      setFtBusy(false);
    }
  };
  const ftImport = async (list: FileList | null) => {
    if (!list || !list.length) return;
    setFtBusy(true);
    setFtMsg("Reading files...");
    try {
      const files = await readFiveToolsUpload([...list]);
      if (!files.size) throw new Error("no .json files found");
      const name = list.length === 1 ? list[0].name.replace(/\.(zip|json)$/i, "") : "5etools data";
      await ftStore(`5etools: ${name}`, files);
    } catch (e) {
      setFtMsg(`Could not import: ${(e as Error).message}`);
    } finally {
      setFtBusy(false);
    }
  };

  const saveCustom = async () => {
    const name = xmlName.trim() || "My homebrew";
    const root = `local://custom/${name}`;
    try {
      const { parseElementsXml, browserXml } = await import("../aurora/parse");
      const parsed = parseElementsXml(xml, browserXml());
      await idbFileCache.put(`${root}/content.xml`, xml, root);
      const node: IndexNode = { url: root, name: `Custom: ${name}`, description: "", version: "local", files: [`${root}/content.xml`], children: [] };
      await content.addLocal({ url: root, name: `Custom: ${name}`, kind: "local", tree: node, disabled: [], versions: {}, lastChecked: Date.now(), fileCount: 1 });
      setMsg(`Saved ${parsed.elements.length} elements.`);
    } catch (e) {
      setMsg(`That XML is not valid: ${(e as Error).message}`);
    }
  };

  return (
    <div>
      <section className="card">
        <h2>Content links</h2>
        <p className="muted">
          Add the address of an Aurora index file. Soul Forge downloads everything it lists, keeps a copy for offline use, and checks for new versions each time it starts.
        </p>
        <div className="row">
          <input style={{ flex: 1 }} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://.../something.index" />
          <button className="primary" disabled={content.busy} onClick={() => content.addLink(link)}>Add link</button>
        </div>
        <div className="row">
          <button onClick={() => openExternal("https://github.com/AuroraLegacy/elements")}>AuroraLegacy elements repo</button>
          <button onClick={() => openExternal("https://aurorabuilder.com/documentation/")}>Aurora documentation</button>
        </div>
        {content.busy && (
          <div className="progress">
            <div style={{ width: `${pct}%` }} />
            <span>{content.status || "Working..."} {content.progress ? `${content.progress.done}/${content.progress.total}` : ""}</span>
          </div>
        )}
        {!content.busy && content.status && <p className="notice">{content.status}</p>}
        {content.errors.length > 0 && <details><summary className="warn">{content.errors.length} files could not be read</summary>{content.errors.slice(0, 20).map((e) => <p key={e} className="muted">{e}</p>)}</details>}
      </section>

      {content.sources.map((s) => (
        <section className="card" key={s.url}>
          <h2>{s.name}</h2>
          <p className="muted">{s.kind === "link" ? s.url : "Stored on this computer"}<br />{s.fileCount} files enabled · checked {ago(s.lastChecked)}</p>
          <div className="row">
            {s.format === "5etools" && s.baseUrl && <button disabled={ftBusy || content.busy} onClick={() => ftFetch(s.baseUrl!)}>Refresh from address</button>}
            {s.kind === "link" && <button disabled={content.busy} onClick={() => content.update(s.url)}>Check for updates</button>}
            {s.kind === "link" && <button disabled={content.busy} onClick={() => content.update(s.url, true)}>Download everything again</button>}
            <button disabled={content.busy} onClick={() => content.remove(s.url)}>Remove</button>
          </div>
          {s.tree && <Tree node={s.tree} source={s} content={content} depth={0} />}
        </section>
      ))}

      <section className="card">
        <h2>5etools data (works with Plutonium)</h2>
        <p className="muted">
          Reads the JSON data that 5e.tools and the Plutonium Foundry module use: species, classes and subclasses, backgrounds, feats, spells, items and creatures.
          5e.tools itself sits behind a bot check, so an app cannot fetch from it. Use the data folder of a copy you are entitled to use: a folder on this computer, a ZIP of it, or
          an address that serves the folder (for example your own 5etools install).
        </p>
        <FiveToolsImport content={content} baseUrl={ftUrl} setBaseUrl={setFtUrl} />
        <h3>Or fetch the whole data folder</h3>
        <div className="row">
          <input style={{ flex: 1 }} value={ftUrl} onChange={(e) => setFtUrl(e.target.value)} placeholder="https://your-server/data" />
          <button className="primary" disabled={ftBusy || !ftUrl.trim()} onClick={() => ftFetch(ftUrl)}>Fetch from address</button>
        </div>
        <div className="row">
          <label>Data folder or ZIP: <input type="file" accept=".json,.zip" multiple {...{ webkitdirectory: "" }} onChange={(e) => { ftImport(e.target.files); e.target.value = ""; }} /></label>
        </div>
        <div className="row">
          <label>Or pick files: <input type="file" accept=".json,.zip" multiple onChange={(e) => { ftImport(e.target.files); e.target.value = ""; }} /></label>
        </div>
        <p className="muted">Homebrew exported from 5etools or Plutonium works too: import its .json file.</p>
        {ftMsg && <p className="notice">{ftMsg}</p>}
      </section>

      <section className="card">
        <h2>Import files</h2>
        <p className="muted">A downloaded ZIP of an elements repository, or loose .xml element files.</p>
        <input ref={fileRef} aria-label="Choose element files or a ZIP" type="file" accept=".zip,.xml" multiple onChange={(e) => { importFiles(e.target.files); e.target.value = ""; }} />
        {msg && <p className="notice">{msg}</p>}
      </section>

      <HomebrewBuilder content={content} classNames={content.reg.ofType("Class").map((c) => c.name).filter((n, i, a) => a.indexOf(n) === i).sort()} />

      <section className="card">
        <h2>Write your own content</h2>
        <p className="muted">Homebrew uses the same element format as the official content: grants, selections and stat rules. See the Aurora documentation for the format.</p>
        <div className="row"><input value={xmlName} onChange={(e) => setXmlName(e.target.value)} placeholder="Name" /><button className="primary" onClick={saveCustom}>Save content</button></div>
        <textarea className="code" aria-label="Element XML" rows={14} value={xml} onChange={(e) => setXml(e.target.value)} spellCheck={false} />
      </section>

      <Compendium content={content} onDetail={onDetail} />
    </div>
  );
}
