import { useState } from "react";
import { openExternal } from "../store";

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

const AURORA_LINK = "https://raw.githubusercontent.com/AuroraLegacy/elements/master/AuroraLegacy.index";

interface Step {
  title: string;
  body: React.ReactNode;
  go?: { label: string; tab: string };
}

const STEPS: Step[] = [
  {
    title: "Welcome to Soul Forge",
    body: (
      <>
        <p>Soul Forge builds D&D 5e characters from rules content that you add yourself, so it starts with none. This quick tour shows the four things most people do first. It takes a minute and you can skip it.</p>
        <p className="muted">You can reopen it any time from Menu, Show the tutorial.</p>
      </>
    ),
  },
  {
    title: "1. Add rules content from Aurora",
    go: { label: "Open the Content tab", tab: "content" },
    body: (
      <>
        <p>On the <b>Content</b> tab, paste the address of an Aurora index file and press Add link. Species, classes, spells and items download and then update by themselves.</p>
        <p>A good place to start is the AuroraLegacy elements:</p>
        <p><code className="copy-link">{AURORA_LINK}</code></p>
        <p><button onClick={() => void navigator.clipboard?.writeText(AURORA_LINK)}>Copy the link</button></p>
      </>
    ),
  },
  {
    title: "2. Import from 5e.tools or Plutonium",
    go: { label: "Open the Content tab", tab: "content" },
    body: (
      <>
        <p>Soul Forge also reads the data format used by 5e.tools and the Plutonium module for Foundry. On the Content tab you can:</p>
        <ul>
          <li>pick the <b>data folder</b> (or a ZIP of it) from a copy you are allowed to use, or</li>
          <li>paste <b>5e.tools links</b> to single spells, items, feats, species or classes and import only those.</li>
        </ul>
        <p className="muted">5e.tools itself blocks apps from fetching its pages, so use a folder or an address that serves the data.</p>
      </>
    ),
  },
  {
    title: "3. Bring in characters from Foundry or Roll20",
    go: { label: "Go to Home", tab: "start" },
    body: (
      <>
        <p>On <b>Home</b>, press <b>Import Foundry / Roll20 / Plutonium</b> and choose the character file (the JSON you exported). Soul Forge matches names against your loaded content and lists anything it could not place.</p>
        <p>Characters you made here can be exported back for Foundry or Roll20 from the Sheet tab.</p>
      </>
    ),
  },
  {
    title: "4. Print or fill a character sheet",
    go: { label: "Open the Sheet tab", tab: "sheet" },
    body: (
      <>
        <p>On the <b>Sheet</b> tab, <b>Export PDF</b> makes a Soul Forge sheet right away. To fill an official sheet instead:</p>
        <ul>
          <li>The <b>official Wizards of the Coast sheets</b> work best, with every field filled. Press <b>Get</b> next to Add sheet PDF in the desktop app.</li>
          <li>Other fillable sheets are matched field by field. The DLDM sheets are supported too.</li>
        </ul>
      </>
    ),
  },
];

/** A short walk through adding content, importing characters and getting a sheet. Skippable, and dismissible for good. */
export function Tutorial({ onClose, onGo }: { onClose: () => void; onGo: (tab: string) => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const finish = () => {
    neverShowTutorial();
    onClose();
  };
  return (
    <div className="modal-back" role="dialog" aria-label="Tutorial" onClick={onClose}>
      <div className="modal-page themed tutorial" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" aria-label="Close the tutorial" onClick={onClose}>×</button>
        <small className="muted">Step {i + 1} of {STEPS.length}</small>
        <h2>{step.title}</h2>
        {step.body}
        {step.go && <p><button onClick={() => { onGo(step.go!.tab); onClose(); }}>{step.go.label}</button></p>}
        <div className="tutorial-dots" aria-hidden="true">{STEPS.map((_, k) => <span key={k} className={k === i ? "on" : ""} />)}</div>
        <div className="row tutorial-nav">
          {i > 0 && <button onClick={() => setI(i - 1)}>Back</button>}
          {!last && <button className="primary" onClick={() => setI(i + 1)}>Next</button>}
          {last && <button className="primary" onClick={finish}>Finish</button>}
          <button onClick={onClose}>Skip for now</button>
          <button className="ghost" onClick={finish} title="The tutorial will not open at start-up again. It stays under Menu.">Never show this again</button>
        </div>
      </div>
    </div>
  );
}

export { AURORA_LINK, openExternal };
