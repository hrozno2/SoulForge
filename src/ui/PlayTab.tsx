import { useMemo, useState } from "react";
import type { Resolved } from "../aurora/engine";
import { buildSheet, headerInfo, type CastingLine, type FeatureLine, type SheetData } from "../aurora/sheet";
import { ABILITY_LABEL, ABILITY_SHORT, XP_TABLE, type AbilityId, type Character } from "../aurora/character";
import type { AElement } from "../aurora/types";
import { Html } from "./Html";
import { requestRoll, RollModeSwitch } from "./Dice";
import { Hint } from "./Help";
import { isAvailable, usedAfterClick } from "./pips";
import { CompanionCard } from "./ManageTab";
import type { SetCharacter } from "./Slots";

const sign = (n: number) => (n >= 0 ? `+${n}` : String(n));
const skillLabel = (id: string) => id.replace(/\b\w/g, (c) => c.toUpperCase());
const roll = (label: string, bonus: number) => requestRoll(label, `1d20${bonus >= 0 ? "+" : ""}${bonus}`);

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`play-panel ${className}`}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- header and vitals

function AbilityBox({ id, a }: { id: AbilityId; a: SheetData["abilities"][number] }) {
  return (
    <button className="ab-box" title={`Roll ${ABILITY_LABEL[id]} check`} onClick={() => roll(`${ABILITY_LABEL[id]} check`, a.mod)}>
      <small>{ABILITY_LABEL[id]}</small>
      <b>{sign(a.mod)}</b>
      <span className="ab-score">{a.score}</span>
    </button>
  );
}

function Vitals({ ch, sheet, set }: { ch: Character; sheet: SheetData; set: SetCharacter }) {
  const hp = ch.play.hp ?? sheet.hp;
  const [amount, setAmount] = useState("");
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  const patch = (p: Partial<Character["play"]>) => set((c) => ({ ...c, play: { ...c.play, ...p } }));
  const damage = () => {
    if (!n) return;
    const absorbed = Math.min(ch.play.tempHp, n);
    patch({ tempHp: ch.play.tempHp - absorbed, hp: Math.max(0, hp - (n - absorbed)) });
    setAmount("");
  };
  const heal = () => {
    if (!n) return;
    patch({ hp: Math.min(sheet.hp, hp + n), deathSaves: { success: 0, fail: 0 } });
    setAmount("");
  };
  const temp = () => {
    if (!n) return;
    patch({ tempHp: Math.max(ch.play.tempHp, n) });
    setAmount("");
  };
  const pct = sheet.hp ? Math.max(0, Math.min(100, (hp / sheet.hp) * 100)) : 0;
  return (
    <div className="vitals">
      <div className="hp-main">
        <small>Hit Points</small>
        <div className="hp-num"><b>{hp}</b><span>/ {sheet.hp}</span>{ch.play.tempHp > 0 && <em>+{ch.play.tempHp} temp</em>}</div>
        <div className="hp-bar"><div style={{ width: `${pct}%` }} className={pct < 25 ? "low" : ""} /></div>
      </div>
      <div className="hp-manage">
        <input type="number" min={0} placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && damage()} />
        <button onClick={heal}>Heal</button>
        <button onClick={damage}>Damage</button>
        <button onClick={temp}>Temp</button>
      </div>
      {hp === 0 && (
        <div className="death">
          <small>Death saves</small>
          <span>Success {[0, 1, 2].map((i) => <input key={i} type="checkbox" checked={i < ch.play.deathSaves.success} onChange={() => patch({ deathSaves: { ...ch.play.deathSaves, success: ch.play.deathSaves.success === i + 1 ? i : i + 1 } })} />)}</span>
          <span>Failure {[0, 1, 2].map((i) => <input key={i} type="checkbox" checked={i < ch.play.deathSaves.fail} onChange={() => patch({ deathSaves: { ...ch.play.deathSaves, fail: ch.play.deathSaves.fail === i + 1 ? i : i + 1 } })} />)}</span>
          <button onClick={() => requestRoll("Death save", "1d20")}>Roll</button>
        </div>
      )}
    </div>
  );
}

