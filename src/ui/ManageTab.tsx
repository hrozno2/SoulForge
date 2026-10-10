import { useMemo, useState } from "react";
import type { AElement } from "../aurora/types";
import type { Resolved } from "../aurora/engine";
import { hitDieOf } from "../aurora/engine";
import { ABILITY_IDS, ABILITY_LABEL, XP_TABLE, uid, xpToLevel, type AbilityId, type Character } from "../aurora/character";
import { SlotList, tabOfSlot, type SetCharacter } from "./Slots";
import { Html } from "./Html";

type Sub = "level" | "options" | "additions" | "attacks" | "companions" | "conditions" | "info" | "sources";
const SUBS: [Sub, string][] = [["level", "Level and hit points"], ["info", "Character details"], ["options", "Options"], ["additions", "Manual additions"], ["attacks", "Attacks"], ["companions", "Companions"], ["conditions", "Conditions"], ["sources", "Sources"]];

export const CONDITIONS = ["Blinded", "Charmed", "Deafened", "Exhaustion", "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed", "Petrified", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious"];

function Level({ r, ch, set }: { r: Resolved; ch: Character; set: SetCharacter }) {
  const total = r.totalLevel;
  const xpLevel = xpToLevel(ch.xp);
  const rollLevels = Array.from({ length: Math.max(0, total - 1) }, (_, i) => i + 2);
  const dieForLevel = (n: number) => {
    let left = n;
    for (const c of ch.classes) {
      if (left <= c.level) return hitDieOf(r.reg.get(c.classId));
      left -= c.level;
    }
    return 0;
  };
  return (
    <>
      <div className="row">
        <label className="field"><span>Experience points</span>
          <input type="number" min={0} value={ch.xp} onChange={(e) => set((c) => ({ ...c, xp: Math.max(0, Number(e.target.value) || 0) }))} />
        </label>
        <span className={xpLevel > total ? "notice" : "muted"}>
          XP says level {xpLevel}; your classes total {total}.{xpLevel > total ? " You can level up on the Build tab." : ""} Next level at {XP_TABLE[Math.min(19, total)] ?? "-"} XP.
        </span>
      </div>
      <h3>Hit points</h3>
      <div className="row">
        {(["average", "roll"] as const).map((m) => (
          <button key={m} className={ch.hpMode === m ? "pill active" : "pill"} onClick={() => set((c) => ({ ...c, hpMode: m }))}>
            {m === "average" ? "Fixed (average)" : "Rolled"}
          </button>
        ))}
        <span>Maximum HP: <b>{r.stats.get("hp")}</b></span>
      </div>
      {ch.hpMode === "roll" && (
        <div className="rolls">
          {rollLevels.map((n) => {
            const die = dieForLevel(n);
            return (
              <label key={n} className="field coin">
                <span>Lv {n} (d{die})</span>
                <input type="number" min={1} max={die} placeholder={String(Math.floor(die / 2) + 1)} value={ch.hpRolls[String(n)] ?? ""} onChange={(e) => set((c) => { const v = Number(e.target.value); const rolls = { ...c.hpRolls }; if (!v) delete rolls[String(n)]; else rolls[String(n)] = Math.min(die, Math.max(1, v)); return { ...c, hpRolls: rolls }; })} />
              </label>
            );
          })}
          {rollLevels.length === 0 && <p className="muted">Level 1 always takes the maximum of the hit die.</p>}
        </div>
      )}
    </>
  );
}

const FIELDS: [keyof Character["info"], string][] = [
  ["alignment", "Alignment"], ["deity", "Deity"], ["gender", "Gender"], ["age", "Age"], ["height", "Height"], ["weight", "Weight"], ["eyes", "Eyes"], ["hair", "Hair"], ["skin", "Skin"],
];
const AREAS: [keyof Character["info"], string][] = [["traits", "Personality traits"], ["ideals", "Ideals"], ["bonds", "Bonds"], ["flaws", "Flaws"], ["allies", "Allies and organizations"], ["backstory", "Backstory"]];

/** Shrinks an image to a small JPEG so it stays cheap to save. */
function toPortrait(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 256;
      const scale = Math.min(1, size / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Not an image"));
    img.src = url;
  });
}

