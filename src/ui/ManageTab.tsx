import { useMemo, useState } from "react";
import { PortraitPicker, toPortrait } from "./Portrait";
import type { AElement } from "../aurora/types";
import type { Resolved } from "../aurora/engine";
import { hitDieOf } from "../aurora/engine";
import { ABILITY_IDS, ABILITY_LABEL, XP_TABLE, uid, xpToLevel, type AbilityId, type AttackEdit, type Character } from "../aurora/character";
import { buildSheet } from "../aurora/sheet";
import { SlotList, tabOfSlot, type SetCharacter } from "./Slots";
import { Html } from "./Html";
import { useUi } from "./Learn";
import { companionHtml } from "../aurora/companion";

type Sub = "level" | "options" | "bonuses" | "additions" | "attacks" | "companions" | "conditions" | "info" | "sources";
const SUBS: [Sub, string][] = [["level", "Level and hit points"], ["info", "Character details"], ["options", "Options"], ["bonuses", "Custom bonuses"], ["additions", "Manual additions"], ["attacks", "Attacks"], ["companions", "Companions"], ["conditions", "Conditions"], ["sources", "Sources"]];

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
function PickOrType({ label, items, value, onChange }: { label: string; items: AElement[]; value: string; onChange: (v: string) => void }) {
  const listId = `dl-${label}`;
  return (
    <label className="field"><span>{label}</span>
      <input list={listId} value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id={listId}>{items.map((i) => <option key={i.id} value={i.name} />)}</datalist>
    </label>
  );
}

function Info({ ch, set, r }: { ch: Character; set: SetCharacter; r: Resolved }) {
  const put = (k: keyof Character["info"], v: string) => set((c) => ({ ...c, info: { ...c.info, [k]: v } }));
  return (
    <>
      <div className="row">
        {ch.portrait && <img className="portrait small" src={ch.portrait} alt="Portrait" />}
        <label>Portrait: <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { try { const url = await toPortrait(f); set((c) => ({ ...c, portrait: url })); } catch { /* ignore non-images */ } } }} /></label>
        {ch.portrait && <button onClick={() => set((c) => ({ ...c, portrait: undefined }))}>Remove</button>}
      </div>
      <PortraitPicker onPick={(url) => set((c) => ({ ...c, portrait: url }))} />
      <div className="row">
        <label className="field"><span>Character name</span><input value={ch.name} onChange={(e) => set((c) => ({ ...c, name: e.target.value }))} /></label>
        <label className="field"><span>Player</span><input value={ch.playerName} onChange={(e) => set((c) => ({ ...c, playerName: e.target.value }))} /></label>
      </div>
      <div className="grid-fields">
        <PickOrType label="Alignment" items={[...new Map(r.reg.ofType("Alignment").map((a) => [a.name, a])).values()]} value={ch.info.alignment} onChange={(v) => put("alignment", v)} />
        <PickOrType label="Deity" items={[...new Map(r.reg.ofType("Deity").map((a) => [a.name, a])).values()].sort((a, b) => a.name.localeCompare(b.name))} value={ch.info.deity} onChange={(v) => put("deity", v)} />
        {FIELDS.filter(([k]) => k !== "alignment" && k !== "deity").map(([k, label]) => <label className="field" key={k}><span>{label}</span><input value={ch.info[k]} onChange={(e) => put(k, e.target.value)} /></label>)}
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

const BONUS_PRESETS: [string, string][] = [
  ["Armor Class", "ac:misc"], ["Initiative", "initiative:misc"], ["Speed", "speed:misc"], ["Hit points", "hp"], ["Proficiency bonus", "proficiency"],
  ["Strength", "strength"], ["Dexterity", "dexterity"], ["Constitution", "constitution"], ["Intelligence", "intelligence"], ["Wisdom", "wisdom"], ["Charisma", "charisma"],
  ["Strength save", "strength:save:misc"], ["Dexterity save", "dexterity:save:misc"], ["Constitution save", "constitution:save:misc"], ["Intelligence save", "intelligence:save:misc"], ["Wisdom save", "wisdom:save:misc"], ["Charisma save", "charisma:save:misc"],
  ["Melee attacks", "melee:attack"], ["Melee damage", "melee:damage"], ["Ranged attacks", "ranged:attack"], ["Ranged damage", "ranged:damage"],
  ...["acrobatics", "animal handling", "arcana", "athletics", "deception", "history", "insight", "intimidation", "investigation", "medicine", "nature", "perception", "performance", "persuasion", "religion", "sleight of hand", "stealth", "survival"].map((k): [string, string] => [k.replace(/\b\w/g, (c) => c.toUpperCase()), `${k}:misc`]),
];

