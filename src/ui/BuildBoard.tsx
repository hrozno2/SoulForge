/**
 * The build board (the default Build layout), after D&D Beyond's "Start your story": the lists down the left
 * (species, class, background, spells, equipment, each opening with its search and filters), the character
 * filling in on the middle board (click a list entry or drag it onto its space), and the scores, numbers and
 * training on the right. The same rules and choices as the tab layout (BuildTab), arranged differently.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { detailsBlank } from "./ManageTab";
import { Shop } from "./Shop";
import { TextInput } from "./TextField";
import { createPortal } from "react-dom";
import type { AElement } from "../aurora/types";
import { stillToChoose, type Resolved } from "../aurora/engine";
import { ABILITY_IDS, ABILITY_LABEL, STANDARD_ARRAY, totalLevel, type AbilityId, type Character } from "../aurora/character";
import { STANDARD_RULES, canLower, canRaise, clampBase, normalizeRules, spent as pbSpent } from "../aurora/pointBuy";
import { buildSheet } from "../aurora/sheet";
import { formatRelease, groupVariants, hiddenBy, type Group } from "../aurora/books";
import { SlotList, tabOfSlot, type SetCharacter, PersonalitySwitch } from "./Slots";
import { PassiveFeatures } from "./PassiveFeatures";
import { HpRollsDialog } from "./HpRolls";
import { ClassPanel } from "./BuildTab";
import { Browse, KindTag, blurb, dragMime } from "./Browse";
import { CLASS_TAGS, ClassIcon, hasClassIcon } from "./classIcons";
import { ChosenBanner, hueOf } from "./PickCards";
import { RulesCheckBar } from "./RulesCheck";
import { multiclassLock } from "./multiclass";
import { MagicTab, PrepareSpells } from "./MagicTab";
import { EquipmentTab, ITEM_KINDS, addItem } from "./EquipmentTab";
import { requestRoll } from "./Dice";
import { startingPlans } from "../aurora/startingEquipment";
import { useUi } from "./Learn";
import { useSettings } from "./Settings";
import { PortraitCropper, PortraitPicker } from "./Portrait";
import { D20, Head, Pack, Scroll, Sword, Wand } from "./icons";

/** A card turned over: `snap` is the character before it turned, for ×. */
type Back = { kind: Kind; mode: "new" | "edit"; snap: Character; from: DOMRect | null; name: string; phase: "flying" | "open" };

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
  const hidden = !target || !target.offsetParent;
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

// ---- Landing effects, one per class (Hearthstone-style: the card lands with weight, then its class's flourish) ----

/** Classes that land with a shake. */
const HEAVY = /barbarian|fighter|paladin/i;

