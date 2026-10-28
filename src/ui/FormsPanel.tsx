import { useMemo, useState } from "react";
import type { Resolved } from "../aurora/engine";
import { formStats, type FormBlock, type FormKind } from "../aurora/forms";
import type { Character } from "../aurora/character";
import type { AElement } from "../aurora/types";
import { FORM_KINDS, applyDamage, applyHealing, statBlockHp, trackedHp, type WildShape } from "./hpModel";
import { CompanionCard } from "./ManageTab";
import type { ARegistry } from "../aurora/registry";

type SetCharacter = (fn: (c: Character) => Character) => void;

interface Tracked {
  key: string;
  name: string;
  el?: AElement;
}

const SIGNED = (n: number) => (n >= 0 ? `+${n}` : String(n));
const ABBR = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

/** The rules a kind of form follows (src/aurora/forms.ts): Wild Shape keeps the mind, the spells take the beast whole. */
const formKind = (k: WildShape["kind"]): FormKind | undefined => (k === "wildshape" ? "wild shape" : k === "polymorph" || k === "truepoly" ? "polymorph" : undefined);

/**
 * A form worked out for this character (C5.3, on A2.6's formStats), like a spell card: AC, hit points, speed, the six
 * scores, the saves and the skills that differ from the beast's own, and how each number came about.
 */
