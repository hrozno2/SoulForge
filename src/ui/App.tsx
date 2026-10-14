import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "../i18n";
import { tabOfSlot } from "./Slots";
import { TAB_ICONS } from "./icons";
import { newCharacter, normalizeCharacter, uid, type Character } from "../aurora/character";
import { resolve } from "../aurora/engine";
import { randomCharacter } from "../aurora/randomCharacter";
import { saveCharacterRecord } from "../aurora/storage";
import type { AElement } from "../aurora/types";
import { useContent } from "./useContent";
import { BuildTab } from "./BuildTab";
import { BuildBoard } from "./BuildBoard";
import { StartTab } from "./StartTab";
import { DetailPanel } from "./DetailPanel";
import { UpdateBanner } from "./UpdateBanner";
import { DicePanel, setRollContext } from "./Dice";
import { UiProvider } from "./Learn";
import { ThemePicker } from "./Theme";
import { HelpButton } from "./Help";
import { AppMenu, GroupNav } from "./TopBar";
import { SettingsDialog, getSettings, updateSettings, useScaleShortcuts, useSettings } from "./Settings";
import { runAutoBackup } from "../aurora/backup";
import { useUpdater } from "../updater";
import { importForeignCharacter, type ForeignImport } from "../aurora/foreign";
import { ImportReport, importReportText } from "./ImportReport";
import { ruleProblems } from "./RulesCheck";
import { makeTestBatch, testExport, testToolsEnabled } from "./TestTools";
import { listCharacters } from "../aurora/storage";
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
const TABS: [Tab, string][] = [["start", "Home"], ["build", "Build"], ["magic", "Magic"], ["equipment", "Equipment"], ["manage", "Manage"], ["play", "Play"], ["sheet", "Export"], ["content", "Content"]];
const CUR_KEY = "charforge.current.v2";

