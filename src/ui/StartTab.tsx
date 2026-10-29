import { useEffect, useMemo, useRef, useState } from "react";
import { exportLibrary, importLibrary, isBackup } from "./library";
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
import { dropCardsIfWaiting, launchReady } from "./LaunchIntro";
import { updateSettings, useSettings } from "./Settings";

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
  const compact = !!useSettings().homeCompact;
  const [listed, setListed] = useState(false);
  // The launch intro's cards drop in here when the list arrives after the pack has burst.
  useEffect(() => { if (list.length && contentReady) requestAnimationFrame(dropCardsIfWaiting); }, [list.length, contentReady]);
  // The launch pack opens once the cards are drawn with everything on them: the saved list and the rules content
  // (their classes, colours and numbers). Two frames, so they are painted before it bursts.
  useEffect(() => { if (listed && contentReady) requestAnimationFrame(() => requestAnimationFrame(launchReady)); }, [listed, contentReady]);
  const [msg, setMsg] = useState("");
  const [askLevel, setAskLevel] = useState(false);
  const [level, setLevel] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);
  const foreignRef = useRef<HTMLInputElement>(null);
  const refresh = () => listCharacters().then((l) => { setList(l); setListed(true); });
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, []);

  const importJson = async (f: File | undefined) => {
    if (!f) return;
    try {
      const parsed = JSON.parse(await f.text());
      // A whole library (from "Export library" or a Settings backup) restores next to the characters here.
      if (isBackup(parsed)) { setMsg(await importLibrary(parsed)); refresh(); return; }
      const raw = parsed as Character;
      if (raw.version !== 2) throw new Error("This is not a Soul Forge character or library file. Foundry and Roll20 exports go through the Import button next to it.");
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
          <button title="A character file, or a whole library file" onClick={async () => { const f = await pickFiles(["json"]); if (f === null) fileRef.current?.click(); else if (f[0]) importJson(f[0]); }}>Open file (.json)</button>
          <button title="Every character in one file, to keep or to carry to another device; open it here with Open file" onClick={async () => setMsg(await exportLibrary())}>Export library</button>
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
        {list.length > 0 && (
          <div className="row char-cards-view">
            <button className={compact ? "pill" : "pill active"} aria-pressed={!compact} onClick={() => updateSettings({ homeCompact: false })}>Cards</button>
            <button className={compact ? "pill active" : "pill"} aria-pressed={compact} onClick={() => updateSettings({ homeCompact: true })}>Compact</button>
          </div>
        )}
        {/* Compact: one short line per character, for small screens (Chris 2026-10-29); also on its own below 560 px. */}
        <div className={`char-cards ${compact ? "compact" : ""}`}>
          {/* Cards are drawn once the rules content is in, never before with an empty registry: they would show as
              blank gold placeholders and change under the player's eyes (C1.6). What lands is final. */}
          {!contentReady && list.length > 0 && <p className="muted">Loading your characters...</p>}
          {contentReady && list.map((c) => (
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
        // Current hit points as the Play tab keeps them (unset: full).
        hpNow: Math.max(0, Math.min(sh.hp, ch.play.hp ?? sh.hp)),
        // All six scores, in the sheet's order.
        all: sh.abilities,
      };
    } catch {
      return null;
    }
  }, [ch, reg]);
  const cls = info?.firstClass ?? "";
  const hue = cls ? hueOf(cls) : 40;
  return (
    <div className={`char-card ${current ? "current" : ""}`} data-level={ch.classes.reduce((n, k) => n + (k.level || 0), 0)}>
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
              {/* First row: hit points as a bar, armor class on a shield, walking speed (C1.0b). */}
              <span className="cc-row">
                <span className="cc-hp" title={`Hit points ${info.hpNow} of ${info.hp}`}>
                  <span className={`cc-hp-bar ${info.hp && info.hpNow / info.hp < 0.25 ? "low" : ""}`}><i style={{ width: `${info.hp ? Math.round((info.hpNow / info.hp) * 100) : 0}%` }} /></span>
                  <b>{info.hpNow}<small> / {info.hp}</small></b>
                </span>
                <span className="cc-ac" title="Armor class">
                  <svg viewBox="0 0 24 28" aria-hidden="true"><path d="M12 1 2 5v8c0 6.5 4.3 11.6 10 14 5.7-2.4 10-7.5 10-14V5z" /></svg>
                  <b>{info.ac}</b>
                </span>
                <span className="cc-speed" title="Walking speed"><small>Speed</small><b>{info.speed}</b></span>
              </span>
              {/* Second row: all six ability scores in the sheet's order (Chris 2026-10-29: they fit, no "+"). */}
              <span className="cc-row cc-abilities">
                {info.all.map((a) => <span key={a.id} className="cc-ab"><small>{a.id.slice(0, 3).toUpperCase()}</small><b>{a.score}</b><em>{SIGNED(a.mod)}</em></span>)}
              </span>
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
