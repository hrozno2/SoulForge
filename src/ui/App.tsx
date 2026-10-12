import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "../i18n";
import { tabOfSlot } from "./Slots";
import { TAB_ICONS } from "./icons";
import { newCharacter, normalizeCharacter, uid, type Character } from "../aurora/character";
import { resolve } from "../aurora/engine";
import { autoFill } from "../aurora/autofill";
import { saveCharacterRecord } from "../aurora/storage";
import type { AElement } from "../aurora/types";
import { useContent } from "./useContent";
import { BuildTab } from "./BuildTab";
import { StartTab } from "./StartTab";
import { DetailPanel } from "./DetailPanel";
import { UpdateBanner } from "./UpdateBanner";
import { DicePanel, setRollContext } from "./Dice";
import { UiProvider } from "./Learn";
import { ThemePicker } from "./Theme";
import { HelpButton } from "./Help";
import { AppMenu, Tabs } from "./TopBar";
import { SettingsDialog, getSettings, useScaleShortcuts } from "./Settings";
import { runAutoBackup } from "../aurora/backup";
import { useUpdater } from "../updater";
import { importForeignCharacter } from "../aurora/foreign";
import { Tutorial, tutorialWanted } from "./Tutorial";
import { CompendiumSearch } from "./CompendiumSearch";

// The tabs that are not needed at start-up load on first use, which keeps the first screen quick.
const MagicTab = lazy(() => import("./MagicTab").then((m) => ({ default: m.MagicTab })));
const EquipmentTab = lazy(() => import("./EquipmentTab").then((m) => ({ default: m.EquipmentTab })));
const ManageTab = lazy(() => import("./ManageTab").then((m) => ({ default: m.ManageTab })));
const SheetTab = lazy(() => import("./SheetTab").then((m) => ({ default: m.SheetTab })));
const PlayTab = lazy(() => import("./PlayTab").then((m) => ({ default: m.PlayTab })));
const LevelUp = lazy(() => import("./LevelUp").then((m) => ({ default: m.LevelUp })));
const ContentTab = lazy(() => import("./ContentTab").then((m) => ({ default: m.ContentTab })));

type Tab = "start" | "build" | "magic" | "equipment" | "manage" | "play" | "sheet" | "content";
const TABS: [Tab, string][] = [["start", "Home"], ["build", "Build"], ["magic", "Magic"], ["equipment", "Equipment"], ["manage", "Manage"], ["play", "Play"], ["sheet", "Sheet"], ["content", "Content"]];
const CUR_KEY = "charforge.current.v2";

function loadCurrent(): { id: string; ch: Character } {
  try {
    const raw = localStorage.getItem(CUR_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { id: string; ch: Character };
      if (p.ch?.version === 2) return { id: p.id, ch: normalizeCharacter(p.ch) };
    }
  } catch {
    /* start fresh */
  }
  return { id: uid(), ch: newCharacter() };
}