function Shield({ value }: { value: number }) {
  return (
    <div className="stat-shield" role="img" aria-label={`Armor class ${value}`}>
      <svg viewBox="0 0 100 116">
        <path d="M50 3 94 18v36c0 30-20 49-44 59C26 103 6 84 6 54V18z" fill="var(--panel2)" stroke="var(--accent)" strokeWidth="3" />
        <path d="M50 11 86 23v31c0 25-16 41-36 50C30 95 14 79 14 54V23z" fill="none" stroke="var(--gold)" strokeWidth="1" opacity=".6" />
        <text x="50" y="62" textAnchor="middle" className="ac-num">{value}</text>
        <text x="50" y="82" textAnchor="middle" className="ac-label">ARMOR</text>
        <text x="50" y="93" textAnchor="middle" className="ac-label">CLASS</text>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------- rests

function useRests(r: Resolved, ch: Character, sheet: SheetData, set: SetCharacter) {
  const features = sheet.features;
  const dieSize = Math.max(0, ...sheet.hitDice.map((h) => h.die));
  const conMod = sheet.abilities.find((a) => a.id === "constitution")!.mod;
  const total = sheet.level;
  const left = Math.max(0, total - ch.play.hitDiceUsed);
  const hp = ch.play.hp ?? sheet.hp;
  void r;
  const spendHitDie = () => {
    if (!left || !dieSize) return;
    const rolled = 1 + Math.floor(Math.random() * dieSize);
    const gain = Math.max(1, rolled + conMod);
    requestRoll("Hit die", `1d${dieSize}${conMod >= 0 ? "+" : ""}${conMod}`);
    set((c) => ({ ...c, play: { ...c.play, hp: Math.min(sheet.hp, (c.play.hp ?? sheet.hp) + gain), hitDiceUsed: c.play.hitDiceUsed + 1 } }));
  };
  const shortRest = () =>
    set((c) => {
      const uses = { ...c.play.featureUses };
      for (const f of features) if (/short rest/i.test(f.usage ?? "")) delete uses[f.id];
      return { ...c, play: { ...c.play, featureUses: uses } };
    });
  const longRest = () =>
    set((c) => ({
      ...c,
      play: {
        ...c.play, hp: sheet.hp, tempHp: 0, slotsUsed: {}, featureUses: {}, hitDiceUsed: Math.max(0, c.play.hitDiceUsed - Math.max(1, Math.floor(total / 2))),
        deathSaves: { success: 0, fail: 0 }, conditions: c.play.conditions.filter((x) => !/exhaustion/i.test(x) || false),
      },
    }));
  return { spendHitDie, shortRest, longRest, left, dieSize, hp };
}

// ---------------------------------------------------------------- tabs

function Actions({ r, ch, sheet, set }: { r: Resolved; ch: Character; sheet: SheetData; set: SetCharacter }) {
  const groups: [string, (f: FeatureLine) => boolean][] = [
    ["Actions", (f) => /^action$/i.test(f.action ?? "") || /^1 ?action/i.test(f.action ?? "")],
    ["Bonus actions", (f) => /bonus/i.test(f.action ?? "")],
    ["Reactions", (f) => /reaction/i.test(f.action ?? "")],
  ];
  const used = new Set<string>();
  const cantrips = sheet.casting.flatMap((c) => c.cantripsKnown.map((p) => r.reg.get(p.id)).filter((e): e is AElement => !!e));
  return (
    <>
      <Panel title="Attacks">
        {sheet.attacks.length === 0 && <p className="muted">Equip a weapon on the Equipment tab.</p>}
        {sheet.attacks.length > 0 && (
          <table className="attacks play-attacks">
            <thead><tr><th>Name</th><th>Hit / DC</th><th>Damage</th><th>Notes</th></tr></thead>
            <tbody>
              {sheet.attacks.map((a, i) => (
                <tr key={i}>
                  <td><b>{a.name}</b></td>
                  <td><button className="roll-btn" onClick={() => roll(`${a.name} attack`, a.bonus)}>{sign(a.bonus)}</button></td>
                  <td><button className="roll-btn" onClick={() => a.damage && requestRoll(`${a.name} damage`, a.damage.replace(/\s+/g, ""))}>{a.damage}</button> <small>{a.damageType}</small></td>
                  <td><small>{[a.properties, a.notes].filter(Boolean).join("; ")}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {cantrips.length > 0 && <p className="muted small-text">Cantrips: {cantrips.map((c) => c.name).join(", ")}. See the Spells tab to cast them.</p>}
      </Panel>
      {groups.map(([title, test]) => {
        const list = sheet.features.filter((f) => test(f) && !used.has(f.id));
        list.forEach((f) => used.add(f.id));
        if (!list.length) return null;
        return (
          <Panel key={title} title={title}>
            {list.map((f) => <FeatureRow key={f.id} f={f} ch={ch} set={set} />)}
          </Panel>
        );
      })}
    </>
  );
}

const RESET: Record<string, string> = { "long rest": "long rest", "short rest": "short rest", "short or long rest": "short or long rest", "dawn": "dawn", "day": "day" };

/** Pips show uses left (filled = available). The text says how many are left and when they come back. */
function Uses({ f, ch, set }: { f: FeatureLine; ch: Character; set: SetCharacter }) {
  const m = f.usage?.match(/^(\d+)\s*\/\s*(.*)$/);
  const n = m ? parseInt(m[1], 10) : 0;
  if (!n || n > 12) return f.usage ? <small className="muted">{f.usage}</small> : null;
  const used = Math.min(n, ch.play.featureUses[f.id] ?? 0);
  const left = n - used;
  const when = (m?.[2] ?? "").trim().toLowerCase();
  const toggle = (i: number) => set((c) => ({ ...c, play: { ...c.play, featureUses: { ...c.play.featureUses, [f.id]: usedAfterClick(n, used, i) } } }));
  return (
    <span className="uses" title="Click a pip to spend or restore a use">
      <span className="uses-pips">
        {Array.from({ length: n }, (_, i) => (
          <button key={i} aria-label={`Use ${i + 1}`} className={i < left ? "pip small" : "pip spent small"} onClick={() => toggle(i)} />
        ))}
      </span>
      <small className={left === 0 ? "uses-text out" : "uses-text"}>{left} of {n} left{when ? ` · back after ${RESET[when] ?? when}` : ""}</small>
    </span>
  );
}

function FeatureRow({ f, ch, set }: { f: FeatureLine; ch: Character; set: SetCharacter }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="feature-row">
      <button className="feature-head" onClick={() => setOpen(!open)}>
        <b>{f.name}</b>
        <small className="muted">{f.source}</small>
        <span className="chev">{open ? "▾" : "▸"}</span>
      </button>
      <Uses f={f} ch={ch} set={set} />
      {open && <p className="feature-text">{f.text || "No description."}</p>}
    </div>
  );
}

function Features({ ch, sheet, set }: { ch: Character; sheet: SheetData; set: SetCharacter }) {
  const groups: [string, string[]][] = [
    ["Class features", ["Class Feature"]], ["Subclass features", ["Archetype Feature"]], ["Species traits", ["Racial Trait"]], ["Feats", ["Feat", "Feat Feature"]], ["Background", ["Background Feature"]],
  ];
  return (
    <>
      {groups.map(([title, types]) => {
        const list = sheet.features.filter((f) => types.includes(f.type));
        if (!list.length) return null;
        return <Panel key={title} title={title}>{list.map((f) => <FeatureRow key={f.id} f={f} ch={ch} set={set} />)}</Panel>;
      })}
    </>
  );
}

function SpellRow({ id, r, casting, set, level }: { id: string; r: Resolved; casting: CastingLine; set: SetCharacter; level: number }) {
  const el = r.reg.get(id);
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState(0);
  if (!el) return null;
  const s = el.setters;
  const comps = [s.hasVerbalComponent?.value === "true" && "V", s.hasSomaticComponent?.value === "true" && "S", s.hasMaterialComponent?.value === "true" && "M"].filter(Boolean).join("");
  const options = casting.slots.filter((x) => x.level >= level && x.used < x.total);
  const chosen = options.find((o) => o.level === slot) ?? options[0];
  const cast = () => {
    if (level > 0 && !chosen) return;
    if (level > 0) set((c) => ({ ...c, play: { ...c.play, slotsUsed: { ...c.play.slotsUsed, [String(chosen!.level)]: (c.play.slotsUsed[String(chosen!.level)] ?? 0) + 1 } } }));
  };
  return (
    <div className="spell-row">
      <button className="feature-head" onClick={() => setOpen(!open)}>
        <b>{el.name}</b>
        <small className="muted">{s.time?.value} · {s.range?.value} · {comps}{s.isConcentration?.value === "true" ? " · C" : ""}{s.isRitual?.value === "true" ? " · R" : ""}</small>
        <span className="chev">{open ? "▾" : "▸"}</span>
      </button>
      {level > 0 ? (
        <span className="cast">
          {options.length > 1 && <select value={chosen?.level ?? ""} onChange={(e) => setSlot(Number(e.target.value))}>{options.map((o) => <option key={o.level} value={o.level}>Level {o.level}</option>)}</select>}
          <button disabled={!chosen} onClick={cast}>{chosen ? "Cast" : "No slots"}</button>
        </span>
      ) : null}
      {open && <Html html={el.description} />}
    </div>
  );
}

function Spells({ r, sheet, set }: { r: Resolved; sheet: SheetData; set: SetCharacter }) {
  if (!sheet.casting.length) return <p className="muted">This character does not cast spells.</p>;
  return (
    <>
      {sheet.casting.map((c) => {
        const levelOf = (id: string) => Number(r.reg.get(id)?.setters.level?.value ?? 0);
        const list = [...new Map([...c.cantripsKnown, ...c.granted, ...(c.prepare ? c.spells.filter((s) => s.prepared) : c.spells)].map((p) => [p.id, p])).values()];
        const levels = [...new Set(list.map((p) => levelOf(p.id)))].sort((a, b) => a - b);
        return (
          <div key={c.name}>
            <div className="spell-head">
              <div><small>Spellcasting</small><b>{c.name}</b></div>
              <div><small>Save DC</small><b>{c.dc}</b></div>
              <div><small>Spell attack</small><button className="roll-btn big" onClick={() => roll(`${c.name} spell attack`, c.attack)}>{sign(c.attack)}</button></div>
              {c.prepare && <div><small>Prepared</small><b>{c.spells.filter((s) => s.prepared).length}/{c.prepareMax}</b></div>}
            </div>
            <div className="slot-tracker">
              {c.slots.map((s) => (
                <div key={s.level} className="slot-level">
                  <small>{c.pactLevel ? `Pact ${s.level}` : `Level ${s.level}`}</small>
                  <div className="pips">
                    {Array.from({ length: s.total }, (_, i) => (
                      <button key={i} className={isAvailable(s.total, s.used, i) ? "pip" : "pip spent"} onClick={() => set((x) => { const used = x.play.slotsUsed[String(s.level)] ?? 0; return { ...x, play: { ...x.play, slotsUsed: { ...x.play.slotsUsed, [String(s.level)]: usedAfterClick(s.total, used, i) } } }; })} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {levels.map((lv) => (
              <Panel key={lv} title={lv === 0 ? "Cantrips" : `Level ${lv}`}>
                {list.filter((p) => levelOf(p.id) === lv).map((p) => <SpellRow key={p.id} id={p.id} r={r} casting={c} set={set} level={lv} />)}
              </Panel>
            ))}
          </div>
        );
      })}
    </>
  );
}

function Inventory({ r, ch, sheet, set }: { r: Resolved; ch: Character; sheet: SheetData; set: SetCharacter }) {
  const toggle = (uid: string) => set((c) => ({ ...c, inventory: c.inventory.map((i) => (i.uid === uid ? { ...i, equipped: !i.equipped } : i)) }));
  const equipped = ch.inventory.filter((i) => i.equipped);
  const rest = ch.inventory.filter((i) => !i.equipped);
  const row = (i: Character["inventory"][number]) => {
    const el = i.id ? r.reg.get(i.id) : undefined;
    return (
      <div key={i.uid} className="inv-row">
        <label className="check"><input type="checkbox" checked={i.equipped} onChange={() => toggle(i.uid)} /> <b>{i.qty > 1 ? `${i.qty} × ` : ""}{el?.name ?? i.custom?.name ?? i.id}</b></label>
        <small className="muted">{el?.type}{i.attuned ? " · attuned" : ""}</small>
      </div>
    );
  };
  return (
    <>
      <div className="spell-head">
        <div><small>Weight carried</small><b>{sheet.weight.carried} / {sheet.weight.capacity} lb</b></div>
        <div><small>Attuned</small><b>{sheet.attunement.current} / {sheet.attunement.max}</b></div>
        {(["pp", "gp", "ep", "sp", "cp"] as const).map((k) => (
          <div key={k}><small>{k.toUpperCase()}</small><input className="coin-in" type="number" min={0} value={ch.coins[k]} onChange={(e) => set((c) => ({ ...c, coins: { ...c.coins, [k]: Math.max(0, Number(e.target.value) || 0) } }))} /></div>
        ))}
      </div>
      <Panel title="Equipped">{equipped.length ? equipped.map(row) : <p className="muted">Nothing equipped.</p>}</Panel>
      <Panel title="Carried">{rest.length ? rest.map(row) : <p className="muted">Nothing else. Add gear on the Equipment tab.</p>}</Panel>
    </>
  );
}

function Description({ ch, sheet, set }: { ch: Character; sheet: SheetData; set: SetCharacter }) {
  const info = ch.info;
  const bits: [string, string][] = [["Alignment", info.alignment], ["Deity", info.deity], ["Appearance", [info.age, info.height, info.weight, info.eyes, info.hair, info.skin].filter(Boolean).join(", ")], ["Personality traits", info.traits], ["Ideals", info.ideals], ["Bonds", info.bonds], ["Flaws", info.flaws], ["Allies", info.allies]];
  return (
    <>
      <Panel title="Details">
        {bits.filter(([, v]) => v).map(([k, v]) => <p key={k}><b>{k}.</b> {v}</p>)}
        {sheet.lists.map((l) => <p key={l.name}><b>{l.name}.</b> {l.texts.join(" ")}</p>)}
        {!bits.some(([, v]) => v) && !sheet.lists.length && <p className="muted">Fill in details on the Manage tab.</p>}
      </Panel>
      {info.backstory && <Panel title="Backstory"><p>{info.backstory}</p></Panel>}
      <label className="field"><span>Edit backstory</span><textarea rows={5} value={info.backstory} onChange={(e) => set((c) => ({ ...c, info: { ...c.info, backstory: e.target.value } }))} /></label>
    </>
  );
}

// ---------------------------------------------------------------- page

type Tab = "actions" | "spells" | "inventory" | "features" | "description" | "notes" | "extras";

export function PlayTab({ r, ch, set }: { r: Resolved; ch: Character; set: SetCharacter }) {
  const sheet = useMemo(() => buildSheet(r), [r]);
  const head = headerInfo(r);
  const [tab, setTab] = useState<Tab>("actions");
  const rests = useRests(r, ch, sheet, set);
  const hasSpells = sheet.casting.length > 0;
  const nextXp = XP_TABLE[Math.min(19, sheet.level)] ?? 0;
  const prevXp = XP_TABLE[Math.max(0, sheet.level - 1)] ?? 0;
  const xpPct = nextXp > prevXp ? Math.max(0, Math.min(100, ((ch.xp - prevXp) / (nextXp - prevXp)) * 100)) : 100;
  const tabs: [Tab, string, boolean][] = [["actions", "Actions", true], ["spells", "Spells", hasSpells], ["inventory", "Inventory", true], ["features", "Features & Traits", true], ["description", "Description", true], ["notes", "Notes", true], ["extras", "Extras", sheet.features.length >= 0]];
  const companions = [...r.active.filter((a) => a.el.type === "Companion").map((a) => ({ el: a.el, name: a.el.name })), ...ch.companions.map((c) => ({ el: r.reg.get(c.id), name: c.name }))];

  return (
    <div className="play">
      <header className="play-head">
        <div className="play-id">
          {ch.portrait ? <img className="portrait-lg" src={ch.portrait} alt="" /> : <div className="portrait-lg ph">{(ch.name || "?").charAt(0)}</div>}
          <div>
            <h1>{ch.name || "Unnamed character"}</h1>
            <p className="muted">{head.species} · {head.classLine}{head.subclass !== "-" ? ` (${head.subclass})` : ""} · {head.background}</p>
            <div className="xp"><div style={{ width: `${xpPct}%` }} /><span>Level {sheet.level} · {ch.xp} / {nextXp || "max"} XP</span></div>
          </div>
        </div>
        <div className="play-buttons">
          <button className="inspire" onClick={() => set((c) => ({ ...c, play: { ...c.play, inspiration: !c.play.inspiration } }))}>{ch.play.inspiration ? "★ Inspired" : "☆ Inspiration"}</button>
          <button onClick={rests.shortRest}>Short rest</button>
          <button className="primary" onClick={rests.longRest}>Long rest</button>
        </div>
      </header>

      <div className="play-tools">
        <div className="rollmode-row"><small>d20 rolls</small><RollModeSwitch /></div>
        <Hint id="play-1">Click any modifier to roll it. Click a pip on a feature to spend a use.</Hint>
      </div>
      <div className="vital-row">
        <div className="ab-row">{sheet.abilities.map((a) => <AbilityBox key={a.id} id={a.id} a={a} />)}</div>
        <div className="stat-tiles">
          <div className="tile"><small>Proficiency</small><b>{sign(sheet.proficiency)}</b></div>
          <div className="tile"><small>Speed</small><b>{sheet.speed}<em> ft</em></b>{sheet.otherSpeeds.length > 0 && <small>{sheet.otherSpeeds.map((s) => `${s.kind} ${s.value}`).join(", ")}</small>}</div>
          <button className="tile" onClick={() => roll("Initiative", sheet.initiative)}><small>Initiative</small><b>{sign(sheet.initiative)}</b></button>
          <Shield value={sheet.ac.value} />
        </div>
        <Vitals ch={ch} sheet={sheet} set={set} />
      </div>

      {ch.play.conditions.length > 0 && <p className="warn">Conditions: {ch.play.conditions.join(", ")}</p>}
      <div className="hd-row">
        <span>Hit dice {rests.left} / {sheet.level} left ({sheet.hitDice.map((h) => `${h.count}d${h.die}`).join(" + ")})</span>
        <button disabled={!rests.left || rests.hp >= sheet.hp} onClick={rests.spendHitDie}>Spend a hit die</button>
      </div>

      <div className="play-grid">
        <aside className="play-side">
          <Panel title="Saving throws">
            {sheet.abilities.map((a) => (
              <button key={a.id} className="line-btn" onClick={() => roll(`${ABILITY_LABEL[a.id]} save`, a.save)}>
                <i className={a.saveProficient ? "dot on" : "dot"} /><span>{ABILITY_SHORT[a.id]}</span><em>{ABILITY_LABEL[a.id]}</em><b>{sign(a.save)}</b>
              </button>
            ))}
          </Panel>
          <Panel title="Senses">
            <div className="line"><span /><span>Passive Perception</span><b>{sheet.passivePerception}</b></div>
            <div className="line"><span /><span>Passive Investigation</span><b>{sheet.skills.find((s) => s.name === "investigation")?.passive}</b></div>
            <div className="line"><span /><span>Passive Insight</span><b>{sheet.skills.find((s) => s.name === "insight")?.passive}</b></div>
            {sheet.vision.length > 0 && <p className="muted small-text">{sheet.vision.join(", ")}</p>}
          </Panel>
          <Panel title="Training">
            {([["Armor", sheet.proficiencies.armor], ["Weapons", sheet.proficiencies.weapons], ["Tools", sheet.proficiencies.tools], ["Languages", sheet.proficiencies.languages]] as [string, string[]][])
              .filter(([, v]) => v.length)
              .map(([k, v]) => <p key={k} className="small-text"><b>{k}.</b> {v.map((x) => x.replace(/^(Armor|Weapon|Tool) Proficiency \((.*)\)$/, "$2")).join(", ")}</p>)}
          </Panel>
        </aside>

        <aside className="play-skills">
          <Panel title="Skills">
            <div className="skill-head"><span /><span>Mod</span><span>Skill</span><span>Bonus</span></div>
            {sheet.skills.map((s) => (
              <button key={s.name} className="skill-line" onClick={() => roll(skillLabel(s.name), s.bonus)}>
                <i className={s.level === "none" ? "dot" : s.level === "expertise" ? "dot on x2" : "dot on"} />
                <small>{ABILITY_SHORT[s.ability]}</small><span>{skillLabel(s.name)}</span><b>{sign(s.bonus)}</b>
              </button>
            ))}
          </Panel>
        </aside>

        <div className="play-main">
          <nav className="play-tabs">
            {tabs.filter(([, , show]) => show).map(([k, label]) => <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{label}</button>)}
          </nav>
          <div className="play-body">
            {tab === "actions" && <Actions r={r} ch={ch} sheet={sheet} set={set} />}
            {tab === "spells" && <Spells r={r} sheet={sheet} set={set} />}
            {tab === "inventory" && <Inventory r={r} ch={ch} sheet={sheet} set={set} />}
            {tab === "features" && <Features ch={ch} sheet={sheet} set={set} />}
            {tab === "description" && <Description ch={ch} sheet={sheet} set={set} />}
            {tab === "notes" && <label className="field"><span>Notes</span><textarea rows={16} value={ch.notes} onChange={(e) => set((c) => ({ ...c, notes: e.target.value }))} /></label>}
            {tab === "extras" && (
              <>
                {companions.length === 0 && <p className="muted">No companions. Add them on the Manage tab.</p>}
                {companions.map((c, i) => (c.el ? <div key={i}><h3>{c.name}</h3><CompanionCard el={c.el} /></div> : null))}
                <Panel title="Conditions">
                  <div className="chips">
                    {["Blinded", "Charmed", "Deafened", "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious"].map((cn) => {
                      const on = ch.play.conditions.includes(cn);
                      return <button key={cn} className={on ? "pill active" : "pill"} onClick={() => set((c) => ({ ...c, play: { ...c.play, conditions: on ? c.play.conditions.filter((x) => x !== cn) : [...c.play.conditions, cn] } }))}>{cn}</button>;
                    })}
                  </div>
                </Panel>
              </>
            )}
          </div>
        </div>
      </div>
      {r.warnings.length > 0 && <details className="muted"><summary>{r.warnings.length} content notes</summary>{r.warnings.slice(0, 8).map((w, i) => <p key={i}>{w}</p>)}</details>}
    </div>
  );
}