function loadCurrent(): { id: string; ch: Character; fromLibrary?: boolean } {
  try {
    const raw = localStorage.getItem(CUR_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { id: string; ch?: Character };
      if (p.ch?.version === 2) return { id: p.id, ch: normalizeCharacter(p.ch) };
      // Only the id was kept (the character was too big for this storage): it is loaded from the library below.
      if (p.id) return { id: p.id, ch: newCharacter(), fromLibrary: true };
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
  // While the open character is still coming from the library, nothing is saved over it.
  const loading = useRef(!!initial.fromLibrary);
  useEffect(() => {
    if (!initial.fromLibrary) return;
    void listCharacters().then((all) => {
      const rec = all.find((c) => c.id === initial.id);
      loading.current = false;
      if (rec) setCharacter(normalizeCharacter(rec.data));
    }).catch(() => { loading.current = false; });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [detail, setDetail] = useState<AElement | null>(null);
  const content = useContent();
  const updater = useUpdater();

  const r = useMemo(() => resolve(character, content.reg), [character, content.reg]);
  useEffect(() => setRollContext({ conditions: character.play.conditions, exhaustion: character.play.exhaustion ?? 0 }), [character.play.conditions, character.play.exhaustion]);

  // Autosave the open character, and keep a copy in the library.
  const saveTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (loading.current) return;
    try {
      localStorage.setItem(CUR_KEY, JSON.stringify({ id, ch: character }));
    } catch {
      // Too big for this storage (a large portrait, say): keep the id, the library has the character.
      try {
        localStorage.setItem(CUR_KEY, JSON.stringify({ id }));
      } catch {
        /* storage can be unavailable */
      }
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
    const p = getSettings();
    open(uid(), randomCharacter(content.reg, level, { legacy: p.showLegacy, playtest: p.showPlaytest, unusual: p.showUnusual }));
  };
  const [testMsg, setTestMsg] = useState("");
  const [report, setReport] = useState<{ name: string; res: ForeignImport; rules: string[] } | null>(null);
  // After an import report closes: where to find it again.
  const [notesHint, setNotesHint] = useState(false);
  useEffect(() => {
    if (!notesHint) return;
    const t = window.setTimeout(() => setNotesHint(false), 9000);
    return () => window.clearTimeout(t);
  }, [notesHint]);
  const [notesFocus, setNotesFocus] = useState(0);
  const openNotes = () => {
    setNotesHint(false);
    setNotesFocus((n) => n + 1);
    setTab("manage");
  };
  const importForeign = async (file: File): Promise<string> => {
    try {
      const res = importForeignCharacter(JSON.parse(await file.text()), content.reg);
      // The report also goes into the character's notes, to read again later.
      const rules = ruleProblems(resolve(res.character, content.reg));
      const text = importReportText(res, file.name, new Date(), rules);
      res.character = { ...res.character, notes: [res.character.notes, text].filter(Boolean).join("\n\n") };
      open(uid(), res.character);
      setReport({ name: res.character.name, res, rules });
      return `Imported ${res.character.name || "the character"}.`;
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
  // Starting gear not chosen: shown on the Equipment tab, like open choices on Build.
  const equipPending = character.classes.length > 0 && !(character.equipmentAdded?.length) && character.inventory.length === 0;
  const hasMagic = r.spellcasting.size > 0 || r.spellPicks.length > 0;
  // When the last open choice on Build is made, go on to Magic (casters) or Equipment; when the last spell is
  // chosen on Magic, go on to Equipment. Only on the change itself, so opening a finished character moves nothing.
  const settings = useSettings();
  const board = testToolsEnabled && settings.buildLayout !== "tabs";
  // The build board holds spells and equipment too, so their own tabs go and Build counts what they had open.
  useEffect(() => { if (board && (tab === "magic" || tab === "equipment")) setTab("build"); }, [board, tab]);
  const prevOpen = useRef({ build: pending, magic: magicList.length, id });
  useEffect(() => {
    const prev = prevOpen.current;
    prevOpen.current = { build: pending, magic: magicList.length, id };
    if (prev.id !== id || board) return;
    if (tab === "build" && prev.build > 0 && pending === 0) setTab(hasMagic ? "magic" : "equipment");
    else if (tab === "magic" && prev.magic > 0 && magicList.length === 0 && pending === 0) setTab("equipment");
  }, [pending, magicList.length, id]); // eslint-disable-line react-hooks/exhaustive-deps
  const tip = (where: string, list: string[]) => `Still to choose on the ${where} tab:\n${list.slice(0, 12).join("\n")}${list.length > 12 ? `\n...and ${list.length - 12} more` : ""}`;
  // The build board has no description panel: its lists open descriptions with Learn more.
  const showDetail = tab !== "start" && tab !== "sheet" && tab !== "play" && !(tab === "build" && board);

  return (
    <UiProvider reg={content.reg}>
    <div className="app">
      <header className="topbar">
        <strong className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="28" height="28" />
          Soul Forge
        </strong>
        <GroupNav current={tab} onPick={setTab} groups={(() => {
          const defs = TABS.map(([key, label]) => ({ key, label: t(label), icon: (() => { const I = TAB_ICONS[key]; return I ? <I size={15} /> : undefined; })(), badge: key === "build" ? pending + (board ? magicList.length + (equipPending ? 1 : 0) : 0) : key === "magic" ? magicList.length : key === "equipment" ? (equipPending ? 1 : undefined) : undefined, badgeTitle: key === "build" && (pending || (board && magicList.length)) ? tip("Build", board ? [...pendingList, ...magicList] : pendingList) : key === "magic" && magicList.length ? tip("Magic", magicList) : key === "equipment" && equipPending ? "Starting equipment is not chosen yet" : undefined }));
          const pick = (...keys: Tab[]) => keys.map((k) => defs.find((d) => d.key === k)!).filter(Boolean);
          return [
            { key: "home", label: t("Home"), items: pick("start") },
            { key: "build", label: t("Build"), items: pick("build") },
            ...(board ? [] : [{ key: "magic", label: t("Magic"), items: pick("magic") }, { key: "equipment", label: t("Equipment"), items: pick("equipment") }]),
            { key: "manage", label: t("Manage"), icon: defs.find((d) => d.key === "manage")?.icon, items: pick("manage", "content") },
            { key: "sheet", label: t("Sheet"), icon: defs.find((d) => d.key === "sheet")?.icon, items: pick("play", "sheet") },
          ];
        })()} />
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
      {testToolsEnabled && (
        <div className="test-bar noprint">
          <b>Test build</b>
          <small title="If this is older than the build you expect, quit the app (Cmd+Q) and open it again.">{import.meta.env.VITE_TEST_BUILD}</small>
          <button onClick={async () => { if (!content.ready) { setTestMsg("Load rules content first (Home, Go to content)."); return; } setTestMsg("Making 10 random characters..."); const made = await makeTestBatch(content.reg); if (made[0]) open(made[0].id, made[0].ch); setTab("start"); setTestMsg(`Made ${made.length} test characters. They are on Home.`); }}>Make 10 random characters</button>
          <button onClick={async () => setTestMsg(await testExport(content.reg, setTestMsg))}>Export test characters</button>
          <button onClick={() => updateSettings({ buildLayout: board ? "tabs" : "board" })} title="Try the new Build layout or go back to the old one">Build layout: {board ? "new (board)" : "old (tabs)"}</button>
        </div>
      )}
      {testMsg && <div className="test-toast" role="status" onClick={() => setTestMsg("")}>{testMsg} <small>(click to close)</small></div>}
      {report && <ImportReport name={report.name} res={report.res} rules={report.rules} onClose={() => { setReport(null); setNotesHint(true); }} onBuild={() => setTab("build")} />}
      {notesHint && (
        <div className="notice-toast noprint" role="status">
          <span>The import notes and the to-do list are saved in the character's Notes (Manage, or Play, Notes).</span>
          <button className="primary" onClick={openNotes}>Open notes</button>
          <button className="notice-x" aria-label="Close" onClick={() => setNotesHint(false)}>×</button>
        </div>
      )}
      {tutorialOpen && <Tutorial step={tutorialStep} setStep={setTutorialStep} minimized={tutorialMin} setMinimized={setTutorialMin} onClose={() => { setTutorialOpen(false); setTutorialMin(false); }} onGo={(t) => setTab(t as Tab)} content={content} onImportForeign={importForeign} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {levelUpOpen && <Suspense fallback={null}><LevelUp r={r} ch={character} set={set} onDetail={setDetail} onClose={() => setLevelUpOpen(false)} /></Suspense>}
      <UpdateBanner found={updater.found} status={updater.status} busy={updater.busy} install={updater.install} dismiss={updater.dismiss} />
      <main className={[showDetail ? "with-detail" : "", tab === "build" && board ? "wide" : ""].filter(Boolean).join(" ")}>
        <div className="pane">
          {["build", "magic", "equipment", "manage"].includes(tab) && (
            <div className="actionbar" role="toolbar" aria-label="Character actions">
              <span className="saved" title="Characters save as you work">✓ Saved</span>
              <button onClick={() => window.dispatchEvent(new Event("cf-levelup"))} disabled={!character.classes.length}>Level up</button>
              <button onClick={() => setTab("play")}>Play</button>
              <button onClick={() => setTab("sheet")}>Export</button>
            </div>
          )}
          <Suspense fallback={<p className="muted">Loading...</p>}>
          {tab === "start" && <StartTab currentId={id} onOpen={open} onNew={() => open(uid(), newCharacter())} onRandom={random} contentReady={content.ready} sourceCount={content.sources.length} goContent={() => setTab("content")} onImportForeign={importForeign} reg={content.reg} />}
          {tab === "build" && (
            <>
              {!board && <div className="namebar"><input placeholder="Character name" value={character.name} onChange={(e) => set((c) => ({ ...c, name: e.target.value }))} /></div>}
              {board ? <BuildBoard r={r} ch={character} set={set} /> : <BuildTab r={r} ch={character} set={set} onDetail={setDetail} />}
            </>
          )}
          {tab === "magic" && <MagicTab r={r} ch={character} set={set} onDetail={setDetail} />}
          {tab === "equipment" && <EquipmentTab r={r} ch={character} set={set} onDetail={setDetail} />}
          {tab === "manage" && <ManageTab r={r} ch={character} set={set} onDetail={setDetail} focusNotes={notesFocus} />}
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
