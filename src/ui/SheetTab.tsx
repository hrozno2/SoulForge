import { useMemo, useState } from "react";
import type { Resolved } from "../aurora/engine";
import { buildSheet, headerInfo, type SheetData } from "../aurora/sheet";
import { ABILITY_LABEL, ABILITY_SHORT, type Character } from "../aurora/character";
import { downloadText, saveFile } from "../store";
import { DEFAULT_PDF_OPTIONS, buildPdf, cardCounts, type PdfOptions } from "../pdf/exportPdf";
import type { SetCharacter } from "./Slots";
import { CompanionCard, CONDITIONS } from "./ManageTab";
import { requestRoll } from "./Dice";

const sign = (n: number) => (n >= 0 ? `+${n}` : String(n));
const rollBtn = (label: string, bonus: number) => requestRoll(label, `1d20${bonus >= 0 ? "+" : ""}${bonus}`);
const skillLabel = (id: string) => id.replace(/\b\w/g, (c) => c.toUpperCase());

function ExportPanel({ r, sheet }: { r: Resolved; sheet: SheetData }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<PdfOptions>(DEFAULT_PDF_OPTIONS);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const counts = cardCounts(r, sheet);
  const toggle = (k: "sheet" | "spellCards" | "itemCards" | "featureCards") => setOpts((o) => ({ ...o, [k]: !o[k] }));
  const run = async () => {
    setBusy(true);
    setMsg("");
    try {
      const { loadFonts } = await import("../pdf/fonts");
      const bytes = await buildPdf(r, sheet, opts, await loadFonts());
      const base = (r.character.name || "character").replace(/[^\p{L}\p{N}]+/gu, "-");
      const ok = await saveFile(`${base}.pdf`, bytes, "application/pdf");
      setMsg(ok ? "PDF saved." : "Cancelled.");
    } catch (e) {
      setMsg(`Could not create the PDF: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="noprint">
      <button className="primary" onClick={() => setOpen(!open)}>Export PDF...</button>
      {open && (
        <div className="subcard">
          <label className="check"><input type="checkbox" checked={opts.sheet} onChange={() => toggle("sheet")} /> Character sheet</label>
          <label className="check"><input type="checkbox" checked={opts.spellCards} onChange={() => toggle("spellCards")} /> Spell cards <small>{counts.spells}</small></label>
          <label className="check"><input type="checkbox" checked={opts.itemCards} onChange={() => toggle("itemCards")} /> Item cards <small>{counts.items}</small></label>
          <label className="check"><input type="checkbox" checked={opts.featureCards} onChange={() => toggle("featureCards")} /> Feat and feature cards <small>{counts.features}</small></label>
          <div className="row">
            <span className="muted">Paper</span>
            {(["a4", "letter"] as const).map((p) => <button key={p} className={opts.paper === p ? "pill active" : "pill"} onClick={() => setOpts((o) => ({ ...o, paper: p }))}>{p === "a4" ? "A4" : "Letter"}</button>)}
          </div>
          <p className="muted">Cards are 2.5 x 3.5 in (poker size), nine to a page, ready to cut.</p>
          <button className="primary" disabled={busy || !(opts.sheet || opts.spellCards || opts.itemCards || opts.featureCards)} onClick={run}>{busy ? "Creating..." : "Create PDF"}</button>
          {msg && <p className="notice">{msg}</p>}
        </div>
      )}
    </div>
  );
}

function PlayBar({ ch, sheet, set }: { ch: Character; sheet: SheetData; set: SetCharacter }) {
  const hp = ch.play.hp ?? sheet.hp;
  const setPlay = (patch: Partial<Character["play"]>) => set((c) => ({ ...c, play: { ...c.play, ...patch } }));
  return (
    <div className="playbar noprint">
      <div className="box">
        <small>Current HP</small>
        <span className="stepper">
          <button onClick={() => setPlay({ hp: Math.max(0, hp - 1) })}>−</button>
          <input type="number" value={hp} onChange={(e) => setPlay({ hp: Math.max(0, Math.min(sheet.hp + ch.play.tempHp, Number(e.target.value) || 0)) })} style={{ width: 64 }} />
          <button onClick={() => setPlay({ hp: Math.min(sheet.hp, hp + 1) })}>+</button>
        </span>
        <button className="more" onClick={() => setPlay({ hp: sheet.hp, tempHp: 0, slotsUsed: {}, hitDiceUsed: 0, deathSaves: { success: 0, fail: 0 }, featureUses: {} })}>Long rest</button>
      </div>
      <div className="box"><small>Temp HP</small><input type="number" min={0} value={ch.play.tempHp} onChange={(e) => setPlay({ tempHp: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 70 }} /></div>
      <div className="box">
        <small>Death saves</small>
        <span>✓ {[0, 1, 2].map((i) => <input key={i} type="checkbox" checked={i < ch.play.deathSaves.success} onChange={() => setPlay({ deathSaves: { ...ch.play.deathSaves, success: ch.play.deathSaves.success === i + 1 ? i : i + 1 } })} />)}</span>
        <span>✗ {[0, 1, 2].map((i) => <input key={i} type="checkbox" checked={i < ch.play.deathSaves.fail} onChange={() => setPlay({ deathSaves: { ...ch.play.deathSaves, fail: ch.play.deathSaves.fail === i + 1 ? i : i + 1 } })} />)}</span>
      </div>
      <div className="box">
        <small>Hit dice used</small>
        <span className="stepper">
          <button onClick={() => setPlay({ hitDiceUsed: Math.max(0, ch.play.hitDiceUsed - 1) })}>−</button>
          <span>{ch.play.hitDiceUsed} / {sheet.level}</span>
          <button onClick={() => setPlay({ hitDiceUsed: Math.min(sheet.level, ch.play.hitDiceUsed + 1) })}>+</button>
        </span>
      </div>
      <div className="box"><small>Experience</small><input type="number" min={0} value={ch.xp} onChange={(e) => set((c) => ({ ...c, xp: Math.max(0, Number(e.target.value) || 0) }))} style={{ width: 90 }} /></div>
    </div>
  );
}

/** Tick boxes for features with a limited number of uses, such as "2/Long Rest". */
function Uses({ id, usage, ch, set }: { id: string; usage?: string; ch: Character; set: SetCharacter }) {
  const m = usage?.match(/^(\d+)\s*\//);
  const n = m ? parseInt(m[1], 10) : 0;
  if (!n || n > 12) return null;
  const used = ch.play.featureUses[id] ?? 0;
  return (
    <span className="uses noprint">
      {Array.from({ length: n }, (_, i) => (
        <button key={i} className={i < used ? "pip spent small" : "pip small"} title={i < used ? "Used" : "Available"} onClick={() => set((c) => ({ ...c, play: { ...c.play, featureUses: { ...c.play.featureUses, [id]: used === i + 1 ? i : i + 1 } } }))} />
      ))}{" "}
    </span>
  );
}

export function SheetTab({ r, ch, set }: { r: Resolved; ch: Character; set: SetCharacter }) {
  const sheet = useMemo(() => buildSheet(r), [r]);
  const head = headerInfo(r);
  const hp = ch.play.hp ?? sheet.hp;
  const hd = sheet.hitDice.map((h) => `${h.count}d${h.die}`).join(" + ") || "-";
  const groups: [string, string[]][] = [
    ["Species traits", ["Racial Trait"]],
    ["Class features", ["Class Feature"]],
    ["Subclass features", ["Archetype Feature"]],
    ["Feats", ["Feat", "Feat Feature"]],
    ["Background", ["Background Feature"]],
  ];
  const attuned = ch.inventory.filter((i) => i.attuned).length;

  return (
    <div className="sheet-wrap">
      <div className="row noprint">
        <ExportPanel r={r} sheet={sheet} />
        <button onClick={() => window.print()}>Quick print</button>
        <button onClick={() => downloadText(`${ch.name || "character"}.json`, JSON.stringify(ch, null, 2))}>Export character</button>
      </div>
      <PlayBar ch={ch} sheet={sheet} set={set} />
      <div className="sheet">
        <header className="sheet-head">
          {ch.portrait && <img className="portrait" src={ch.portrait} alt="Portrait" />}
          <h1>{ch.name || "Unnamed character"}</h1>
          <div className="meta">
            <div><small>Species</small>{head.species}</div>
            <div><small>Class</small>{head.classLine}</div>
            <div><small>Subclass</small>{head.subclass}</div>
            <div><small>Background</small>{head.background}</div>
            <div><small>Size</small>{head.size || "-"}</div>
            <div><small>Alignment</small>{head.alignment}</div>
          </div>
        </header>

        <div className="combat">
          <div className="box"><small>Armor Class</small><b>{sheet.ac.value}</b><small>{sheet.ac.parts.join(" ")}</small></div>
          <div className="box"><small>Initiative</small><b className="roll" title="Roll" onClick={() => rollBtn("Initiative", sheet.initiative)}>{sign(sheet.initiative)}</b></div>
          <div className="box"><small>Hit Points</small><b>{hp}{ch.play.tempHp ? ` +${ch.play.tempHp}` : ""} / {sheet.hp}</b></div>
          <div className="box"><small>Hit Dice</small><b>{hd}</b></div>
          <div className="box"><small>Proficiency</small><b>{sign(sheet.proficiency)}</b></div>
          <div className="box"><small>Speed</small><b>{sheet.speed} ft</b>{sheet.otherSpeeds.length > 0 && <small>{sheet.otherSpeeds.map((s) => `${s.kind} ${s.value}`).join(", ")}</small>}</div>
          <div className="box"><small>Passive Perception</small><b>{sheet.passivePerception}</b></div>
          <button className="box inspiration" onClick={() => set((c) => ({ ...c, play: { ...c.play, inspiration: !c.play.inspiration } }))}><small>Inspiration</small><b>{ch.play.inspiration ? "☑" : "☐"}</b></button>
        </div>
        {ch.play.conditions.length > 0 && <p className="warn">Conditions: {ch.play.conditions.join(", ")}</p>}

        <div className="ability-grid">
          {sheet.abilities.map((a) => (
            <div className="ability" key={a.id}>
              <div className="ability-head"><span>{ABILITY_LABEL[a.id]}</span><b className="roll" title="Roll check" onClick={() => rollBtn(`${ABILITY_LABEL[a.id]} check`, a.mod)}>{sign(a.mod)}</b><em>{a.score}</em></div>
              <div className="line"><i className={a.saveProficient ? "dot on" : "dot"} /><span>Saving Throw</span><b className="roll" title="Roll save" onClick={() => rollBtn(`${ABILITY_LABEL[a.id]} save`, a.save)}>{sign(a.save)}</b></div>
              {sheet.skills.filter((s) => s.ability === a.id).map((s) => (
                <div className="line" key={s.name}>
                  <i className={s.level === "none" ? "dot" : s.level === "expertise" ? "dot on x2" : "dot on"} />
                  <span>{skillLabel(s.name)}</span><b className="roll" title="Roll" onClick={() => rollBtn(skillLabel(s.name), s.bonus)}>{sign(s.bonus)}</b>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="cols">
          <section className="block">
            <h3>Training and proficiencies</h3>
            {([["Armor", sheet.proficiencies.armor], ["Weapons", sheet.proficiencies.weapons], ["Tools", sheet.proficiencies.tools], ["Languages", sheet.proficiencies.languages], ["Other", sheet.proficiencies.other], ["Senses", sheet.vision]] as [string, string[]][])
              .filter(([, v]) => v.length)
              .map(([k, v]) => <p key={k}><b>{k}.</b> {v.map((x) => x.replace(/^(Armor|Weapon|Tool) Proficiency \((.*)\)$/, "$2")).join(", ")}</p>)}
          </section>
          <section className="block">
            <h3>Attacks</h3>
            {sheet.attacks.length === 0 && <p className="muted">Equip a weapon on the Equipment tab to see attacks.</p>}
            {sheet.attacks.length > 0 && (
              <table className="attacks">
                <thead><tr><th>Name</th><th>Atk</th><th>Damage</th><th>Notes</th></tr></thead>
                <tbody>{sheet.attacks.map((a, i) => <tr key={i}><td>{a.name}</td><td><span className="roll" title="Roll to hit" onClick={() => rollBtn(`${a.name} attack`, a.bonus)}>{sign(a.bonus)}</span></td><td><span className="roll" title="Roll damage" onClick={() => a.damage && requestRoll(`${a.name} damage`, a.damage.replace(/\s+/g, ""))}>{a.damage}</span> {a.damageType}</td><td>{[a.properties, a.notes].filter(Boolean).join("; ")}</td></tr>)}</tbody>
              </table>
            )}
          </section>
        </div>

        {sheet.casting.map((c) => (
          <section className="block" key={c.name}>
            <h3>Spellcasting: {c.name}</h3>
            <p>Save DC <b>{c.dc}</b> · Spell attack <b>{sign(c.attack)}</b> · {c.ability ? `${ABILITY_SHORT[c.ability as keyof typeof ABILITY_SHORT] ?? c.ability}` : ""}</p>
            {c.slots.length > 0 && <p>{c.slots.map((s) => `L${s.level}: ${s.total - s.used}/${s.total}`).join("   ")}</p>}
            {c.cantripsKnown.length > 0 && <p><b>Cantrips.</b> {c.cantripsKnown.map((p) => r.reg.get(p.id)?.name).filter(Boolean).join(", ")}</p>}
            {(() => {
              const nm = (list: { id: string }[]) => [...new Set(list.map((p) => r.reg.get(p.id)?.name).filter(Boolean))];
              const prepared = nm([...c.granted.filter((g) => !c.cantripsKnown.some((x) => x.id === g.id)), ...c.spells.filter((s) => s.prepared)]);
              const known = nm(c.spells);
              return (
                <>
                  {known.length > 0 && <p><b>{c.prepare ? "Spellbook / known." : "Spells known."}</b> {known.join(", ")}</p>}
                  {c.prepare && <p><b>Prepared ({prepared.length}/{c.prepareMax}).</b> {prepared.join(", ") || <span className="muted">none chosen yet, pick them on the Magic tab</span>}</p>}
                  {!c.prepare && c.granted.length > 0 && <p><b>Granted.</b> {nm(c.granted).join(", ")}</p>}
                </>
              );
            })()}
          </section>
        ))}

        {groups.map(([title, types]) => {
          const list = sheet.features.filter((f) => types.includes(f.type));
          if (!list.length) return null;
          return (
            <section className="block" key={title}>
              <h3>{title}</h3>
              {list.map((f) => (
                <p key={f.id}><b>{f.name}.</b> {f.usage ? <em>({f.usage}) </em> : null}<Uses id={f.id} usage={f.usage} ch={ch} set={set} />{f.text}</p>
              ))}
            </section>
          );
        })}

        <div className="cols">
          <section className="block">
            <h3>Equipment</h3>
            {ch.inventory.map((i) => {
              const el = i.id ? r.reg.get(i.id) : undefined;
              return <p key={i.uid}>{i.qty > 1 ? `${i.qty} × ` : ""}{el?.name ?? i.custom?.name ?? i.id}{i.equipped ? " (equipped)" : ""}{i.attuned ? " (attuned)" : ""}</p>;
            })}
            <p className="muted">{sheet.weight.carried} / {sheet.weight.capacity} lb · attuned {attuned}/{sheet.attunement.max}</p>
            <p><b>Coins.</b> {(["pp", "gp", "ep", "sp", "cp"] as const).map((k) => `${ch.coins[k]} ${k.toUpperCase()}`).join(", ")}</p>
          </section>
          <section className="block">
            <h3>Details</h3>
            {([["Alignment", ch.info.alignment], ["Deity", ch.info.deity], ["Traits", ch.info.traits], ["Ideals", ch.info.ideals], ["Bonds", ch.info.bonds], ["Flaws", ch.info.flaws], ["Appearance", [ch.info.age, ch.info.height, ch.info.weight, ch.info.eyes, ch.info.hair, ch.info.skin].filter(Boolean).join(", ")]] as [string, string][])
              .filter(([, v]) => v)
              .map(([k, v]) => <p key={k}><b>{k}.</b> {v}</p>)}
            {sheet.lists.map((l) => <p key={l.name}><b>{l.name}.</b> {l.texts.join(" ")}</p>)}
          </section>
        </div>

        {(r.active.some((a) => a.el.type === "Companion") || ch.companions.length > 0) && (
          <section className="block">
            <h3>Companions</h3>
            {r.active.filter((a) => a.el.type === "Companion").map((a) => <CompanionCard key={a.el.id} el={a.el} />)}
            {ch.companions.map((c) => { const el = r.reg.get(c.id); return el ? <div key={c.uid}><b>{c.name}</b><CompanionCard el={el} /></div> : null; })}
          </section>
        )}
        {ch.info.backstory && <section className="block"><h3>Backstory</h3><p>{ch.info.backstory}</p></section>}
        {ch.notes && <section className="block"><h3>Notes</h3><p>{ch.notes}</p></section>}
        {r.warnings.length > 0 && <section className="block noprint"><h3>Content warnings</h3>{r.warnings.slice(0, 10).map((w, i) => <p key={i} className="muted">{w}</p>)}</section>}
      </div>
      <details className="noprint"><summary>Conditions reference</summary><p className="muted">{CONDITIONS.join(", ")}. Toggle them on the Manage tab.</p></details>
    </div>
  );
}
