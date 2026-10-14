/**
 * The step layout of the Build tab (on trial in the test app): the steps down the left with what is left to do,
 * the choice in the middle (a list beside the chosen option and its questions) and the character as it stands on
 * the right. The same parts as the tab layout (BuildTab), arranged differently.
 */
import { useMemo, useState } from "react";
import type { AElement } from "../aurora/types";
import type { Resolved } from "../aurora/engine";
import { ABILITY_LABEL, totalLevel, type Character } from "../aurora/character";
import { buildSheet } from "../aurora/sheet";
import { SlotList, tabOfSlot, type SetCharacter } from "./Slots";
import { Abilities, ActiveList, ClassPanel, SUBS, todoFor, type Sub } from "./BuildTab";
import { Browse } from "./Browse";
import { ChosenBanner } from "./PickCards";
import { RulesCheckBar } from "./RulesCheck";
import { multiclassLock } from "./multiclass";
import { Anvil, D20, Head, Scroll, Speech, Star, Sword } from "./icons";
import { DetailPanel } from "./DetailPanel";

const ICON: Record<Sub, (p: { size?: number }) => React.ReactNode> = {
  race: Head, class: Sword, background: Scroll, abilities: D20, languages: Speech, proficiencies: Anvil, feats: Star,
};

const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));

/** A list to pick from beside the chosen option, the way the species, class and background steps work. */
function ListAndChoice({ items, chosen, onPick, onDetail, empty, disabledReason, children }: { items: AElement[]; chosen: string[]; onPick: (e: AElement) => void; onDetail: (e: AElement) => void; empty: string; disabledReason?: (e: AElement) => string | undefined; children: React.ReactNode }) {
  return (
    <div className="steps-split">
      <div className="steps-list">
        <Browse items={items} type={items[0]?.type ?? "Race"} chosen={chosen} onPick={onPick} onSwap={(_, to) => onPick(to)} onHover={onDetail} defaultView="list" allowCards={false} perPage={200} disabledReason={disabledReason} />
      </div>
      <div className="steps-choice">{chosen.length ? children : <p className="muted steps-empty">{empty}</p>}</div>
    </div>
  );
}

/** The character as it stands: the numbers, the scores and what it is trained in. */
function Summary({ r, ch }: { r: Resolved; ch: Character }) {
  const sh = useMemo(() => buildSheet(r), [r]);
  const race = ch.race ? r.reg.get(ch.race)?.name : "";
  const classes = ch.classes.map((c) => `${r.reg.get(c.classId)?.name ?? c.classId} ${c.level}`).join(" / ");
  const left = SUBS.reduce((n, [k]) => n + todoFor(r, ch, k).length, 0);
  const tiles: [string, string][] = [["HP", String(sh.hp)], ["AC", String(sh.ac.value)], ["Init", signed(sh.initiative)], ["Speed", `${sh.speed} ft`], ["Prof", signed(sh.proficiency)]];
  const trained = sh.skills.filter((s) => s.level !== "none");
  const defenses = [...sh.defenses.resistances.map((d) => `Resists ${d}`), ...sh.defenses.immunities.map((d) => `Immune to ${d}`), ...sh.defenses.vulnerabilities.map((d) => `Vulnerable to ${d}`)];
  const section = (title: string, items: string[], open = false) => items.length > 0 && (
    <details className="steps-sec" open={open}>
      <summary>{title} <small>{items.length}</small></summary>
      <div className="chips">{items.map((i) => <span key={i} className="chip">{i}</span>)}</div>
    </details>
  );
  return (
    <aside className="steps-summary" aria-label="Character summary">
      <h2>{ch.name || "Unnamed"}</h2>
      <p className="muted">{[race, totalLevel(ch) ? `Level ${totalLevel(ch)}` : "", classes].filter(Boolean).join(" · ") || "Nothing chosen yet"}</p>
      <div className="steps-tiles">
        {tiles.map(([k, v]) => <div key={k} className="steps-tile"><small>{k}</small><b>{v}</b></div>)}
      </div>
      <div className="steps-scores">
        {sh.abilities.map((a) => (
          <div key={a.id} className="steps-score" title={`${ABILITY_LABEL[a.id]}: save ${signed(a.save)}${a.saveProficient ? " (proficient)" : ""}`}>
            <small>{a.id.slice(0, 3).toUpperCase()}</small>
            <b>{a.score}</b>
            <span className={a.saveProficient ? "save prof" : "save"}>{signed(a.mod)}</span>
          </div>
        ))}
      </div>
      <p className={left ? "steps-left warn" : "steps-left ok"}>{left ? `${left} ${left === 1 ? "choice" : "choices"} left to make` : "Every choice is made"}</p>
      {section("Senses", [...sh.vision, `Passive Perception ${sh.passivePerception}`])}
      {section("Saving throws", sh.abilities.filter((a) => a.saveProficient).map((a) => `${ABILITY_LABEL[a.id]} ${signed(a.save)}`))}
      {section("Skills", trained.map((s) => `${s.name} ${signed(s.bonus)}${s.level === "expertise" ? " (expertise)" : ""}`))}
      {section("Languages", sh.proficiencies.languages)}
      {section("Armor and weapons", [...sh.proficiencies.armor, ...sh.proficiencies.weapons])}
      {section("Tools", sh.proficiencies.tools.map((t) => t.replace(/^Tool Proficiency \((.*)\)$/, "$1")))}
      {section("Defenses", defenses)}
    </aside>
  );
}

