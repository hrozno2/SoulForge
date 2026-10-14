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
import { groupVariants, hiddenBy } from "../aurora/books";
import { SlotList, tabOfSlot, type SetCharacter } from "./Slots";
import { ClassPanel } from "./BuildTab";
import { Browse, VariantChips, blurb, dragMime } from "./Browse";
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
import { PortraitCropper, PortraitPicker } from "./Portrait";
import { D20, Head, Pack, Scroll, Sword, Wand } from "./icons";

/** One thing still to choose, and where it is chosen. */
type LeftItem = { kind: Kind; text: string; list: boolean };
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
/** The app's own Reduce motion setting (Menu, Settings) turns the board's animations off. */
const reduced = () => document.documentElement.classList.contains("reduce-motion");

/** A name flies from where it was clicked to the space it fills, which then lights up. */
function fly(from: DOMRect | null, label: string, kind: Kind) {
  let target = document.querySelector<HTMLElement>(`[data-tile="${kind}"]`);
  // With the columns as tabs the board may be hidden: the Character tab lights up instead.
  const hidden = !target || !target.offsetParent;
  if (hidden) target = document.querySelector<HTMLElement>('[data-pane="board"]');
  if (!target || !target.offsetParent) return;
  const glow = (el: HTMLElement, cls = "board-filled-anim") => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  if (reduced()) return glow(target);
  if (!hidden && (kind === "race" || kind === "class" || kind === "background")) return epicFly(from, label, kind, target);
  if (!from) return glow(target);
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
  anim.onfinish = () => { ghost.remove(); glow(target!); };
}

/**
 * The big choices (species, class, background) arrive as a card: it lifts out of the list, turns over as it arcs
 * across the board, grows to the size of its space and lands with a flash, a ring and a burst of sparks.
 */
