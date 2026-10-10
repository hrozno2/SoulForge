import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { newCharacter, uid, type Character } from "../aurora/character";
import { resolve } from "../aurora/engine";
import { autoFill } from "../aurora/autofill";
import { saveCharacterRecord } from "../aurora/storage";
import type { AElement } from "../aurora/types";
import { useContent } from "./useContent";
import { BuildTab } from "./BuildTab";
import { MagicTab } from "./MagicTab";
import { EquipmentTab } from "./EquipmentTab";
import { ManageTab } from "./ManageTab";
import { SheetTab } from "./SheetTab";
import { PlayTab } from "./PlayTab";
import { ContentTab } from "./ContentTab";
import { StartTab } from "./StartTab";
import { DetailPanel } from "./DetailPanel";
import { UpdateBanner } from "./UpdateBanner";
import { DicePanel } from "./Dice";
import { UiProvider } from "./Learn";
import { ThemePicker } from "./Theme";
import { HelpButton } from "./Help";
import { useUpdater } from "../updater";
import { importForeignCharacter } from "../aurora/foreign";

type Tab = "start" | "build" | "magic" | "equipment" | "manage" | "play" | "sheet" | "content";
const TABS: [Tab, string][] = [["start", "Home"], ["build", "Build"], ["magic", "Magic"], ["equipment", "Equipment"], ["manage", "Manage"], ["play", "Play"], ["sheet", "Sheet"], ["content", "Content"]];
const CUR_KEY = "charforge.current.v2";

function loadCurrent(): { id: string; ch: Character } {
  try {
    const raw = localStorage.getItem(CUR_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { id: string; ch: Character };
      if (p.ch?.version === 2) return { id: p.id, ch: { ...newCharacter(), ...p.ch } };
    }
  } catch {
    /* start fresh */
  }
  return { id: uid(), ch: newCharacter() };
}

export function App() {
  const [tab, setTab] = useState<Tab>("start");
  const initial = useMemo(loadCurrent, []);
  const [id, setId] = useState(initial.id);
  const [character, setCharacter] = useState<Character>(initial.ch);
  const [detail, setDetail] = useState<AElement | null>(null);
  const content = useContent();
  const updater = useUpdater();

  const r = useMemo(() => resolve(character, content.reg), [character, content.reg]);

  // Autosave the open character, and keep a copy in the library.
  const saveTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    try {
      localStorage.setItem(CUR_KEY, JSON.stringify({ id, ch: character }));
    } catch {
      /* storage can be unavailable */
    }
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const classes = character.classes.map((c) => `${content.reg.get(c.classId)?.name ?? "?"} ${c.level}`).join(" / ");
      const race = character.race ? content.reg.get(character.race)?.name : "";
      const empty = !character.name && !character.race && !character.classes.length && !character.background;
      if (!empty) saveCharacterRecord({ id, name: character.name, summary: [race, classes].filter(Boolean).join(" ") , updated: Date.now(), data: character }).catch(() => {});
    }, 800);
  }, [character, id, content.reg]);

  const set = useCallback((fn: (c: Character) => Character) => setCharacter((c) => fn(c)), []);
  const open = (nid: string, ch: Character) => { setId(nid); setCharacter({ ...newCharacter(), ...ch, info: { ...newCharacter().info, ...ch.info }, play: { ...newCharacter().play, ...ch.play } }); setTab("build"); };
  const random = () => {
    const reg = content.reg;
    const pick = <T,>(a: T[]): T | undefined => a[Math.floor(Math.random() * a.length)];
    let c = newCharacter();
    c.race = pick(reg.ofType("Race"))?.id;
    c.background = pick(reg.ofType("Background"))?.id;
    const cls = pick(reg.ofType("Class"));
    if (cls) c.classes = [{ classId: cls.id, level: 1 + Math.floor(Math.random() * 5) }];
    c.abilityMethod = "standard";
    const order = [...["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]].sort(() => Math.random() - 0.5);
    [15, 14, 13, 12, 10, 8].forEach((v, i) => ((c.abilityBase as Record<string, number>)[order[i]] = v));
    c = autoFill(c, reg, () => Math.random());
    c.name = "Random adventurer";
    open(uid(), c);
  };
  const importForeign = async (file: File): Promise<string> => {
    try {
      const res = importForeignCharacter(JSON.parse(await file.text()), content.reg);
      open(uid(), res.character);
      return res.notes.join(" ");
    } catch (e) {
      return `Could not import: ${(e as Error).message}`;
    }
  };

  const pending = r.slots.filter((s) => !s.rule.optional && s.chosen.length < s.rule.number && s.options.length).length + (character.race ? 0 : 1) + (character.classes.length ? 0 : 1);
  const showDetail = tab !== "start" && tab !== "sheet" && tab !== "play";

  return (
    <UiProvider reg={content.reg}>
    <div className="app">
      <header className="topbar">
        <strong className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="28" height="28" />
          Soul Forge
        </strong>
        <nav>
          {TABS.map(([k, label]) => (
            <button key={k} className={tab === k ? "tab active" : "tab"} onClick={() => setTab(k)}>
              {label}
              {k === "build" && pending > 0 && <span className="badge">{pending}</span>}
            </button>
          ))}
        </nav>
        <span className="who">{character.name || "Unnamed"} · {r.totalLevel ? `Level ${r.totalLevel}` : "no class yet"}</span>
        {content.busy && <span className="muted busy">{content.status || "Working..."}</span>}
        <ThemePicker />
        <HelpButton tab={tab} />
        <button className="tab noprint" onClick={() => updater.check(true)}>Check for updates</button>
      </header>
      <UpdateBanner found={updater.found} status={updater.status} busy={updater.busy} install={updater.install} />
      <main className={showDetail ? "with-detail" : ""}>
        <div className="pane">
          {tab === "start" && <StartTab currentId={id} onOpen={open} onNew={() => open(uid(), newCharacter())} onRandom={random} contentReady={content.ready} sourceCount={content.sources.length} goContent={() => setTab("content")} onImportForeign={importForeign} />}
          {tab === "build" && (
            <>
              <div className="namebar"><input placeholder="Character name" value={character.name} onChange={(e) => set((c) => ({ ...c, name: e.target.value }))} /></div>
              <BuildTab r={r} ch={character} set={set} onDetail={setDetail} />
            </>
          )}
          {tab === "magic" && <MagicTab r={r} ch={character} set={set} onDetail={setDetail} />}
          {tab === "equipment" && <EquipmentTab r={r} ch={character} set={set} onDetail={setDetail} />}
          {tab === "manage" && <ManageTab r={r} ch={character} set={set} onDetail={setDetail} />}
          {tab === "play" && <PlayTab r={r} ch={character} set={set} />}
          {tab === "sheet" && <SheetTab r={r} ch={character} set={set} />}
          {tab === "content" && <ContentTab content={content} onDetail={setDetail} />}
        </div>
        {showDetail && <DetailPanel el={detail} />}
      </main>
      <DicePanel />
    </div>
    </UiProvider>
  );
}
