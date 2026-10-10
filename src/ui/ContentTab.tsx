import { useMemo, useState } from "react";
import type { Registry } from "../engine/registry";
import { validatePack } from "../engine/registry";
import type { Character, ElementType, Pack, Rule } from "../engine/types";
import { convertAuroraXml, type ImportReport } from "../engine/aurora";
import { DEFAULT_GROUP, groupAuroraFiles, readAuroraUpload, type AuroraGroup } from "../engine/auroraFiles";
import { importCharacterFile } from "../engine/importers";
import { openExternal } from "../store";

interface Props {
  registry: Registry;
  userPacks: Pack[];
  addPack: (p: Pack) => Promise<void>;
  removePack: (id: string) => Promise<void>;
  character: Character;
  setCharacter: (fn: (c: Character) => Character) => void;
}

const AURORA_SITE = "https://aurorabuilder.com";
const AURORA_REPO = "https://github.com/AuroraLegacy/elements";

interface ModRow {
  stat: string;
  op: "add" | "set" | "max" | "min";
  value: string;
}

export function ContentTab({ registry, userPacks, addPack, removePack, character, setCharacter }: Props) {
  const [groups, setGroups] = useState<AuroraGroup[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [report, setReport] = useState<ImportReport | null>(null);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  const [name, setName] = useState("");
  const [type, setType] = useState<ElementType>("feat");
  const [desc, setDesc] = useState("");
  const [mods, setMods] = useState<ModRow[]>([{ stat: "ac", op: "add", value: "1" }]);

  const onAuroraFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setMessage("Reading files...");
    const found = await readAuroraUpload([...files]);
    const g = groupAuroraFiles(found);
    setGroups(g);
    setSelected(new Set(g.some((x) => x.key === DEFAULT_GROUP) ? [DEFAULT_GROUP] : g.map((x) => x.key)));
    setMessage(found.length ? `Found ${found.length} XML files in ${g.length} groups.` : "No .xml files found. Use the ZIP from the repo's Code > Download ZIP.");
  };

  const runImport = async () => {
    const files = groups.filter((g) => selected.has(g.key)).flatMap((g) => g.files);
    if (files.length === 0) return setMessage("Select at least one group.");
    const { pack, report } = convertAuroraXml(files, undefined, "Aurora import");
    const errors = validatePack(pack);
    if (errors.length) return setMessage(`Import produced invalid data: ${errors.slice(0, 3).join("; ")}`);
    // Merge with any earlier Aurora import so groups can be added one at a time.
    const prev = userPacks.find((p) => p.id === pack.id);
    const merged = new Map((prev?.elements ?? []).map((e) => [e.id, e]));
    pack.elements.forEach((e) => merged.set(e.id, e));
    await addPack({ ...pack, elements: [...merged.values()] });
    setReport(report);
    setMessage(`Imported ${report.elements} elements.`);
  };

  const onPackFile = async (files: FileList | null) => {
    if (!files?.[0]) return;
    try {
      const data = JSON.parse(await files[0].text());
      const errors = validatePack(data);
      if (errors.length) return setMessage(`Pack rejected: ${errors.slice(0, 4).join("; ")}`);
      await addPack(data as Pack);
      setMessage(`Loaded pack "${(data as Pack).name}".`);
    } catch (e) {
      setMessage(`Could not read pack: ${(e as Error).message}`);
    }
  };

  const onCharFile = async (files: FileList | null) => {
    if (!files?.[0]) return;
    try {
      const data = JSON.parse(await files[0].text());
      // A CharForge export loads as is.
      if (data && data.abilityBase && data.extras) {
        setCharacter(() => data as Character);
        return setMessage("Character loaded.");
      }
      const res = importCharacterFile(data, registry);
      if ("error" in res) return setMessage(res.error);
      if (res.elements.length) {
        const id = `imported-${(res.character.name || "character").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        await addPack({ id, name: `Imported: ${res.character.name || "character"}`, elements: res.elements });
      }
      setCharacter(() => res.character);
      const r = res.report;
      setMessage(
        `${r.format}: matched ${r.matched.length} from your content, kept ${r.created.length} as plain entries` +
          (r.warnings.length ? `. Notes: ${r.warnings.slice(0, 3).join("; ")}` : "."),
      );
    } catch (e) {
      setMessage(`Could not read character: ${(e as Error).message}`);
    }
  };

  const saveCustom = async () => {
    if (!name.trim()) return setMessage("Give the element a name.");
    const rules: Rule[] = mods
      .filter((m) => m.stat.trim() && m.value.trim())
      .map((m) => ({
        kind: "stat",
        stat: m.stat.trim(),
        op: m.op,
        value: /^-?\d+(\.\d+)?$/.test(m.value.trim()) ? Number(m.value) : m.value.trim(),
      }));
    const id = `custom-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const pack: Pack = {
      id: "custom-homebrew",
      name: "My homebrew",
      elements: [
        ...(userPacks.find((p) => p.id === "custom-homebrew")?.elements.filter((e) => e.id !== id) ?? []),
        { id, type, name: name.trim(), description: desc.trim() || undefined, rules },
      ],
    };
    const errors = validatePack(pack);
    if (errors.length) return setMessage(`Fix this first: ${errors[0]}`);
    await addPack(pack);
    setMessage(`Saved "${name.trim()}". Add it from the Build tab.`);
    setName("");
    setDesc("");
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return registry.all().filter((e) => e.name.toLowerCase().includes(q)).slice(0, 50);
  }, [query, registry]);

  return (
    <div className="grid two">
      <section className="card">
        <h2>Content sources</h2>
        <ul className="added">
          <li>Starter sample <small>{registry.packs[0]?.elements.length} elements, built in</small></li>
          {userPacks.map((p) => (
            <li key={p.id}>
              {p.name} <small>{p.elements.length} elements</small>
              <button onClick={() => removePack(p.id)}>remove</button>
            </li>
          ))}
        </ul>

        <h3>Aurora content</h3>
        <p className="muted">
          Aurora content is not bundled. Download it yourself, then import the file here.
        </p>
        <div className="row">
          <button onClick={() => openExternal(AURORA_SITE)}>Open aurorabuilder.com</button>
          <button onClick={() => openExternal(AURORA_REPO)}>Open elements repository</button>
        </div>
        <p className="muted">On GitHub use Code, then Download ZIP. Loose .xml files also work.</p>
        <input type="file" accept=".zip,.xml" multiple onChange={(e) => onAuroraFiles(e.target.files)} />
        {groups.length > 0 && (
          <div className="subcard">
            {groups.map((g) => (
              <label key={g.key} className="check">
                <input
                  type="checkbox"
                  checked={selected.has(g.key)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(g.key);
                    else next.delete(g.key);
                    setSelected(next);
                  }}
                />
                {g.key} <small>{g.files.length} files</small>
              </label>
            ))}
            <button className="primary" onClick={runImport}>Import selected</button>
          </div>
        )}
        {report && (
          <p className="muted">
            {report.elements} elements, {report.rulesConverted} rules converted, {report.rulesSkipped} rules skipped,{" "}
            {report.selectionsSkipped} selection rules left for manual choices
            {report.warnings.length > 0 && `, ${report.warnings.length} warnings`}.
          </p>
        )}

        <h3>Packs and characters</h3>
        <label className="field"><span>Load a CharForge pack (.json)</span><input type="file" accept=".json" onChange={(e) => onPackFile(e.target.files)} /></label>
        <label className="field"><span>Import a character (Foundry, Roll20 or CharForge .json)</span><input type="file" accept=".json" onChange={(e) => onCharFile(e.target.files)} /></label>
        {message && <p className="notice">{message}</p>}
        <p className="muted">Current character: {character.name || "unnamed"}.</p>
      </section>

      <section className="card">
        <h2>Create a custom element</h2>
        <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field">
          <span>Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as ElementType)}>
            {["feat", "item", "feature", "custom", "species", "background"].map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="field"><span>Description</span><textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
        <h3>Modifiers</h3>
        <p className="muted">Stats: str, ac, hp, speed, initiative, skill.stealth, save.dex, or any name you invent. Values can be formulas such as level * 2 or 10 + dexMod.</p>
        {mods.map((m, i) => (
          <div className="row" key={i}>
            <input placeholder="stat" value={m.stat} onChange={(e) => setMods(mods.map((x, j) => (j === i ? { ...x, stat: e.target.value } : x)))} />
            <select value={m.op} onChange={(e) => setMods(mods.map((x, j) => (j === i ? { ...x, op: e.target.value as ModRow["op"] } : x)))}>
              <option value="add">add</option><option value="set">set</option><option value="max">max</option><option value="min">min</option>
            </select>
            <input placeholder="value" value={m.value} onChange={(e) => setMods(mods.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
            <button onClick={() => setMods(mods.filter((_, j) => j !== i))}>x</button>
          </div>
        ))}
        <div className="row">
          <button onClick={() => setMods([...mods, { stat: "", op: "add", value: "" }])}>Add modifier</button>
          <button className="primary" onClick={saveCustom}>Save element</button>
        </div>

        <h2>Compendium</h2>
        <input placeholder="Search everything loaded..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <ul className="results tall">
          {results.map((e) => (
            <li key={e.id}>
              <b>{e.name}</b> <small>{e.type}</small>
              {e.description && <p className="muted">{e.description}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
