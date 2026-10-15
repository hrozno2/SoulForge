import { useMemo, useState } from "react";
import { askConfirm } from "./Confirm";
import { ABILITY_NAMES, DAMAGE_TYPES, EFFECTS, HB_KINDS, SCHOOLS, SKILL_NAMES, WEAPON_PROPERTIES, entryXml, newEntry, toXml, validate, type HbEffect, type HbEntry } from "../aurora/homebrew";
import { idbFileCache } from "../aurora/storage";
import type { IndexNode } from "../aurora/sources";
import type { ContentState } from "./useContent";

const KEY = "charforge.homebrew.v1";
const ROOT = "local://builder";
const SOURCE = "Homebrew (builder)";

function load(): HbEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? "field wide" : "field"}>
      <span>{label}</span>
      {children}
    </label>
  );
}

/** Forms for custom items, spells, feats and features. They save as ordinary content, so the rest of the app treats them like any book. */
export function HomebrewBuilder({ content, classNames }: { content: ContentState; classNames: string[] }) {
  const [entries, setEntries] = useState<HbEntry[]>(load);
  const [editing, setEditing] = useState<HbEntry | null>(null);
  const [msg, setMsg] = useState("");

  const persist = async (next: HbEntry[]) => {
    setEntries(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage can be unavailable */
    }
    const xml = toXml(next, SOURCE);
    await idbFileCache.put(`${ROOT}/content.xml`, xml, ROOT);
    const node: IndexNode = { url: ROOT, name: SOURCE, description: "Made with the homebrew builder", version: "local", files: [`${ROOT}/content.xml`], children: [] };
    await content.addLocal({ url: ROOT, name: SOURCE, kind: "local", tree: node, disabled: [], versions: {}, lastChecked: Date.now(), fileCount: 1 });
  };

  const problems = editing ? validate(editing) : [];
  const save = async () => {
    if (!editing || problems.length) return;
    const exists = entries.some((e) => e.id === editing.id);
    await persist(exists ? entries.map((e) => (e.id === editing.id ? editing : e)) : [...entries, editing]);
    setMsg(`Saved ${editing.name}. It is in the lists now.`);
    setEditing(null);
  };
  const remove = async (e: HbEntry) => {
    if (!(await askConfirm({ title: `Delete ${e.name || "this entry"}?`, message: "It is removed from your homebrew content. Characters that use it will show it as missing." }))) return;
    await persist(entries.filter((x) => x.id !== e.id));
    setMsg(`Deleted ${e.name}.`);
  };
  const duplicate = (e: HbEntry) => setEditing({ ...e, id: newEntry(e.kind).id, name: `${e.name} (copy)`, data: { ...e.data }, effects: e.effects.map((f) => ({ ...f })) });

  const set = (patch: Partial<HbEntry>) => setEditing((e) => (e ? { ...e, ...patch } : e));
  const setData = (k: string, v: string | boolean) => setEditing((e) => (e ? { ...e, data: { ...e.data, [k]: v } } : e));
  const d = editing?.data ?? {};
  const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
  const on = (k: string) => d[k] === true;
  const xml = useMemo(() => (editing ? entryXml(editing, SOURCE) : ""), [editing]);
  const props = new Set(str("properties").split(",").map((p) => p.trim()).filter(Boolean));

  return (
    <section className="card homebrew">
      <h2>Homebrew builder</h2>
      <p className="muted">Make your own weapons, armor, items, spells, feats and features without writing XML. Entries are saved as content and appear in the same lists as the books. Add a feat or feature to a character on Manage → Manual additions.</p>

      {!editing && (
        <>
          <div className="row">
            {HB_KINDS.map((k) => <button key={k.kind} title={k.hint} onClick={() => { setMsg(""); setEditing(newEntry(k.kind)); }}>New {k.label.toLowerCase()}</button>)}
          </div>
          {msg && <p className="notice" role="status">{msg}</p>}
          {entries.length === 0 ? <p className="muted">Nothing here yet.</p> : (
            <ul className="added">
              {entries.map((e) => (
                <li key={e.id}>
                  <span><b>{e.name || "(unnamed)"}</b> <small className="muted">{HB_KINDS.find((k) => k.kind === e.kind)?.label}</small></span>
                  <span>
                    <button onClick={() => setEditing(e)}>Edit</button> <button onClick={() => duplicate(e)}>Duplicate</button> <button onClick={() => remove(e)}>Delete</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {editing && (
        <div className="hb-form">
          <h3>{entries.some((e) => e.id === editing.id) ? "Edit" : "New"} {HB_KINDS.find((k) => k.kind === editing.kind)?.label.toLowerCase()}</h3>
          <div className="row">
            <Field label="Name"><input value={editing.name} onChange={(e) => set({ name: e.target.value })} autoFocus /></Field>
          </div>

          {editing.kind === "weapon" && (
            <div className="row">
              <Field label="Category"><select value={str("category")} onChange={(e) => setData("category", e.target.value)}><option value="simple">Simple</option><option value="martial">Martial</option></select></Field>
              <Field label="Melee or ranged"><select value={str("range")} onChange={(e) => setData("range", e.target.value)}><option value="melee">Melee</option><option value="ranged">Ranged</option></select></Field>
              <Field label="Damage"><input value={str("damage")} onChange={(e) => setData("damage", e.target.value)} style={{ width: 90 }} /></Field>
              <Field label="Damage type"><select value={str("damageType")} onChange={(e) => setData("damageType", e.target.value)}>{DAMAGE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
              <Field label="Versatile damage"><input value={str("versatile")} placeholder="1d10" onChange={(e) => setData("versatile", e.target.value)} style={{ width: 90 }} /></Field>
              <Field label="Magic bonus"><input type="number" value={str("magic")} onChange={(e) => setData("magic", e.target.value)} style={{ width: 70 }} /></Field>
              <div className="field wide"><span>Properties</span>
                <span className="chips">{WEAPON_PROPERTIES.map((p) => <label key={p} className="check"><input type="checkbox" checked={props.has(p)} onChange={(e) => { const n = new Set(props); if (e.target.checked) n.add(p); else n.delete(p); setData("properties", [...n].join(",")); }} />{p}</label>)}</span>
              </div>
            </div>
          )}

          {editing.kind === "armor" && (
            <div className="row">
              <Field label="Type"><select value={str("armor")} onChange={(e) => setData("armor", e.target.value)}><option value="light">Light</option><option value="medium">Medium</option><option value="heavy">Heavy</option><option value="shield">Shield</option></select></Field>
              <Field label={str("armor") === "shield" ? "Armor class bonus" : "Base armor class"}><input type="number" value={str("ac")} onChange={(e) => setData("ac", e.target.value)} style={{ width: 80 }} /></Field>
              <Field label="Magic bonus"><input type="number" value={str("magic")} onChange={(e) => setData("magic", e.target.value)} style={{ width: 70 }} /></Field>
              <Field label="Strength needed"><input value={str("strength")} onChange={(e) => setData("strength", e.target.value)} style={{ width: 70 }} /></Field>
              <label className="check"><input type="checkbox" checked={on("stealth")} onChange={(e) => setData("stealth", e.target.checked)} />Disadvantage on Stealth</label>
            </div>
          )}

          {(editing.kind === "item" || editing.kind === "magic") && (
            <div className="row">
              {editing.kind === "item" && <Field label="Category"><input value={str("category")} onChange={(e) => setData("category", e.target.value)} /></Field>}
              {editing.kind === "magic" && <Field label="Rarity"><select value={str("rarity")} onChange={(e) => setData("rarity", e.target.value)}>{["Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact"].map((r) => <option key={r}>{r}</option>)}</select></Field>}
              {editing.kind === "magic" && <label className="check"><input type="checkbox" checked={on("attunement")} onChange={(e) => setData("attunement", e.target.checked)} />Requires attunement</label>}
              {editing.kind === "magic" && <Field label="Worn in slot"><input value={str("slot")} placeholder="ring, head, ..." onChange={(e) => setData("slot", e.target.value)} /></Field>}
            </div>
          )}

          {(editing.kind === "weapon" || editing.kind === "armor" || editing.kind === "item" || editing.kind === "magic") && (
            <div className="row">
              <Field label="Weight (lb)"><input type="number" value={str("weight")} onChange={(e) => setData("weight", e.target.value)} style={{ width: 80 }} /></Field>
              {editing.kind !== "magic" && <Field label="Cost (gp)"><input type="number" value={str("cost")} onChange={(e) => setData("cost", e.target.value)} style={{ width: 80 }} /></Field>}
            </div>
          )}

          {editing.kind === "spell" && (
            <>
              <div className="row">
                <Field label="Level (0 is a cantrip)"><input type="number" min={0} max={9} value={str("level")} onChange={(e) => setData("level", e.target.value)} style={{ width: 70 }} /></Field>
                <Field label="School"><select value={str("school")} onChange={(e) => setData("school", e.target.value)}>{SCHOOLS.map((s) => <option key={s}>{s}</option>)}</select></Field>
                <Field label="Casting time"><input value={str("time")} onChange={(e) => setData("time", e.target.value)} /></Field>
                <Field label="Range"><input value={str("range")} onChange={(e) => setData("range", e.target.value)} /></Field>
                <Field label="Duration"><input value={str("duration")} onChange={(e) => setData("duration", e.target.value)} /></Field>
              </div>
              <div className="row">
                <label className="check"><input type="checkbox" checked={on("v")} onChange={(e) => setData("v", e.target.checked)} />Verbal</label>
                <label className="check"><input type="checkbox" checked={on("s")} onChange={(e) => setData("s", e.target.checked)} />Somatic</label>
                <label className="check"><input type="checkbox" checked={on("m")} onChange={(e) => setData("m", e.target.checked)} />Material</label>
                {on("m") && <Field label="Material"><input value={str("material")} onChange={(e) => setData("material", e.target.value)} /></Field>}
                <label className="check"><input type="checkbox" checked={on("concentration")} onChange={(e) => setData("concentration", e.target.checked)} />Concentration</label>
                <label className="check"><input type="checkbox" checked={on("ritual")} onChange={(e) => setData("ritual", e.target.checked)} />Ritual</label>
              </div>
              <div className="row">
                <Field label="On the spell lists of" wide><input list="hb-classes" value={str("classes")} placeholder="Wizard, Cleric" onChange={(e) => setData("classes", e.target.value)} /></Field>
                <datalist id="hb-classes">{classNames.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
            </>
          )}

          {editing.kind === "feat" && (
            <div className="row">
              <Field label="Minimum level"><input type="number" min={0} value={str("level")} onChange={(e) => setData("level", e.target.value)} style={{ width: 70 }} /></Field>
              <Field label="Prerequisite text"><input value={str("prerequisite")} onChange={(e) => setData("prerequisite", e.target.value)} /></Field>
              <label className="check"><input type="checkbox" checked={on("origin")} onChange={(e) => setData("origin", e.target.checked)} />Origin feat</label>
            </div>
          )}

          {(editing.kind === "feat" || editing.kind === "feature") && (
            <div className="row">
              <Field label="Uses"><input value={str("usage")} placeholder="1/Long Rest" onChange={(e) => setData("usage", e.target.value)} style={{ width: 130 }} /></Field>
              <Field label="Takes"><select value={str("action")} onChange={(e) => setData("action", e.target.value)}><option value="">Nothing special</option><option>Action</option><option>Bonus Action</option><option>Reaction</option></select></Field>
            </div>
          )}

          <Field label="Description" wide><textarea rows={5} value={editing.description} onChange={(e) => set({ description: e.target.value })} placeholder="What it does. Blank lines start a new paragraph." /></Field>
          {editing.kind === "spell" && <Field label="At higher levels" wide><input value={str("higher")} onChange={(e) => setData("higher", e.target.value)} /></Field>}

          {editing.kind !== "spell" && (
            <div className="hb-effects">
              <h4>Bonuses it gives</h4>
              {editing.effects.map((f, i) => {
                const def = EFFECTS.find((x) => x.kind === f.kind)!;
                const upd = (p: Partial<HbEffect>) => set({ effects: editing.effects.map((x, j) => (j === i ? { ...x, ...p } : x)) });
                return (
                  <div key={i} className="row">
                    <select aria-label="What it changes" value={f.kind} onChange={(e) => upd({ kind: e.target.value as HbEffect["kind"], target: e.target.value === "skill" ? "athletics" : e.target.value === "ability" || e.target.value === "save" ? "strength" : undefined })}>
                      {EFFECTS.map((x) => <option key={x.kind} value={x.kind}>{x.label}</option>)}
                    </select>
                    {def.needsTarget && (
                      <select aria-label="Which one" value={f.target} onChange={(e) => upd({ target: e.target.value })}>
                        {(def.needsTarget === "ability" ? ABILITY_NAMES : SKILL_NAMES).map((n) => <option key={n}>{n}</option>)}
                      </select>
                    )}
                    <input aria-label="Amount" type="number" value={f.value} onChange={(e) => upd({ value: Number(e.target.value) || 0 })} style={{ width: 70 }} />
                    <button aria-label="Remove bonus" onClick={() => set({ effects: editing.effects.filter((_, j) => j !== i) })}>×</button>
                  </div>
                );
              })}
              <button onClick={() => set({ effects: [...editing.effects, { kind: "ac", value: 1 }] })}>Add a bonus</button>
              {(editing.kind === "weapon" || editing.kind === "armor" || editing.kind === "item" || editing.kind === "magic") && <small className="muted"> Bonuses on items apply while the item is equipped.</small>}
            </div>
          )}

          {problems.length > 0 && <ul className="warn">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          <div className="row">
            <button className="primary" disabled={problems.length > 0} onClick={save}>Save</button>
            <button onClick={() => setEditing(null)}>Cancel</button>
          </div>
          <details className="tip"><summary>See the content this makes</summary><pre className="code-view">{xml}</pre></details>
        </div>
      )}
    </section>
  );
}
