import { useState } from "react";
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

/** Hit points for companions and mounts, and a tracker for a wild shape form. */
export function FormsPanel({ ch, set, companions, reg }: { ch: Character; set: SetCharacter; companions: Tracked[]; reg: ARegistry }) {
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
            <span>{ws.hp} / {ws.maxHp} HP</span>
            <input type="number" min={0} aria-label="Wild Shape damage or healing" placeholder="Amount" value={amounts.ws ?? ""} onChange={(e) => setAmounts((a) => ({ ...a, ws: e.target.value }))} />
            <button onClick={() => { patch({ wildShape: applyDamage({ hp: ch.play.hp ?? 0, tempHp: ch.play.tempHp, wildShape: ws }, amt("ws")).wildShape }); clear("ws"); }}>Damage</button>
            <button onClick={() => { patch({ wildShape: applyHealing({ hp: ch.play.hp ?? 0, tempHp: ch.play.tempHp, wildShape: ws }, amt("ws"), 0).wildShape }); clear("ws"); }}>Heal</button>
            <button onClick={() => patch({ wildShape: undefined, ...(ws.kind === "polymorph" || ws.kind === "truepoly" ? { concentration: undefined } : {}) })}>Revert</button>
          </div>
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
                <li key={c.id}><button onClick={() => { setPickedId(c.id); setName(c.name); setMax(String(statBlockHp(c.setters.hp?.value) || "")); setQuery(""); }}><span className="opt-name">{c.name}</span><span className="opt-meta">{[c.setters.size?.value, c.setters.type?.value, c.setters.challenge?.value && `CR ${c.setters.challenge.value}`].filter(Boolean).join(" · ")}</span><span className="opt-src" title={c.source}>{c.source}</span></button></li>
              ))}
            </ul>
          )}
          {pickedId && reg.get(pickedId) && <details className="form-block"><summary>Stat block: {reg.get(pickedId)!.name}</summary><CompanionCard el={reg.get(pickedId)!} /></details>}
          <div className="row">
            <input placeholder="Form, for example Brown Bear" value={name} onChange={(e) => { setName(e.target.value); setPickedId(undefined); }} />
            <input type="number" min={1} placeholder="Form HP" aria-label="Form hit points" value={max} onChange={(e) => setMax(e.target.value)} />
            <button disabled={!name.trim() || !Number(max)} onClick={() => {
              const conc = FORM_KINDS.find((k) => k.kind === kind)?.concentration;
              set((c) => ({ ...c, play: { ...c.play, wildShape: { name: name.trim(), hp: Number(max), maxHp: Number(max), kind, creatureId: pickedId }, ...(conc ? { concentration: conc } : {}) } }));
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