function Info({ ch, set }: { ch: Character; set: SetCharacter }) {
  const put = (k: keyof Character["info"], v: string) => set((c) => ({ ...c, info: { ...c.info, [k]: v } }));
  return (
    <>
      <div className="row">
        {ch.portrait && <img className="portrait small" src={ch.portrait} alt="Portrait" />}
        <label>Portrait: <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { try { const url = await toPortrait(f); set((c) => ({ ...c, portrait: url })); } catch { /* ignore non-images */ } } }} /></label>
        {ch.portrait && <button onClick={() => set((c) => ({ ...c, portrait: undefined }))}>Remove</button>}
      </div>
      <div className="row">
        <label className="field"><span>Character name</span><input value={ch.name} onChange={(e) => set((c) => ({ ...c, name: e.target.value }))} /></label>
        <label className="field"><span>Player</span><input value={ch.playerName} onChange={(e) => set((c) => ({ ...c, playerName: e.target.value }))} /></label>
      </div>
      <div className="grid-fields">
        {FIELDS.map(([k, label]) => <label className="field" key={k}><span>{label}</span><input value={ch.info[k]} onChange={(e) => put(k, e.target.value)} /></label>)}
      </div>
      {AREAS.map(([k, label]) => <label className="field" key={k}><span>{label}</span><textarea rows={k === "backstory" ? 6 : 3} value={ch.info[k]} onChange={(e) => put(k, e.target.value)} /></label>)}
      <label className="field"><span>Notes</span><textarea rows={6} value={ch.notes} onChange={(e) => set((c) => ({ ...c, notes: e.target.value }))} /></label>
    </>
  );
}

