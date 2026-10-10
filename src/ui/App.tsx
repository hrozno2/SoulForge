import { useEffect, useMemo, useState } from "react";
import { Registry } from "../engine/registry";
import { computeSheet } from "../engine/compute";
import type { Character, Pack } from "../engine/types";
import { starterPack } from "../content/starter";
import { deletePack, loadCharacter, loadPacks, savePack, saveCharacter } from "../store";
import { BuildTab } from "./BuildTab";
import { SheetTab } from "./SheetTab";
import { ContentTab } from "./ContentTab";
import { UpdateBanner } from "./UpdateBanner";
import { useUpdater } from "../updater";

type Tab = "build" | "sheet" | "content";

export function App() {
  const [tab, setTab] = useState<Tab>("build");
  const [character, setCharacter] = useState<Character>(loadCharacter);
  const [userPacks, setUserPacks] = useState<Pack[]>([]);
  const updater = useUpdater();

  useEffect(() => {
    loadPacks().then(setUserPacks);
  }, []);
  useEffect(() => saveCharacter(character), [character]);

  const registry = useMemo(() => {
    const r = new Registry();
    r.addPack(starterPack);
    userPacks.forEach((p) => r.addPack(p));
    return r;
  }, [userPacks]);

  const sheet = useMemo(() => computeSheet(character, registry), [character, registry]);

  const addPack = async (pack: Pack) => {
    await savePack(pack);
    setUserPacks((prev) => [...prev.filter((p) => p.id !== pack.id), pack]);
  };
  const removePack = async (id: string) => {
    await deletePack(id);
    setUserPacks((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="app">
      <header className="topbar">
        <strong className="brand">CharForge</strong>
        <nav>
          {(["build", "sheet", "content"] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? "tab active" : "tab"} onClick={() => setTab(t)}>
              {t === "build" ? "Build" : t === "sheet" ? "Sheet" : "Content"}
              {t === "build" && sheet.pending.length > 0 && <span className="badge">{sheet.pending.length}</span>}
            </button>
          ))}
        </nav>
        <button className="tab noprint" style={{ marginLeft: "auto" }} onClick={() => updater.check(true)}>
          Check for updates
        </button>
      </header>
      <UpdateBanner found={updater.found} status={updater.status} busy={updater.busy} install={updater.install} />
      <main>
        {tab === "build" && (
          <BuildTab character={character} setCharacter={setCharacter} registry={registry} sheet={sheet} />
        )}
        {tab === "sheet" && <SheetTab character={character} sheet={sheet} />}
        {tab === "content" && (
          <ContentTab
            registry={registry}
            userPacks={userPacks}
            addPack={addPack}
            removePack={removePack}
            character={character}
            setCharacter={setCharacter}
          />
        )}
      </main>
    </div>
  );
}