export function BuildSteps({ r, ch, set }: { r: Resolved; ch: Character; set: SetCharacter }) {
  const [sub, setSub] = useState<Sub>("race");
  const [detail, setDetail] = useState<AElement | null>(null);
  const sheet = useMemo(() => buildSheet(r), [r]);
  const of = (s: Sub) => r.slots.filter((x) => tabOfSlot(x) === s);
  const onDetail = setDetail;
  const races = r.reg.ofType("Race");
  const backgrounds = r.reg.ofType("Background");
  const classes = r.reg.ofType("Class").filter((c) => !c.compendiumHidden);
  const have = new Set(ch.classes.map((c) => c.classId));
  const race = ch.race ? r.reg.get(ch.race) : undefined;
  const background = ch.background ? r.reg.get(ch.background) : undefined;
  const index = SUBS.findIndex(([k]) => k === sub);
  return (
    <div className="steps">
      <nav className="steps-rail" aria-label="Build steps">
        {SUBS.map(([k, label], i) => {
          const lines = todoFor(r, ch, k);
          const Icon = ICON[k];
          return (
            <button key={k} className={`steps-step ${sub === k ? "active" : ""} ${lines.length ? "todo" : "done"}`} onClick={() => setSub(k)} title={lines.length ? `Still to choose:\n${lines.join("\n")}` : "Done"} aria-current={sub === k ? "step" : undefined}>
              <span className="steps-icon"><Icon size={26} /></span>
              <span className="steps-label"><small>{i + 1}</small>{label}</span>
              <span className="steps-state">{lines.length ? lines.length : "✓"}</span>
            </button>
          );
        })}
      </nav>
      <section className="steps-stage">
        <RulesCheckBar r={r} />
        <header className="steps-head">
          <h2>{SUBS[index][1]}</h2>
          <span className="steps-nav">
            <button className="ghost" disabled={index === 0} onClick={() => setSub(SUBS[index - 1][0])}>Back</button>
            <button className="primary" disabled={index === SUBS.length - 1} onClick={() => setSub(SUBS[index + 1][0])}>Next{index < SUBS.length - 1 ? `: ${SUBS[index + 1][1]}` : ""}</button>
          </span>
        </header>
        {sub === "race" && (
          <ListAndChoice items={races} chosen={ch.race ? [ch.race] : []} onPick={(e) => set((c) => ({ ...c, race: e.id }))} onDetail={onDetail} empty="Pick a species from the list.">
            {race && <ChosenBanner el={race} label="Your species" onHover={onDetail}><button className="ghost" onClick={() => set((c) => ({ ...c, race: undefined }))}>Clear</button></ChosenBanner>}
            <SlotList slots={of("race")} r={r} set={set} onDetail={onDetail} />
          </ListAndChoice>
        )}
        {sub === "class" && (
          <ListAndChoice
            items={classes}
            disabledReason={ch.classes.length ? (c) => (have.has(c.id) ? undefined : totalLevel(ch) >= 20 ? "Level 20 is the maximum" : multiclassLock(r, c)) : undefined}
            chosen={ch.classes.map((c) => c.classId)}
            onPick={(e) => { if (!have.has(e.id) && totalLevel(ch) < 20) set((c) => ({ ...c, classes: [...c.classes, { classId: e.id, level: 1 }] })); }}
            onDetail={onDetail} empty="Pick a class from the list. Picking another one later adds it as a multiclass."
          >
            <ClassPanel r={r} ch={ch} set={set} onDetail={onDetail} picker={false} />
          </ListAndChoice>
        )}
        {sub === "background" && (
          <ListAndChoice items={backgrounds} chosen={ch.background ? [ch.background] : []} onPick={(e) => set((c) => ({ ...c, background: e.id }))} onDetail={onDetail} empty="Pick a background from the list.">
            {background && <ChosenBanner el={background} label="Your background" onHover={onDetail}><button className="ghost" onClick={() => set((c) => ({ ...c, background: undefined }))}>Clear</button></ChosenBanner>}
            <SlotList slots={of("background")} r={r} set={set} onDetail={onDetail} />
          </ListAndChoice>
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
          </>
        )}
        {sub === "feats" && (
          <>
            <SlotList slots={of("feats")} r={r} set={set} onDetail={onDetail} empty="No feat choices yet. Feats come from your species, background and class levels." />
            <ActiveList title="Your feats" items={r.active.filter((a) => a.el.type === "Feat").map((a) => a.el.name)} />
          </>
        )}
      </section>
      <div className="steps-side">
        <Summary r={r} ch={ch} />
        {detail && (
          <div className="steps-detail">
            <button className="notice-x" aria-label="Close the description" onClick={() => setDetail(null)}>×</button>
            <DetailPanel el={detail} />
          </div>
        )}
      </div>
    </div>
  );
}

