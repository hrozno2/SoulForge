import { useEffect, useRef, useState } from "react";
import { listTemplates } from "../aurora/storage";
import { OFFICIAL_DOWNLOADS } from "../sheets/links";
import { addSheetFiles, downloadOfficialSheet } from "../sheets/templates";
import { isDesktop } from "../net";
import { pickFiles } from "../store";
import type { ContentState } from "./useContent";

const KEY = "charforge.tutorial";

/** Whether to show the tutorial at start-up. Everyone sees it, new and updated installs alike, until they say never. */
export function tutorialWanted(): boolean {
  try {
    return localStorage.getItem(KEY) !== "never";
  } catch {
    return true;
  }
}

export function neverShowTutorial(): void {
  try {
    localStorage.setItem(KEY, "never");
  } catch {
    /* not remembered */
  }
}

export const AURORA_LINK = "https://raw.githubusercontent.com/AuroraLegacy/elements/master/AuroraLegacy.index";

export const TUTORIAL_STEPS = 6;

export interface TutorialProps {
  step: number;
  setStep: (n: number) => void;
  minimized: boolean;
  setMinimized: (v: boolean) => void;
  onClose: () => void;
  onGo: (tab: string) => void;
  content: ContentState;
  /** Imports a Foundry or Roll20 character file and opens it. Returns a note to show. */
  onImportForeign: (file: File) => Promise<string>;
}

