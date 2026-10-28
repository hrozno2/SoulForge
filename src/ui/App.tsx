import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TextInput } from "./TextField";
import { logEvent, timed } from "../logbook";
import { withGrantedItems } from "../aurora/grantedItems";
import { checkDue } from "../aurora/olderBuild";
import { ConfirmHost } from "./Confirm";
import { BugReport } from "./BugReport";
import { t } from "../i18n";
import { tabOfSlot } from "./Slots";
import { TAB_ICONS } from "./icons";
import { newCharacter, normalizeCharacter, uid, type Character } from "../aurora/character";
import { resolve, stillToChoose } from "../aurora/engine";
import { randomCharacter } from "../aurora/randomCharacter";
import { saveCharacterRecord } from "../aurora/storage";
import type { AElement } from "../aurora/types";
import { useContent } from "./useContent";
import { BuildTab } from "./BuildTab";
import { BuildBoard } from "./BuildBoard";
import { StartTab } from "./StartTab";
import { LaunchIntro, launchReady } from "./LaunchIntro";
import { outdatedFiveTools } from "../aurora/content";
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
import { ImportNotes, ImportReport, importReportText } from "./ImportReport";
import { APP_VERSION, OlderBuildNotice, ruleProblems } from "./RulesCheck";
import { loadTestContent, makeTestBatch, testExport, testToolsEnabled } from "./TestTools";
import { listCharacters } from "../aurora/storage";
import { Tutorial, tutorialWanted } from "./Tutorial";
import { CompendiumSearch } from "./CompendiumSearch";

