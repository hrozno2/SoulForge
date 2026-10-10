import { useMemo, useState } from "react";
import type { AElement } from "../aurora/types";
import type { Resolved } from "../aurora/engine";
import { reqCtx } from "../aurora/engine";
import { meets } from "../aurora/requirements";
import {
  ABILITY_IDS, ABILITY_LABEL, POINT_BUY_BUDGET, POINT_BUY_COST, STANDARD_ARRAY, pointBuySpent, totalLevel, type AbilityId, type Character,
} from "../aurora/character";
import { SlotList, tabOfSlot, type SetCharacter } from "./Slots";
import { buildSheet } from "../aurora/sheet";
import { PickCards } from "./PickCards";

type Sub = "race" | "class" | "background" | "abilities" | "languages" | "proficiencies" | "feats";
const SUBS: [Sub, string][] = [["race", "Species"], ["class", "Class"], ["background", "Background"], ["abilities", "Ability scores"], ["languages", "Languages"], ["proficiencies", "Proficiencies"], ["feats", "Feats"]];

/** A grid of cards until something is chosen; then the choice with its follow-up questions and a way to change it. */
function ChosenOrCards({ kicker, title, label, items, value, onPick, onClear, onDetail, children }: { kicker: string; title: string; label: string; items: AElement[]; value?: string; onPick: (id: string) => void; onClear: () => void; onDetail: (e: AElement) => void; children: React.ReactNode }) {
  const [changing, setChanging] = useState(false);
  const cur = items.find((i) => i.id === value);
  if (!cur || changing) {
    return (
      <>
        {cur && <button className="more" onClick={() => setChanging(false)}>Keep {cur.name}</button>}
        <PickCards kicker={kicker} title={title} items={items} value={value} onPick={(id) => { onPick(id); setChanging(false); }} onDetail={onDetail} />
      </>
    );
  }
  return (
    <>
      <div className="slot done">
        <div className="slot-head" style={{ cursor: "default" }} onMouseEnter={() => onDetail(cur)}>
          <span className="slot-name">{label}</span>
          <span className="slot-chosen">{cur.name} <small className="muted">{cur.source}</small></span>
          <span />
          <span />
        </div>
        <div className="slot-body row">
          <button onClick={() => setChanging(true)}>Change</button>
          <button onClick={onClear}>Clear</button>
        </div>
      </div>
      {children}
    </>
  );
}

function ClassPanel({ r, ch, set, onDetail }: { r: Resolved; ch: Character; set: SetCharacter; onDetail: (e: AElement) => void }) {
  const classes = r.reg.ofType("Class").filter((c) => !c.compendiumHidden);
  const [adding, setAdding] = useState(false);
  const ctx = reqCtx(r);
  const level = totalLevel(ch);
  const setLevel = (i: number, delta: number) =>
    set((c) => {
      const next = c.classes.map((x, j) => (j === i ? { ...x, level: Math.max(1, Math.min(20, x.level + delta)) } : x));
      return { ...c, classes: next };
    });
  const remove = (i: number) => set((c) => ({ ...c, classes: c.classes.filter((_, j) => j !== i) }));
  const add = (id: string) => set((c) => ({ ...c, classes: [...c.classes, { classId: id, level: 1 }] }));
  const have = new Set(ch.classes.map((c) => c.classId));
  return (
    <>
      <div className="class-list">
        {ch.classes.map((c, i) => {
          const el = r.reg.get(c.classId);
          return (
            <div className="class-row" key={c.classId} onMouseEnter={() => el && onDetail(el)}>
              <b>{el?.name ?? c.classId}</b>
              <span className="muted">{i === 0 ? "starting class" : "multiclass"}</span>
              <span className="stepper">
                <button onClick={() => setLevel(i, -1)} disabled={c.level <= 1}>−</button>
                <span>Level {c.level}</span>
                <button onClick={() => setLevel(i, 1)} disabled={c.level >= 20 || level >= 20}>+</button>
              </span>
              <button onClick={() => remove(i)}>Remove</button>
            </div>
          );
        })}
        {!ch.classes.length && <p className="muted">Pick a class to start.</p>}
      </div>
      <div className="row">
        <button className="primary" onClick={() => setAdding(!adding)}>{adding ? "Close" : ch.classes.length ? "Add class (multiclass)" : "Choose class"}</button>
        {level >= 20 && <span className="muted">Level 20 is the maximum.</span>}
      </div>
      {adding && (
        <PickCards
          kicker={ch.classes.length ? "Add a class" : "Choose a class"} title={ch.classes.length ? "Branch out." : "Claim your role."}
          items={classes.filter((c) => !have.has(c.id) && (!ch.classes.length || !c.multiclass || meets(c.multiclass.requirements, ctx)))} onPick={(id) => { add(id); setAdding(false); }} onDetail={onDetail}
        />
      )}
      {ch.classes.map((c) => {
        const slots = r.slots.filter((s) => tabOfSlot(s) === "class" && s.root === `class:${c.classId}`);
        const el = r.reg.get(c.classId);
        return (
          <section key={c.classId}>
            <h3>{el?.name} choices</h3>
            <SlotList slots={slots} r={r} set={set} onDetail={onDetail} empty="No choices yet at this level." />
          </section>
        );
      })}
    </>
  );
}