function Options({ r, ch, set, onDetail }: { r: Resolved; ch: Character; set: SetCharacter; onDetail: (e: AElement) => void }) {
  const opts = r.reg.ofType("Option");
  if (!opts.length) return <p className="muted">No character options are loaded. Options such as optional rules come from content files.</p>;
  return (
    <ul className="options boxed">
      {opts.map((o) => {
        const on = ch.options.includes(o.id);
        return (
          <li key={o.id} className={on ? "picked" : ""}>
            <button onClick={() => set((c) => ({ ...c, options: on ? c.options.filter((x) => x !== o.id) : [...c.options, o.id] }))} onMouseEnter={() => onDetail(o)}>
              <span className="tick">{on ? "✓" : ""}</span><span className="opt-name">{o.name}</span><span className="opt-meta" /><span className="opt-src">{o.source}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const ADD_TYPES = ["Language", "Feat", "Spell", "Proficiency", "Racial Trait", "Class Feature", "Feat Feature", "Archetype Feature", "Background Feature", "Item", "Magic Item"];

/** Table rulings and homebrew: add any content to the character without going through a choice. */
function Additions({ r, ch, set, onDetail }: { r: Resolved; ch: Character; set: SetCharacter; onDetail: (e: AElement) => void }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("Language");
  const results = useMemo(() => {
    const n = q.trim().toLowerCase();
    return r.reg.ofType(type).filter((e) => !e.compendiumHidden && (!n || e.name.toLowerCase().includes(n)) && !ch.extras.includes(e.id)).slice(0, 80);
  }, [q, type, r.reg, ch.extras]);
  return (
    <>
      <p className="muted">Add anything the rules did not give you by choice, such as a bonus language from a story reward or a feat your table allows. It follows the same rules as normal content.</p>
      <div className="row">
        <select value={type} onChange={(e) => setType(e.target.value)}>{ADD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <input style={{ flex: 1 }} placeholder={`Search ${type.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul className="options boxed">
        {results.map((o) => (
          <li key={o.id}><button onMouseEnter={() => onDetail(o)} onClick={() => set((c) => ({ ...c, extras: [...c.extras, o.id] }))}><span className="tick">+</span><span className="opt-name">{o.name}</span><span className="opt-meta" /><span className="opt-src">{o.source}</span></button></li>
        ))}
      </ul>
      <h3>Added</h3>
      <ul className="added">
        {ch.extras.map((id) => {
          const el = r.reg.get(id);
          return <li key={id}><span>{el?.name ?? id} <small className="muted">{el?.type}</small></span><button onClick={() => set((c) => ({ ...c, extras: c.extras.filter((x) => x !== id) }))}>Remove</button></li>;
        })}
        {!ch.extras.length && <li className="muted">Nothing added by hand.</li>}
      </ul>
    </>
  );
}

function Attacks({ ch, set }: { ch: Character; set: SetCharacter }) {
  const [form, setForm] = useState({ name: "", ability: "strength" as AbilityId, damage: "1d6", damageType: "", proficient: true, bonus: 0 });
  return (
    <>
      <p className="muted">Equipped weapons appear on the sheet automatically. Use this for attacks that are not items, such as natural weapons or spell-like effects.</p>
      <div className="row">
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select value={form.ability} onChange={(e) => setForm({ ...form, ability: e.target.value as AbilityId })}>{ABILITY_IDS.map((a) => <option key={a} value={a}>{ABILITY_LABEL[a]}</option>)}</select>
        <input placeholder="Damage" value={form.damage} onChange={(e) => setForm({ ...form, damage: e.target.value })} style={{ width: 90 }} />
        <input placeholder="Type" value={form.damageType} onChange={(e) => setForm({ ...form, damageType: e.target.value })} style={{ width: 110 }} />
        <label className="check"><input type="checkbox" checked={form.proficient} onChange={(e) => setForm({ ...form, proficient: e.target.checked })} /> Proficient</label>
        <input type="number" title="Extra attack bonus" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: Number(e.target.value) || 0 })} style={{ width: 70 }} />
        <button className="primary" disabled={!form.name.trim()} onClick={() => { set((c) => ({ ...c, attacks: [...c.attacks, { uid: uid(), name: form.name.trim(), ability: form.ability, proficient: form.proficient, damage: form.damage, damageType: form.damageType, bonus: form.bonus }] })); setForm({ ...form, name: "" }); }}>Add</button>
      </div>
      <ul className="added">
        {ch.attacks.map((a) => (
          <li key={a.uid}><span>{a.name} · {ABILITY_LABEL[a.ability]} · {a.damage} {a.damageType}</span><button onClick={() => set((c) => ({ ...c, attacks: c.attacks.filter((x) => x.uid !== a.uid) }))}>Remove</button></li>
        ))}
      </ul>
    </>
  );
}

function Companions({ r, ch, set, onDetail }: { r: Resolved; ch: Character; set: SetCharacter; onDetail: (e: AElement) => void }) {
  const [q, setQ] = useState("");
  const found = useMemo(() => (q.trim() ? r.reg.ofType("Companion").filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 40) : []), [q, r.reg]);
  const granted = r.active.filter((a) => a.el.type === "Companion");
  const slots = r.slots.filter((s) => s.rule.type === "Companion");
  return (
    <>
      <SlotList slots={slots} r={r} set={set} onDetail={onDetail} />
      {granted.map((a) => <CompanionCard key={a.el.id} el={a.el} />)}
      <h3>Add a companion by hand</h3>
      <input className="slot-search" placeholder="Search creatures, familiars, mounts" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="options boxed">
        {found.map((c) => (
          <li key={c.id}><button onMouseEnter={() => onDetail(c)} onClick={() => set((x) => ({ ...x, companions: [...x.companions, { uid: uid(), id: c.id, name: c.name }] }))}><span className="tick">+</span><span className="opt-name">{c.name}</span><span className="opt-meta" /><span className="opt-src">{c.source}</span></button></li>
        ))}
      </ul>
      {ch.companions.map((c) => {
        const el = r.reg.get(c.id);
        return (
          <div key={c.uid} className="card sub">
            <div className="row"><input value={c.name} onChange={(e) => set((x) => ({ ...x, companions: x.companions.map((y) => (y.uid === c.uid ? { ...y, name: e.target.value } : y)) }))} /><button onClick={() => set((x) => ({ ...x, companions: x.companions.filter((y) => y.uid !== c.uid) }))}>Remove</button></div>
            {el && <CompanionCard el={el} />}
          </div>
        );
      })}
    </>
  );
}

export function CompanionCard({ el }: { el: AElement }) {
  const s = el.setters;
  const val = (k: string) => s[k]?.value;
  const stats = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].filter((k) => val(k));
  return (
    <div className="statblock">
      <h4>{el.name}</h4>
      <p className="muted">{[val("size"), val("type"), val("alignment")].filter(Boolean).join(", ")}</p>
      <p><b>AC</b> {val("ac")} · <b>HP</b> {val("hp")} · <b>Speed</b> {val("speed")}</p>
      {stats.length > 0 && <p className="abil-line">{stats.map((k) => `${k.slice(0, 3).toUpperCase()} ${val(k)}`).join("  ")}</p>}
      {["skills", "senses", "languages", "challenge", "resistances", "immunities", "conditionImmunities"].filter(val).map((k) => <p key={k}><b>{k}</b> {val(k)}</p>)}
      {val("traits") && <Html html={val("traits")!} />}
      {val("actions") && <Html html={val("actions")!} />}
      {el.description && <Html html={el.description} />}
    </div>
  );
}

function Conditions({ ch, set }: { ch: Character; set: SetCharacter }) {
  return (
    <div className="chips">
      {CONDITIONS.map((c) => {
        const on = ch.play.conditions.includes(c);
        return <button key={c} className={on ? "pill active" : "pill"} onClick={() => set((x) => ({ ...x, play: { ...x.play, conditions: on ? x.play.conditions.filter((y) => y !== c) : [...x.play.conditions, c] } }))}>{c}</button>;
      })}
    </div>
  );
}

function Sources({ r, ch, set }: { r: Resolved; ch: Character; set: SetCharacter }) {
  const names = useMemo(() => {
    const seen = new Map<string, number>();
    for (const t of ["Race", "Class", "Background", "Feat", "Spell", "Archetype"]) for (const e of r.reg.ofType(t)) if (e.source) seen.set(e.source, (seen.get(e.source) ?? 0) + 1);
    return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [r.reg]);
  const on = new Set(ch.sources);
  return (
    <>
      <p className="muted">Limit the choices in the builder to specific books. Leave everything unticked to allow all content.</p>
      <div className="source-grid">
        {names.map(([n, count]) => (
          <label key={n} className="check">
            <input type="checkbox" checked={on.has(n)} onChange={() => set((c) => ({ ...c, sources: on.has(n) ? c.sources.filter((x) => x !== n) : [...c.sources, n] }))} />
            {n} <small className="muted">{count}</small>
          </label>
        ))}
      </div>
      {ch.sources.length > 0 && <button onClick={() => set((c) => ({ ...c, sources: [] }))}>Allow all sources</button>}
    </>
  );
}

export function ManageTab({ r, ch, set, onDetail }: { r: Resolved; ch: Character; set: SetCharacter; onDetail: (e: AElement) => void }) {
  const [sub, setSub] = useState<Sub>("level");
  const other = r.slots.filter((s) => tabOfSlot(s) === "other" && s.rule.type !== "Companion");
  return (
    <div>
      <nav className="subtabs">{SUBS.map(([k, label]) => <button key={k} className={sub === k ? "subtab active" : "subtab"} onClick={() => setSub(k)}>{label}</button>)}</nav>
      {sub === "level" && <Level r={r} ch={ch} set={set} />}
      {sub === "info" && <Info ch={ch} set={set} />}
      {sub === "options" && (<><Options r={r} ch={ch} set={set} onDetail={onDetail} />{other.length > 0 && (<><h3>Other choices</h3><SlotList slots={other} r={r} set={set} onDetail={onDetail} /></>)}</>)}
      {sub === "additions" && <Additions r={r} ch={ch} set={set} onDetail={onDetail} />}
      {sub === "attacks" && <Attacks ch={ch} set={set} />}
      {sub === "companions" && <Companions r={r} ch={ch} set={set} onDetail={onDetail} />}
      {sub === "conditions" && <Conditions ch={ch} set={set} />}
      {sub === "sources" && <Sources r={r} ch={ch} set={set} />}
    </div>
  );
}
