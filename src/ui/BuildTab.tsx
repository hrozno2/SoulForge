import { RulesCheckBar } from "./RulesCheck";
import { STANDARD_RULES, canLower, canRaise, clampBase, normalizeRules, spent as pbSpent } from "../aurora/pointBuy";
import { useMemo, useState } from "react";
import type { AElement } from "../aurora/types";
import { stillToChoose, type Resolved } from "../aurora/engine";
import {
  ABILITY_IDS, ABILITY_LABEL, STANDARD_ARRAY, totalLevel, type AbilityId, type Character,
} from "../aurora/character";
import { SlotList, tabOfSlot, type SetCharacter } from "./Slots";
import { buildSheet } from "../aurora/sheet";
import { ChosenBanner, PickCards } from "./PickCards";
import { multiclassLock } from "./multiclass";

export type Sub = "race" | "class" | "background" | "abilities" | "languages" | "proficiencies" | "feats";
export const SUBS: [Sub, string][] = [["race", "Species"], ["class", "Class"], ["background", "Background"], ["abilities", "Ability scores"], ["languages", "Languages"], ["proficiencies", "Proficiencies"], ["feats", "Feats"]];

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
      <ChosenBanner el={cur} label={`Your ${label.toLowerCase()}`} onHover={onDetail}>
        <button className="ghost" onClick={onClear}>Clear</button>
        <button className="pick-select" onClick={() => setChanging(true)}>Change</button>
      </ChosenBanner>
      {children}
    </>
  );
}

/**
 * The chosen classes with their levels and choices. `picker` off leaves picking a class to the caller (the build
 * board lists them beside); `compact` shows each class as a plain row, for when its card is already on show.
 */