/** One particle: a small element that flies from (x, y) by (dx, dy), turning and fading. */
function particle(cls: string, x: number, y: number, dx: number, dy: number, o: { color?: string; text?: string; size?: number; turn?: number; duration?: number; delay?: number; scaleTo?: number } = {}) {
  const e = document.createElement("div");
  e.className = `fx ${cls}`;
  if (o.text) e.textContent = o.text;
  Object.assign(e.style, { left: `${x}px`, top: `${y}px`, ...(o.color ? { color: o.color, background: cls === "fx-spark" || cls === "fx-dot" ? o.color : "" } : {}), ...(o.size ? { fontSize: `${o.size}px`, width: cls === "fx-dot" || cls === "fx-smoke" ? `${o.size}px` : "", height: cls === "fx-dot" || cls === "fx-smoke" ? `${o.size}px` : "" } : {}) });
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const turn0 = cls === "fx-spark" ? ang : 0;
  document.body.appendChild(e);
  e.animate(
    [{ transform: `translate(-50%,-50%) rotate(${turn0}deg) scale(1)`, opacity: 0 }, { opacity: 1, offset: 0.12 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${turn0 + (o.turn ?? 0)}deg) scale(${o.scaleTo ?? 0.4})`, opacity: 0 }],
    { duration: o.duration ?? 560, delay: o.delay ?? 0, easing: "cubic-bezier(.15,.7,.3,1)" },
  ).onfinish = () => e.remove();
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Sparks flying out from the middle, fast and straight (steel, rage, gears). */
function sparks(cx: number, cy: number, colors: string[], n = 22, reach = 140) {
  for (let k = 0; k < n; k++) { const a = rnd(0, Math.PI * 2), d = rnd(reach * 0.4, reach); particle("fx-spark", cx, cy, Math.cos(a) * d, Math.sin(a) * d, { color: colors[k % colors.length], duration: rnd(260, 480) }); }
}

/** A bright line across the card (a blade's slash). */
function slash(to: DOMRect, color: string, angle = -28) {
  const e = document.createElement("div");
  e.className = "fx fx-slash";
  Object.assign(e.style, { left: `${to.left + to.width / 2}px`, top: `${to.top + to.height / 2}px`, width: `${to.width * 1.3}px`, background: `linear-gradient(90deg, transparent, ${color}, #fff, ${color}, transparent)` });
  document.body.appendChild(e);
  e.animate([{ transform: `translate(-50%,-50%) rotate(${angle}deg) scaleX(0)`, opacity: 1 }, { transform: `translate(-50%,-50%) rotate(${angle}deg) scaleX(1)`, opacity: 1, offset: 0.35 }, { transform: `translate(-50%,-50%) rotate(${angle}deg) scaleX(1.05)`, opacity: 0 }], { duration: 360, easing: "ease-out" }).onfinish = () => e.remove();
}

/** Expanding rings (ki, rage). */
function rings(cx: number, cy: number, color: string, n = 3, size = 160) {
  for (let k = 0; k < n; k++) {
    const e = document.createElement("div");
    e.className = "fx fx-ring";
    Object.assign(e.style, { left: `${cx}px`, top: `${cy}px`, width: `${size}px`, height: `${size}px`, borderColor: color, boxShadow: `0 0 18px ${color}` });
    document.body.appendChild(e);
    e.animate([{ transform: "translate(-50%,-50%) scale(.2)", opacity: 0.9 }, { transform: "translate(-50%,-50%) scale(2.4)", opacity: 0 }], { duration: 460, delay: k * 80, easing: "cubic-bezier(.2,.7,.3,1)" }).onfinish = () => e.remove();
  }
}

/** A column of light on the card (radiance from above). */
function beam(to: DOMRect, color: string) {
  const e = document.createElement("div");
  e.className = "fx fx-beam";
  Object.assign(e.style, { left: `${to.left + to.width / 2}px`, top: `${to.top + to.height / 2}px`, width: `${to.width * 0.7}px`, height: `${to.height * 2.4}px`, background: `linear-gradient(180deg, transparent, ${color} 40%, #fff 55%, ${color} 70%, transparent)` });
  document.body.appendChild(e);
  e.animate([{ transform: "translate(-50%,-70%) scaleX(.1)", opacity: 0 }, { transform: "translate(-50%,-55%) scaleX(1)", opacity: 0.85, offset: 0.3 }, { transform: "translate(-50%,-50%) scaleX(.6)", opacity: 0 }], { duration: 650, easing: "ease-out" }).onfinish = () => e.remove();
}

/** Rays turning around the card's middle (holy light). */
function rays(cx: number, cy: number, color: string, size: number) {
  const e = document.createElement("div");
  e.className = "fx fx-rays";
  Object.assign(e.style, { left: `${cx}px`, top: `${cy}px`, width: `${size}px`, height: `${size}px`, background: `repeating-conic-gradient(${color} 0 6deg, transparent 6deg 22deg)` });
  document.body.appendChild(e);
  e.animate([{ transform: "translate(-50%,-50%) rotate(0deg) scale(.3)", opacity: 0 }, { opacity: 0.7, offset: 0.25 }, { transform: "translate(-50%,-50%) rotate(40deg) scale(1.2)", opacity: 0 }], { duration: 760, easing: "ease-out" }).onfinish = () => e.remove();
}

/** Forked lightning striking the card from above. */
function lightning(to: DOMRect, color: string) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "fx fx-bolt");
  const w = to.width, h = to.height * 1.6;
  Object.assign(svg.style, { left: `${to.left}px`, top: `${to.top - to.height * 0.6}px`, width: `${w}px`, height: `${h}px` });
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const bolt = (x0: number, spread: number) => { let x = x0, d = `M${x} 0`; for (let y = h / 8; y <= h * 0.85; y += h / 8) { x += rnd(-spread, spread); d += ` L${x.toFixed(1)} ${y.toFixed(1)}`; } return d; };
  svg.innerHTML = [bolt(w * 0.5, w * 0.12), bolt(w * rnd(0.3, 0.45), w * 0.1), bolt(w * rnd(0.55, 0.7), w * 0.1)].map((d, k) => `<path d="${d}" stroke="${k ? color : "#fff"}" stroke-width="${k ? 2 : 3.2}" fill="none" stroke-linejoin="round"/>`).join("");
  svg.style.filter = `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 14px ${color})`;
  document.body.appendChild(svg);
  svg.animate([{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 0.2, offset: 0.2 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 420, easing: "linear" }).onfinish = () => svg.remove();
}

/** Things drifting up (leaves, notes, smoke, embers). */
function drift(to: DOMRect, cls: string, n: number, o: { colors?: string[]; texts?: string[]; size?: [number, number]; rise?: number; duration?: [number, number] } = {}) {
  for (let k = 0; k < n; k++) {
    const x = to.left + rnd(0.1, 0.9) * to.width, y = to.top + rnd(0.45, 1) * to.height;
    particle(cls, x, y, rnd(-50, 50), -rnd(60, o.rise ?? 150), { color: o.colors?.[k % o.colors.length], text: o.texts?.[k % o.texts.length], size: o.size ? rnd(o.size[0], o.size[1]) : undefined, turn: rnd(-160, 160), duration: rnd(...(o.duration ?? [700, 1100])), delay: rnd(0, 150), scaleTo: cls === "fx-smoke" ? 2.2 : 0.5 });
  }
}

/** The arcane circle that draws itself around the card (wizards, species, backgrounds). */
function sigil(to: DOMRect, color: string) {
  const cx = to.left + to.width / 2, cy = to.top + to.height / 2;
  const size = Math.max(to.width, to.height) * 1.15;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "board-sigil");
  svg.setAttribute("viewBox", "-50 -50 100 100");
  Object.assign(svg.style, { left: `${cx - size / 2}px`, top: `${cy - size / 2}px`, width: `${size}px`, height: `${size}px`, stroke: color });
  const tick = Array.from({ length: 12 }, (_, k) => { const a = (k * Math.PI) / 6; return `M${(44 * Math.cos(a)).toFixed(1)} ${(44 * Math.sin(a)).toFixed(1)} L${(40 * Math.cos(a)).toFixed(1)} ${(40 * Math.sin(a)).toFixed(1)}`; }).join(" ");
  const star = Array.from({ length: 6 }, (_, k) => { const a = (k * Math.PI) / 3 - Math.PI / 2; return `${(34 * Math.cos(a)).toFixed(1)},${(34 * Math.sin(a)).toFixed(1)}`; });
  svg.innerHTML = `<circle r="47" pathLength="1"/><circle r="38" pathLength="1"/><path d="${tick}" pathLength="1"/><polygon points="${star[0]} ${star[2]} ${star[4]}" pathLength="1"/><polygon points="${star[1]} ${star[3]} ${star[5]}" pathLength="1"/>`;
  document.body.appendChild(svg);
  svg.animate([{ transform: "rotate(-20deg) scale(.92)", opacity: 0 }, { transform: "rotate(0deg) scale(1)", opacity: 1, offset: 0.35 }, { transform: "rotate(12deg) scale(1.04)", opacity: 0 }], { duration: 950, easing: "cubic-bezier(.2,.7,.3,1)" }).onfinish = () => svg.remove();
}

/** A bright flash over the card the moment it lands. */
function flash(to: DOMRect) {
  const e = document.createElement("div");
  e.className = "fx fx-flash";
  Object.assign(e.style, { left: `${to.left + to.width / 2}px`, top: `${to.top + to.height / 2}px`, width: `${to.width * 1.1}px`, height: `${to.height * 1.1}px` });
  document.body.appendChild(e);
  e.animate([{ transform: "translate(-50%,-50%) scale(.9)", opacity: 0.95 }, { transform: "translate(-50%,-50%) scale(1.15)", opacity: 0 }], { duration: 320, easing: "ease-out" }).onfinish = () => e.remove();
}

/** A low ring of dust spreading from under a card that has just landed. */
function dust(to: DOMRect) {
  const e = document.createElement("div");
  e.className = "fx fx-dust";
  Object.assign(e.style, { left: `${to.left + to.width / 2}px`, top: `${to.top + to.height - 6}px`, width: `${to.width}px`, height: `${to.width * 0.22}px` });
  document.body.appendChild(e);
  e.animate([{ transform: "translate(-50%,-50%) scale(.6)", opacity: 0.8 }, { transform: "translate(-50%,-50%) scale(1.5)", opacity: 0 }], { duration: 450, easing: "cubic-bezier(.2,.7,.3,1)" }).onfinish = () => e.remove();
}

/** The flourish when a card lands in its space; `name` is the class, or empty for a species or background. */
function land(name: string, to: DOMRect, target: HTMLElement) {
  const cx = to.left + to.width / 2, cy = to.top + to.height / 2;
  const n = name.toLowerCase();
  if (/barbarian/.test(n)) { rings(cx, cy, "#e0412c", 2, 140); sparks(cx, cy, ["#ff5a36", "#ffb347", "#c81e1e"], 30, 170); }
  else if (/fighter/.test(n)) { slash(to, "#ffb347"); sparks(cx, cy, ["#ffd27a", "#ff7a2e", "#fff"], 24, 150); }
  else if (/paladin/.test(n)) { beam(to, "#ffd36a"); sparks(cx, cy, ["#ffe7a3", "#fff"], 16, 120); }
  else if (/ranger/.test(n)) { for (let k = 0; k < 3; k++) particle("fx-arrow", to.left - 120 - k * 30, cy - 30 + k * 30, to.width * 0.55 + 120, rnd(-6, 6), { duration: 260, delay: k * 60, scaleTo: 1 }); drift(to, "fx-leaf", 10, { colors: ["#6aa84f", "#8fbf4a", "#4e7a32"] }); }
  else if (/rogue/.test(n)) { drift(to, "fx-smoke", 12, { colors: ["#1b1b24", "#2c2a3a"], size: [30, 60], rise: 60, duration: [500, 800] }); slash(to, "#8b7bd8", 32); }
  else if (/monk/.test(n)) { rings(cx, cy, "#9fd8ff", 3, 150); drift(to, "fx-dot", 10, { colors: ["#cfeeff", "#7cc4ff"], size: [4, 7] }); }
  else if (/cleric/.test(n)) { rays(cx, cy, "rgba(255, 236, 170, .9)", Math.max(to.width, to.height) * 1.6); drift(to, "fx-dot", 12, { colors: ["#fff7d1", "#ffe08a"], size: [3, 6] }); }
  else if (/druid/.test(n)) { drift(to, "fx-leaf", 18, { colors: ["#5f9e3a", "#8cc152", "#3f7a2a", "#e3c35a"], rise: 190 }); rings(cx, cy, "#7fbf5a", 1, 170); }
  else if (/wizard/.test(n)) { sigil(to, "#8fc3ff"); drift(to, "fx-dot", 10, { colors: ["#bfe0ff", "#6ea8ff"], size: [3, 6] }); }
  else if (/sorcerer/.test(n)) { lightning(to, "#9d7bff"); sparks(cx, cy, ["#c9b6ff", "#7b5bff", "#fff"], 18, 130); }
  else if (/warlock/.test(n)) { drift(to, "fx-smoke", 14, { colors: ["#3b1f5a", "#1f5a3b", "#5a1f4f"], size: [30, 64], rise: 110, duration: [650, 950] }); sparks(cx, cy, ["#7dff9a", "#c27dff"], 14, 110); }
  else if (/bard/.test(n)) { drift(to, "fx-note", 12, { colors: ["#ffd36a", "#ff8ad8", "#8ad8ff", "#b4ff8a"], texts: ["♪", "♫", "♩", "♬"], size: [16, 26], rise: 170 }); }
  else if (/artificer/.test(n)) { drift(to, "fx-gear", 7, { colors: ["#d9a441", "#b0b8c0"], texts: ["⚙"], size: [18, 30], rise: 110 }); sparks(cx, cy, ["#ffb347", "#ffe08a"], 16, 120); }
  else { sigil(to, "#ffd98a"); drift(to, "fx-dot", 9, { colors: ["#ffcf7a"], size: [3, 5] }); }
  // Every landing flashes bright on the card and kicks up a ring of dust under it.
  flash(to);
  dust(to);
  void target;
}

/** Where a turned-over card sits: the middle of the window. Matches .card-back in the styles. */
function backRect(): DOMRect {
  const w = Math.min(680, window.innerWidth * 0.92), h = Math.min(window.innerHeight * 0.82, 680);
  return new DOMRect((window.innerWidth - w) / 2, (window.innerHeight - h) / 2, w, h);
}

/** A picked card flies up to the middle and turns edge-on; its back (the choices) then turns the rest of the way. */
function flyToBack(from: DOMRect | null, label: string, kind: Kind, to: DOMRect, done: () => void) {
  const start = from ?? new DOMRect(to.left + to.width / 2 - 90, window.innerHeight + 40, 180, 40);
  const card = document.createElement("div");
  card.className = "board-flycard";
  card.style.setProperty("--hue", String(HUE[kind]));
  card.innerHTML = "<small></small><b></b>";
  card.querySelector("small")!.textContent = TITLE[kind];
  card.querySelector("b")!.textContent = label;
  document.body.appendChild(card);
  const at = (x: number, y: number, w: number, h: number, font: number, turn: number): Keyframe => ({ left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, fontSize: `${font}px`, transform: `perspective(1200px) rotateY(${turn}deg)` });
  const h0 = Math.max(start.height, 34);
  card.animate(
    [
      { ...at(start.left, start.top, start.width, h0, 14, 0), opacity: 0 },
      { ...at(start.left, start.top - 12, start.width, h0, 14, 0), opacity: 1, offset: 0.15 },
      { ...at(to.left, to.top, to.width, to.height, 34, 0), offset: 0.72 },
      { ...at(to.left, to.top, to.width, to.height, 34, 90), opacity: 1, offset: 1 },
    ],
    { duration: 560, easing: "cubic-bezier(.3,.7,.3,1)", fill: "forwards" },
  ).onfinish = () => { card.remove(); done(); };
}

/** × on a new pick: the card shrinks back toward the list it came from. */
function flyHome(from: DOMRect, to: DOMRect, label: string, kind: Kind) {
  const card = document.createElement("div");
  card.className = "board-flycard";
  card.style.setProperty("--hue", String(HUE[kind]));
  card.innerHTML = "<small></small><b></b>";
  card.querySelector("small")!.textContent = TITLE[kind];
  card.querySelector("b")!.textContent = label;
  document.body.appendChild(card);
  card.animate(
    [
      { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, fontSize: "30px", opacity: 1 },
      { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${Math.max(to.height, 30)}px`, fontSize: "13px", opacity: 0 },
    ],
    { duration: 380, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" },
  ).onfinish = () => card.remove();
}

/**
 * The big choices (species, class, background) arrive as a card: it glides from the list to its space, growing to
 * fit, and an arcane circle draws itself around it as it lands, with a few embers drifting up.
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
  // Hearthstone-style: the card lifts toward you as it travels, hangs just above its space a little larger, then
  // slams down into it.
  const midX = start.left + (to.left - start.left) * 0.5, midY = Math.min(start.top, to.top) - 50;
  const big = 1.12;
  const anim = card.animate(
    [
      { ...box(start.left, start.top, start.width, h0, 14, 0, 0), opacity: 0, offset: 0 },
      { ...box(start.left, start.top - 10, start.width, h0, 14, 0, -2), opacity: 1, offset: 0.12 },
      { ...box(midX - (to.width * (big - 1)) / 2, midY, ((start.width + to.width) / 2) * 1.05, ((h0 + to.height) / 2) * 1.05, 22, 0, 2), offset: 0.5 },
      { ...box(to.left - (to.width * (big - 1)) / 2, to.top - (to.height * (big - 1)) / 2 - 18, to.width * big, to.height * big, 30, 0, 0), offset: 0.8, easing: "cubic-bezier(.55,0,1,.45)" },
      { ...box(to.left, to.top, to.width, to.height, 28, 0, 0), opacity: 1, offset: 1 },
    ],
    { duration: 620, easing: "cubic-bezier(.22,.8,.24,1)", fill: "forwards" },
  );
  anim.onfinish = () => {
    card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: "forwards" }).onfinish = () => card.remove();
    delete target.dataset.awaiting;
    delete target.dataset.impact;
    void target.offsetWidth;
    target.dataset.impact = kind === "class" && HEAVY.test(label) ? "heavy" : "1";
    window.setTimeout(() => delete target.dataset.impact, 900);
    // The landing: a class lands with its own effect, a species or background with the arcane circle.
    land(kind === "class" ? label : "", to, target);
  };
}

/**
 * A heavy spellbook that thickens as spells are chosen: the page block grows and the cover, with its straps, clasps
 * and brass corners, rises with it. Full, it crackles with arcane light and a wisp of smoke curls up. Transforms
 * only, so it animates in WebKit as well.
 */
function SpellBook({ f }: { f: number }) {
  const t = 0.12 + 0.88 * f; // share of the full thickness
  const H = 30; // the full thickness, in the drawing's units
  // The book lies at an angle: front edge from (10,92) to (78,104), right edge to (110,80), back to (42,68).
  const top = (y: number) => `M10 ${92 + y} L78 ${104 + y} L110 ${80 + y} L42 ${68 + y} Z`;
  return (
    <svg className="board-book" viewBox="0 0 120 120" role="img" aria-label={`Spellbook ${Math.round(f * 100)}% full`}>
      <defs>
        <linearGradient id="sbCover" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#9b4632" /><stop offset=".6" stopColor="#7a3022" /><stop offset="1" stopColor="#4f1c14" /></linearGradient>
        <linearGradient id="sbPages" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#f3e2b4" /><stop offset="1" stopColor="#c9a86a" /></linearGradient>
        <linearGradient id="sbBrass" x1="0" x2="1"><stop offset="0" stopColor="#f6dc94" /><stop offset=".5" stopColor="#c8963c" /><stop offset="1" stopColor="#8a6020" /></linearGradient>
      </defs>
      <ellipse cx="60" cy="104" rx="50" ry="9" fill="#000" opacity=".32" />
      {/* back cover */}
      <path d={top(0)} fill="#3b130d" />
      <path d="M10 92 L78 104 L78 108 L10 96 Z M78 104 L110 80 L110 84 L78 108 Z" fill="#2a0d09" />
      {/* the page edges, front and right: each face grows up from its own bottom edge (skewed to the book's angle) */}
      <g transform="translate(10 92) skewY(10)">
        <g className="board-book-block" style={{ transform: `scaleY(${t})` }}>
          <rect x="0" y={-H} width="68" height={H} fill="url(#sbPages)" stroke="#9c7b45" strokeWidth=".6" />
          {Array.from({ length: 8 }, (_, k) => <path key={k} d={`M0 ${(-H * (k + 1)) / 9} h68`} stroke="#b8975e" strokeWidth=".45" />)}
        </g>
      </g>
      <g transform="translate(78 104) skewY(-36.87)">
        <g className="board-book-block" style={{ transform: `scaleY(${t})` }}>
          <rect x="0" y={-H} width="32" height={H} fill="#e6cf98" stroke="#9c7b45" strokeWidth=".6" />
          {Array.from({ length: 8 }, (_, k) => <path key={k} d={`M0 ${(-H * (k + 1)) / 9} h32`} stroke="#b8975e" strokeWidth=".45" />)}
        </g>
      </g>
      {/* ribbons from the pages */}
      {f > 0.4 && <path className="board-book-ribbon" d="M52 100 l-1 12 l3 -3 l3 3 l1 -11 z" fill="#8a1f2a" />}
      {f > 0.8 && <path className="board-book-ribbon" d="M60 102 l-1 11 l3 -3 l3 3 l1 -10 z" fill="#1f4f8a" />}
      {/* the cover, lifted by the thickness, with its border, straps, clasps and corners */}
      <g className="board-book-cover" style={{ transform: `translateY(${-H * t}px)` }}>
        <path d="M10 92 L78 104 L78 107 L10 95 Z M78 104 L110 80 L110 83 L78 107 Z" fill="#4f1c14" />
        <path d={top(0)} fill="url(#sbCover)" stroke="#2a0d09" strokeWidth="1" />
        <path d="M19 91 L76 100.5 L101 82 L44 72.5 Z" fill="none" stroke="#c9963f" strokeWidth=".7" opacity=".7" />
        <path d="M22 90.5 L74 99 L97 82.4 L46 74 Z" fill="none" stroke="#3b130d" strokeWidth=".6" strokeDasharray="1.5 1.5" opacity=".7" />
        {/* two straps across the cover, over the front edge */}
        {[0.3, 0.68].map((k) => {
          const x0 = 10 + 32 * k, y0 = 92 - 24 * k, x1 = 78 + 32 * k, y1 = 104 - 24 * k;
          return (
            <g key={k}>
              <path d={`M${x0 - 3} ${y0 + 1} L${x1 - 3} ${y1 + 1} L${x1 + 3} ${y1 - 2} L${x0 + 3} ${y0 - 2} Z`} fill="#3d2414" />
              <path d={`M${x1 - 3} ${y1 + 1} l0 5 l6 -3 l0 -5 z`} fill="#2e1a0e" />
              <rect x={x0 + (x1 - x0) * 0.22 - 3} y={y0 + (y1 - y0) * 0.22 - 3} width="6" height="5" rx="1.5" fill="url(#sbBrass)" />
              <rect x={x0 + (x1 - x0) * 0.78 - 3} y={y0 + (y1 - y0) * 0.78 - 3} width="6" height="5" rx="1.5" fill="url(#sbBrass)" />
            </g>
          );
        })}
        {/* brass corners */}
        <path d="M10 92 l10 1.8 l-3 2.4 z M78 104 l-10 -1.8 l6 -3 z M110 80 l-8 6 l-2 -3 z M42 68 l8 1.4 l-5 3 z" fill="url(#sbBrass)" />
        <g transform="translate(60 86) scale(1 .5)" opacity={0.35 + f * 0.65}>
          <circle r="7" fill="none" stroke="#ffd98a" strokeWidth="1.3" />
          <path d="M0-5 1.5-1.5 5 0 1.5 1.5 0 5-1.5 1.5-5 0-1.5-1.5z" fill="#ffd98a" />
        </g>
      </g>
      {/* full: arcane crackles along the edges and a wisp of smoke */}
      {f >= 1 && (
        <g className="board-book-charged">
          <path d="M14 66 l4 6 l-3 3 l5 7" fill="none" stroke="#8fd0ff" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M100 52 l-3 7 l4 2 l-3 8" fill="none" stroke="#8fd0ff" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M66 98 l4 4 l-2 4 l5 4" fill="none" stroke="#8fd0ff" strokeWidth="1.2" strokeLinejoin="round" />
          <path className="board-book-smoke" d="M80 44 q-6 -8 2 -14 q8 -6 0 -14" fill="none" stroke="#cfcfd6" strokeWidth="2.4" strokeLinecap="round" opacity=".5" />
        </g>
      )}
    </svg>
  );
}

/**
 * A rucksack that fills with gear as the starting equipment goes in, and empties as it comes out: papers in the
 * front pocket, rope at the side, a bedroll buckled on top, a sword, a pouch and herbs, a scroll in the side sleeve.
 */
/** A coin purse with a few coins beside it, for the shop on the backpack's card back. */
function Purse() {
  return (
    <svg className="board-pack" viewBox="0 0 120 120" role="img" aria-label="Coin purse">
      <path d="M44 38c-4-8 2-14 16-14s20 6 16 14" fill="none" stroke="var(--gold2)" strokeWidth="4" strokeLinecap="round" />
      <path d="M40 40h40l-4 8c18 8 26 22 22 38-3 12-16 18-38 18s-35-6-38-18c-4-16 4-30 22-38z" fill="hsl(30 40% 26%)" stroke="var(--gold)" strokeWidth="2.5" />
      <path d="M42 48h36" stroke="var(--gold2)" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="96" cy="100" rx="11" ry="4.5" fill="var(--gold)" stroke="#0006" />
      <ellipse cx="96" cy="94" rx="11" ry="4.5" fill="var(--gold2)" stroke="#0006" />
      <ellipse cx="22" cy="102" rx="9" ry="3.8" fill="var(--gold2)" stroke="#0006" />
    </svg>
  );
}

function Backpack({ f }: { f: number }) {
  const has = (at: number) => f > 0 && f >= at - 1e-9;
  const brass = "url(#bpBrass)";
  const buckle = (x: number, y: number, w = 7, h = 6) => <><rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx="1.2" fill="none" stroke={brass} strokeWidth="1.6" /><path d={`M${x} ${y - h / 2} v${h}`} stroke={brass} strokeWidth="1" /></>;
  return (
    <svg className="board-pack" viewBox="0 0 120 120" role="img" aria-label={`Backpack ${Math.round(f * 100)}% full`}>
      <defs>
        <linearGradient id="bpLeather" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#8f6440" /><stop offset=".55" stopColor="#6e4a2c" /><stop offset="1" stopColor="#4a2f1a" /></linearGradient>
        <linearGradient id="bpDark" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#6b4529" /><stop offset="1" stopColor="#3e2716" /></linearGradient>
        <linearGradient id="bpBrass" x1="0" x2="1"><stop offset="0" stopColor="#f2d58a" /><stop offset=".5" stopColor="#c4923c" /><stop offset="1" stopColor="#86601f" /></linearGradient>
        <linearGradient id="bpRoll" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#7d9450" /><stop offset="1" stopColor="#4a5c2c" /></linearGradient>
        <pattern id="bpBraid" width="6" height="5" patternUnits="userSpaceOnUse"><rect width="6" height="5" fill="#c9a454" /><path d="M0 0 L3 2.5 L6 0 M0 5 L3 2.5 L6 5" stroke="#8a6a2a" strokeWidth=".8" fill="none" /></pattern>
      </defs>
      <ellipse cx="58" cy="112" rx="34" ry="5" fill="#000" opacity=".32" />
      <g className="board-pack-body" style={{ transform: `scale(${0.94 + f * 0.06})` }}>
        {/* the shoulder strap behind, hanging to the right */}
        <path d="M80 36 q24 4 22 40 q-1 20 -6 30" fill="none" stroke="#5a3a1e" strokeWidth="5" strokeLinecap="round" />
        {/* behind the bag: the sword, the herbs, the rope */}
        {has(0.55) && <g className="board-item"><path d="M34 60 L24 22" stroke="#c7ced6" strokeWidth="3.2" strokeLinecap="round" /><path d="M18 27 L30 23.5" stroke={brass} strokeWidth="3" strokeLinecap="round" /><path d="M24 22 L21.8 13" stroke="#3b2412" strokeWidth="3.4" strokeLinecap="round" /><circle cx="21.5" cy="11.8" r="2.4" fill={brass} /></g>}
        {has(0.7) && <g className="board-item"><path d="M24 78 q-10 -6 -14 -2 q6 2 8 6 z" fill="#3f7a35" /><path d="M24 82 q-12 2 -14 8 q8 -2 12 -4 z" fill="#2f6a2a" /><circle cx="13" cy="79" r="2.4" fill="#e07a9a" /><circle cx="15" cy="86" r="2" fill="#e07a9a" /></g>}
        {has(0.25) && <g className="board-item"><ellipse cx="22" cy="62" rx="8" ry="10" fill="none" stroke="#d9c79a" strokeWidth="3" /><ellipse cx="22" cy="62" rx="4.5" ry="6.5" fill="none" stroke="#b9a676" strokeWidth="2.4" /></g>}
        {/* the bedroll buckled on top */}
        {has(0.4) && <g className="board-item"><rect x="26" y="14" width="64" height="18" rx="9" fill="url(#bpRoll)" stroke="#2c331c" strokeWidth="1.2" /><path d="M30 20 q30 3 56 0" fill="none" stroke="#a2b479" strokeWidth=".9" opacity=".6" /><circle cx="88" cy="23" r="7" fill="#5f7144" stroke="#2c331c" strokeWidth="1" /><path d="M88 23 m-4 0 a4 4 0 1 1 4 4 a2.5 2.5 0 1 1 -2 -2.5" fill="none" stroke="#3a4625" strokeWidth="1" /><rect x="40" y="12" width="5" height="22" rx="1.2" fill="#4a2c16" /><rect x="70" y="12" width="5" height="22" rx="1.2" fill="#4a2c16" />{buckle(42.5, 30)}{buckle(72.5, 30)}</g>}
        {/* the body: tall, rounded at the top */}
        <path d="M30 40 q2 -10 28 -10 q26 0 28 10 l4 58 q0 10 -12 10 h-40 q-12 0 -12 -10 z" fill="url(#bpLeather)" stroke="#2b1a0c" strokeWidth="1.6" />
        {/* the two braided bands down the front */}
        <path d="M44 36 v68" stroke="url(#bpBraid)" strokeWidth="5" />
        <path d="M72 36 v68" stroke="url(#bpBraid)" strokeWidth="5" />
        {/* the rounded flap with coloured piping, an emblem and its buckle */}
        <path d="M30 42 q0 -12 28 -12 q28 0 28 12 l0 12 l-28 10 l-28 -10 z" fill="url(#bpDark)" stroke="#a83a2a" strokeWidth="1.6" />
        <path d="M52 44 l6 -5 l6 5 l-6 6 z" fill="#c9a454" opacity=".85" />
        <path d="M58 64 v8" stroke="#3b2412" strokeWidth="5" />
        {buckle(58, 70, 8, 7)}
        {/* papers out of the lower pocket */}
        {has(0.1) && <g className="board-item"><rect x="38" y="70" width="13" height="16" rx="1" fill="#efe3c4" stroke="#9a8256" strokeWidth=".7" transform="rotate(-10 44 78)" /><rect x="47" y="68" width="13" height="18" rx="1" fill="#f8efd6" stroke="#9a8256" strokeWidth=".7" transform="rotate(6 53 77)" /></g>}
        {/* the deep lower pocket with its flap and buckle */}
        <path d="M30 80 h56 l1 18 q0 8 -9 8 h-40 q-9 0 -9 -8 z" fill="url(#bpLeather)" stroke="#2b1a0c" strokeWidth="1.3" />
        <path d="M30 80 h56 v6 q-28 8 -56 0 z" fill="url(#bpDark)" stroke="#a83a2a" strokeWidth="1.3" />
        <path d="M58 86 v8" stroke="#3b2412" strokeWidth="4.5" />
        {buckle(58, 93, 7, 6)}
        {/* the side sleeve with a scroll, and the pouch hanging from it */}
        <path d="M86 46 l8 2 l2 30 l-8 2 z" fill="url(#bpDark)" stroke="#2b1a0c" strokeWidth="1.1" />
        {has(0.85) && <g className="board-item"><rect x="86" y="30" width="9" height="20" rx="4.5" fill="#ece3cf" stroke="#9a8a6a" strokeWidth=".8" transform="rotate(8 90 40)" /><path d="M86 33 a4.5 2 0 0 0 9 0" fill="none" stroke="#9a8a6a" strokeWidth=".7" transform="rotate(8 90 40)" /></g>}
        {has(1) && <g className="board-item"><path d="M90 78 q-8 2 -8 12 q0 10 9 10 q9 0 9 -10 q0 -10 -8 -12 z" fill="#5c86a6" stroke="#2c4458" strokeWidth="1" /><path d="M86 79 q4 -4 8 0" fill="none" stroke="#3b2412" strokeWidth="1.4" /></g>}
        <path d="M36 104 q22 3 44 0" fill="none" stroke="#e7c98f" strokeWidth=".7" strokeDasharray="2 1.6" opacity=".5" />
      </g>
    </svg>
  );
}

/** Whether the window is too narrow for the three columns (the sides become floating panels). */
function useNarrow(): boolean {
  const q = "(max-width: 1250px)";
  const [n, setN] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setN(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return n;
}

/**
 * A score's number. Normally a click turns it into a box to type in; with `onRoll` (manual scores) the number shows a
 * die on hover and a click rolls it, and typing a digit on it still lets you enter a number.
 */
function EditNum({ value, onSet, min, max, label, onRoll }: { value: number; onSet: (n: number) => void; min: number; max: number; label: string; onRoll?: () => void }) {
  const [edit, setEdit] = useState<string | null>(null);
  if (edit === null && onRoll) {
    return (
      <button className="board-num rolls" title="Click to roll 4d6 and drop the lowest (shown in the dice log). Type a number to set it." aria-label={`${label} base score ${value}. Click to roll, or type a number`} onClick={onRoll} onKeyDown={(e) => { if (/^[0-9]$/.test(e.key)) { e.preventDefault(); setEdit(e.key); } }}>
        <span className="board-num-value">{value}</span><span className="board-num-die" aria-hidden="true"><D20 size={16} /></span>
      </button>
    );
  }
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
  // Each method keeps its own numbers: switching away and back picks up where they were.
  const setMethod = (m: Character["abilityMethod"]) =>
    set((c) => (m === c.abilityMethod ? c : {
      ...c,
      abilityMethod: m,
      abilityBases: { ...c.abilityBases, [c.abilityMethod]: c.abilityBase },
      abilityBase: c.abilityBases?.[m] ? c.abilityBases[m]! : m === "pointbuy" ? (() => { const lo = normalizeRules(c.pointBuy).min; return { strength: lo, dexterity: lo, constitution: lo, intelligence: lo, wisdom: lo, charisma: lo }; })()
        : m === "standard" ? (STANDARD_ARRAY.every((n) => Object.values(c.abilityBase).includes(n)) ? c.abilityBase : { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 })
        : c.abilityBase,
    }));
  const roll = (a: AbilityId) => requestRoll(`${ABILITY_LABEL[a]}: 4d6, the lowest die dropped`, "4d6kh3", (res) => setBase(a, res.total));
  const bonusText = (a: AbilityId) => r.stats.contributions(a).filter((x) => !x.inline).map((b) => `${b.value.startsWith("-") ? "" : "+"}${b.value} ${b.from}`).join(", ");
  const mime = "application/x-sf-score";
  // The main abilities of each class (its card tag, such as "Str and Cha"), outlined in that class's colour.
  const SHORT: Record<string, AbilityId> = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" };
  const primary = new Map<AbilityId, { cls: string; hue: number }>();
  for (const k of ch.classes) {
    const name = r.reg.get(k.classId)?.name ?? "";
    const tag = CLASS_TAGS[name]?.[1] ?? "";
    for (const word of tag.toLowerCase().split(/\W+/)) { const a = SHORT[word.slice(0, 3)]; if (a && !primary.has(a)) primary.set(a, { cls: name, hue: hueOf(name) }); }
  }
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
        {method === "manual" && <span>Click a score to roll 4d6 and drop the lowest, or type a number on it.</span>}
      </p>
      <div className="board-score-grid">
        {ABILITY_IDS.map((a) => {
          const line = sh.abilities.find((x) => x.id === a)!;
          const base = ch.abilityBase[a];
          const extra = line.score - base;
          return (
            <div
              key={a}
              className={`board-score ${over === a ? "over" : ""} ${held === a ? "held" : ""} ${primary.has(a) ? "primary" : ""}`}
                            title={[`${ABILITY_LABEL[a]}: base ${base}`, primary.has(a) ? `A main ability of the ${primary.get(a)!.cls}` : "", bonusText(a), `save ${signed(line.save)}${line.saveProficient ? " (proficient)" : ""}`].filter(Boolean).join("\n")}
              onDragOver={method === "standard" ? (e) => { if (e.dataTransfer.types.includes(mime)) { e.preventDefault(); setOver(a); } } : undefined}
              onDragLeave={() => setOver(null)}
              onDrop={method === "standard" ? (e) => { e.preventDefault(); setOver(null); const from = e.dataTransfer.getData(mime) as AbilityId; if (from) swap(from, a); } : undefined}
            >
              <small>{ABILITY_LABEL[a].slice(0, 3).toUpperCase()}{line.saveProficient && <span className="board-saveprof" title="Proficient in this saving throw">save</span>}</small>
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
                    <EditNum value={base} label={ABILITY_LABEL[a]} min={method === "pointbuy" ? rules.min : 1} max={method === "pointbuy" ? rules.max : 30} onSet={(n) => setBase(a, n)} onRoll={method === "manual" ? () => roll(a) : undefined} />
                    <button className="board-step" aria-label={`Raise ${ABILITY_LABEL[a]}`} disabled={method === "pointbuy" ? !canRaise(rules, ch.abilityBase, a) : base >= 30} onClick={() => setBase(a, base + 1)}>+</button>
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

/**
 * The books a chosen card exists in. In the open card (`strip`): a strip of buttons side by side, oldest to newest, the
 * current one highlighted, scrolling sideways when they do not fit. On the board's summary card: only the current book,
 * with the others unfolding above it on hover or focus, so the card keeps its look. A click switches to that book.
 */
function SourcePicker({ g, activeId, onPick, strip = false }: { g: Group; activeId: string; onPick: (el: AElement) => void; strip?: boolean }) {
  const active = g.variants.find((v) => v.el.id === activeId) ?? g.best;
  const byDate = [...g.variants].sort((a, b) => (a.book.release ?? 0) - (b.book.release ?? 0) || a.el.source.localeCompare(b.el.source));
  const year = (r?: number) => (r ? String(Math.floor(r / 10000)) : "");
  const title = (v: typeof active) => `${v.book.name || v.el.source}${v.book.release ? `, ${formatRelease(v.book.release)}` : ""}`;
  const label = (v: typeof active) => <><b>{v.book.abbr ?? v.el.source}</b><small>{year(v.book.release)}</small><KindTag v={v} /></>;
  if (strip) {
    return (
      <div className="src-strip" role="group" aria-label="Book">
        {byDate.map((v) => (
          <button key={v.el.id} className={v === active ? "on" : ""} aria-pressed={v === active} title={title(v)} disabled={v.el.comingSoon && v !== active} onClick={() => v !== active && onPick(v.el)}>{label(v)}</button>
        ))}
      </div>
    );
  }
  const others = byDate.filter((v) => v !== active);
  return (
    <div className={`src-pick ${others.length ? "has-more" : ""}`}>
      {others.length > 0 && (
        <div className="src-more" role="group" aria-label="Other books">
          {others.map((v) => <button key={v.el.id} title={title(v)} disabled={v.el.comingSoon} onClick={() => onPick(v.el)}>{label(v)}</button>)}
        </div>
      )}
      <button className="src-current" title={others.length ? `${title(active)}. Hover for other books.` : title(active)} aria-haspopup={others.length ? "true" : undefined}>{label(active)}{others.length > 0 && <span className="src-more-mark" aria-hidden="true">+</span>}</button>
    </div>
  );
}

/** The portrait in an arched frame at the top of the right column, with the name and what the character is. Click to change it. */
function PortraitCard({ r, ch, set }: { r: Resolved; ch: Character; set: SetCharacter }) {
  const [open, setOpen] = useState(false);
  const sh = useMemo(() => buildSheet(r), [r]);
  const hp = Math.max(0, Math.min(sh.hp, ch.play.hp ?? sh.hp));
  const dice = sh.hitDice.reduce((n, h) => n + h.count, 0);
  const diceLeft = Math.max(0, dice - (ch.play.hitDiceUsed ?? 0));
  const dieNames = sh.hitDice.map((h) => `d${h.die}`).join("+");
  const [crop, setCrop] = useState<File | null>(null);
  const [hpOpen, setHpOpen] = useState(false);
  const race = ch.race ? r.reg.get(ch.race)?.name : "";
  const what = [race, ch.classes.map((c) => `${r.reg.get(c.classId)?.name ?? c.classId} ${c.level}`).join(" / ")].filter(Boolean).join(" · ");
  const pick = (url: string) => { set((c) => ({ ...c, portrait: url })); setOpen(false); };
  return (
    <div className="board-who">
      <button className="board-arch" onClick={() => setOpen(true)} title={ch.portrait ? "Change the portrait" : "Add a portrait"} aria-label={ch.portrait ? "Change the portrait" : "Add a portrait"}>
        {ch.portrait ? <img src={ch.portrait} alt="" /> : <span className="board-arch-empty"><Head size={44} /><small>Add portrait</small></span>}
      </button>
      <div className="board-who-text">
        <TextInput className="board-name" placeholder="Character name" aria-label="Character name" value={ch.name} onCommit={(v) => set((c) => ({ ...c, name: v }))} />
        <span className="board-who-what">
          <small>{what || "Nothing chosen yet"}</small>
          <button className="board-details" title="Alignment, personality, backstory, notes and the rest" onClick={() => window.dispatchEvent(new CustomEvent("cf-details"))}>
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg> Details
          </button>
        </span>
        {sh.hp > 0 && (
          <div className="board-bars">
            <button type="button" className="board-bar hp" title={`Hit points ${hp} of ${sh.hp}${ch.play.tempHp ? `, ${ch.play.tempHp} temporary` : ""}. Click for the hit point rolls.`} onClick={() => setHpOpen(true)}>
              <span style={{ width: `${(100 * hp) / sh.hp}%` }} /><b>HP {hp}/{sh.hp}{ch.play.tempHp ? ` +${ch.play.tempHp}` : ""}</b>
            </button>
            {dice > 0 && (
              <div className="board-bar hd" title={`Hit dice ${diceLeft} of ${dice} (${dieNames})`}>
                <span style={{ width: `${(100 * diceLeft) / dice}%` }} /><b>Hit dice {diceLeft}/{dice} {dieNames}</b>
              </div>
            )}
          </div>
        )}
      </div>
      {open && createPortal(
        <div className="modal-back" onClick={() => setOpen(false)}>
          <div className="modal-page themed board-modal" role="dialog" aria-label="Portrait" onClick={(e) => e.stopPropagation()}>
            <button className="board-x" aria-label="Close" onClick={() => setOpen(false)}>×</button>
            <h2>Portrait</h2>
            <div className="row">
              {ch.portrait && <img className="portrait small" src={ch.portrait} alt="Portrait" />}
              <label>Your own image: <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f && f.type.startsWith("image/")) { setCrop(f); setOpen(false); } }} /></label>
              {ch.portrait && <button onClick={() => { set((c) => ({ ...c, portrait: undefined })); setOpen(false); }}>Remove</button>}
            </div>
            <PortraitPicker onPick={pick} />
          </div>
        </div>,
        document.body,
      )}
      {crop && <PortraitCropper file={crop} onCancel={() => setCrop(null)} onDone={(url) => { pick(url); setCrop(null); }} />}
      {hpOpen && <HpRollsDialog r={r} ch={ch} set={set} onClose={() => setHpOpen(false)} />}
    </div>
  );
}

/** The right column: scores first, then the numbers, the open score increases and what the character is trained in. */
function StatsPanel({ r, ch, set, onIncreases, onMouseLeave }: { r: Resolved; ch: Character; set: SetCharacter; onIncreases: (root: string) => void; onMouseLeave?: () => void }) {
  const sh = useMemo(() => buildSheet(r), [r]);
  const tiles: [string, string][] = [["HP", String(sh.hp)], ["AC", String(sh.ac.value)], ["Init", signed(sh.initiative)], ["Speed", `${sh.speed} ft`], ["Prof", signed(sh.proficiency)]];
  const increases = r.slots.filter((s) => tabOfSlot(s) === "abilities");
  const openIncreases = increases.filter((s) => stillToChoose(s, r)).length;
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
    <aside className="board-stats" aria-label="Scores and training" onMouseLeave={onMouseLeave}>
      <PortraitCard r={r} ch={ch} set={set} />
      <Scores r={r} ch={ch} set={set} />
      <div className="board-tiles">{tiles.map(([k, v]) => <div key={k} className="board-tile"><small>{k}</small><b>{v}</b></div>)}</div>
      {openIncreases > 0 && (
        <p className="board-incr">
          <span className="warn">{openIncreases} score {openIncreases === 1 ? "increase" : "increases"} to choose</span>
          <button className="pick-select" onClick={() => onIncreases(increases.find((s) => stillToChoose(s, r))!.root)}>Choose</button>
        </p>
      )}
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
  // On a narrow window the lists and the scores sit at the sides as floating panels: `side` is the one showing, and
  // `flyHide` puts it aside while a big choice lands, then it comes back.
  const narrow = useNarrow();
  const [side, setSide] = useState<"left" | "right" | null>(null);
  const [flyHide, setFlyHide] = useState(false);
  /** The card turned over to its back (its choices): a new pick waiting for Done, or a card opened to edit. */
  const [back, setBack] = useState<Back | null>(null);
  // The spellbook's and backpack's own view on their card back: only the prepare-spells picker, only the inventory
  // (C1.5) or the shop (C3), toggled by clicking the book, the pack or the purse; null shows everything.
  const [backView, setBackView] = useState<"prepare" | "inventory" | "shop" | null>(null);
  /** Turns a filled card over to edit its choices (quickly; Done turns it back). */
  const openBack = (kind: Kind) => { setFocus(kind); setBack({ kind, mode: "edit", snap: ch, from: null, name: "", phase: "open" }); };
  /** Done (keep) or × (undo everything since the card turned over). */
  const finish = (keep: boolean) => {
    const b = back;
    if (!b) return;
    const rect = backRect();
    setBack(null);
    if (!keep) {
      set(() => b.snap);
      if (b.mode === "new" && b.from && !reduced()) flyHome(rect, b.from, b.name, b.kind);
      // Not placed: the list it came from stays open.
      if (b.mode === "new") setOpen(b.kind);
      return;
    }
    // Placed: a newly filled core space moves the lists on to the next empty one.
    const core: Kind[] = ["race", "class", "background"];
    if (b.mode === "new" && core.includes(b.kind)) setOpen(core.find((k) => k !== b.kind && !filled[k]) ?? null);
    const tileEl = document.querySelector<HTMLElement>(`[data-tile="${b.kind}"]`);
    if (b.mode === "new" && tileEl && !reduced()) {
      if (narrow) { setFlyHide(true); window.setTimeout(() => setFlyHide(false), 900); }
      epicFly(rect, b.name, b.kind, tileEl);
    } else if (tileEl) { tileEl.classList.remove("board-filled-anim"); void tileEl.offsetWidth; tileEl.classList.add("board-filled-anim"); }
  };
  useEffect(() => {
    if (!back) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") finish(true); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  /**
   * Opens a list; on a narrow window it also brings out the lists panel (a click there never just closes it). A second
   * click closes the list, and on a narrow window the panel with it, so no empty panel stays over the cards (C1.1).
   */
  const toggleList = (kind: Kind) => {
    if (narrow && side !== "left") { setOpen(kind); setSide("left"); return; }
    if (open === kind) { setOpen(null); if (narrow) setSide(null); return; }
    setOpen(kind);
  };
  /** Change on the class card: the next class picked replaces the starting class instead of adding a multiclass. */
  const [replacing, setReplacing] = useState(false);
  const lastRow = useRef<DOMRect | null>(null);
  const lastName = useRef("");
  const sheet = useMemo(() => buildSheet(r), [r]);

  const visible = (items: AElement[]) => items.filter((e) => !e.compendiumHidden && !hiddenBy(books.info(e.source), e.source, { legacy: prefs.showLegacy, playtest: prefs.showPlaytest, unusual: prefs.showUnusual, scifi: prefs.showSciFi, modern: prefs.showModern }, e.type, e.supports));
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
    // The lists move on to the next empty core space only when the card is kept (Done, in finish): closing it with ×
    // puts the pick back and leaves the player in the same list.
    const core: Kind[] = ["race", "class", "background"];
    setFocus(kind);
    if (core.includes(kind)) {
      // A big choice flies up and turns over: its back holds its choices, and Done lands it (× takes it back).
      // A second pick while this card is open (a double click, a change of mind) keeps the first "before": × still
      // puts back what was there before the card turned over.
      const snap = back && back.mode === "new" && back.kind === kind ? back.snap : ch;
      const b: Back = { kind, mode: "new", snap, from, name: el.name, phase: reduced() ? "open" : "flying" };
      setBack(b);
      if (!reduced()) flyToBack(from, el.name, kind, backRect(), () => setBack((cur) => (cur && cur.phase === "flying" ? { ...cur, phase: "open" } : cur)));
      return;
    }
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
  const prepares = sheet.casting.some((l) => l.prepare);
  const spellCount = sheet.casting.reduce((n, c) => n + c.cantripsKnown.length + c.spells.length, 0);
  // Spells are picked inside their own choices, so a new one is noticed by the count going up.
  const spellsBefore = useRef(spellCount);
  useEffect(() => {
    if (spellCount > spellsBefore.current) fly(lastRow.current, lastName.current, "magic");
    spellsBefore.current = spellCount;
  }, [spellCount]);
  // How far along the spells and the starting gear are, 0 to 1, for the book and the backpack.
  const magicSlots = r.slots.filter((s) => tabOfSlot(s) === "magic" && !s.rule.optional);
  // The spellbook fills with what the player has picked: spells and cantrips to learn (a choice the content filled
  // in by default does not count), and the spells prepared, out of what each allows. Nothing to pick leaves it thin.
  const preparing = sheet.casting.filter((c) => c.prepare && c.prepareMax > 0);
  const preparedOf = (c: (typeof sheet.casting)[number]) => Math.min(c.prepareMax, (ch.prepared[c.name] ?? []).length);
  const spellNeed = magicSlots.reduce((n, s) => n + s.rule.number, 0) + preparing.reduce((n, c) => n + c.prepareMax, 0);
  const spellHave = magicSlots.reduce((n, s) => n + (s.defaulted ? 0 : Math.min(s.chosen.length, s.rule.number)), 0) + preparing.reduce((n, c) => n + preparedOf(c), 0);
  const spellFill = spellNeed ? spellHave / spellNeed : 0;
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
    ...r.slots.filter((sl) => stillToChoose(sl, r)).map((sl) => ({ kind: kindOfSlot(sl), text: `${sl.rule.name}: ${sl.rule.number - sl.chosen.length} to choose`, list: false })),
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
    race: <Browse items={races} type="Race" chosen={ch.race ? [ch.race] : []} onPick={pick("race")} onSwap={(_, to) => pick("race")(to)} defaultView="cards" mini viewKey="board.Race" perPage={300} draggable />,
    class: (
      <>
        <Browse items={classes} type="Class" chosen={ch.classes.map((c) => c.classId)} onPick={pick("class")} defaultView="cards" mini viewKey="board.Class" perPage={300} draggable disabledReason={ch.classes.length && !replacing ? classLock : undefined}
          barExtra={ch.classes.length > 0 && (
            <div className="board-class-mode">
              <span className="seg" role="group" aria-label="What a pick does">
                <button className={replacing ? "on" : ""} onClick={() => setReplacing(true)}>Change base class</button>
                <button className={!replacing ? "on" : ""} onClick={() => setReplacing(false)}>Add multiclass</button>
              </span>
              <small className="muted">{replacing ? `A pick replaces ${r.reg.get(ch.classes[0].classId)?.name ?? "the base class"}, keeping its level.` : "A pick adds a class at level 1."}</small>
            </div>
          )} />
      </>
    ),
    background: <Browse items={backgrounds} type="Background" chosen={ch.background ? [ch.background] : []} onPick={pick("background")} onSwap={(_, to) => pick("background")(to)} defaultView="cards" mini viewKey="board.Background" perPage={300} draggable />,
    magic: caster ? <MagicTab r={r} ch={ch} set={set} onDetail={() => undefined} prepareElsewhere /> : <p className="muted pad">No spellcasting yet. It appears when a class, species or feat grants it.</p>,
    equipment: (
      <>
        <EquipmentTab r={r} ch={ch} set={set} onDetail={() => undefined} listBeside part="adding" />
        <h3 className="board-lib-sub">All items</h3>
        <Browse items={items} type="Item" chosen={[]} onPick={pick("equipment")} defaultView="list" allowCards={false} perPage={80} draggable pickLabel={() => "Add"} />
      </>
    ),
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
        </>
      );
      return (
        <div key={kind} data-tile={kind} className={`board-space board-${kind} filled has-card ${focus === kind ? "focused" : ""} ${dropOver === kind ? "drop-over" : ""}`} onClick={() => openBack(kind)} {...drop(kind)}>
          {/* Learn more and Remove sit in the card's corner, so the card keeps its room for the text. */}
          <div className="board-corner" onClick={(e) => e.stopPropagation()}>
            {todo[kind] > 0 && <button className="board-todo-pill" title="Choices still to make here" onClick={() => setFocus(kind)}>{todo[kind]} to choose</button>}
            <button className="board-ico" title="Learn more" aria-label={`Learn more about ${el.name}`} onClick={() => learn(el)}>i</button>
            <button className="board-ico" title="Remove" aria-label={`Remove ${el.name}`} onClick={() => (kind === "class" ? set((c) => ({ ...c, classes: c.classes.slice(1) })) : clear(kind))}>×</button>
          </div>
          <ChosenBanner el={el} label={label}>
            <span className="board-card-actions" onClick={(e) => e.stopPropagation()}>
              {(() => { const g = groupOf(el); return g && <SourcePicker g={g} activeId={el.id} onPick={(to) => switchVersion(kind, el, to)} />; })()}
              <button className={`pick-select ${isOpen ? "is-on" : ""}`} onClick={() => { if (kind === "class") setReplacing(false); toggleList(kind); setFocus(kind); }}>{kind === "class" ? "Edit" : "Change"}</button>
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
        onClick={() => { if (disabled) return; if (kind === "magic" || kind === "equipment") openBack(kind); else toggleList(kind); }}
        {...drop(kind)}
      >
        {filled[kind] && todo[kind] > 0 && <div className="board-corner"><span className="board-todo-pill">{todo[kind]} to choose</span></div>}
        <div className="pick-card board-frame" data-glyph="" style={{ ["--hue" as string]: el ? hueOf(el.name) : HUE[kind] }}>
        {kind === "magic" ? <span className="board-art board-art-live"><SpellBook f={spellFill} /></span>
          : kind === "equipment" ? <span className="board-art board-art-live"><Backpack f={packFill} /></span>
          : <span className="board-art" aria-hidden="true">{el && hasClassIcon(el.name) ? <ClassIcon name={el.name} size={150} /> : <Icon size={120} />}</span>}
        <div className="board-space-text">
          {filled[kind] ? (
            <>
              <small className="board-kicker">{kind === "class" ? `Level ${totalLevel(ch)}` : TITLE[kind]}</small>
              <h3>{name}</h3>
              {kind === "class" && el && CLASS_TAGS[el.name] && <div className="pick-tags">{CLASS_TAGS[el.name].map((t) => <span key={t}>{t}</span>)}</div>}
              {el && <p className="board-blurb">{blurb(el.description, 120)}</p>}
              {kind === "magic" && <p className="board-blurb">{spellNeed ? `${spellHave} of ${spellNeed} spells chosen` : "No spells to choose yet"}</p>}
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
          {!disabled && <button className={`board-see ${isOpen ? "on" : ""}`} onClick={() => { if (kind === "magic" || kind === "equipment") openBack(kind); else { toggleList(kind); setFocus(kind); } }}>{filled[kind] ? (kind === "class" ? "Add a class" : kind === "equipment" ? "Add items" : kind === "magic" ? (spellNeed && spellHave >= spellNeed ? "Change spells" : "Choose spells") : "Change") : "See options"}</button>}
        </div>
        </div>
      </div>
    );
  };

  /** Takes you to one thing still to choose: its list opens (spells, or a missing pick) and its space is shown. */
  const goTo = (it: { kind: Kind; list: boolean }) => {
    if (it.list) { setOpen(it.kind); setFocus(it.kind); setSide("left"); }
    else { setSide(null); openBack(it.kind); }
    window.setTimeout(() => (it.list ? document.querySelector(".board-acc.open") : document.querySelector(".board-focus"))?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };
  /** A card's back: the choices its species, class or background asks for, the spells, or the inventory. */
  const choicesFor = (kind: Kind) => (
    <>
          {kind === "race" && (chosenEl.race ? <><SlotList slots={ownSlots((root) => root === "race")} r={r} set={set} onDetail={() => undefined} empty="Nothing more to choose for your species." /><PassiveFeatures r={r} root={(root) => root === "race"} /></> : <p className="muted">Choose a species from the list on the left, or drag one onto its space.</p>)}
          {kind === "class" && (ch.classes.length ? (
            <>
              <ClassPanel r={r} ch={ch} set={set} onDetail={() => undefined} picker={false} compact />
              {ch.classes.map((c) => {
                const extra = ownSlots((root) => root === `class:${c.classId}`).filter((s) => tabOfSlot(s) !== "class");
                return (
                  <section key={c.classId}>
                    {extra.length > 0 && <><h3>{r.reg.get(c.classId)?.name} training and feats</h3><SlotList slots={extra} r={r} set={set} onDetail={() => undefined} /></>}
                    <PassiveFeatures r={r} root={(root) => root === `class:${c.classId}`} />
                  </section>
                );
              })}
            </>
          ) : <p className="muted">Choose a class from the list on the left, or drag one onto its space. Adding another class later makes a multiclass.</p>)}
          {kind === "background" && (chosenEl.background ? <><PersonalitySwitch r={r} set={set} /><SlotList slots={ownSlots((root) => root === "background")} r={r} set={set} onDetail={() => undefined} empty="Nothing more to choose for your background." /><PassiveFeatures r={r} root={(root) => root === "background"} /></> : <p className="muted">Choose a background from the list on the left, or drag one onto its space.</p>)}
          {kind === "magic" && (caster ? (
            <>
              <div className="card-back-art">
                {prepares ? (
                  <button className={`card-back-toggle ${backView === "prepare" ? "on" : ""}`} aria-pressed={backView === "prepare"} title={backView === "prepare" ? "Back to all the spells" : "Show only the spells to prepare"} onClick={() => setBackView(backView === "prepare" ? null : "prepare")}>
                    <SpellBook f={spellFill} /><small>Prepare spells</small>
                  </button>
                ) : <SpellBook f={spellFill} />}
                <span>{spellNeed ? `${spellHave} of ${spellNeed}` : ""}</span>
              </div>
              {backView === "prepare" && prepares ? <PrepareSpells r={r} ch={ch} set={set} onDetail={() => undefined} /> : (
                <>
                  <p className="muted card-back-count">{spellNeed ? `${spellHave} of ${spellNeed} spells chosen` : "No spells to choose yet"}</p>
                  <MagicTab r={r} ch={ch} set={set} onDetail={() => undefined} prepareElsewhere={prepares} />
                </>
              )}
            </>
          ) : <p className="muted">This character does not cast spells yet.</p>)}
          {kind === "equipment" && (
            <>
              <div className="card-back-art">
                <button className={`card-back-toggle ${backView === "inventory" ? "on" : ""}`} aria-pressed={backView === "inventory"} title={backView === "inventory" ? "Back to adding items" : "Show only the inventory"} onClick={() => setBackView(backView === "inventory" ? null : "inventory")}>
                  <Backpack f={packFill} /><small>Inventory</small>
                </button>
                <button className={`card-back-toggle ${backView === "shop" ? "on" : ""}`} aria-pressed={backView === "shop"} title={backView === "shop" ? "Back to adding items" : "Buy items with your coins, sell from the inventory"} onClick={() => setBackView(backView === "shop" ? null : "shop")}>
                  <Purse /><small>Shop</small>
                </button>
              </div>
              {backView === "shop" && <Shop r={r} ch={ch} set={set} />}
              {backView !== "inventory" && backView !== "shop" && (
                <>
                  <EquipmentTab r={r} ch={ch} set={set} onDetail={() => undefined} listBeside part="adding" />
                  <h3 className="board-lib-sub">All items</h3>
                  <Browse items={items} type="Item" chosen={[]} onPick={(el) => addItem(set, el)} defaultView="cards" mini viewKey="board.Item" perPage={60} pickLabel={() => "Add"} />
                </>
              )}
              <EquipmentTab r={r} ch={ch} set={set} onDetail={() => undefined} listBeside part="inventory" />
            </>
          )}
    </>
  );
  const scoresLeft = r.slots.filter((s) => tabOfSlot(s) === "abilities" && stillToChoose(s, r)).length;
  // A side panel closes when the mouse leaves it, except while a big choice is landing.
  const leave = (which: "left" | "right") => () => { if (narrow && !flyHide && !back && side === which) setSide(null); };
  return (
    <div className={`board ${side ? `side-${side}` : ""} ${flyHide || back ? "fly-hide" : ""}`}>
      <button className="board-handle left" aria-label="Show the lists" aria-expanded={side === "left"} onClick={() => setSide(side === "left" ? null : "left")}>
        <span className="board-handle-plus">+</span><span className="board-handle-label">Lists</span>
        {leftItems.length > 0 && <span className="board-acc-badge">{leftItems.length}</span>}
      </button>
      <button className="board-handle right" aria-label="Show the scores" aria-expanded={side === "right"} onClick={() => setSide(side === "right" ? null : "right")}>
        <span className="board-handle-plus">+</span><span className="board-handle-label">Scores</span>
        {scoresLeft > 0 && <span className="board-acc-badge">{scoresLeft}</span>}
      </button>
      <nav className="board-lib" aria-label="Lists" onMouseLeave={leave("left")}>
        {(["race", "class", "background"] as Kind[]).map((kind) => {
          const Icon = ICON[kind];
          const isOpen = open === kind;
          return (
            <section key={kind} className={`board-acc ${isOpen ? "open" : ""}`}>
              <button className="board-acc-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : kind)}>
                <span className="board-acc-icon"><Icon size={22} /></span>
                <span className="board-acc-title">{TITLE[kind]}<small>{libValue[kind] || (kind === "magic" && !caster ? "none yet" : "not chosen")}</small></span>
                {filled[kind] && !todo[kind] ? <span className="board-acc-done">✓</span> : null}
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
            ) : (
              <>
                <p className="ok">Everything is chosen. Export your sheet when you are ready.</p>
                {detailsBlank(ch) && <p className="muted details-default">The character's details are at their defaults (blank). <button className="ghost" onClick={() => window.dispatchEvent(new CustomEvent("cf-details"))}>Add details</button></p>}
              </>
            )}
          </section>
        )}
      </nav>

      <section className="board-main">
        <RulesCheckBar r={r} />
        <header className="board-hero">
          <div>
            <small>Ready, set,</small>
            <h2>Start your story...</h2>
            <p className="muted">Your character is a species, a class and a background. Click an entry in a list or drag it onto its space.</p>
          </div>
          {/* What is left to choose: a count that unfolds into the list on hover, each line a shortcut to it. */}
          <div className={`board-left-btn ${leftItems.length ? "todo" : "done"}`}>
            <button aria-haspopup={leftItems.length ? "true" : undefined}>{leftItems.length ? `${leftItems.length} ${leftItems.length === 1 ? "choice" : "choices"} left` : "✓ Every choice is made"}</button>
            {leftItems.length > 0 && (
              <ul className="board-left-pop">
                {leftItems.map((it, k) => <li key={k}><button onClick={() => goTo(it)}><span className="board-left-kind">{TITLE[it.kind]}</span><span>{it.text}</span></button></li>)}
              </ul>
            )}
          </div>
        </header>
        <div className="board-spaces">
          {ORDER.map(tile)}
        </div>
        {otherSlots.length > 0 && (
          <div className="board-focus">
            <h3 className="board-focus-title">Other choices</h3>
            <SlotList slots={otherSlots} r={r} set={set} onDetail={() => undefined} />
          </div>
        )}
        {back && back.phase === "open" && createPortal(
          <div className="card-back-veil">
            <div className={`card-back ${back.mode}`} role="dialog" aria-label={`${TITLE[back.kind]} choices`} style={{ ["--hue" as string]: HUE[back.kind] }}>
              <header className="card-back-head">
                <div>
                  <small>{TITLE[back.kind]}</small>
                  <h2>{back.kind === "class" ? firstClass?.name : back.kind === "race" ? chosenEl.race?.name : back.kind === "background" ? chosenEl.background?.name : back.kind === "magic" ? "Your spells" : "Your inventory"}</h2>
                </div>
                {(() => {
                  // The open card's book: switching it changes the card to that version, and its choices with it.
                  const kind = back.kind;
                  const el = kind === "class" ? firstClass : kind === "race" ? chosenEl.race : kind === "background" ? chosenEl.background : undefined;
                  const g = el ? groupOf(el) : undefined;
                  return el && g && g.variants.length > 1 ? (
                    <div className="card-back-source"><small>Source</small><SourcePicker strip g={g} activeId={el.id} onPick={(to) => switchVersion(kind as Kind, el, to)} /></div>
                  ) : null;
                })()}
                <div className="card-back-ctl">
                  <button className="primary" onClick={() => finish(true)}>Done</button>
                  <button className="board-ico" title={back.mode === "new" ? "Put it back" : "Undo the changes"} aria-label={back.mode === "new" ? "Put it back" : "Undo the changes"} onClick={() => finish(false)}>×</button>
                </div>
              </header>
              <div className="card-back-body">{choicesFor(back.kind)}</div>
            </div>
          </div>,
          document.body,
        )}
      </section>

      <StatsPanel onMouseLeave={leave("right")} r={r} ch={ch} set={set} onIncreases={(root) => { setSide(null); openBack(root === "race" ? "race" : root === "background" ? "background" : "class"); }} />
    </div>
  );
}
