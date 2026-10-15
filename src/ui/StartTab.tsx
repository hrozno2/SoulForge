import { useEffect, useMemo, useRef, useState } from "react";
import { deleteCharacterRecord, listCharacters, type CharacterRecord } from "../aurora/storage";
import { normalizeCharacter, uid, type Character } from "../aurora/character";
import { downloadText, pickFiles } from "../store";
import { Hint } from "./Help";
import { t } from "../i18n";
import { PartyView } from "./PartyView";
import { askConfirm } from "./Confirm";
import type { ARegistry } from "../aurora/registry";
import { resolve } from "../aurora/engine";
import { buildSheet } from "../aurora/sheet";
import { ClassIcon, hasClassIcon } from "./classIcons";
import { hueOf } from "./PickCards";

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
  onRandom: (level: number) => void;
  contentReady: boolean;
  sourceCount: number;
  goContent: () => void;
  onImportForeign: (file: File) => Promise<string>;
}) {
  const [list, setList] = useState<CharacterRecord[]>([]);
  const [msg, setMsg] = useState("");
  const [askLevel, setAskLevel] = useState(false);
  const [level, setLevel] = useState(1);
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
        <h2>{t("Characters")}</h2>
        <Hint id="home-1">Characters save on this computer as you work. Export gives you a file to back up or share.</Hint>
        <div className="row">
          <button className="primary" onClick={onNew}>{t("New character")}</button>
          <button onClick={() => setAskLevel((v) => !v)} disabled={sourceCount === 0} aria-expanded={askLevel}>{t("Random character")}</button>
          <button onClick={async () => { const f = await pickFiles(["json"]); if (f === null) fileRef.current?.click(); else if (f[0]) importJson(f[0]); }}>Open file (.json)</button>
          <button onClick={async () => { const f = await pickFiles(["json"]); if (f === null) foreignRef.current?.click(); else if (f[0]) setMsg(await onImportForeign(f[0])); }}>Import Foundry / Roll20 / Plutonium</button>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => { importJson(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={foreignRef} type="file" accept=".json" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setMsg(await onImportForeign(f)); }} />
        </div>
        {askLevel && (
          <div className="row random-level">
            <label>Character level <input type="number" min={1} max={20} value={level} onChange={(e) => setLevel(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} /></label>
            <button className="primary" onClick={() => { setAskLevel(false); onRandom(level); }}>Create</button>
          </div>
        )}
        {msg && <p className="notice">{msg}</p>}
        <div className="char-cards">
          {list.map((c) => (
            <CharCard key={c.id} rec={c} reg={reg} current={c.id === currentId} onOpen={() => onOpen(c.id, c.data)}
              onDuplicate={() => onOpen(uid(), { ...c.data, name: `${c.data.name || "Character"} (copy)` })}
              onExport={() => downloadText(`${c.name || "character"}.json`, JSON.stringify(c.data, null, 2))}
              onDelete={async () => { if (await askConfirm({ title: `Delete ${c.name || "this character"}?`, message: "The character and everything saved with it will be removed from this computer. This cannot be undone; export it first if you might want it back.", confirmLabel: "Delete character" })) { await deleteCharacterRecord(c.id); refresh(); } }} />
          ))}
          {!list.length && <p className="muted">No saved characters yet. Your work saves automatically.</p>}
        </div>
      </section>
      {reg && list.length > 1 && <PartyView list={list} reg={reg} onOpen={(c) => onOpen(c.id, c.data)} />}
    </div>
  );
}

const SIGNED = (n: number) => (n >= 0 ? `+${n}` : String(n));

/** A saved character as a card: class emblem, portrait, name, what it is, and its main numbers. Click to open. */
function CharCard({ rec, reg, current, onOpen, onDuplicate, onExport, onDelete }: { rec: CharacterRecord; reg?: ARegistry; current: boolean; onOpen: () => void; onDuplicate: () => void; onExport: () => void; onDelete: () => void }) {
  const ch = rec.data;
  // The numbers need the rules content; without it the card shows the saved summary only.
  const info = useMemo(() => {
    if (!reg) return null;
    try {
      const r = resolve(ch, reg);
      const sh = buildSheet(r);
      const name = (id?: string) => (id ? reg.get(id)?.name : undefined);
      return {
        classes: ch.classes.map((k) => `${name(k.classId) ?? "?"} ${k.level}`).join(" / "),
        firstClass: name(ch.classes[0]?.classId) ?? "",
        species: name(ch.race) ?? "", background: name(ch.background) ?? "",
        level: r.totalLevel, hp: sh.hp, ac: sh.ac.value, speed: sh.speed,
        top: [...sh.abilities].sort((a, b) => b.score - a.score).slice(0, 3),
      };
    } catch {
      return null;
    }
  }, [ch, reg]);
  const cls = info?.firstClass ?? "";
  const hue = cls ? hueOf(cls) : 40;
  return (
    <div className={`char-card ${current ? "current" : ""}`}>
      <button className="char-card-body pick-card is-class" data-glyph="" style={{ ["--hue" as string]: hue }} onClick={onOpen} aria-label={`Open ${rec.name || "this character"}`}>
        {cls && hasClassIcon(cls) && <ClassIcon name={cls} size={220} className="pick-watermark" />}
        <span className="ribbon">{cls && hasClassIcon(cls) ? <ClassIcon name={cls} size={30} /> : (rec.name || "?").charAt(0)}</span>
        {ch.portrait && <img className="char-card-portrait" src={ch.portrait} alt="" />}
        <span className="char-card-text">
          {current && <small className="char-card-current">Open now</small>}
          <b className="char-card-name">{rec.name || "Unnamed character"}</b>
          <span className="char-card-what">{info ? [info.level ? `Level ${info.level}` : "", info.species, info.classes].filter(Boolean).join(" · ") || "Nothing chosen yet" : rec.summary || "empty"}</span>
          {info?.background && <span className="char-card-bg">{info.background}</span>}
          {info && info.level > 0 && (
            <span className="char-card-stats">
              <span><small>HP</small><b>{info.hp}</b></span>
              <span><small>AC</small><b>{info.ac}</b></span>
              <span><small>Speed</small><b>{info.speed}</b></span>
              {info.top.map((a) => <span key={a.id}><small>{a.id.slice(0, 3).toUpperCase()}</small><b>{a.score}</b><em>{SIGNED(a.mod)}</em></span>)}
            </span>
          )}
          <small className="char-card-when">Edited {ago(rec.updated)}</small>
        </span>
      </button>
      <div className="char-card-tools">
        <button className="board-ico" title="Duplicate" aria-label={`Duplicate ${rec.name || "this character"}`} onClick={onDuplicate}>⧉</button>
        <button className="board-ico" title="Export as a file" aria-label={`Export ${rec.name || "this character"}`} onClick={onExport}>⤓</button>
        <button className="board-ico" title="Delete" aria-label={`Delete ${rec.name || "this character"}`} onClick={onDelete}>×</button>
      </div>
    </div>
  );
}