export function App() {
  const [tab, setTab] = useState<Tab>("start");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(tutorialWanted);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialMin, setTutorialMin] = useState(false);
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  useEffect(() => {
    const on = () => setLevelUpOpen(true);
    window.addEventListener("cf-levelup", on);
    return () => window.removeEventListener("cf-levelup", on);
  }, []);
  useScaleShortcuts();
  // One backup a day, a little after start-up so it never slows the first screen.
  useEffect(() => {
    const t = window.setTimeout(() => void runAutoBackup(getSettings().autoBackup).catch(() => undefined), 8000);
    return () => window.clearTimeout(t);
  }, []);
  const initial = useMemo(loadCurrent, []);
  const [id, setId] = useState(initial.id);
  const [character, setCharacter] = useState<Character>(initial.ch);
  const [detail, setDetail] = useState<AElement | null>(null);
  const content = useContent();
  const updater = useUpdater();

  const r = useMemo(() => resolve(character, content.reg), [character, content.reg]);
  useEffect(() => setRollContext({ conditions: character.play.conditions, exhaustion: character.play.exhaustion ?? 0 }), [character.play.conditions, character.play.exhaustion]);

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
  const open = (nid: string, ch: Character) => { setId(nid); setCharacter(normalizeCharacter(ch)); setTab("build"); };
  const random = (level: number) => {
    const reg = content.reg;
    const pick = <T,>(a: T[]): T | undefined => a[Math.floor(Math.random() * a.length)];
    let c = newCharacter();
    c.race = pick(reg.ofType("Race"))?.id;
    c.background = pick(reg.ofType("Background"))?.id;
    const cls = pick(reg.ofType("Class"));
    if (cls) c.classes = [{ classId: cls.id, level: Math.max(1, Math.min(20, Math.floor(level) || 1)) }];
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

  const unfilled = r.slots.filter((s) => !s.rule.optional && s.chosen.length < s.rule.number && s.options.length);
  const describe = (s: (typeof unfilled)[number]) => `${s.rule.name}: ${s.rule.number - s.chosen.length} to choose`;
  // Spell choices belong to the Magic tab, everything else to Build.
  const pendingList = [
    ...(character.race ? [] : ["Pick a species"]),
    ...(character.classes.length ? [] : ["Pick a class"]),
    ...unfilled.filter((s) => tabOfSlot(s) !== "magic").map(describe),
  ];
  const magicList = unfilled.filter((s) => tabOfSlot(s) === "magic").map(describe);
  const pending = pendingList.length;
  const tip = (where: string, list: string[]) => `Still to choose on the ${where} tab:\n${list.slice(0, 12).join("\n")}${list.length > 12 ? `\n...and ${list.length - 12} more` : ""}`;
  const showDetail = tab !== "start" && tab !== "sheet" && tab !== "play";

  return (
    <UiProvider reg={content.reg}>
    <div className="app">
      <header className="topbar">
        <strong className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="28" height="28" />
          Soul Forge
        </strong>
        <Tabs tabs={TABS.map(([key, label]) => ({ key, label: t(label), icon: (() => { const I = TAB_ICONS[key]; return I ? <I size={15} /> : undefined; })(), badge: key === "build" ? pending : key === "magic" ? magicList.length : undefined, badgeTitle: key === "build" && pending ? tip("Build", pendingList) : key === "magic" && magicList.length ? tip("Magic", magicList) : undefined }))} current={tab} onPick={setTab} />
        <CompendiumSearch />
        <button className="who-badge" title="Character details" onClick={() => setTab("manage")}>
          {character.portrait ? <img src={character.portrait} alt="" /> : <span className="ph">{(character.name || "?").charAt(0)}</span>}
          <span className="who-text">
            <b>{character.name || "Unnamed"}</b>
            <small>{[r.totalLevel ? `Level ${r.totalLevel}` : "no class yet", character.race ? content.reg.get(character.race)?.name : "", character.classes[0] ? content.reg.get(character.classes[0].classId)?.name : ""].filter(Boolean).join(" ")}</small>
          </span>
        </button>
        {content.busy && <span className="muted busy">{content.status || "Working..."}</span>}
        <HelpButton tab={tab} />
        <AppMenu>
          <label className="menu-row">Theme <ThemePicker /></label>
          <button className="menu-item" onClick={() => setSettingsOpen(true)}>Settings...</button>
          <button className="menu-item" onClick={() => { setTutorialStep(0); setTutorialMin(false); setTutorialOpen(true); }}>Show the tutorial</button>
          <button className="menu-item" onClick={() => updater.check(true)}>Check for updates</button>
        </AppMenu>
      </header>
      {tutorialOpen && <Tutorial step={tutorialStep} setStep={setTutorialStep} minimized={tutorialMin} setMinimized={setTutorialMin} onClose={() => { setTutorialOpen(false); setTutorialMin(false); }} onGo={(t) => setTab(t as Tab)} content={content} onImportForeign={importForeign} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {levelUpOpen && <Suspense fallback={null}><LevelUp r={r} ch={character} set={set} onDetail={setDetail} onClose={() => setLevelUpOpen(false)} /></Suspense>}
      <UpdateBanner found={updater.found} status={updater.status} busy={updater.busy} install={updater.install} dismiss={updater.dismiss} />
      <main className={showDetail ? "with-detail" : ""}>
        <div className="pane">
          {["build", "magic", "equipment", "manage"].includes(tab) && (
            <div className="actionbar" role="toolbar" aria-label="Character actions">
              <span className="saved" title="Characters save as you work">✓ Saved</span>
              <button onClick={() => window.dispatchEvent(new Event("cf-levelup"))} disabled={!character.classes.length}>Level up</button>
              <button onClick={() => setTab("play")}>Play</button>
              <button onClick={() => setTab("sheet")}>Sheet</button>
            </div>
          )}
          <Suspense fallback={<p className="muted">Loading...</p>}>
          {tab === "start" && <StartTab currentId={id} onOpen={open} onNew={() => open(uid(), newCharacter())} onRandom={random} contentReady={content.ready} sourceCount={content.sources.length} goContent={() => setTab("content")} onImportForeign={importForeign} reg={content.reg} />}
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
          </Suspense>
        </div>
        {showDetail && <DetailPanel el={detail} />}
      </main>
      <DicePanel />
    </div>
    </UiProvider>
  );
}