/** Table rulings and homebrew: add a number to any statistic. */
function Bonuses({ ch, set }: { ch: Character; set: SetCharacter }) {
  const [stat, setStat] = useState("ac:misc");
  const [value, setValue] = useState(1);
  const [note, setNote] = useState("");
  const label = (s: string) => BONUS_PRESETS.find(([, k]) => k === s)?.[0] ?? s;
  return (
    <>
      <p className="muted">Add or subtract from any statistic. It is counted like a bonus from content, and shows up on the sheet. Ability score changes can also be made on the Build tab.</p>
      <div className="row">
        <select value={stat} onChange={(e) => setStat(e.target.value)}>{BONUS_PRESETS.map(([l, k]) => <option key={k} value={k}>{l}</option>)}</select>
        <input type="number" value={value} onChange={(e) => setValue(Number(e.target.value) || 0)} style={{ width: 80 }} />
        <input placeholder="Why (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 1 }} />
        <button className="primary" disabled={!value} onClick={() => { set((c) => ({ ...c, customStats: [...c.customStats, { id: uid(), stat, value, note: note || "Custom bonus" }] })); setNote(""); }}>Add</button>
      </div>
      <ul className="added">
        {ch.customStats.map((c) => (
          <li key={c.id}><span>{label(c.stat)} {c.value >= 0 ? "+" : ""}{c.value} <small className="muted">{c.note}</small></span><button onClick={() => set((x) => ({ ...x, customStats: x.customStats.filter((y) => y.id !== c.id) }))}>Remove</button></li>
        ))}
        {!ch.customStats.length && <li className="muted">No custom bonuses.</li>}
      </ul>
    </>
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

function AutoAttacks({ r, ch, set }: { r: Resolved; ch: Character; set: SetCharacter }) {
  const lines = useMemo(() => buildSheet(r).attacksAll.filter((a) => a.auto), [r]);
  const [open, setOpen] = useState<string | null>(null);
  const edit = (id: string, p: Partial<AttackEdit>) => set((c) => ({ ...c, attackEdits: { ...(c.attackEdits ?? {}), [id]: { ...(c.attackEdits?.[id] ?? {}), ...p } } }));
  if (!lines.length) return <p className="muted">Equip a weapon on the Equipment tab and its attack shows up here, ready to edit.</p>;
  return (
    <ul className="added auto-attacks">
      {lines.map((a) => {
        const id = a.id!;
        const e = ch.attackEdits?.[id] ?? {};
        const edited = Object.keys(e).length > 0;
        return (
          <li key={id} className={a.hiddenByEdit ? "muted" : ""}>
            <span>
              <b>{a.name}</b> · {a.bonus >= 0 ? "+" : ""}{a.bonus} to hit · {a.damage} {a.damageType}{a.hiddenByEdit ? " · hidden" : ""}{edited ? " · edited" : ""}
              <small className="muted"> (from your equipped weapon)</small>
            </span>
            <button onClick={() => setOpen(open === id ? null : id)}>{open === id ? "Done" : "Edit"}</button>
            {open === id && (
              <div className="attack-edit">
                <label>Name <input value={e.name ?? ""} placeholder={a.name} onChange={(ev) => edit(id, { name: ev.target.value })} /></label>
                <label>Bonus adjustment <input type="number" value={e.bonusAdjust ?? 0} onChange={(ev) => edit(id, { bonusAdjust: Number(ev.target.value) || 0 })} style={{ width: 70 }} /></label>
                <label>Damage <input value={e.damage ?? ""} placeholder={a.damage} onChange={(ev) => edit(id, { damage: ev.target.value })} style={{ width: 120 }} /></label>
                <label>Type <input value={e.damageType ?? ""} placeholder={a.damageType} onChange={(ev) => edit(id, { damageType: ev.target.value })} style={{ width: 110 }} /></label>
                <label>Notes <input value={e.notes ?? ""} placeholder={a.notes} onChange={(ev) => edit(id, { notes: ev.target.value })} /></label>
                <label className="check"><input type="checkbox" checked={!!e.hidden} onChange={(ev) => edit(id, { hidden: ev.target.checked })} /> Hide this attack</label>
                {edited && <button onClick={() => set((c) => { const next = { ...(c.attackEdits ?? {}) }; delete next[id]; return { ...c, attackEdits: next }; })}>Reset to calculated</button>}
                <small className="muted">Leave a box empty to keep the calculated value. The bonus adjustment is added on top of it.</small>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Attacks({ r, ch, set }: { r: Resolved; ch: Character; set: SetCharacter }) {
  const [form, setForm] = useState({ name: "", ability: "strength" as AbilityId, damage: "1d6", damageType: "", proficient: true, bonus: 0 });
  return (
    <>
      <h3>From equipped weapons</h3>
      <AutoAttacks r={r} ch={ch} set={set} />
      <h3>Other attacks</h3>
      <p className="muted">Use this for attacks that are not items, such as natural weapons or spell-like effects.</p>
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
  const [kind, setKind] = useState<"all" | "companion" | "mount">("all");
  const pool = useMemo(() => {
    const companions = r.reg.ofType("Companion");
    const mounts = r.reg.ofType("Item").filter((i) => /mount/i.test(i.setters.category?.value ?? ""));
    return { companions, mounts };
  }, [r.reg]);
  const found = useMemo(() => {
    const list = kind === "companion" ? pool.companions : kind === "mount" ? pool.mounts : [...pool.companions, ...pool.mounts];
    const n = q.trim().toLowerCase();
    return list.filter((c) => !n || c.name.toLowerCase().includes(n)).sort((a, b) => a.name.localeCompare(b.name));
  }, [pool, kind, q]);
  const granted = r.active.filter((a) => a.el.type === "Companion");
  const slots = r.slots.filter((s) => s.rule.type === "Companion");
  return (
    <>
      <SlotList slots={slots} r={r} set={set} onDetail={onDetail} />
      {granted.map((a) => <CompanionCard key={a.el.id} el={a.el} />)}
      <h3>Add a companion by hand</h3>
      <div className="row">
        {([["all", "All"], ["companion", "Familiars and creatures"], ["mount", "Mounts"]] as const).map(([k, label]) => <button key={k} className={kind === k ? "pill active" : "pill"} onClick={() => setKind(k)}>{label}</button>)}
        <input className="slot-search" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
      </div>
      <small className="muted">{found.length} listed</small>
      <ul className="options boxed companion-list">
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

const COMPANION_LABEL: Record<string, string> = { skills: "Skills", senses: "Senses", languages: "Languages", challenge: "Challenge", resistances: "Damage Resistances", immunities: "Damage Immunities", conditionImmunities: "Condition Immunities" };

export function CompanionCard({ el }: { el: AElement }) {
  const { reg } = useUi();
  const s = el.setters;
  const val = (k: string) => s[k]?.value;
  // Mounts come from the equipment list: they have a price, speed and carrying capacity instead of a stat block.
  if (el.type === "Item") {
    return (
      <div className="statblock">
        <h4>{el.name}</h4>
        <p className="muted">{[val("category"), val("cost") && `${val("cost")}`, val("weight") && `${val("weight")}`].filter(Boolean).join(" · ")}</p>
        <Html html={el.description} />
      </div>
    );
  }
  const stats = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].filter((k) => val(k));
  return (
    <div className="statblock">
      <h4>{el.name}</h4>
      <p className="muted">{[val("size"), val("type"), val("alignment")].filter(Boolean).join(", ")}</p>
      <p><b>AC</b> {val("ac")} · <b>HP</b> {val("hp")} · <b>Speed</b> {val("speed")}</p>
      {stats.length > 0 && <p className="abil-line">{stats.map((k) => `${k.slice(0, 3).toUpperCase()} ${val(k)}`).join("  ")}</p>}
      {["skills", "senses", "languages", "challenge", "resistances", "immunities", "conditionImmunities"].filter(val).map((k) => <p key={k}><b>{COMPANION_LABEL[k] ?? k}</b> {val(k)}</p>)}
      {val("traits") && <Html html={companionHtml(val("traits"), reg)} />}
      {val("actions") && <><h5>Actions</h5><Html html={companionHtml(val("actions"), reg)} /></>}
      {val("reactions") && <><h5>Reactions</h5><Html html={companionHtml(val("reactions"), reg)} /></>}
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
      {sub === "info" && <Info ch={ch} set={set} r={r} />}
      {sub === "options" && (<><Options r={r} ch={ch} set={set} onDetail={onDetail} />{other.length > 0 && (<><h3>Other choices</h3><SlotList slots={other} r={r} set={set} onDetail={onDetail} /></>)}</>)}
      {sub === "bonuses" && <Bonuses ch={ch} set={set} />}
      {sub === "additions" && <Additions r={r} ch={ch} set={set} onDetail={onDetail} />}
      {sub === "attacks" && <Attacks r={r} ch={ch} set={set} />}
      {sub === "companions" && <Companions r={r} ch={ch} set={set} onDetail={onDetail} />}
      {sub === "conditions" && <Conditions ch={ch} set={set} />}
      {sub === "sources" && <Sources r={r} ch={ch} set={set} />}
    </div>
  );
}