export function ClassPanel({ r, ch, set, onDetail, picker = true, compact = false }: { r: Resolved; ch: Character; set: SetCharacter; onDetail: (e: AElement) => void; picker?: boolean; compact?: boolean }) {
  const classes = r.reg.ofType("Class").filter((c) => !c.compendiumHidden);
  const [adding, setAdding] = useState(false);
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
          if (el && compact) {
            return (
              <div className="class-row compact" key={c.classId}>
                <b>{el.name}</b><small className="muted">{i === 0 ? "starting class" : "multiclass"}</small>
                <span className="stepper">
                  <button onClick={() => setLevel(i, -1)} disabled={c.level <= 1} aria-label="Level down">−</button>
                  <span>Level {c.level}</span>
                  <button onClick={() => setLevel(i, 1)} disabled={c.level >= 20 || level >= 20} aria-label="Level up">+</button>
                </span>
                <button className="ghost" onClick={() => remove(i)}>Remove</button>
              </div>
            );
          }
          return (
            el ? (
              <ChosenBanner key={c.classId} el={el} label={i === 0 ? "Starting class" : "Multiclass"} onHover={onDetail}>
                <span className="stepper">
                  <button onClick={() => setLevel(i, -1)} disabled={c.level <= 1} aria-label="Level down">−</button>
                  <span>Level {c.level}</span>
                  <button onClick={() => setLevel(i, 1)} disabled={c.level >= 20 || level >= 20} aria-label="Level up">+</button>
                </span>
                <button className="ghost" onClick={() => remove(i)}>Remove</button>
              </ChosenBanner>
            ) : (
              <div className="class-row" key={c.classId}><b>{c.classId}</b><button onClick={() => remove(i)}>Remove</button></div>
            )
          );
        })}
        {!ch.classes.length && <p className="muted">Pick a class to start.</p>}
      </div>
      {picker && <div className="row">
        <button className="primary" onClick={() => setAdding(!adding)}>{adding ? "Close" : ch.classes.length ? "Add class (multiclass)" : "Choose class"}</button>
        {level >= 20 && <span className="muted">Level 20 is the maximum.</span>}
      </div>}
      {picker && adding && (
        <PickCards
          kicker={ch.classes.length ? "Add a class" : "Choose a class"} title={ch.classes.length ? "Branch out." : "Claim your role."}
          items={classes.filter((c) => !have.has(c.id))} onPick={(id) => { add(id); setAdding(false); }} onDetail={onDetail}
          disabledReason={ch.classes.length ? (c) => multiclassLock(r, c) : undefined}
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

export function Abilities({ r, ch, set, onDetail }: { r: Resolved; ch: Character; set: SetCharacter; onDetail: (e: AElement) => void }) {
  const rules = normalizeRules(ch.pointBuy);
  const spent = pbSpent(rules, ch.abilityBase);
  const setRules = (p: Partial<typeof rules>, resetCosts = false) => set((c) => {
    const next = normalizeRules({ ...normalizeRules(c.pointBuy), ...p, costs: resetCosts ? undefined : { ...normalizeRules(c.pointBuy).costs, ...(p.costs ?? {}) } });
    return { ...c, pointBuy: next, abilityBase: c.abilityMethod === "pointbuy" ? clampBase(next, c.abilityBase) : c.abilityBase };
  });
  const sheet = buildSheet(r);
  const setBase = (a: AbilityId, v: number) => set((c) => ({ ...c, abilityBase: { ...c.abilityBase, [a]: v } }));
  const setMethod = (m: Character["abilityMethod"]) =>
    set((c) => ({
      ...c,
      abilityMethod: m,
      abilityBase: m === "pointbuy" ? (() => { const lo = normalizeRules(c.pointBuy).min; return { strength: lo, dexterity: lo, constitution: lo, intelligence: lo, wisdom: lo, charisma: lo }; })() : m === "standard" ? { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 } : c.abilityBase,
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
        {ch.abilityMethod === "pointbuy" && <span className={spent > rules.budget ? "warn" : "muted"}>{spent} / {rules.budget} points</span>}
      </div>
      {ch.abilityMethod === "pointbuy" && (
        <details className="pb-rules">
          <summary>Point buy rules{JSON.stringify(rules) === JSON.stringify(STANDARD_RULES) ? " (standard)" : " (custom)"}</summary>
          <div className="row">
            <label>Points to spend <input type="number" min={0} max={999} value={rules.budget} onChange={(e) => setRules({ budget: Number(e.target.value) })} /></label>
            <label>Lowest score <input type="number" min={1} max={30} value={rules.min} onChange={(e) => setRules({ min: Number(e.target.value) })} /></label>
            <label>Highest score <input type="number" min={1} max={30} value={rules.max} onChange={(e) => setRules({ max: Number(e.target.value) })} /></label>
            <button onClick={() => set((c) => ({ ...c, pointBuy: undefined, abilityBase: clampBase(STANDARD_RULES, c.abilityBase) }))}>Standard rules</button>
          </div>
          <table className="pb-costs">
            <thead><tr><th>Score</th>{Array.from({ length: rules.max - rules.min + 1 }, (_, i) => <th key={i}>{rules.min + i}</th>)}</tr></thead>
            <tbody><tr><td>Total cost</td>{Array.from({ length: rules.max - rules.min + 1 }, (_, i) => { const sc = rules.min + i; return <td key={sc}><input type="number" aria-label={`Cost of ${sc}`} value={rules.costs[sc]} onChange={(e) => setRules({ costs: { [sc]: Number(e.target.value) } })} /></td>; })}</tr></tbody>
          </table>
          <p className="muted">The cost is the total points a score costs from nothing, so the step up from 13 to 14 costs the difference between the two. The standard table is 27 points over 8 to 15.</p>
        </details>
      )}
      <table className="abilities">
        <thead><tr><th>Ability</th><th>Base</th><th>Bonuses</th><th title="Your own modifier, for table rulings or items the content lacks">Custom</th><th className="final">Score</th><th className="final">Mod</th></tr></thead>
        <tbody>
          {ABILITY_IDS.map((a) => {
            const line = sheet.abilities.find((x) => x.id === a)!;
            const bonuses = bonusOf(a).filter((b) => b.from !== "Custom bonus" && !b.from.startsWith("Custom"));
            const custom = ch.customStats.find((c) => c.stat === a && c.id.startsWith("ability-"));
            const setCustom = (v: number) => set((c) => {
              const rest = c.customStats.filter((x) => !(x.stat === a && x.id.startsWith("ability-")));
              return { ...c, customStats: v ? [...rest, { id: `ability-${a}`, stat: a, value: v, note: "Custom bonus" }] : rest };
            });
            return (
              <tr key={a}>
                <td>{ABILITY_LABEL[a]}</td>
                <td>
                  {ch.abilityMethod === "pointbuy" ? (
                    <span className="stepper">
                      <button onClick={() => setBase(a, ch.abilityBase[a] - 1)} disabled={!canLower(rules, ch.abilityBase, a)}>−</button>
                      <span>{ch.abilityBase[a]}</span>
                      <button onClick={() => setBase(a, ch.abilityBase[a] + 1)} disabled={!canRaise(rules, ch.abilityBase, a)}>+</button>
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
                <td><input className="custom-in" type="number" value={custom?.value ?? ""} placeholder="0" onChange={(e) => setCustom(Number(e.target.value) || 0)} /></td>
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

export function ActiveList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <>
      <h3>{title}</h3>
      <div className="chips">{items.map((i) => <span key={i} className="chip">{i}</span>)}</div>
    </>
  );
}

/** What is still to do on a part of the build, for the number badges and their hover lists. */
export function todoFor(r: Resolved, ch: Character, s: Sub): string[] {
  const lines: string[] = [];
  if (s === "race" && !ch.race) lines.push("Choose a species");
  if (s === "class" && !ch.classes.length) lines.push("Choose a class");
  if (s === "background" && !ch.background) lines.push("Choose a background");
  for (const x of r.slots.filter((x) => tabOfSlot(x) === s && stillToChoose(x, r))) lines.push(`${x.rule.name}: ${x.rule.number - x.chosen.length} more to choose${x.rule.number > 1 ? ` (${x.chosen.length}/${x.rule.number})` : ""}`);
  return lines;
}

export function BuildTab({ r, ch, set, onDetail }: { r: Resolved; ch: Character; set: SetCharacter; onDetail: (e: AElement) => void }) {
  const [sub, setSub] = useState<Sub>("race");
  const sheet = useMemo(() => buildSheet(r), [r]);
  const of = (s: Sub) => r.slots.filter((x) => tabOfSlot(x) === s);
  const todo = (s: Sub) => todoFor(r, ch, s);
  const races = r.reg.ofType("Race");
  const backgrounds = r.reg.ofType("Background");
  return (
    <div>
      <RulesCheckBar r={r} />
      <nav className="subtabs">
        {SUBS.map(([k, label]) => {
          const lines = todo(k);
          return (
            <button key={k} className={sub === k ? "subtab active" : "subtab"} onClick={() => setSub(k)}>
              {label}
              {lines.length > 0 && (
                <span className="badge has-tip" tabIndex={0}>
                  {lines.length}
                  <span className="tip"><b>Still to choose</b><ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul></span>
                </span>
              )}
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
