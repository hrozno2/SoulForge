/**
 * The build board (on trial in the test app), after D&D Beyond's "Start your story": the lists down the left
 * (species, class, background, spells, equipment, each opening with its search and filters), the character
 * filling in on the middle board (click a list entry or drag it onto its space), and the scores, numbers and
 * training on the right. The same rules and choices as the tab layout (BuildTab), arranged differently.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AElement } from "../aurora/types";
import type { Resolved } from "../aurora/engine";
import { ABILITY_IDS, ABILITY_LABEL, STANDARD_ARRAY, totalLevel, type AbilityId, type Character } from "../aurora/character";
import { STANDARD_RULES, canLower, canRaise, clampBase, normalizeRules, spent as pbSpent } from "../aurora/pointBuy";
import { buildSheet } from "../aurora/sheet";
import { hiddenBy } from "../aurora/books";
import { SlotList, tabOfSlot, type SetCharacter } from "./Slots";
import { ClassPanel, SUBS, todoFor } from "./BuildTab";
import { Browse, blurb, dragMime } from "./Browse";
import { CLASS_TAGS, ClassIcon, hasClassIcon } from "./classIcons";
import { ChosenBanner, hueOf } from "./PickCards";
import { RulesCheckBar } from "./RulesCheck";
import { multiclassLock } from "./multiclass";
import { MagicTab } from "./MagicTab";
import { EquipmentTab, ITEM_KINDS, addItem } from "./EquipmentTab";
import { requestRoll } from "./Dice";
import { startingPlans } from "../aurora/startingEquipment";
import { useUi } from "./Learn";
import { useSettings } from "./Settings";
import { D20, Head, Pack, Scroll, Sword, Wand } from "./icons";

type Kind = "race" | "class" | "background" | "magic" | "equipment";
const TITLE: Record<Kind, string> = { race: "Species", class: "Class", background: "Background", magic: "Spells and magic", equipment: "Equipment" };
const ASK: Record<Kind, string> = {
  race: "Who are your ancestors? What languages do they speak?",
  class: "What are your vocation, special talents and favoured tactics?",
  background: "How did you spend the years before a life of adventure?",
  magic: "Which spells and incantations can you cast?",
  equipment: "What weapons, armor and gear do you carry?",
};
const ICON: Record<Kind, (p: { size?: number }) => React.ReactNode> = { race: Head, class: Sword, background: Scroll, magic: Wand, equipment: Pack };
/** Each space's colour before anything is in it (and the spellbook's and backpack's always). */
const HUE: Record<Kind, number> = { race: 150, class: 8, background: 260, magic: 275, equipment: 30 };
const ORDER: Kind[] = ["race", "class", "background", "magic", "equipment"];
const DROP_TYPES: Partial<Record<Kind, string[]>> = { race: ["Race"], class: ["Class"], background: ["Background"], equipment: ITEM_KINDS };

