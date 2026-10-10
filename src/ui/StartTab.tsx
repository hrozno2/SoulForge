import { useEffect, useRef, useState } from "react";
import { deleteCharacterRecord, listCharacters, type CharacterRecord } from "../aurora/storage";
import { normalizeCharacter, uid, type Character } from "../aurora/character";
import { downloadText, pickFiles } from "../store";
import { Hint } from "./Help";
import { PartyView } from "./PartyView";
import type { ARegistry } from "../aurora/registry";

function ago(ms: number): string {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

export function StartTab({
  currentId, onOpen, onNew, onRandom, contentReady, sourceCount, goContent, onImportForeign, reg,
}: {
  reg?: ARegistry;
  currentId: string;
  onOpen: (id: string, ch: Character) => void;
  onNew: () => void;
  onRandom: () => void;
  contentReady: boolean;
  sourceCount: number;
  goContent: () => void;
  onImportForeign: (file: File) => Promise<string>;
}) {
  const [list, setList] = useState<CharacterRecord[]>([]);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const foreignRef = useRef<HTMLInputElement>(null);
  const refresh = () => listCharacters().then(setList);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, []);

  const importJson = async (f: File | undefined) => {
    if (!f) return;
    try {
      const raw = JSON.parse(await f.text()) as Character;
      if (raw.version !== 2) throw new Error("This is not a Soul Forge character file. Foundry and Roll20 exports go through the Import button next to it.");
      onOpen(uid(), normalizeCharacter(raw));
      setMsg("");
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <div>
      {contentReady && sourceCount === 0 && (
        <section className="card callout">
          <h2>Add content first</h2>
          <p>Soul Forge ships without rules content. Add the AuroraLegacy link to download species, classes, spells and items.</p>
          <button className="primary" onClick={goContent}>Go to Content</button>
        </section>
      )}
      <section className="card">
        <h2>Characters</h2>
        <Hint id="home-1">Characters save on this computer as you work. Export gives you a file to back up or share.</Hint>
        <div className="row">
          <button className="primary" onClick={onNew}>New character</button>
          <button onClick={onRandom} disabled={sourceCount === 0}>Random character</button>
          <button onClick={async () => { const f = await pickFiles(["json"]); if (f === null) fileRef.current?.click(); else if (f[0]) importJson(f[0]); }}>Open file (.json)</button>
          <button onClick={async () => { const f = await pickFiles(["json"]); if (f === null) foreignRef.current?.click(); else if (f[0]) setMsg(await onImportForeign(f[0])); }}>Import Foundry / Roll20 / Plutonium</button>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => { importJson(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={foreignRef} type="file" accept=".json" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setMsg(await onImportForeign(f)); }} />
        </div>
        {msg && <p className="notice">{msg}</p>}
        <ul className="char-list">
          {list.map((c) => (
            <li key={c.id} className={c.id === currentId ? "current" : ""}>
              <button className="char-open" onClick={() => onOpen(c.id, c.data)}>
                {c.data.portrait ? <img className="portrait-chip" src={c.data.portrait} alt="" /> : <span className="portrait-chip ph">{(c.name || "?").charAt(0)}</span>}
                <b>{c.name || "Unnamed character"}</b>
                <span className="muted">{c.summary || "empty"}</span>
                <small className="muted">{ago(c.updated)}</small>
              </button>
              <button onClick={() => { onOpen(uid(), { ...c.data, name: `${c.data.name || "Character"} (copy)` }); }}>Duplicate</button>
              <button onClick={() => downloadText(`${c.name || "character"}.json`, JSON.stringify(c.data, null, 2))}>Export</button>
              <button onClick={async () => { if (confirm(`Delete ${c.name || "this character"}?`)) { await deleteCharacterRecord(c.id); refresh(); } }}>Delete</button>
            </li>
          ))}
          {!list.length && <li className="muted">No saved characters yet. Your work saves automatically.</li>}
        </ul>
      </section>
      {reg && list.length > 1 && <PartyView list={list} reg={reg} onOpen={(c) => onOpen(c.id, c.data)} />}
    </div>
  );
}