export function FormCard({ b }: { b: FormBlock }) {
  const abilities = Object.values(b.abilities);
  const saves = Object.values(b.saves);
  const skills = b.skills.filter((k) => k.bonus !== 0).sort((x, y) => y.bonus - x.bonus).slice(0, 8);
  return (
    <div className="form-card" aria-label={`${b.name} as ${b.kind}`}>
      <div className="form-card-head"><b>{b.name}</b><small className="muted">{b.kind === "wild shape" ? `Wild Shape (${b.rules} rules)` : b.kind === "polymorph" ? "Polymorph" : "Companion"}</small></div>
      <div className="form-card-vitals">
        <span><small>AC</small><b>{b.ac}</b></span>
        <span><small>HP</small><b>{b.hp}</b></span>
        {b.tempHp > 0 && <span><small>Temp HP</small><b>{b.tempHp}</b></span>}
        <span><small>Speed</small><b>{b.speed || "-"}</b></span>
      </div>
      <div className="form-card-abilities">
        {abilities.map((v, i) => <span key={ABBR[i]}><small>{ABBR[i]}</small><b>{v}</b><em>{SIGNED(Math.floor((v - 10) / 2))}</em><i title="Saving throw">save {SIGNED(saves[i])}</i></span>)}
      </div>
      {skills.length > 0 && <p className="form-card-skills">{skills.map((k) => `${k.name.replace(/\b\w/g, (c) => c.toUpperCase())} ${SIGNED(k.bonus)}`).join(" · ")}</p>}
      {b.notes.length > 0 && <ul className="form-card-notes">{b.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </div>
  );
}

/** Hit points for companions and mounts, and a tracker for a wild shape form. */
export function FormsPanel({ r, ch, set, companions, reg }: { r?: Resolved; ch: Character; set: SetCharacter; companions: Tracked[]; reg: ARegistry }) {
  const patch = (p: Partial<Character["play"]>) => set((c) => ({ ...c, play: { ...c.play, ...p } }));
  const ws = ch.play.wildShape;
  const [kind, setKind] = useState<NonNullable<WildShape["kind"]>>("wildshape");
  const [query, setQuery] = useState("");
  const [beastsOnly, setBeastsOnly] = useState(true);
  const [pickedId, setPickedId] = useState<string | undefined>();
  const [showBlock, setShowBlock] = useState(false);
  const [name, setName] = useState("");
  const [max, setMax] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const amt = (k: string) => Math.max(0, Math.floor(Number(amounts[k]) || 0));
  const matches = (() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [] as AElement[];
    return reg.ofType("Companion").filter((c) => c.name.toLowerCase().includes(q) && (!beastsOnly || /beast/i.test(c.setters.type?.value ?? "") || !c.setters.type?.value)).slice(0, 30);
  })();
  const clear = (k: string) => setAmounts((a) => ({ ...a, [k]: "" }));
  // The picked creature, or the active form's, worked out for this character.
  const blockFor = (id: string | undefined, k: WildShape["kind"]) => {
    const el = id ? reg.get(id) : undefined;
    const fk = formKind(k);
    if (!r || !el || !fk) return undefined;
    try { return formStats(r, el, fk); } catch { return undefined; }
  };
  const preview = useMemo(() => blockFor(pickedId, kind), [r, pickedId, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = useMemo(() => (ws ? blockFor(ws.creatureId, ws.kind) : undefined), [r, ws]); // eslint-disable-line react-hooks/exhaustive-deps
  const hpOf = (c: Tracked) => ({ max: statBlockHp(c.el?.setters.hp?.value), cur: trackedHp(ch.play.companionHp, c.key, statBlockHp(c.el?.setters.hp?.value)) });
  const setHp = (key: string, v: number) => patch({ companionHp: { ...(ch.play.companionHp ?? {}), [key]: v } });

  return (
    <section className="block forms-panel">
      <h3>Wild Shape and other forms</h3>
      {ws ? (
        <>
          <div className="row">
            <b>{ws.name}</b>
            <small className="muted">{FORM_KINDS.find((k) => k.kind === (ws.kind ?? "wildshape"))?.label}</small>
            {ws.ownHp ? <span className="muted">your own hit points{ch.play.tempHp ? `, ${ch.play.tempHp} temporary` : ""}</span> : <span>{ws.hp} / {ws.maxHp} HP</span>}
            {!ws.ownHp && (
              <>
                <input type="number" min={0} aria-label="Wild Shape damage or healing" placeholder="Amount" value={amounts.ws ?? ""} onChange={(e) => setAmounts((a) => ({ ...a, ws: e.target.value }))} />
                <button onClick={() => { patch({ wildShape: applyDamage({ hp: ch.play.hp ?? 0, tempHp: ch.play.tempHp, wildShape: ws }, amt("ws")).wildShape }); clear("ws"); }}>Damage</button>
                <button onClick={() => { patch({ wildShape: applyHealing({ hp: ch.play.hp ?? 0, tempHp: ch.play.tempHp, wildShape: ws }, amt("ws"), 0).wildShape }); clear("ws"); }}>Heal</button>
              </>
            )}
            <button onClick={() => patch({ wildShape: undefined, ...(ws.kind === "polymorph" || ws.kind === "truepoly" ? { concentration: undefined } : {}) })}>Revert</button>
          </div>
          {active && <FormCard b={active} />}
          {ws.creatureId && reg.get(ws.creatureId) && (
            <details className="form-block" open={showBlock} onToggle={(e) => setShowBlock((e.target as HTMLDetailsElement).open)}>
              <summary>Stat block</summary>
              <CompanionCard el={reg.get(ws.creatureId)!} />
            </details>
          )}
        </>
      ) : (
        <>
          <div className="row">
            <select aria-label="Kind of form" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              {FORM_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
            </select>
            <input type="search" aria-label="Find a creature" placeholder="Find a creature in your content" value={query} onChange={(e) => setQuery(e.target.value)} />
            <label className="check small"><input type="checkbox" checked={beastsOnly} onChange={() => setBeastsOnly(!beastsOnly)} /> beasts only</label>
          </div>
          {matches.length > 0 && (
            <ul className="options boxed form-matches">
              {matches.map((c) => (
                <li key={c.id}><button onClick={() => { setPickedId(c.id); setName(c.name); setMax(String(blockFor(c.id, kind)?.hp || statBlockHp(c.setters.hp?.value) || "")); setQuery(""); }}><span className="opt-name">{c.name}</span><span className="opt-meta">{[c.setters.size?.value, c.setters.type?.value, c.setters.challenge?.value && `CR ${c.setters.challenge.value}`].filter(Boolean).join(" · ")}</span><span className="opt-src" title={c.source}>{c.source}</span></button></li>
              ))}
            </ul>
          )}
          {preview && <FormCard b={preview} />}
          {pickedId && reg.get(pickedId) && <details className="form-block"><summary>Stat block: {reg.get(pickedId)!.name}</summary><CompanionCard el={reg.get(pickedId)!} /></details>}
          <div className="row">
            <input placeholder="Form, for example Brown Bear" value={name} onChange={(e) => { setName(e.target.value); setPickedId(undefined); }} />
            <input type="number" min={1} placeholder="Form HP" aria-label="Form hit points" value={max} onChange={(e) => setMax(e.target.value)} />
            <button disabled={!name.trim() || !Number(max)} onClick={() => {
              const conc = FORM_KINDS.find((k) => k.kind === kind)?.concentration;
              // 2024 Wild Shape: no form pool; the character keeps their hit points and gains the temporary ones
              // (which do not stack: the higher stays).
              const own = preview?.kind === "wild shape" && preview.rules === "2024";
              set((c) => ({ ...c, play: { ...c.play, wildShape: { name: name.trim(), hp: own ? 0 : Number(max), maxHp: own ? 0 : Number(max), kind, creatureId: pickedId, ...(own ? { ownHp: true } : {}) }, ...(own ? { tempHp: Math.max(c.play.tempHp, preview.tempHp) } : {}), ...(conc ? { concentration: conc } : {}) } }));
              setName(""); setMax(""); setPickedId(undefined);
            }}>Assume form</button>
          </div>
          <p className="muted small-text">{FORM_KINDS.find((k) => k.kind === kind)?.hint}</p>
        </>
      )}
      <p className="muted">While shaped, damage hits the form first. Whatever is left over carries to the character.</p>
      {companions.length > 0 && <h3>Companion hit points</h3>}
      {companions.map((c) => {
        const { max: m, cur } = hpOf(c);
        return (
          <div key={c.key} className="row companion-hp">
            <b>{c.name}</b>
            {m > 0 ? <span>{cur} / {m}</span> : <span className="muted">no hit points listed</span>}
            {m > 0 && (
              <>
                <input type="number" min={0} aria-label={`${c.name} damage or healing`} placeholder="Amount" value={amounts[c.key] ?? ""} onChange={(e) => setAmounts((a) => ({ ...a, [c.key]: e.target.value }))} />
                <button onClick={() => { setHp(c.key, Math.max(0, cur - amt(c.key))); clear(c.key); }}>Damage</button>
                <button onClick={() => { setHp(c.key, Math.min(m, cur + amt(c.key))); clear(c.key); }}>Heal</button>
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}