const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));
const reduced = () => document.documentElement.classList.contains("reduce-motion") || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** A name flies from where it was clicked to the space it fills, which then lights up. */
function fly(from: DOMRect | null, label: string, kind: Kind) {
  let target = document.querySelector<HTMLElement>(`[data-tile="${kind}"]`);
  // With the columns as tabs the board may be hidden: the Character tab lights up instead.
  if (!target || !target.offsetParent) target = document.querySelector<HTMLElement>('[data-pane="board"]');
  if (!target || !target.offsetParent) return;
  const glow = () => { target.classList.remove("board-filled-anim"); void target.offsetWidth; target.classList.add("board-filled-anim"); };
  if (!from || reduced()) return glow();
  const to = target.getBoundingClientRect();
  const ghost = document.createElement("div");
  ghost.className = "board-ghost";
  ghost.textContent = label;
  ghost.style.left = `${from.left}px`;
  ghost.style.top = `${from.top}px`;
  ghost.style.width = `${from.width}px`;
  document.body.appendChild(ghost);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const anim = ghost.animate(
    [{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${dx * 0.6}px, ${dy * 0.6 - 40}px) scale(1.08)`, opacity: 1, offset: 0.6 }, { transform: `translate(${dx}px, ${dy}px) scale(.6)`, opacity: 0 }],
    { duration: 520, easing: "cubic-bezier(.4,.1,.3,1)" },
  );
  anim.onfinish = () => { ghost.remove(); glow(); };
}

/** A spellbook that grows with the spells chosen: small and plain when empty, full size and glowing when every spell is picked. */
function SpellBook({ f }: { f: number }) {
  const pages = 4 + Math.round(f * 14);
  return (
    <svg className="board-book" viewBox="0 0 120 120" style={{ ["--f" as string]: f }} role="img" aria-label={`Spellbook ${Math.round(f * 100)}% full`}>
      <defs>
        <radialGradient id="bookGlow"><stop offset="0" stopColor="var(--gold2)" stopOpacity=".8" /><stop offset="1" stopColor="var(--gold2)" stopOpacity="0" /></radialGradient>
      </defs>
      <g className="board-book-body" style={{ transform: `scale(${0.45 + 0.55 * f})` }}>
        <circle cx="60" cy="60" r="56" fill="url(#bookGlow)" opacity={f * 0.7} />
        {/* the page block thickens as spells go in */}
        <rect x="30" y={84 - pages} width="64" height={pages + 8} rx="3" fill="#efe3c4" stroke="#8a6a3a" strokeWidth="1.2" />
        {Array.from({ length: Math.min(6, Math.ceil(pages / 3)) }, (_, i) => <line key={i} x1="34" x2="90" y1={86 - i * 3} y2={86 - i * 3} stroke="#c9b48a" strokeWidth=".6" />)}
        <path d={`M26 ${30 - f * 6} h62 a6 6 0 0 1 6 6 v${48 - pages + f * 6} h-62 a6 6 0 0 1 -6 -6z`} fill="#5b2a1e" stroke="var(--gold)" strokeWidth="1.6" />
        <rect x="30" y={34 - f * 6} width="54" height={40 - pages + f * 6} rx="3" fill="none" stroke="var(--gold)" strokeWidth=".8" opacity=".7" />
        <g transform={`translate(57 ${54 - pages / 2 - f * 3})`} opacity={0.35 + f * 0.65}>
          <circle r="9" fill="none" stroke="var(--gold2)" strokeWidth="1.4" />
          <path d="M0-6 1.8-1.8 6 0 1.8 1.8 0 6-1.8 1.8-6 0-1.8-1.8z" fill="var(--gold2)" />
        </g>
        <rect x="92" y={44 - pages / 2} width="6" height="14" rx="2" fill="var(--gold)" />
      </g>
      {f >= 1 && <g className="board-sparks" fill="var(--gold2)"><circle cx="18" cy="26" r="2" /><circle cx="104" cy="20" r="1.6" /><circle cx="108" cy="70" r="2.2" /><circle cx="14" cy="80" r="1.4" /></g>}
    </svg>
  );
}

/** A backpack that fills as the starting gear goes in, and empties again as it comes out. */
function Backpack({ f }: { f: number }) {
  const top = 98 - f * 62; // the level the contents reach inside the bag
  return (
    <svg className="board-pack" viewBox="0 0 120 120" style={{ ["--f" as string]: f }} role="img" aria-label={`Backpack ${Math.round(f * 100)}% full`}>
      <defs>
        <clipPath id="packInside"><path d="M30 44 q0-14 30-14 q30 0 30 14 v50 q0 8-8 8 h-44 q-8 0-8-8z" /></clipPath>
      </defs>
      <g className="board-pack-body" style={{ transform: `scaleX(${0.86 + f * 0.14})` }}>
        {/* things poking out of the top once the bag is well filled */}
        {f > 0.55 && <rect className="board-pack-roll" x="34" y="20" width="52" height="13" rx="6.5" fill="#6d7d4a" stroke="#2c331c" strokeWidth="1.2" />}
        {f >= 1 && <g className="board-pack-sword"><path d="M86 6 l3 3-10 22-3-1z" fill="#cfd4da" stroke="#555" strokeWidth=".8" /><path d="M72 28 l10 4" stroke="var(--gold)" strokeWidth="3" strokeLinecap="round" /></g>}
        <path d="M30 44 q0-14 30-14 q30 0 30 14 v50 q0 8-8 8 h-44 q-8 0-8-8z" fill="#5a4026" stroke="#2b1d10" strokeWidth="1.6" />
        <g clipPath="url(#packInside)">
          <g className="board-pack-fill" style={{ transform: `translateY(${top - 36}px)` }}>
            <rect x="28" y="36" width="64" height="80" fill="#8a6239" />
            <path d="M28 36 q16 -5 32 0 t32 0" fill="none" stroke="#b08452" strokeWidth="1.4" />
            <circle cx="44" cy="44" r="3" fill="#a77b4a" /><rect x="62" y="41" width="12" height="6" rx="2" fill="#a77b4a" />
          </g>
        </g>
        <path d="M30 44 q30 12 60 0" fill="none" stroke="#2b1d10" strokeWidth="1.6" />
        <rect x="46" y="58" width="28" height="22" rx="4" fill="#6b4c2c" stroke="#2b1d10" strokeWidth="1.2" />
        <rect x="56" y="54" width="8" height="10" rx="2" fill="var(--gold)" />
        <path d="M34 50 q-8 20 -2 44 M86 50 q8 20 2 44" fill="none" stroke="#3b2915" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** A number that turns into a box to type in when clicked. */
function EditNum({ value, onSet, min, max, label }: { value: number; onSet: (n: number) => void; min: number; max: number; label: string }) {
  const [edit, setEdit] = useState<string | null>(null);
  if (edit === null) return <button className="board-num" title="Click to type a number" aria-label={`${label} base score ${value}, click to type`} onClick={() => setEdit(String(value))}>{value}</button>;
  const done = () => { const n = Number(edit); if (edit.trim() && Number.isFinite(n)) onSet(Math.max(min, Math.min(max, Math.round(n)))); setEdit(null); };
  return <input className="board-num-in" autoFocus type="number" aria-label={`${label} base score`} value={edit} min={min} max={max} onChange={(e) => setEdit(e.target.value)} onBlur={done} onKeyDown={(e) => { if (e.key === "Enter") done(); if (e.key === "Escape") setEdit(null); }} />;
}

function PointBuyRules({ ch, set, onClose }: { ch: Character; set: SetCharacter; onClose: () => void }) {
  const rules = normalizeRules(ch.pointBuy);
  const setRules = (p: Partial<typeof rules>) => set((c) => {
    const next = normalizeRules({ ...normalizeRules(c.pointBuy), ...p, costs: { ...normalizeRules(c.pointBuy).costs, ...(p.costs ?? {}) } });
    return { ...c, pointBuy: next, abilityBase: clampBase(next, c.abilityBase) };
  });
  // On the page itself, so the sticky panel it is opened from cannot hide it.
  return createPortal(
    <div className="modal-back" onClick={onClose}>
      <div className="modal-page themed board-modal" role="dialog" aria-label="Point buy rules" onClick={(e) => e.stopPropagation()}>
        <button className="board-x" aria-label="Close" onClick={onClose}>×</button>
        <h2>Point buy rules</h2>
        <div className="row">
          <label>Points to spend <input type="number" min={0} max={999} value={rules.budget} onChange={(e) => setRules({ budget: Number(e.target.value) })} /></label>
          <label>Lowest score <input type="number" min={1} max={30} value={rules.min} onChange={(e) => setRules({ min: Number(e.target.value) })} /></label>
          <label>Highest score <input type="number" min={1} max={30} value={rules.max} onChange={(e) => setRules({ max: Number(e.target.value) })} /></label>
        </div>
        <table className="pb-costs">
          <thead><tr><th>Score</th>{Array.from({ length: rules.max - rules.min + 1 }, (_, i) => <th key={i}>{rules.min + i}</th>)}</tr></thead>
          <tbody><tr><td>Total cost</td>{Array.from({ length: rules.max - rules.min + 1 }, (_, i) => { const sc = rules.min + i; return <td key={sc}><input type="number" aria-label={`Cost of ${sc}`} value={rules.costs[sc]} onChange={(e) => setRules({ costs: { [sc]: Number(e.target.value) } })} /></td>; })}</tr></tbody>
        </table>
        <p className="muted">The cost is the total a score costs from nothing. The standard table is 27 points over 8 to 15.</p>
        <div className="row">
          <button onClick={() => set((c) => ({ ...c, pointBuy: undefined, abilityBase: clampBase(STANDARD_RULES, c.abilityBase) }))}>Standard rules</button>
          <button className="primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The scores, worked in place: point buy with plus and minus, the standard array by dragging, or typed and rolled. */
function Scores({ r, ch, set }: { r: Resolved; ch: Character; set: SetCharacter }) {
  const sh = useMemo(() => buildSheet(r), [r]);
  const rules = normalizeRules(ch.pointBuy);
  const spent = pbSpent(rules, ch.abilityBase);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [held, setHeld] = useState<AbilityId | null>(null);
  const [over, setOver] = useState<AbilityId | null>(null);
  const method = ch.abilityMethod;
  const setBase = (a: AbilityId, v: number) => set((c) => ({ ...c, abilityBase: { ...c.abilityBase, [a]: v } }));
  const swap = (a: AbilityId, b: AbilityId) => a !== b && set((c) => ({ ...c, abilityBase: { ...c.abilityBase, [a]: c.abilityBase[b], [b]: c.abilityBase[a] } }));
  const setMethod = (m: Character["abilityMethod"]) =>
    set((c) => ({
      ...c,
      abilityMethod: m,
      abilityBase: m === "pointbuy" ? (() => { const lo = normalizeRules(c.pointBuy).min; return { strength: lo, dexterity: lo, constitution: lo, intelligence: lo, wisdom: lo, charisma: lo }; })()
        : m === "standard" ? (STANDARD_ARRAY.every((n) => Object.values(c.abilityBase).includes(n)) ? c.abilityBase : { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 })
        : c.abilityBase,
    }));
  const roll = (a: AbilityId) => requestRoll(`${ABILITY_LABEL[a]}: 4d6, the lowest die dropped`, "4d6kh3", (res) => setBase(a, res.total));
  const bonusText = (a: AbilityId) => r.stats.contributions(a).filter((x) => !x.inline).map((b) => `${b.value.startsWith("-") ? "" : "+"}${b.value} ${b.from}`).join(", ");
  const mime = "application/x-sf-score";
  return (
    <section className="board-scores" aria-label="Ability scores">
      <div className="seg board-method" role="group" aria-label="How scores are made">
        {(["pointbuy", "standard", "manual"] as const).map((m) => (
          <button key={m} className={method === m ? "on" : ""} onClick={() => setMethod(m)}>{m === "pointbuy" ? "Point buy" : m === "standard" ? "Standard array" : "Manual"}</button>
        ))}
      </div>
      <p className="board-method-note">
        {method === "pointbuy" && <><span className={spent > rules.budget ? "warn" : ""}><b>{rules.budget - spent}</b> of {rules.budget} points left</span><button className="linkish" onClick={() => setRulesOpen(true)}>Custom rules{JSON.stringify(rules) === JSON.stringify(STANDARD_RULES) ? "" : " (on)"}</button></>}
        {method === "standard" && <span>Drag a number onto another score to swap them, or click two in turn.</span>}
        {method === "manual" && <span>Click a number to type it, or roll 4d6 and drop the lowest.</span>}
      </p>
      <div className="board-score-grid">
        {ABILITY_IDS.map((a) => {
          const line = sh.abilities.find((x) => x.id === a)!;
          const base = ch.abilityBase[a];
          const extra = line.score - base;
          return (
            <div
              key={a}
              className={`board-score ${over === a ? "over" : ""} ${held === a ? "held" : ""}`}
              title={[`${ABILITY_LABEL[a]}: base ${base}`, bonusText(a), `save ${signed(line.save)}${line.saveProficient ? " (proficient)" : ""}`].filter(Boolean).join("\n")}
              onDragOver={method === "standard" ? (e) => { if (e.dataTransfer.types.includes(mime)) { e.preventDefault(); setOver(a); } } : undefined}
              onDragLeave={() => setOver(null)}
              onDrop={method === "standard" ? (e) => { e.preventDefault(); setOver(null); const from = e.dataTransfer.getData(mime) as AbilityId; if (from) swap(from, a); } : undefined}
            >
              <small>{ABILITY_LABEL[a].slice(0, 3).toUpperCase()}{line.saveProficient && <span className="board-saveprof" title="Proficient in this saving throw">●</span>}</small>
              <b className="board-total">{line.score}</b>
              <span className="board-mod">{signed(line.mod)}</span>
              <div className="board-base">
                {method === "standard" ? (
                  <button
                    className="board-chip" draggable aria-label={`${ABILITY_LABEL[a]} has ${base}. Click, then click another score to swap.`}
                    onDragStart={(e) => { e.dataTransfer.setData(mime, a); e.dataTransfer.effectAllowed = "move"; }}
                    onClick={() => { if (held && held !== a) { swap(held, a); setHeld(null); } else setHeld(held === a ? null : a); }}
                  >{base}</button>
                ) : (
                  <>
                    <button className="board-step" aria-label={`Lower ${ABILITY_LABEL[a]}`} disabled={method === "pointbuy" ? !canLower(rules, ch.abilityBase, a) : base <= 1} onClick={() => setBase(a, base - 1)}>−</button>
                    <EditNum value={base} label={ABILITY_LABEL[a]} min={method === "pointbuy" ? rules.min : 1} max={method === "pointbuy" ? rules.max : 30} onSet={(n) => setBase(a, n)} />
                    <button className="board-step" aria-label={`Raise ${ABILITY_LABEL[a]}`} disabled={method === "pointbuy" ? !canRaise(rules, ch.abilityBase, a) : base >= 30} onClick={() => setBase(a, base + 1)}>+</button>
                    {method === "manual" && <button className="board-roll" title="Roll 4d6 and drop the lowest (shows in the dice log)" aria-label={`Roll ${ABILITY_LABEL[a]}`} onClick={() => roll(a)}><D20 size={15} /></button>}
                  </>
                )}
              </div>
              {extra !== 0 && <small className="board-extra">{extra > 0 ? `+${extra}` : extra} from choices</small>}
            </div>
          );
        })}
      </div>
      {method === "standard" && new Set(ABILITY_IDS.map((a) => ch.abilityBase[a])).size < 6 && <p className="warn">Each number of the standard array can be used once.</p>}
      {rulesOpen && <PointBuyRules ch={ch} set={set} onClose={() => setRulesOpen(false)} />}
    </section>
  );
}

/** The right column: scores first, then the numbers, the open score increases and what the character is trained in. */
function StatsPanel({ r, ch, set }: { r: Resolved; ch: Character; set: SetCharacter }) {
  const sh = useMemo(() => buildSheet(r), [r]);
  const tiles: [string, string][] = [["HP", String(sh.hp)], ["AC", String(sh.ac.value)], ["Init", signed(sh.initiative)], ["Speed", `${sh.speed} ft`], ["Prof", signed(sh.proficiency)]];
  const increases = r.slots.filter((s) => tabOfSlot(s) === "abilities");
  const openIncreases = increases.filter((s) => !s.rule.optional && s.chosen.length < s.rule.number).length;
  const defenses = [...sh.defenses.resistances.map((d) => `Resists ${d}`), ...sh.defenses.immunities.map((d) => `Immune to ${d}`), ...sh.defenses.vulnerabilities.map((d) => `Vulnerable to ${d}`)];
  const left = SUBS.flatMap(([k]) => todoFor(r, ch, k));
  const section = (title: string, items: string[]) => items.length > 0 && (
    <details className="board-sec">
      <summary>{title} <small>{items.length}</small></summary>
      <div className="chips">{items.map((i) => <span key={i} className="chip">{i}</span>)}</div>
    </details>
  );
  const custom = (a: AbilityId) => ch.customStats.find((c) => c.stat === a && c.id.startsWith("ability-"))?.value ?? 0;
  const setCustom = (a: AbilityId, v: number) => set((c) => {
    const rest = c.customStats.filter((x) => !(x.stat === a && x.id.startsWith("ability-")));
    return { ...c, customStats: v ? [...rest, { id: `ability-${a}`, stat: a, value: v, note: "Custom bonus" }] : rest };
  });
  return (
    <aside className="board-stats" aria-label="Scores and training">
      <Scores r={r} ch={ch} set={set} />
      <div className="board-tiles">{tiles.map(([k, v]) => <div key={k} className="board-tile"><small>{k}</small><b>{v}</b></div>)}</div>
      {increases.length > 0 && (
        <details className="board-sec" open={openIncreases > 0}>
          <summary>Score increases from your choices {openIncreases > 0 ? <small className="warn">{openIncreases} to choose</small> : <small>{increases.length}</small>}</summary>
          <SlotList slots={increases} r={r} set={set} onDetail={() => undefined} />
        </details>
      )}
      <p className={left.length ? "board-left warn" : "board-left ok"} title={left.join("\n")}>{left.length ? `${left.length} ${left.length === 1 ? "choice" : "choices"} left to make` : "Every choice is made"}</p>
      {section("Senses", [...sh.vision, `Passive Perception ${sh.passivePerception}`])}
      {section("Saving throws", sh.abilities.filter((a) => a.saveProficient).map((a) => `${ABILITY_LABEL[a.id]} ${signed(a.save)}`))}
      {section("Skills", sh.skills.filter((s) => s.level !== "none").map((s) => `${s.name} ${signed(s.bonus)}${s.level === "expertise" ? " (expertise)" : ""}`))}
      {section("Languages", sh.proficiencies.languages)}
      {section("Armor and weapons", [...sh.proficiencies.armor, ...sh.proficiencies.weapons])}
      {section("Tools", sh.proficiencies.tools.map((t) => t.replace(/^Tool Proficiency \((.*)\)$/, "$1")))}
      {section("Feats", r.active.filter((a) => a.el.type === "Feat").map((a) => a.el.name))}
      {section("Defenses", defenses)}
      <details className="board-sec">
        <summary>Custom score bonuses</summary>
        <div className="board-custom">
          {ABILITY_IDS.map((a) => <label key={a}>{ABILITY_LABEL[a].slice(0, 3)} <input type="number" value={custom(a) || ""} placeholder="0" onChange={(e) => setCustom(a, Number(e.target.value) || 0)} /></label>)}
        </div>
      </details>
    </aside>
  );
}

export function BuildBoard({ r, ch, set }: { r: Resolved; ch: Character; set: SetCharacter }) {
  const { books, learn } = useUi();
  const prefs = useSettings();
  const [open, setOpen] = useState<Kind | null>(ch.race ? (ch.classes.length ? (ch.background ? null : "background") : "class") : "race");
  const [focus, setFocus] = useState<Kind>("race");
  const [dropOver, setDropOver] = useState<Kind | null>(null);
  /** On a narrow window the three columns are tabs; this is the one showing. */
  const [pane, setPane] = useState<"lists" | "board" | "stats">("lists");
  const lastRow = useRef<DOMRect | null>(null);
  const lastName = useRef("");
  const sheet = useMemo(() => buildSheet(r), [r]);

  const visible = (items: AElement[]) => items.filter((e) => !e.compendiumHidden && !hiddenBy(books.info(e.source), e.source, { legacy: prefs.showLegacy, playtest: prefs.showPlaytest, unusual: prefs.showUnusual }));
  const races = r.reg.ofType("Race");
  const classes = r.reg.ofType("Class").filter((c) => !c.compendiumHidden);
  const backgrounds = r.reg.ofType("Background");
  const items = useMemo(() => ITEM_KINDS.flatMap((t) => r.reg.ofType(t)).filter((e) => !e.compendiumHidden), [r.reg]);
  const have = new Set(ch.classes.map((c) => c.classId));
  const classLock = (c: AElement) => (!ch.classes.length || have.has(c.id) ? undefined : totalLevel(ch) >= 20 ? "Level 20 is the maximum" : multiclassLock(r, c));

  // Where a click in a list came from, so the name can fly from there.
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const row = (e.target as HTMLElement).closest?.(".board-lib .opt-row, .board-lib .pick-card");
      lastRow.current = row ? row.getBoundingClientRect() : null;
      lastName.current = row?.querySelector(".opt-name, h3")?.textContent ?? "";
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, []);

  /** Puts an element in its place on the board, from a click or a drop. */
  const place = (kind: Kind, el: AElement, from: DOMRect | null) => {
    if (kind === "race") set((c) => ({ ...c, race: el.id }));
    else if (kind === "background") set((c) => ({ ...c, background: el.id }));
    else if (kind === "class") {
      if (have.has(el.id) || classLock(el)) return;
      set((c) => ({ ...c, classes: [...c.classes, { classId: el.id, level: 1 }] }));
    } else if (kind === "equipment") addItem(set, el);
    // Filling one of the three core spaces moves the lists on to the next empty one.
    const core: Kind[] = ["race", "class", "background"];
    if (core.includes(kind) && !filled[kind]) setOpen(core.find((k) => k !== kind && !filled[k]) ?? null);
    setFocus(kind);
    fly(from, el.name, kind);
  };
  const pick = (kind: Kind) => (el: AElement) => place(kind, el, lastRow.current);
  const random = (kind: Kind) => {
    const pool = visible(kind === "race" ? races : kind === "class" ? classes.filter((c) => !classLock(c) && !have.has(c.id)) : backgrounds);
    const el = pool[Math.floor(Math.random() * pool.length)];
    if (el) place(kind, el, null);
  };
  const clear = (kind: Kind) => set((c) => (kind === "race" ? { ...c, race: undefined } : kind === "background" ? { ...c, background: undefined } : kind === "class" ? { ...c, classes: [] } : c));

  const chosenEl: Record<"race" | "background", AElement | undefined> = { race: ch.race ? r.reg.get(ch.race) : undefined, background: ch.background ? r.reg.get(ch.background) : undefined };
  const firstClass = ch.classes[0] ? r.reg.get(ch.classes[0].classId) : undefined;
  const caster = sheet.casting.length > 0 || r.slots.some((s) => tabOfSlot(s) === "magic");
  const spellCount = sheet.casting.reduce((n, c) => n + c.cantripsKnown.length + c.spells.length, 0);
  // Spells are picked inside their own choices, so a new one is noticed by the count going up.
  const spellsBefore = useRef(spellCount);
  useEffect(() => {
    if (spellCount > spellsBefore.current) fly(lastRow.current, lastName.current, "magic");
    spellsBefore.current = spellCount;
  }, [spellCount]);
  // How far along the spells and the starting gear are, 0 to 1, for the book and the backpack.
  const magicSlots = r.slots.filter((s) => tabOfSlot(s) === "magic" && !s.rule.optional);
  const spellNeed = magicSlots.reduce((n, s) => n + s.rule.number, 0);
  const spellHave = magicSlots.reduce((n, s) => n + Math.min(s.chosen.length, s.rule.number), 0);
  const spellFill = spellNeed ? spellHave / spellNeed : spellCount ? 1 : 0;
  const plans = useMemo(() => startingPlans(ch, r.reg), [ch, r.reg]);
  const packFill = useMemo(() => {
    const added = ch.equipmentAdded ?? [];
    const have = new Set(ch.inventory.map((i) => i.id));
    // What each pack put in that is still in the bag.
    const kept = (label: string) => {
      const items = ch.equipmentLedger?.[label]?.items ?? [];
      return items.length ? items.filter((i) => have.has(i.id)).length / items.length : 1;
    };
    if (plans.length) {
      const per = plans.map((p) => { const mine = added.filter((l) => l.startsWith(`${p.title}, `)); return mine.length ? Math.max(...mine.map(kept)) : 0; });
      const extra = Math.min(0.15, ch.inventory.filter((i) => !added.some((l) => (ch.equipmentLedger?.[l]?.items ?? []).some((x) => x.id === i.id))).length * 0.03);
      return Math.min(1, per.reduce((a, b) => a + b, 0) / plans.length + extra);
    }
    return Math.min(1, ch.inventory.length / 12);
  }, [ch.inventory, ch.equipmentAdded, ch.equipmentLedger, plans]);
  const filled: Record<Kind, boolean> = { race: !!chosenEl.race, class: !!firstClass, background: !!chosenEl.background, magic: spellCount > 0, equipment: ch.inventory.length > 0 };
  const todo: Record<Kind, number> = {
    race: todoFor(r, ch, "race").length, class: todoFor(r, ch, "class").length, background: todoFor(r, ch, "background").length,
    magic: r.slots.filter((s) => tabOfSlot(s) === "magic" && !s.rule.optional && s.chosen.length < s.rule.number).length, equipment: 0,
  };

  // Choices that belong to each space: everything its species, class or background asks except score increases
  // (on the right) and spells (under magic).
  const ownSlots = (test: (root: string) => boolean) => r.slots.filter((s) => test(s.root) && !["abilities", "magic"].includes(tabOfSlot(s)));
  const otherSlots = r.slots.filter((s) => s.root !== "race" && s.root !== "background" && !s.root.startsWith("class:") && !["abilities", "magic"].includes(tabOfSlot(s)));

  const drop = (kind: Kind) => {
    const types = DROP_TYPES[kind];
    if (!types) return {};
    const mimes = types.map(dragMime);
    return {
      onDragOver: (e: React.DragEvent) => { if (mimes.some((m) => e.dataTransfer.types.includes(m))) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setDropOver(kind); } },
      onDragLeave: () => setDropOver(null),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setDropOver(null);
        delete document.body.dataset.dragging;
        const id = mimes.map((m) => e.dataTransfer.getData(m)).find(Boolean);
        const el = id ? r.reg.get(id) : undefined;
        if (el) place(kind, el, null);
      },
    };
  };

  const libList: Record<Kind, React.ReactNode> = {
    race: <Browse items={races} type="Race" chosen={ch.race ? [ch.race] : []} onPick={pick("race")} onSwap={(_, to) => pick("race")(to)} defaultView="list" allowCards={false} perPage={300} draggable />,
    class: <Browse items={classes} type="Class" chosen={ch.classes.map((c) => c.classId)} onPick={pick("class")} defaultView="list" allowCards={false} perPage={300} draggable disabledReason={ch.classes.length ? classLock : undefined} />,
    background: <Browse items={backgrounds} type="Background" chosen={ch.background ? [ch.background] : []} onPick={pick("background")} onSwap={(_, to) => pick("background")(to)} defaultView="list" allowCards={false} perPage={300} draggable />,
    magic: caster ? <MagicTab r={r} ch={ch} set={set} onDetail={() => undefined} /> : <p className="muted pad">No spellcasting yet. It appears when a class, species or feat grants it.</p>,
    equipment: <Browse items={items} type="Item" chosen={[]} onPick={pick("equipment")} defaultView="list" allowCards={false} perPage={80} draggable pickLabel={() => "Add"} />,
  };
  const libValue: Record<Kind, string> = {
    race: chosenEl.race?.name ?? "", class: ch.classes.map((c) => `${r.reg.get(c.classId)?.name ?? c.classId} ${c.level}`).join(" / "), background: chosenEl.background?.name ?? "",
    magic: spellCount ? `${spellCount} spells` : "", equipment: ch.inventory.length ? `${ch.inventory.length} items` : "",
  };

  // A plain render function (not a component), so the spaces are not remade on every change.
  const tile = (kind: Kind) => {
    const Icon = ICON[kind];
    const isOpen = open === kind;
    const el = kind === "race" ? chosenEl.race : kind === "background" ? chosenEl.background : kind === "class" ? firstClass : undefined;
    const disabled = kind === "magic" && !caster;
    const name = kind === "class" && ch.classes.length ? ch.classes.map((c) => r.reg.get(c.classId)?.name ?? c.classId).join(" / ") : el?.name ?? (kind === "magic" ? "Spellbook" : kind === "equipment" ? "Backpack" : "");
    // A chosen species, class or background shows as its full card, the same as the cards in the lists.
    if (el && (kind === "race" || kind === "class" || kind === "background")) {
      const label = (
        <>
          {kind === "class" ? `Level ${totalLevel(ch)}${ch.classes.length > 1 ? ` · ${ch.classes.map((c) => `${r.reg.get(c.classId)?.name ?? c.classId} ${c.level}`).join(" / ")}` : ""}` : `Your ${TITLE[kind].toLowerCase()}`}
          {todo[kind] > 0 && <span className="board-todo">{todo[kind]} to choose</span>}
        </>
      );
      return (
        <div key={kind} data-tile={kind} className={`board-space board-${kind} filled has-card ${focus === kind ? "focused" : ""} ${dropOver === kind ? "drop-over" : ""}`} onClick={() => setFocus(kind)} {...drop(kind)}>
          <ChosenBanner el={el} label={label}>
            <span className="board-card-actions" onClick={(e) => e.stopPropagation()}>
              <button className="ghost" onClick={() => learn(el)}>Learn more</button>
              {kind !== "class" && <button className="ghost" onClick={() => clear(kind)}>Remove</button>}
              <button className={`pick-select ${isOpen ? "is-on" : ""}`} onClick={() => { setOpen(isOpen ? null : kind); setFocus(kind); }}>{kind === "class" ? "Add a class" : "Change"}</button>
            </span>
          </ChosenBanner>
        </div>
      );
    }
    return (
      <div
        key={kind}
        data-tile={kind}
        className={`board-space board-${kind} ${filled[kind] ? "filled" : "empty"} ${focus === kind ? "focused" : ""} ${dropOver === kind ? "drop-over" : ""} ${disabled ? "disabled" : ""}`}
        data-accepts={(DROP_TYPES[kind] ?? []).map(dragMime).join(" ")}
        onClick={() => !disabled && setFocus(kind)}
        {...drop(kind)}
      >
        <div className="pick-card board-frame" data-glyph="" style={{ ["--hue" as string]: el ? hueOf(el.name) : HUE[kind] }}>
        {kind === "magic" ? <span className="board-art board-art-live"><SpellBook f={spellFill} /></span>
          : kind === "equipment" ? <span className="board-art board-art-live"><Backpack f={packFill} /></span>
          : <span className="board-art" aria-hidden="true">{el && hasClassIcon(el.name) ? <ClassIcon name={el.name} size={150} /> : <Icon size={120} />}</span>}
        <div className="board-space-text">
          {filled[kind] ? (
            <>
              <small className="board-kicker">{kind === "class" ? `Level ${totalLevel(ch)}` : TITLE[kind]}{todo[kind] > 0 && <span className="board-todo">{todo[kind]} to choose</span>}</small>
              <h3>{name}</h3>
              {kind === "class" && el && CLASS_TAGS[el.name] && <div className="pick-tags">{CLASS_TAGS[el.name].map((t) => <span key={t}>{t}</span>)}</div>}
              {el && <p className="board-blurb">{blurb(el.description, 120)}</p>}
              {kind === "magic" && <p className="board-blurb">{sheet.casting.map((c) => `${c.name}: DC ${c.dc}, ${signed(c.attack)} to hit`).join(" · ")}{spellNeed ? ` · ${spellHave} of ${spellNeed} spells chosen` : ""}</p>}
              {kind === "equipment" && <p className="board-blurb">{ch.inventory.length} {ch.inventory.length === 1 ? "item" : "items"}{plans.length > 0 ? (packFill >= 1 ? " · packed for the road" : ` · starting gear ${plans.filter((p) => (ch.equipmentAdded ?? []).some((l) => l.startsWith(`${p.title}, `))).length} of ${plans.length}`) : ""}</p>}
            </>
          ) : (
            <>
              <small className="board-kicker">Choose</small>
              <h3>{TITLE[kind]}</h3>
              <p className="board-blurb">{disabled ? "No spellcasting yet." : ASK[kind]}</p>
            </>
          )}
        </div>
        <div className="board-space-actions" onClick={(e) => e.stopPropagation()}>
          {el && <button className="ghost" onClick={() => learn(el)}>Learn more</button>}
          {!filled[kind] && ["race", "class", "background"].includes(kind) && <button className="board-dice" title={`Random ${TITLE[kind].toLowerCase()}`} aria-label={`Random ${TITLE[kind].toLowerCase()}`} onClick={() => random(kind)}><D20 size={16} /></button>}
          {filled[kind] && ["race", "background"].includes(kind) && <button className="ghost" onClick={() => clear(kind)}>Remove</button>}
          {!disabled && <button className={`board-see ${isOpen ? "on" : ""}`} onClick={() => { setOpen(isOpen ? null : kind); setFocus(kind); }}>{filled[kind] ? (kind === "class" ? "Add a class" : kind === "equipment" ? "Add items" : kind === "magic" ? "Choose spells" : "Change") : "See options"}</button>}
        </div>
        </div>
      </div>
    );
  };

  const panes: ["lists" | "board" | "stats", string, number][] = [
    ["lists", "Lists", 0],
    ["board", "Character", ORDER.reduce((n, k) => n + todo[k], 0)],
    ["stats", "Scores", r.slots.filter((s) => tabOfSlot(s) === "abilities" && !s.rule.optional && s.chosen.length < s.rule.number).length],
  ];
  return (
    <div className={`board pane-${pane}`}>
      <div className="board-panes" role="tablist" aria-label="Build sections">
        {panes.map(([k, label, n]) => (
          <button key={k} role="tab" aria-selected={pane === k} data-pane={k} className={pane === k ? "on" : ""} onClick={() => setPane(k)}>
            {label}{n > 0 && <span className="board-acc-badge">{n}</span>}
          </button>
        ))}
      </div>
      <nav className="board-lib" aria-label="Lists">
        {ORDER.map((kind) => {
          const Icon = ICON[kind];
          const isOpen = open === kind;
          return (
            <section key={kind} className={`board-acc ${isOpen ? "open" : ""}`}>
              <button className="board-acc-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : kind)}>
                <span className="board-acc-icon"><Icon size={22} /></span>
                <span className="board-acc-title">{TITLE[kind]}<small>{libValue[kind] || (kind === "magic" && !caster ? "none yet" : "not chosen")}</small></span>
                {todo[kind] > 0 ? <span className="board-acc-badge">{todo[kind]}</span> : filled[kind] ? <span className="board-acc-done">✓</span> : null}
                <span className="board-acc-chev">▸</span>
              </button>
              <div className="board-acc-body"><div className="board-acc-inner">{isOpen && libList[kind]}</div></div>
            </section>
          );
        })}
      </nav>

      <section className="board-main">
        <RulesCheckBar r={r} />
        <header className="board-hero">
          <small>Ready, set,</small>
          <h2>Start your story...</h2>
          <p className="muted">Your character is a species, a class and a background. Click an entry in a list or drag it onto its space.</p>
        </header>
        <div className="board-spaces">
          {ORDER.map(tile)}
        </div>
        <div className="board-focus" key={focus}>
          <h3 className="board-focus-title">{TITLE[focus]}</h3>
          {focus === "race" && (chosenEl.race ? <SlotList slots={ownSlots((root) => root === "race")} r={r} set={set} onDetail={() => undefined} empty="Nothing more to choose for your species." /> : <p className="muted">Choose a species from the list on the left, or drag one onto its space.</p>)}
          {focus === "class" && (ch.classes.length ? (
            <>
              <ClassPanel r={r} ch={ch} set={set} onDetail={() => undefined} picker={false} compact />
              {ch.classes.map((c) => {
                const extra = ownSlots((root) => root === `class:${c.classId}`).filter((s) => tabOfSlot(s) !== "class");
                return extra.length > 0 && (
                  <section key={c.classId}>
                    <h3>{r.reg.get(c.classId)?.name} training and feats</h3>
                    <SlotList slots={extra} r={r} set={set} onDetail={() => undefined} />
                  </section>
                );
              })}
            </>
          ) : <p className="muted">Choose a class from the list on the left, or drag one onto its space. Adding another class later makes a multiclass.</p>)}
          {focus === "background" && (chosenEl.background ? <SlotList slots={ownSlots((root) => root === "background")} r={r} set={set} onDetail={() => undefined} empty="Nothing more to choose for your background." /> : <p className="muted">Choose a background from the list on the left, or drag one onto its space.</p>)}
          {focus === "magic" && (caster ? (
            <div className="board-magic">
              {sheet.casting.map((c) => (
                <div key={c.name} className="board-cast">
                  <b>{c.name}</b> <span className="muted">DC {c.dc} · {signed(c.attack)} to hit{c.prepare ? ` · prepares ${c.prepareMax}` : ""}</span>
                  <div className="chips">{[...c.cantripsKnown, ...c.spells, ...c.granted].map((p) => r.reg.get(p.id)).filter(Boolean).map((sp) => <button key={sp!.id} className="chip" onClick={() => learn(sp!)}>{sp!.name}</button>)}</div>
                </div>
              ))}
              <p className="muted">Choose spells under Spells and magic on the left.</p>
            </div>
          ) : <p className="muted">This character does not cast spells yet.</p>)}
          {focus === "equipment" && <EquipmentTab r={r} ch={ch} set={set} onDetail={() => undefined} listBeside />}
          {otherSlots.length > 0 && (
            <section>
              <h3>Other choices</h3>
              <SlotList slots={otherSlots} r={r} set={set} onDetail={() => undefined} />
            </section>
          )}
        </div>
      </section>

      <StatsPanel r={r} ch={ch} set={set} />
    </div>
  );
}