// The tabs that are not needed at start-up load on first use, which keeps the first screen quick.
// Magic and Equipment are part of the build board, so they load with it rather than on their own (issue #2).
import { MagicTab } from "./MagicTab";
import { EquipmentTab } from "./EquipmentTab";
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
  // The tutorial waits for the launch intro to finish.
  const [introOver, setIntroOver] = useState(false);
  const endIntro = useCallback(() => setIntroOver(true), []);
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
  // Launched on another tab than Home: the pack opens when the content is ready (the home screen signals otherwise).
  useEffect(() => { if (tab !== "start" && content.ready) launchReady(); }, [tab, content.ready]);
  // 5e.tools content imported by an older importer lacks files this version reads: ask for a fresh import, once per
  // launch, until it is done.
  const [reimportLater, setReimportLater] = useState(false);
  const outdated = useMemo(() => outdatedFiveTools(content.sources), [content.sources]);
  const updater = useUpdater();

  // Working out the character; logged only when slow (A2.11), with what the character is made of.
  const r = useMemo(() => timed("engine", "resolve", () => resolve(character, content.reg), 50, () => `${character.classes.map((c) => `${content.reg.get(c.classId)?.name ?? c.classId} ${c.level}`).join("/")}, ${Object.keys(character.selections).length} picks`), [character, content.reg]);
  // Content the character's rules point at but nothing loaded has (the engine's warnings), when that changes (A2.11).
  const warned = useRef("");
  useEffect(() => {
    const sig = r.warnings.join(" | ");
    if (sig === warned.current) return;
    warned.current = sig;
    if (sig) logEvent("engine", `${r.warnings.length} references to missing content: ${r.warnings.slice(0, 8).join(" | ")}`);
  }, [r]);
  // Items a feature gives go into the inventory once (src/aurora/grantedItems.ts).
  useEffect(() => { const next = withGrantedItems(character, r); if (next !== character) setCharacter(next); }, [character, r]);
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
    open(uid(), { ...randomCharacter(content.reg, level, { legacy: p.showLegacy, playtest: p.showPlaytest, unusual: p.showUnusual, scifi: p.showSciFi, modern: p.showModern }), checkedWith: APP_VERSION });
  };
  const [testMsg, setTestMsg] = useState("");
  const [report, setReport] = useState<{ name: string; res: ForeignImport; rules: string[] } | null>(null);
  // A short notice after an import report closes or the report is added to the notes: where to find it.
  const [notesHint, setNotesHint] = useState<"" | "report" | "added">("");
  const [reportOpen, setReportOpen] = useState(false);
  useEffect(() => {
    if (!notesHint) return;
    const t = window.setTimeout(() => setNotesHint(""), 9000);
    return () => window.clearTimeout(t);
  }, [notesHint]);
  const [notesFocus, setNotesFocus] = useState(0);
  // Report a bug, from the menu or from Settings.
  const [bugOpen, setBugOpen] = useState(false);
  useEffect(() => {
    const open = () => setBugOpen(true);
    window.addEventListener("cf-report-bug", open);
    return () => window.removeEventListener("cf-report-bug", open);
  }, []);
  const openNotes = () => {
    setNotesHint("");
    setNotesFocus((n) => n + 1);
    setTab("manage");
  };
  const importForeign = async (file: File): Promise<string> => {
    try {
      const res = importForeignCharacter(JSON.parse(await file.text()), content.reg);
      // The report stays with the character (Import notes, beside Level up), to read again or add to the notes.
      const rules = ruleProblems(resolve(res.character, content.reg));
      const text = importReportText(res, file.name, new Date(), rules);
      // The import report lists what does not line up; the older-build notice would repeat it.
      res.character = { ...res.character, importReport: text, checkedWith: APP_VERSION };
      open(uid(), res.character);
      setReport({ name: res.character.name, res, rules });
      return `Imported ${res.character.name || "the character"}.`;
    } catch (e) {
      return `Could not import: ${(e as Error).message}`;
    }
  };

  const unfilled = r.slots.filter((s) => stillToChoose(s, r));
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
  // Starting gear not taken yet, or gear that names only a kind still to pick ("a musical instrument").
  const equipPending = (character.classes.length > 0 && !(character.equipmentAdded?.length) && character.inventory.length === 0) || character.inventory.some((i) => i.pending);
  const hasMagic = r.spellcasting.size > 0 || r.spellPicks.length > 0;
  // When the last open choice on Build is made, go on to Magic (casters) or Equipment; when the last spell is
  // chosen on Magic, go on to Equipment. Only on the change itself, so opening a finished character moves nothing.
  const settings = useSettings();
  const board = settings.buildLayout !== "tabs";
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
      <LaunchIntro onDone={endIntro} />
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
            { key: "manage", label: t("Manage"), items: pick("manage") },
            { key: "content", label: t("Content"), items: pick("content") },
            // With the board, Magic and Equipment are gone from here, so Play and Export each get their own tab.
            ...(board
              ? [{ key: "play", label: t("Play"), items: pick("play") }, { key: "export", label: t("Export"), items: pick("sheet") }]
              : [{ key: "sheet", label: t("Sheet"), icon: defs.find((d) => d.key === "sheet")?.icon, items: pick("play", "sheet") }]),
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
          <button className="menu-item" onClick={() => setBugOpen(true)}>Report a bug...</button>
          {testToolsEnabled && settings.hideTestTools && <button className="menu-item" onClick={() => updateSettings({ hideTestTools: false })}>Show test controls</button>}
        </AppMenu>
      </header>
      {testToolsEnabled && !settings.hideTestTools && (
        <div className="test-bar noprint">
          <b>Test build</b>
          <small title="If this is older than the build you expect, quit the app (Cmd+Q) and open it again.">{import.meta.env.VITE_TEST_BUILD}</small>
          <button onClick={async () => { if (!content.ready) { setTestMsg("Load rules content first (Home, Go to content)."); return; } setTestMsg("Making 10 random characters..."); const made = await makeTestBatch(content.reg); if (made[0]) open(made[0].id, made[0].ch); setTab("start"); setTestMsg(`Made ${made.length} test characters. They are on Home.`); }}>Make 10 random characters</button>
          <button onClick={async () => setTestMsg(await testExport(content.reg, setTestMsg))}>Export test characters</button>
          {import.meta.env.DEV && <button onClick={async () => { setTestMsg("Loading the test content..."); const msg = await loadTestContent(setTestMsg); await content.reload(); setTestMsg(msg); }} title="Dev server only: the test cache's Aurora and 5e.tools content">Load test content</button>}
          <button onClick={() => updateSettings({ buildLayout: board ? "tabs" : "board" })} title="Try the new Build layout or go back to the old one">Build layout: {board ? "new (board)" : "old (tabs)"}</button>
          <button onClick={() => { updateSettings({ hideTestTools: true }); setTestMsg("Test controls hidden. Bring them back in the menu or in Settings."); }} title="Hide this bar so the app looks like the released one">Hide test controls</button>
        </div>
      )}
      {testMsg && <div className="test-toast" role="status" onClick={() => setTestMsg("")}>{testMsg} <small>(click to close)</small></div>}
      {report && <ImportReport name={report.name} res={report.res} rules={report.rules} onClose={() => { setReport(null); setNotesHint("report"); }} onBuild={() => setTab("build")} />}
      {notesHint && (
        <div className="notice-toast noprint" role="status">
          {notesHint === "report" ? (
            <>
              <span>The import report and its to-do list stay with the character: <b>Import notes</b>, next to Level up on Build. From there you can add it to the character's notes.</span>
              <button className="primary" onClick={() => { setNotesHint(""); setTab("build"); setReportOpen(true); }}>Show import notes</button>
            </>
          ) : (
            <>
              <span>Added to the character's notes. Find them in Manage, Notes (and in Play, Notes).</span>
              <button className="primary" onClick={openNotes}>Open notes</button>
            </>
          )}
          <button className="notice-x" aria-label="Close" onClick={() => setNotesHint("")}>×</button>
        </div>
      )}
      {reportOpen && character.importReport && (
        <ImportNotes
          text={character.importReport}
          added={character.notes.includes(character.importReport)}
          onAdd={() => { set((c) => ({ ...c, notes: [c.notes, c.importReport].filter(Boolean).join("\n\n") })); setReportOpen(false); setNotesHint("added"); }}
          onClose={() => setReportOpen(false)}
        />
      )}
      {tutorialOpen && introOver && <Tutorial step={tutorialStep} setStep={setTutorialStep} minimized={tutorialMin} setMinimized={setTutorialMin} onClose={() => { setTutorialOpen(false); setTutorialMin(false); }} onGo={(t) => setTab(t as Tab)} content={content} onImportForeign={importForeign} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {levelUpOpen && <Suspense fallback={null}><LevelUp r={r} ch={character} set={set} onDetail={setDetail} onClose={() => setLevelUpOpen(false)} /></Suspense>}
      {checkDue(character, APP_VERSION) && !loading.current && <OlderBuildNotice key={id} r={r} set={set} />}
      <UpdateBanner found={updater.found} status={updater.status} busy={updater.busy} install={updater.install} dismiss={updater.dismiss} />
      <main className={[showDetail ? "with-detail" : "", tab === "build" && board ? "wide" : ""].filter(Boolean).join(" ")}>
        <div className="pane">
          {["build", "magic", "equipment", "manage"].includes(tab) && (
            <div className="actionbar" role="toolbar" aria-label="Character actions">
              <span className="saved" title="Characters save as you work">✓ Saved</span>
              <button onClick={() => window.dispatchEvent(new Event("cf-levelup"))} disabled={!character.classes.length}>Level up</button>
              <button onClick={() => setTab("play")}>Play</button>
              <button onClick={() => setTab("sheet")}>Export</button>
              {character.importReport && <button onClick={() => setReportOpen(true)} title="The report of the import that made this character">Import notes</button>}
            </div>
          )}
          <Suspense fallback={<p className="muted">Loading...</p>}>
          {tab === "start" && <StartTab currentId={id} onOpen={open} onNew={() => open(uid(), { ...newCharacter(), checkedWith: APP_VERSION })} onRandom={random} contentReady={content.ready} sourceCount={content.sources.length} goContent={() => setTab("content")} onImportForeign={importForeign} reg={content.reg} />}
          {tab === "build" && (
            <>
              {!board && <div className="namebar"><TextInput placeholder="Character name" value={character.name} onCommit={(v) => set((c) => ({ ...c, name: v }))} /></div>}
              {board ? <BuildBoard r={r} ch={character} set={set} /> : <BuildTab r={r} ch={character} set={set} onDetail={setDetail} />}
            </>
          )}
          {tab === "magic" && <MagicTab r={r} ch={character} set={set} onDetail={setDetail} />}
          {tab === "equipment" && <EquipmentTab r={r} ch={character} set={set} onDetail={setDetail} />}
          {tab === "manage" && <ManageTab r={r} ch={character} set={set} onDetail={setDetail} focusNotes={notesFocus} />}
          {tab === "play" && <PlayTab r={r} ch={character} set={set} />}
          {tab === "sheet" && <SheetTab r={r} ch={character} set={set} />}
          {tab === "content" && <ContentTab content={content} onDetail={setDetail} r={r} set={set} />}
          </Suspense>
        </div>
        {showDetail && <DetailPanel el={detail} />}
      </main>
      <DicePanel />
      <ConfirmHost />
      {bugOpen && <BugReport r={r} sources={content.sources} onClose={() => setBugOpen(false)} />}
      {introOver && !reimportLater && outdated.length > 0 && !(tutorialOpen && !tutorialMin) && (
        <div className="modal-back" role="dialog" aria-label="Import 5e.tools again" onClick={() => setReimportLater(true)}>
          <div className="modal-page themed reimport" onClick={(e) => e.stopPropagation()}>
            <h2>Import your 5e.tools content again</h2>
            <p>This version of Soul Forge reads more from 5e.tools than your import has: magic item variants (+1 weapons, Flame Tongue and the rest), lore, beasts for Wild Shape, and the mechanics data Plutonium uses (limited uses, attacks, saving throws).</p>
            <p>Import <b>{outdated.map((s) => s.name).join(", ")}</b> again on the Content tab to get them. Your characters stay as they are.</p>
            <div className="row">
              <button className="primary" onClick={() => { setReimportLater(true); setTab("content"); }}>Go to Content</button>
              <button onClick={() => setReimportLater(true)}>Later</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </UiProvider>
  );
}
