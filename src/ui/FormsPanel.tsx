import { useState } from "react";
import type { Character } from "../aurora/character";
import type { AElement } from "../aurora/types";
import { applyDamage, applyHealing, statBlockHp, trackedHp } from "./hpModel";

type SetCharacter = (fn: (c: Character) => Character) => void;

interface Tracked {
  key: string;
  name: string;
  el?: AElement;
}

/** Hit points for companions and mounts, and a tracker for a wild shape form. */
export function FormsPanel({ ch, set, companions }: { ch: Character; set: SetCharacter; companions: Tracked[] }) {
  const patch = (p: Partial<Character["play"]>) => set((c) => ({ ...c, play: { ...c.play, ...p } }));
  const ws = ch.play.wildShape;
  const [name, setName] = useState("");
  const [max, setMax] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const amt = (k: string) => Math.max(0, Math.floor(Number(amounts[k]) || 0));
  const clear = (k: string) => setAmounts((a) => ({ ...a, [k]: "" }));
  const hpOf = (c: Tracked) => ({ max: statBlockHp(c.el?.setters.hp?.value), cur: trackedHp(ch.play.companionHp, c.key, statBlockHp(c.el?.setters.hp?.value)) });
  const setHp = (key: string, v: number) => patch({ companionHp: { ...(ch.play.companionHp ?? {}), [key]: v } });

  return (
    <section className="block forms-panel">
      <h3>Wild Shape</h3>
      {ws ? (
        <div className="row">
          <b>{ws.name}</b>
          <span>{ws.hp} / {ws.maxHp} HP</span>
          <input type="number" min={0} aria-label="Wild Shape damage or healing" placeholder="Amount" value={amounts.ws ?? ""} onChange={(e) => setAmounts((a) => ({ ...a, ws: e.target.value }))} />
          <button onClick={() => { patch({ wildShape: applyDamage({ hp: ch.play.hp ?? 0, tempHp: ch.play.tempHp, wildShape: ws }, amt("ws")).wildShape }); clear("ws"); }}>Damage</button>
          <button onClick={() => { patch({ wildShape: applyHealing({ hp: ch.play.hp ?? 0, tempHp: ch.play.tempHp, wildShape: ws }, amt("ws"), 0).wildShape }); clear("ws"); }}>Heal</button>
          <button onClick={() => patch({ wildShape: undefined })}>Revert</button>
        </div>
      ) : (
        <div className="row">
          <input placeholder="Form, for example Brown Bear" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="number" min={1} placeholder="Form HP" aria-label="Form hit points" value={max} onChange={(e) => setMax(e.target.value)} />
          <button disabled={!name.trim() || !Number(max)} onClick={() => { patch({ wildShape: { name: name.trim(), hp: Number(max), maxHp: Number(max) } }); setName(""); setMax(""); }}>Assume form</button>
        </div>
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