/** A short walk through the setup: rules content, other imports, characters and a sheet. Each step can do its job right here. */
export function Tutorial(p: TutorialProps) {
  const { step: i, setStep, content } = p;
  const last = i === TUTORIAL_STEPS - 1;
  const [sheets, setSheets] = useState(0);
  const [sheetMsg, setSheetMsg] = useState("");
  const [sheetBusy, setSheetBusy] = useState(false);
  const [charMsg, setCharMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const refreshSheets = () => listTemplates().then((l) => setSheets(l.length));
  useEffect(() => { void refreshSheets(); }, []);

  const finish = () => {
    neverShowTutorial();
    p.onClose();
  };
  /** Goes to a tab and tucks the tutorial away so it can be resumed. */
  const goAndMinimize = (tab: string) => {
    p.onGo(tab);
    p.setMinimized(true);
  };

  const addAurora = () => void content.addLink(AURORA_LINK);
  const pct = content.progress && content.progress.total ? Math.round((content.progress.done / content.progress.total) * 100) : 0;

  const getSheet = async (o: (typeof OFFICIAL_DOWNLOADS)[number]) => {
    setSheetBusy(true);
    try {
      if (!isDesktop()) throw new Error("Downloading works in the desktop app. In a browser, open the link from the Sheet tab and add the file.");
      setSheetMsg(`Downloading ${o.label}...`);
      setSheetMsg((await downloadOfficialSheet(o)).join(". "));
    } catch (e) {
      setSheetMsg(`Could not download it: ${(e as Error).message}`);
    } finally {
      setSheetBusy(false);
      void refreshSheets();
    }
  };
  const addOwnSheet = async (picked: FileList | File[] | null) => {
    const files = picked ? Array.from(picked) : [];
    if (!files.length) return;
    setSheetBusy(true);
    setSheetMsg((await addSheetFiles(files)).join(". "));
    setSheetBusy(false);
    void refreshSheets();
  };
  const chooseSheet = async () => {
    const f = await pickFiles(["pdf"], true);
    if (f === null) pdfRef.current?.click();
    else void addOwnSheet(f);
  };
  const importCharacter = async (file: File | undefined) => {
    if (!file) return;
    setCharMsg("Reading...");
    const note = await p.onImportForeign(file);
    setCharMsg(note || "Imported. It is open on the Build tab.");
    p.setMinimized(true);
  };
  const chooseCharacter = async () => {
    const f = await pickFiles(["json"]);
    if (f === null) fileRef.current?.click();
    else void importCharacter(f[0]);
  };

  if (p.minimized) {
    return (
      <div className="tutorial-pill" role="region" aria-label="Tutorial paused">
        <span>Tutorial, step {i + 1} of {TUTORIAL_STEPS}</span>
        <button className="primary" onClick={() => p.setMinimized(false)}>Resume</button>
        <button className="ghost" aria-label="Close the tutorial" onClick={p.onClose}>×</button>
      </div>
    );
  }

  const aurora = content.sources.length > 0;
  const steps: { title: string; body: React.ReactNode }[] = [
    {
      title: "Welcome to Soul Forge",
      body: (
        <>
          <p>Soul Forge builds D&D 5e characters from rules content that you add yourself, so it starts with none. This setup gets you ready in a few clicks: it adds rules content and a character sheet, right here. You can skip any step.</p>
          <p className="muted">You can reopen this from Menu, Show the tutorial.</p>
        </>
      ),
    },
    {
      title: "1. Add rules content from Aurora",
      body: (
        <>
          <p>Aurora content gives you species, classes, backgrounds, spells and items, and keeps itself up to date. Press the button to add the AuroraLegacy elements.</p>
          <p><code className="copy-link">{AURORA_LINK}</code></p>
          <div className="row">
            <button className="primary" disabled={content.busy || aurora} onClick={addAurora}>{aurora ? "Added" : content.busy ? "Downloading..." : "Download rules content"}</button>
            {aurora && <span className="done-mark">✓ {content.sources.length} source{content.sources.length === 1 ? "" : "s"} ready</span>}
          </div>
          {content.busy && (
            <div className="progress"><div style={{ width: `${pct}%` }} /><span>{content.status || "Working..."} {content.progress ? `${content.progress.done}/${content.progress.total}` : ""}</span></div>
          )}
          {!content.busy && content.status && !aurora && <p className="notice">{content.status}</p>}
          <p className="muted">It is a large download and takes a minute or two. Other Aurora links can be added later on the Content tab.</p>
        </>
      ),
    },
    {
      title: "2. Import from 5e.tools or Plutonium",
      body: (
        <>
          <p>Soul Forge also reads the data format used by 5e.tools and the Plutonium module for Foundry. On the Content tab you can:</p>
          <ul>
            <li>pick the <b>data folder</b> (or a ZIP of it) from a copy you are allowed to use, or</li>
            <li>paste <b>5e.tools links</b> to single spells, items, feats, species or classes and import only those.</li>
          </ul>
          <p className="muted">5e.tools blocks apps from fetching its pages, so use a folder or an address that serves the data.</p>
          <p><button onClick={() => goAndMinimize("content")}>Open the importer</button> <span className="muted">The tutorial waits for you at the bottom of the window.</span></p>
        </>
      ),
    },
    {
      title: "3. Bring in characters from Foundry or Roll20",
      body: (
        <>
          <p>Choose a character file you exported from Foundry VTT (an actor JSON, including Plutonium actors) or Roll20. Soul Forge matches names against your loaded content and tells you what it could not place.</p>
          <div className="row">
            <button disabled={!content.ready || content.sources.length === 0} onClick={chooseCharacter}>Choose a character file...</button>
            <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => { void importCharacter(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
          {content.sources.length === 0 && <p className="muted">Add rules content in step 1 first, so there is something to match against.</p>}
          {charMsg && <p className="notice">{charMsg}</p>}
          <p className="muted">Characters made here export back for Foundry or Roll20 from the Sheet tab.</p>
        </>
      ),
    },
    {
      title: "4. Get a character sheet",
      body: (
        <>
          <p>These sheets are filled completely: the <b>fillable 2024 sheet by DLtheDM</b> (stays editable), the <b>official Wizards of the Coast sheets</b> for 2024 and 2014, and companion sheets. Soul Forge downloads them from their makers and keeps a copy on this computer.</p>
          <ul className="sheet-downloads">
            {OFFICIAL_DOWNLOADS.map((o) => (
              <li key={o.id}>
                <div><b>{o.label}</b><small className="muted">{o.by}. {o.note}</small></div>
                <button disabled={sheetBusy} onClick={() => void getSheet(o)}>Get</button>
              </li>
            ))}
            <li>
              <div><b>Your own PDF</b><small className="muted">Any fillable sheet works.</small></div>
              <button disabled={sheetBusy} onClick={() => void chooseSheet()}>Add PDF...</button>
            </li>
          </ul>
          <input ref={pdfRef} type="file" accept=".pdf" multiple hidden onChange={(e) => { void addOwnSheet(e.target.files); e.target.value = ""; }} />
          {sheetMsg && <p className="notice">{sheetMsg}</p>}
          <p>{sheets > 0 ? <span className="done-mark">✓ {sheets} sheet{sheets === 1 ? "" : "s"} ready to fill</span> : <span className="muted">No sheet yet. The Soul Forge style PDF always works without one.</span>}</p>
          <p className="muted">Fillable sheets stay editable. A print version is written onto the page and cannot be edited afterwards. Fill a sheet from Sheet, Export. <b>Manage sheets</b> there shows all your sheets with a preview, lets you rename or remove them, and has these downloads again.</p>
        </>
      ),
    },
    {
      title: "5. Finding your way",
      body: (
        <>
          <ul className="tutorial-tour">
            <li><b>Build</b>: species, class and background are picked from cards. Use <b>Learn more</b> to read the full rules. Options you cannot take yet stay visible, grayed out, with what is missing written on them; the <b>Locked</b> switch hides them.</li>
            <li><b>Multiclassing</b>: <b>Level up</b> lets you add a level to a class you have or start a new one. Classes whose requirements you do not meet show the missing ability scores.</li>
            <li><b>Play</b>: click any modifier to roll. The dice panel shows the dice and the sum written out, for example 16 + 2 = 18. Drag weapons, spells and features into <b>Favorites</b>, or click their star.</li>
            <li><b>Sheet</b>: print the Soul Forge sheet or fill an official one, in your language if you like.</li>
            <li><b>Menu, Settings</b>: theme, interface size, which books show in lists, and backups.</li>
          </ul>
          {last && (
            <div className="tutorial-summary">
              <b>You are set up:</b>
              <ul>
                <li>{aurora ? "✓" : "○"} Rules content {aurora ? "added" : "not added yet (Content tab)"}</li>
                <li>{sheets > 0 ? "✓" : "○"} Character sheet {sheets > 0 ? "added" : "not added yet (optional)"}</li>
              </ul>
            </div>
          )}
        </>
      ),
    },
  ];
  const step = steps[i];

  return (
    <div className="modal-back" role="dialog" aria-label="Tutorial" onClick={() => p.setMinimized(true)}>
      <div className="modal-page themed tutorial" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" aria-label="Minimize the tutorial" title="Minimize" onClick={() => p.setMinimized(true)}>×</button>
        <small className="muted">Step {i + 1} of {TUTORIAL_STEPS}</small>
        <h2>{step.title}</h2>
        {step.body}
        <div className="tutorial-dots" aria-hidden="true">{steps.map((_, k) => <span key={k} className={k === i ? "on" : ""} />)}</div>
        <div className="row tutorial-nav">
          {i > 0 && <button onClick={() => setStep(i - 1)}>Back</button>}
          {!last && <button className="primary" onClick={() => setStep(i + 1)}>{i === 0 ? "Start" : "Next"}</button>}
          {last && <button className="primary" onClick={finish}>Finish</button>}
          <button onClick={p.onClose}>Skip for now</button>
          <button className="ghost" onClick={finish} title="The tutorial will not open at start-up again. It stays under Menu.">Never show this again</button>
        </div>
      </div>
    </div>
  );
}