function epicFly(from: DOMRect | null, label: string, kind: Kind, target: HTMLElement) {
  const to = target.getBoundingClientRect();
  // The space stays dark until the card lands in it.
  target.dataset.awaiting = "1";
  window.setTimeout(() => delete target.dataset.awaiting, 2000); // never left dark if the flight is cut short
  const start = from ?? new DOMRect(to.left + to.width / 2 - 90, window.innerHeight + 40, 180, 40);
  const card = document.createElement("div");
  card.className = "board-flycard";
  card.style.setProperty("--hue", String(HUE[kind]));
  card.innerHTML = `<small></small><b></b>`;
  card.querySelector("small")!.textContent = TITLE[kind];
  card.querySelector("b")!.textContent = label;
  Object.assign(card.style, { left: `${start.left}px`, top: `${start.top}px`, width: `${start.width}px`, height: `${Math.max(start.height, 34)}px` });
  document.body.appendChild(card);
  // The card's real size and position change (not a stretch), so the name stays in proportion.
  const h0 = Math.max(start.height, 34);
  const box = (x: number, y: number, w: number, h: number, font: number, turn: number, tilt: number, extra: Keyframe = {}): Keyframe =>
    ({ left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, fontSize: `${font}px`, transform: `perspective(900px) rotateY(${turn}deg) rotateZ(${tilt}deg)`, ...extra });
  const midW = (start.width + to.width) / 2, midH = (h0 + to.height) / 2;
  const midX = start.left + (to.left - start.left) * 0.45, midY = Math.min(start.top, to.top) - 120;
  const anim = card.animate(
    [
      box(start.left, start.top, start.width, h0, 14, 0, 0, { opacity: 0.9, offset: 0 }),
      box(start.left - 6, start.top - 26, start.width * 1.08, h0 * 1.15, 15, 0, -3, { opacity: 1, offset: 0.16 }),
      box(midX, midY, midW * 0.8, midH * 0.8, 22, 180, 4, { offset: 0.55 }),
      box(to.left - to.width * 0.03, to.top - 24, to.width * 1.06, to.height * 1.06, 30, 360, 0, { offset: 0.86 }),
      box(to.left, to.top, to.width, to.height, 28, 360, 0, { opacity: 1, offset: 1 }),
    ],
    { duration: 1150, easing: "cubic-bezier(.45,.05,.35,1)", fill: "forwards" },
  );
  anim.onfinish = () => {
    card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: "forwards" }).onfinish = () => card.remove();
    delete target.dataset.awaiting;
    delete target.dataset.impact;
    void target.offsetWidth;
    target.dataset.impact = "1";
    window.setTimeout(() => delete target.dataset.impact, 800);
    const cx = to.left + to.width / 2, cy = to.top + to.height / 2;
    const ring = document.createElement("div");
    ring.className = "board-ring";
    Object.assign(ring.style, { left: `${cx}px`, top: `${cy}px` });
    document.body.appendChild(ring);
    ring.animate([{ transform: "translate(-50%,-50%) scale(.2)", opacity: 0.95 }, { transform: "translate(-50%,-50%) scale(3.2)", opacity: 0 }], { duration: 700, easing: "cubic-bezier(.2,.7,.3,1)" }).onfinish = () => ring.remove();
    for (let i = 0; i < 22; i++) {
      const p = document.createElement("div");
      p.className = "board-spark";
      const ex = cx + (Math.random() - 0.5) * to.width * 0.9, ey = cy + (Math.random() - 0.5) * to.height * 0.7;
      Object.assign(p.style, { left: `${ex}px`, top: `${ey}px` });
      document.body.appendChild(p);
      const ang = Math.random() * Math.PI * 2, dist = 60 + Math.random() * 120;
      p.animate(
        [{ transform: "translate(-50%,-50%) scale(1)", opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist - 30}px)) scale(.2)`, opacity: 0 }],
        { duration: 600 + Math.random() * 500, easing: "cubic-bezier(.1,.8,.3,1)" },
      ).onfinish = () => p.remove();
    }
  };
}

/**
 * A spellbook that thickens as spells are chosen: the spine and the page edges grow and the cover rises with them,
 * ribbons appear, and the rune on the cover lights up when every spell is picked. Transforms only, so it animates in
 * WebKit as well.
 */
function SpellBook({ f }: { f: number }) {
  const t = 0.1 + 0.9 * f; // share of the full thickness
  const H = 34; // the full thickness, in the drawing's units
  return (
    <svg className="board-book" viewBox="0 0 120 120" role="img" aria-label={`Spellbook ${Math.round(f * 100)}% full`}>
      <defs>
        <radialGradient id="bookGlow"><stop offset="0" stopColor="#ffd98a" stopOpacity=".9" /><stop offset="1" stopColor="#ffd98a" stopOpacity="0" /></radialGradient>
        <linearGradient id="bookLeather" x1="0" x2="1"><stop offset="0" stopColor="#6e2a1d" /><stop offset="1" stopColor="#4a1912" /></linearGradient>
      </defs>
      {f >= 1 && <ellipse cx="60" cy="70" rx="56" ry="40" fill="url(#bookGlow)" opacity=".55" />}
      {/* back cover */}
      <path d="M8 100 L80 100 L108 86 L36 86 Z" fill="#3e140e" />
      <path d="M8 100 L80 100 L80 104 L8 104 Z M80 100 L108 86 L108 90 L80 104 Z" fill="#2a0d09" />
      {/* spine and page edges: drawn at full thickness, squeezed to the current one */}
      <g className="board-book-block" style={{ transform: `scaleY(${t})` }}>
        <rect x="8" y={100 - H} width="72" height={H} fill="url(#bookLeather)" stroke="#2a0d09" strokeWidth=".8" />
        {[0.2, 0.5, 0.8].map((k) => <rect key={k} x="8" y={100 - H * (1 - k) - 1.5} width="72" height="3" fill="#c9a45c" opacity=".85" />)}
        <path d={`M80 ${100 - H} L106 ${86 - H} L106 86 L80 100 Z`} fill="#f1e6c8" stroke="#a88c5a" strokeWidth=".6" />
        {Array.from({ length: 9 }, (_, k) => { const y = 100 - (H * (k + 1)) / 10; return <path key={k} d={`M80 ${y} L106 ${y - 14}`} stroke="#c8b48a" strokeWidth=".5" />; })}
      </g>
      {/* ribbons hanging from the pages */}
      {f > 0.4 && <path className="board-book-ribbon" d="M92 94 l0 14 l3 -3 l3 3 l0 -16 z" fill="#8a1f2a" />}
      {f > 0.8 && <path className="board-book-ribbon" d="M100 90 l0 12 l3 -3 l3 3 l0 -14 z" fill="#1f4f8a" />}
      {/* front cover, lifted by the thickness */}
      <g className="board-book-cover" style={{ transform: `translateY(${-H * t}px)` }}>
        <path d="M8 100 L80 100 L80 103 L8 103 Z M80 100 L108 86 L108 89 L80 103 Z" fill="#3e140e" />
        <path d="M8 100 L80 100 L108 86 L36 86 Z" fill="url(#bookLeather)" stroke="#c9a45c" strokeWidth="1.2" />
        <path d="M17 97.5 L76 97.5 L97 87.5 L39 87.5 Z" fill="none" stroke="#c9a45c" strokeWidth=".7" opacity=".8" />
        <g transform="translate(57 92.5) scale(1 .45)" opacity={0.4 + f * 0.6}>
          <circle r="9" fill="none" stroke="#ffd98a" strokeWidth="1.6" />
          <path d="M0-7 2-2 7 0 2 2 0 7-2 2-7 0-2-2z" fill="#ffd98a" />
        </g>
        {/* the clasp */}
        <path d="M78 96 l6 -3 l0 6 l-6 3z" fill="#c9a45c" />
      </g>
      {f >= 1 && <g className="board-sparks" fill="#ffe8b0"><circle cx="20" cy="40" r="2" /><circle cx="104" cy="34" r="1.6" /><circle cx="112" cy="70" r="2.2" /><circle cx="10" cy="76" r="1.4" /></g>}
    </svg>
  );
}

/**
 * A backpack that fills with gear: papers, rope, a bedroll, a sword, food, a torch and a map appear out of its
 * pockets as the starting equipment goes in, and go back as it comes out.
 */
function Backpack({ f }: { f: number }) {
  const has = (at: number) => f > at - 1e-9 && f > 0;
  return (
    <svg className="board-pack" viewBox="0 0 120 120" role="img" aria-label={`Backpack ${Math.round(f * 100)}% full`}>
      <g className="board-pack-body" style={{ transform: `scale(${0.92 + f * 0.08}, ${0.96 + f * 0.04})` }}>
        {/* behind the bag: the sword's hilt, the torch, the map */}
        {has(0.55) && <g className="board-item"><path d="M33 40 L27 10" stroke="#9aa3ad" strokeWidth="4" strokeLinecap="round" /><path d="M23 19 L37 15" stroke="#c9a45c" strokeWidth="3.2" strokeLinecap="round" /><path d="M27 10 L25.6 3" stroke="#5a3b1f" strokeWidth="3.4" strokeLinecap="round" /><circle cx="25.3" cy="2.5" r="2.4" fill="#c9a45c" /></g>}
        {has(0.85) && <g className="board-item"><path d="M96 70 L101 36" stroke="#6b4a2b" strokeWidth="3.4" strokeLinecap="round" /><path d="M101 36 q-6 -6 -1 -14 q2 6 5 5 q3 5 -4 9z" fill="#f08a24" /><path d="M101 33 q-2 -3 0 -7 q2 4 2 4z" fill="#ffd36a" /></g>}
        {has(1) && <g className="board-item"><path d="M68 30 L90 10" stroke="#e8dcb8" strokeWidth="7" strokeLinecap="round" /><path d="M68 30 L90 10" stroke="#b8a170" strokeWidth="7" strokeDasharray="1 5" strokeLinecap="round" /></g>}
        {/* the bedroll on top */}
        {has(0.4) && <g className="board-item"><rect x="30" y="18" width="60" height="15" rx="7.5" fill="#5f7144" stroke="#2c331c" strokeWidth="1.2" /><path d="M44 18 v15 M76 18 v15" stroke="#3b2915" strokeWidth="2.4" /><ellipse cx="30" cy="25.5" rx="3" ry="7.5" fill="#4b5a35" /></g>}
        {/* straps and body */}
        <path d="M46 34 q14 -14 28 0" fill="none" stroke="#3b2915" strokeWidth="4" strokeLinecap="round" />
        <rect x="28" y="34" width="64" height="72" rx="14" fill="#6b4a2b" stroke="#2b1d10" strokeWidth="1.6" />
        <path d="M34 40 q26 8 52 0" fill="none" stroke="#5a3d22" strokeWidth="1.2" />
        {/* papers out of the front pocket */}
        {has(0.1) && <g className="board-item"><rect x="44" y="62" width="15" height="18" fill="#efe3c4" stroke="#9a8256" strokeWidth=".7" transform="rotate(-9 51 71)" /><rect x="57" y="59" width="15" height="20" fill="#f6edd2" stroke="#9a8256" strokeWidth=".7" transform="rotate(7 64 69)" /><path d="M60 64 h9 M60 67 h8 M60 70 h9" stroke="#8a7650" strokeWidth=".6" transform="rotate(7 64 69)" /></g>}
        {/* bread and cheese out of the left pocket */}
        {has(0.7) && <g className="board-item"><ellipse cx="23" cy="66" rx="7" ry="5.5" fill="#c58b45" stroke="#6b4a2b" strokeWidth=".8" /><path d="M19 64 l3 -2 M23 63 l3 -2" stroke="#8a5a2a" strokeWidth=".8" /><path d="M26 70 l8 -6 l2 6z" fill="#f2c94c" stroke="#a4862f" strokeWidth=".6" /></g>}
        {/* the top flap and its buckle */}
        <path d="M28 52 q0 -20 32 -20 q32 0 32 20 v6 q-32 10 -64 0 z" fill="#7c5733" stroke="#2b1d10" strokeWidth="1.4" />
        <rect x="56" y="55" width="8" height="10" rx="1.5" fill="#c9a45c" stroke="#7a5c22" strokeWidth=".8" />
        {/* the pockets */}
        <rect x="38" y="76" width="44" height="26" rx="6" fill="#5d3f22" stroke="#2b1d10" strokeWidth="1.3" />
        <path d="M38 82 q22 6 44 0" fill="none" stroke="#2b1d10" strokeWidth="1" />
        <rect x="16" y="68" width="15" height="32" rx="5" fill="#5d3f22" stroke="#2b1d10" strokeWidth="1.3" />
        <rect x="89" y="68" width="15" height="32" rx="5" fill="#5d3f22" stroke="#2b1d10" strokeWidth="1.3" />
        {/* rope hung on the side */}
        {has(0.25) && <g className="board-item"><ellipse cx="96" cy="52" rx="9" ry="7" fill="none" stroke="#c2a26a" strokeWidth="3" /><ellipse cx="96" cy="52" rx="5.5" ry="4" fill="none" stroke="#a88a52" strokeWidth="2.4" /></g>}
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

/** The portrait in an arched frame at the top of the right column, with the name and what the character is. Click to change it. */
function PortraitCard({ r, ch, set }: { r: Resolved; ch: Character; set: SetCharacter }) {
  const [open, setOpen] = useState(false);
  const [crop, setCrop] = useState<File | null>(null);
  const race = ch.race ? r.reg.get(ch.race)?.name : "";
  const what = [race, ch.classes.map((c) => `${r.reg.get(c.classId)?.name ?? c.classId} ${c.level}`).join(" / ")].filter(Boolean).join(" · ");
  const pick = (url: string) => { set((c) => ({ ...c, portrait: url })); setOpen(false); };
  return (
    <div className="board-who">
      <button className="board-arch" onClick={() => setOpen(true)} title={ch.portrait ? "Change the portrait" : "Add a portrait"} aria-label={ch.portrait ? "Change the portrait" : "Add a portrait"}>
        {ch.portrait ? <img src={ch.portrait} alt="" /> : <span className="board-arch-empty"><Head size={44} /><small>Add portrait</small></span>}
      </button>
      <div className="board-who-text">
        <input className="board-name" placeholder="Character name" aria-label="Character name" value={ch.name} onChange={(e) => set((c) => ({ ...c, name: e.target.value }))} />
        <small>{what || "Nothing chosen yet"}</small>
      </div>
      {open && createPortal(
        <div className="modal-back" onClick={() => setOpen(false)}>
          <div className="modal-page themed board-modal" role="dialog" aria-label="Portrait" onClick={(e) => e.stopPropagation()}>
            <button className="board-x" aria-label="Close" onClick={() => setOpen(false)}>×</button>
            <h2>Portrait</h2>
            <div className="row">
              {ch.portrait && <img className="portrait small" src={ch.portrait} alt="Portrait" />}
              <label>Your own image: <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f && f.type.startsWith("image/")) setCrop(f); }} /></label>
              {ch.portrait && <button onClick={() => { set((c) => ({ ...c, portrait: undefined })); setOpen(false); }}>Remove</button>}
            </div>
            <PortraitPicker onPick={pick} />
          </div>
        </div>,
        document.body,
      )}
      {crop && <PortraitCropper file={crop} onCancel={() => setCrop(null)} onDone={(url) => { pick(url); setCrop(null); }} />}
    </div>
  );
}

/** The right column: scores first, then the numbers, the open score increases and what the character is trained in. */
function StatsPanel({ r, ch, set, onIncreases, left, onGo }: { r: Resolved; ch: Character; set: SetCharacter; onIncreases: (root: string) => void; left: LeftItem[]; onGo: (it: LeftItem) => void }) {
  const sh = useMemo(() => buildSheet(r), [r]);
  const tiles: [string, string][] = [["HP", String(sh.hp)], ["AC", String(sh.ac.value)], ["Init", signed(sh.initiative)], ["Speed", `${sh.speed} ft`], ["Prof", signed(sh.proficiency)]];
  const increases = r.slots.filter((s) => tabOfSlot(s) === "abilities");
  const openIncreases = increases.filter((s) => !s.rule.optional && s.chosen.length < s.rule.number).length;
  const defenses = [...sh.defenses.resistances.map((d) => `Resists ${d}`), ...sh.defenses.immunities.map((d) => `Immune to ${d}`), ...sh.defenses.vulnerabilities.map((d) => `Vulnerable to ${d}`)];
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
      <PortraitCard r={r} ch={ch} set={set} />
      <Scores r={r} ch={ch} set={set} />
      <div className="board-tiles">{tiles.map(([k, v]) => <div key={k} className="board-tile"><small>{k}</small><b>{v}</b></div>)}</div>
      {openIncreases > 0 && (
        <p className="board-incr">
          <span className="warn">{openIncreases} score {openIncreases === 1 ? "increase" : "increases"} to choose</span>
          <button className="pick-select" onClick={() => onIncreases(increases.find((s) => !s.rule.optional && s.chosen.length < s.rule.number)!.root)}>Choose</button>
        </p>
      )}
      {left.length ? (
        <details className="board-sec board-left-list">
          <summary className="warn">{left.length} {left.length === 1 ? "choice" : "choices"} left to make</summary>
          <ul>{left.map((it, i) => <li key={i}><button onClick={() => onGo(it)}><span className="board-left-kind">{TITLE[it.kind]}</span><span>{it.text}</span></button></li>)}</ul>
        </details>
      ) : <p className="board-left ok">Every choice is made</p>}
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
  /** Change on the class card: the next class picked replaces the starting class instead of adding a multiclass. */
  const [replacing, setReplacing] = useState(false);
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
      if (replacing && ch.classes.length) {
        // The starting class swaps, keeping its level; a class already taken further down is not doubled.
        if (have.has(el.id)) return;
        set((c) => ({ ...c, classes: c.classes.map((k, i) => (i === 0 ? { ...k, classId: el.id } : k)) }));
        setReplacing(false);
      } else {
        if (have.has(el.id) || classLock(el)) return;
        set((c) => ({ ...c, classes: [...c.classes, { classId: el.id, level: 1 }] }));
      }
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
  /** The versions (books) of a chosen option, and switching between them on its card. */
  const groupOf = (el: AElement) => groupVariants(r.reg.ofType(el.type), books).find((g) => g.variants.some((v) => v.el.id === el.id));
  const switchVersion = (kind: Kind, from: AElement, to: AElement) => {
    if (kind === "race") set((c) => ({ ...c, race: to.id }));
    else if (kind === "background") set((c) => ({ ...c, background: to.id }));
    else if (kind === "class") set((c) => ({ ...c, classes: c.classes.map((k) => (k.classId === from.id ? { ...k, classId: to.id } : k)) }));
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
  // What is left, for the summary under the closed lists: missing picks first, then each open choice.
  const kindOfSlot = (sl: (typeof r.slots)[number]): Kind => (tabOfSlot(sl) === "magic" ? "magic" : sl.root === "race" ? "race" : sl.root === "background" ? "background" : "class");
  const leftItems: LeftItem[] = [
    ...(!ch.race ? [{ kind: "race" as Kind, text: "Choose a species", list: true }] : []),
    ...(!ch.classes.length ? [{ kind: "class" as Kind, text: "Choose a class", list: true }] : []),
    ...(!ch.background ? [{ kind: "background" as Kind, text: "Choose a background", list: true }] : []),
    ...r.slots.filter((sl) => !sl.rule.optional && sl.chosen.length < sl.rule.number).map((sl) => ({ kind: kindOfSlot(sl), text: `${sl.rule.name}: ${sl.rule.number - sl.chosen.length} to choose`, list: tabOfSlot(sl) === "magic" })),
    ...(plans.length && packFill < 1 && !plans.every((p) => (ch.equipmentAdded ?? []).some((l) => l.startsWith(`${p.title}, `))) ? [{ kind: "equipment" as Kind, text: "Starting equipment", list: false }] : []),
  ];
  // Each space's count of what is left: every choice its species, class or background asks for (languages,
  // skills, feats and score increases included), and the spells still to pick.
  const todo = Object.fromEntries(ORDER.map((k) => [k, leftItems.filter((it) => it.kind === k && k !== "equipment").length])) as Record<Kind, number>;

  // Choices that belong to each space: everything its species, class or background asks except spells (under magic).
  const ownSlots = (test: (root: string) => boolean) => r.slots.filter((s) => test(s.root) && tabOfSlot(s) !== "magic");
  const otherSlots = r.slots.filter((s) => s.root !== "race" && s.root !== "background" && !s.root.startsWith("class:") && tabOfSlot(s) !== "magic");

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
        // From where it was dropped.
        if (el) place(kind, el, new DOMRect(e.clientX - 90, e.clientY - 17, 180, 34));
      },
    };
  };

  const libList: Record<Kind, React.ReactNode> = {
    race: <Browse items={races} type="Race" chosen={ch.race ? [ch.race] : []} onPick={pick("race")} onSwap={(_, to) => pick("race")(to)} defaultView="list" allowCards={false} perPage={300} draggable />,
    class: (
      <>
        {replacing && ch.classes.length > 0 && <p className="board-replace">Pick the class to replace {r.reg.get(ch.classes[0].classId)?.name}. <button className="linkish" onClick={() => setReplacing(false)}>Add a class instead</button></p>}
        <Browse items={classes} type="Class" chosen={ch.classes.map((c) => c.classId)} onPick={pick("class")} defaultView="list" allowCards={false} perPage={300} draggable disabledReason={ch.classes.length && !replacing ? classLock : undefined} />
      </>
    ),
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
              {(() => { const g = groupOf(el); return g && <VariantChips short g={g} activeId={el.id} chosen={new Set([el.id])} onActive={() => undefined} onSwitch={(from, to) => switchVersion(kind, from, to)} />; })()}
              <button className="ghost" onClick={() => learn(el)}>Learn more</button>
              <button className="ghost" onClick={() => (kind === "class" ? set((c) => ({ ...c, classes: c.classes.slice(1) })) : clear(kind))}>Remove</button>
              {kind === "class" && <button className={`ghost ${isOpen && replacing ? "is-on" : ""}`} onClick={() => { setReplacing(true); setOpen("class"); setFocus("class"); }}>Change</button>}
              <button className={`pick-select ${isOpen && !replacing ? "is-on" : ""}`} onClick={() => { if (kind === "class") setReplacing(false); setOpen(isOpen && !(kind === "class" && replacing) ? null : kind); setFocus(kind); }}>{kind === "class" ? "Add a class" : "Change"}</button>
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

  /** Takes you to one thing still to choose: its list opens (spells, or a missing pick) and its space is shown. */
  const goTo = (it: { kind: Kind; list: boolean }) => {
    if (it.list) setOpen(it.kind);
    setFocus(it.kind);
    setPane(it.list ? "lists" : "board");
    window.setTimeout(() => (it.list ? document.querySelector(".board-acc.open") : document.querySelector(".board-focus"))?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
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
        {open === null && (
          <section className="board-left-summary" aria-label="Still to choose">
            <h3>Still to choose</h3>
            {leftItems.length ? (
              <ul>
                {leftItems.map((it, i) => (
                  <li key={i}>
                    <button onClick={() => goTo(it)}>
                      <span className="board-left-kind">{TITLE[it.kind]}</span>
                      <span>{it.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="ok">Everything is chosen. Export your sheet when you are ready.</p>}
          </section>
        )}
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

      <StatsPanel r={r} ch={ch} set={set} left={leftItems} onGo={goTo} onIncreases={(root) => { setFocus(root === "race" ? "race" : root === "background" ? "background" : "class"); setPane("board"); window.setTimeout(() => document.querySelector(".board-focus")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); }} />
    </div>
  );
}