function Abilities({ r, ch, set, onDetail }: { r: Resolved; ch: Character; set: SetCharacter; onDetail: (e: AElement) => void }) {
  const spent = pointBuySpent(ch.abilityBase);
  const sheet = buildSheet(r);
  const setBase = (a: AbilityId, v: number) => set((c) => ({ ...c, abilityBase: { ...c.abilityBase, [a]: v } }));
  const setMethod = (m: Character["abilityMethod"]) =>
    set((c) => ({
      ...c,
      abilityMethod: m,
      abilityBase: m === "pointbuy" ? { strength: 8, dexterity: 8, constitution: 8, intelligence: 8, wisdom: 8, charisma: 8 } : m === "standard" ? { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 } : c.abilityBase,
    }));
  const bonusOf = (a: AbilityId) => r.stats.contributions(a).filter((x) => !x.inline);
  return (
    <>
      <div className="row">
        {(["pointbuy", "standard", "manual"] as const).map((m) => (
          <button key={m} className={ch.abilityMethod === m ? "pill active" : "pill"} onClick={() => setMethod(m)}>
            {m === "pointbuy" ? "Point buy" : m === "standard" ? "Standard array" : "Manual / rolled"}
          </button>
        ))}
        {ch.abilityMethod === "pointbuy" && <span className={spent > POINT_BUY_BUDGET ? "warn" : "muted"}>{spent} / {POINT_BUY_BUDGET} points</span>}
      </div>
      <table className="abilities">
        <thead><tr><th>Ability</th><th>Base</th><th>Bonuses</th><th className="final">Score</th><th className="final">Mod</th></tr></thead>
        <tbody>
          {ABILITY_IDS.map((a) => {
            const line = sheet.abilities.find((x) => x.id === a)!;
            const bonuses = bonusOf(a);
            return (
              <tr key={a}>
                <td>{ABILITY_LABEL[a]}</td>
                <td>
                  {ch.abilityMethod === "pointbuy" ? (
                    <span className="stepper">
                      <button onClick={() => setBase(a, ch.abilityBase[a] - 1)} disabled={ch.abilityBase[a] <= 8}>−</button>
                      <span>{ch.abilityBase[a]}</span>
                      <button onClick={() => setBase(a, ch.abilityBase[a] + 1)} disabled={ch.abilityBase[a] >= 15 || spent - (POINT_BUY_COST[ch.abilityBase[a]] ?? 0) + (POINT_BUY_COST[ch.abilityBase[a] + 1] ?? 99) > POINT_BUY_BUDGET}>+</button>
                    </span>
                  ) : ch.abilityMethod === "standard" ? (
                    <select value={ch.abilityBase[a]} onChange={(e) => setBase(a, Number(e.target.value))}>
                      {STANDARD_ARRAY.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  ) : (
                    <input type="number" min={1} max={30} value={ch.abilityBase[a]} onChange={(e) => setBase(a, Number(e.target.value) || 0)} style={{ width: 64 }} />
                  )}
                </td>
                <td className="muted">{bonuses.map((b) => `${b.value.startsWith("-") ? "" : "+"}${b.value} ${b.from}`).join(", ")}</td>
                <td className="final">{line.score}</td>
                <td className="final">{line.mod >= 0 ? `+${line.mod}` : line.mod}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {ch.abilityMethod === "standard" && new Set(ABILITY_IDS.map((a) => ch.abilityBase[a])).size < 6 && <p className="warn">Each number of the standard array can be used once.</p>}
      <h3>Increases from your choices</h3>
      <SlotList slots={r.slots.filter((s) => tabOfSlot(s) === "abilities")} r={r} set={set} onDetail={onDetail} empty="No ability score choices yet. Pick a background or class first." />
    </>
  );
}

function ActiveList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <>
      <h3>{title}</h3>
      <div className="chips">{items.map((i) => <span key={i} className="chip">{i}</span>)}</div>
    </>
  );
}

export function BuildTab({ r, ch, set, onDetail }: { r: Resolved; ch: Character; set: SetCharacter; onDetail: (e: AElement) => void }) {
  const [sub, setSub] = useState<Sub>("race");
  const sheet = useMemo(() => buildSheet(r), [r]);
  const pending = (s: Sub) => r.slots.filter((x) => tabOfSlot(x) === s && !x.rule.optional && x.chosen.length < x.rule.number).length;
  const of = (s: Sub) => r.slots.filter((x) => tabOfSlot(x) === s);
  const races = r.reg.ofType("Race");
  const backgrounds = r.reg.ofType("Background");
  return (
    <div>
      <nav className="subtabs">
        {SUBS.map(([k, label]) => {
          const n = k === "class" ? ch.classes.length ? pending("class") : 1 : k === "race" ? (ch.race ? 0 : 1) + pending("race") : k === "background" ? (ch.background ? 0 : 1) + pending("background") : pending(k);
          return (
            <button key={k} className={sub === k ? "subtab active" : "subtab"} onClick={() => setSub(k)}>
              {label}{n > 0 && <span className="badge">{n}</span>}
            </button>
          );
        })}
      </nav>
      {sub === "race" && (
        <ChosenOrCards kicker="Choose a species" title="Pick your heritage." label="Species" items={races} value={ch.race} onPick={(id) => set((c) => ({ ...c, race: id }))} onClear={() => set((c) => ({ ...c, race: undefined }))} onDetail={onDetail}>
          <SlotList slots={of("race")} r={r} set={set} onDetail={onDetail} />
        </ChosenOrCards>
      )}
      {sub === "class" && <ClassPanel r={r} ch={ch} set={set} onDetail={onDetail} />}
      {sub === "background" && (
        <ChosenOrCards kicker="Choose a background" title="Where did you come from?" label="Background" items={backgrounds} value={ch.background} onPick={(id) => set((c) => ({ ...c, background: id }))} onClear={() => set((c) => ({ ...c, background: undefined }))} onDetail={onDetail}>
          <SlotList slots={of("background")} r={r} set={set} onDetail={onDetail} />
        </ChosenOrCards>
      )}
      {sub === "abilities" && <Abilities r={r} ch={ch} set={set} onDetail={onDetail} />}
      {sub === "languages" && (
        <>
          <SlotList slots={of("languages")} r={r} set={set} onDetail={onDetail} empty="No language choices right now." />
          <ActiveList title="Known languages" items={sheet.proficiencies.languages} />
        </>
      )}
      {sub === "proficiencies" && (
        <>
          <SlotList slots={of("proficiencies")} r={r} set={set} onDetail={onDetail} empty="No proficiency choices right now." />
          <ActiveList title="Armor" items={sheet.proficiencies.armor} />
          <ActiveList title="Weapons" items={sheet.proficiencies.weapons} />
          <ActiveList title="Tools" items={sheet.proficiencies.tools} />
          <ActiveList title="Skills" items={sheet.skills.filter((s) => s.level !== "none").map((s) => `${s.name}${s.level === "expertise" ? " (expertise)" : ""}`)} />
        </>
      )}
      {sub === "feats" && (
        <>
          <SlotList slots={of("feats")} r={r} set={set} onDetail={onDetail} empty="No feat choices yet. Feats come from your species, background and class levels." />
          <ActiveList title="Your feats" items={r.active.filter((a) => a.el.type === "Feat").map((a) => a.el.name)} />
        </>
      )}
    </div>
  );
}
