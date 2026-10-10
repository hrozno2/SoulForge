import { useEffect, useState, useSyncExternalStore } from "react";
import { combine, effectsFor, type RollKind } from "./conditions";

export interface RollResult {
  label: string;
  expr: string;
  rolls: number[];
  total: number;
  detail: string;
  /** Reasons the roll was changed: conditions, exhaustion. */
  notes?: string[];
  /** A difficulty to beat, with the outcome worked out. */
  dc?: { value: number; success: boolean };
  /** Each dice group with its individual dice, and flat bonuses (sides 0), for display. */
  terms: { sides: number; sign: 1 | -1; rolls: number[]; sum: number }[];
}

export function parseDice(expr: string): { terms: { sign: 1 | -1; count: number; sides: number; flat: number }[] } | null {
  const clean = expr.replace(/\s+/g, "").toLowerCase();
  if (!clean) return null;
  const parts = clean.match(/[+-]?[^+-]+/g);
  if (!parts) return null;
  const terms = [];
  for (const p of parts) {
    const sign: 1 | -1 = p.startsWith("-") ? -1 : 1;
    const body = p.replace(/^[+-]/, "");
    const m = body.match(/^(\d*)d(\d+)$/);
    if (m) terms.push({ sign, count: m[1] ? parseInt(m[1], 10) : 1, sides: parseInt(m[2], 10), flat: 0 });
    else if (/^\d+$/.test(body)) terms.push({ sign, count: 0, sides: 0, flat: parseInt(body, 10) });
    else return null;
  }
  return { terms };
}

export function rollExpression(expr: string, label = "", rng: () => number = Math.random): RollResult | null {
  const parsed = parseDice(expr);
  if (!parsed) return null;
  let total = 0;
  const rolls: number[] = [];
  const bits: string[] = [];
  const shown: RollResult["terms"] = [];
  for (const t of parsed.terms) {
    if (t.count > 0) {
      if (t.count > 200 || t.sides > 1000) return null;
      const r = Array.from({ length: t.count }, () => 1 + Math.floor(rng() * t.sides));
      rolls.push(...r);
      total += t.sign * r.reduce((a, b) => a + b, 0);
      bits.push(`${t.sign < 0 ? "-" : ""}[${r.join(",")}]`);
      shown.push({ sides: t.sides, sign: t.sign, rolls: r, sum: t.sign * r.reduce((a, b) => a + b, 0) });
    } else {
      total += t.sign * t.flat;
      bits.push(`${t.sign < 0 ? "-" : "+"}${t.flat}`);
      shown.push({ sides: 0, sign: t.sign, rolls: [], sum: t.sign * t.flat });
    }
  }
  return { label, expr, rolls, total, terms: shown, detail: bits.join(" ").replace(/ \+/g, " + ").replace(/ -/g, " - ") };
}

/** Rebuilds a dice expression from its terms: dice by size, then the flat bonus. */
function build(terms: { sign: 1 | -1; count: number; sides: number; flat: number }[]): string {
  const dice = new Map<string, number>();
  let flat = 0;
  for (const t of terms) {
    if (t.sides > 0) dice.set(`${t.sign}|${t.sides}`, (dice.get(`${t.sign}|${t.sides}`) ?? 0) + t.count);
    else flat += t.sign * t.flat;
  }
  const parts = [...dice.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => Number(a[0].split("|")[1]) - Number(b[0].split("|")[1]))
    .map(([k, n], i) => `${k.startsWith("-") ? "-" : i ? "+" : ""}${n}d${k.split("|")[1]}`);
  if (flat) parts.push(`${flat > 0 ? (parts.length ? "+" : "") : "-"}${Math.abs(flat)}`);
  return parts.join("");
}

/** Adds (or with a negative delta removes) dice of one size, or a flat amount when sides is 0. */
export function changePool(expr: string, sides: number, delta: number): string {
  const parsed = expr.trim() ? parseDice(expr) : { terms: [] };
  const terms = parsed ? [...parsed.terms] : [];
  if (sides === 0) terms.push({ sign: delta < 0 ? -1 : 1, count: 0, sides: 0, flat: Math.abs(delta) });
  else terms.push({ sign: 1, count: delta, sides, flat: 0 });
  // A negative count on a size nobody has yet would go below zero; build() drops anything that ends at zero or less.
  return build(terms);
}

export function diceCount(expr: string, sides: number): number {
  const parsed = expr.trim() ? parseDice(expr) : null;
  return parsed ? parsed.terms.filter((t) => t.sign === 1 && t.sides === sides).reduce((n, t) => n + t.count, 0) : 0;
}

export type RollMode = "normal" | "adv" | "dis";

let mode: RollMode = "normal";
const listeners = new Set<() => void>();
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};
export const setRollMode = (m: RollMode) => {
  mode = m;
  listeners.forEach((f) => f());
};
export const useRollMode = (): RollMode => useSyncExternalStore(subscribe, () => mode);

/** Ask the dice panel to roll something, for example from a bonus on the sheet. */
export interface RollOptions {
  /** What kind of roll this is, so conditions and exhaustion can change it. */
  kind?: RollKind;
  ability?: string;
  /** A difficulty class to compare the total against. */
  dc?: number;
}

export function requestRoll(label: string, expr: string, done?: (r: RollResult) => void, opts?: RollOptions): void {
  window.dispatchEvent(new CustomEvent("cf-roll", { detail: { label, expr, done, opts } }));
}

/** The character's current conditions, kept here so every roll can see them. Set by the app. */
let rollContext = { conditions: [] as string[], exhaustion: 0 };
export function setRollContext(c: { conditions: string[]; exhaustion: number }): void {
  rollContext = c;
}

/** Normal / Advantage / Disadvantage switch for d20 rolls. Lives on the sheet. */
export function RollModeSwitch() {
  const m = useRollMode();
  const opts: [RollMode, string][] = [["dis", "Disadvantage"], ["normal", "Normal"], ["adv", "Advantage"]];
  return (
    <div className="rollmode" role="group" aria-label="Roll mode for d20 rolls">
      {opts.map(([k, t]) => (
        <button key={k} className={`${k} ${m === k ? "on" : ""}`} aria-pressed={m === k} onClick={() => setRollMode(k)}>{t}</button>
      ))}
    </div>
  );
}

const SHAPES: Record<number, string> = {
  4: "M20 4 L37 34 L3 34 Z",
  6: "M6 6 H34 V34 H6 Z",
  8: "M20 2 L36 20 L20 38 L4 20 Z",
  10: "M20 2 L36 16 L30 36 L10 36 L4 16 Z",
  12: "M20 3 L35 14 L30 33 L10 33 L5 14 Z",
  20: "M20 2 L35 11 L35 29 L20 38 L5 29 L5 11 Z",
  100: "M20 2 L35 11 L35 29 L20 38 L5 29 L5 11 Z",
};

export function DieIcon({ sides, label, size = 34 }: { sides: number; label?: string; size?: number }) {
  return (
    <svg className="die-icon" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <path d={SHAPES[sides] ?? SHAPES[20]} />
      {sides === 20 && <path className="inner" d="M20 2 L5 29 M20 2 L35 29 M5 11 L35 11 M5 29 L35 29" />}
      <text x="20" y="25" textAnchor="middle">{label ?? sides}</text>
    </svg>
  );
}

/** A roll shown like a chat card: the formula, each group with its dice as hexagons, and a large total. */
function RollCard({ r }: { r: RollResult }) {
  return (
    <div className="roll-card">
      {r.label && <div className="roll-label">{r.label}</div>}
      <div className="roll-formula">{r.expr}</div>
      {r.terms.map((t, i) => (
        <div key={i} className="roll-term">
          <div className="roll-term-head">
            <span>{t.sides ? `${t.rolls.length}d${t.sides}` : "bonus"}</span>
            <b>{t.sum}</b>
          </div>
          {t.sides > 0 && (
            <div className="roll-chips">
              {t.rolls.map((v, j) => <span key={j} className={v === t.sides ? "chip max" : v === 1 ? "chip min" : "chip"}>{v}</span>)}
            </div>
          )}
        </div>
      ))}
      <div className="roll-total">{r.total}</div>
      {r.dc && <div className={r.dc.success ? "roll-dc ok" : "roll-dc bad"}>vs DC {r.dc.value}: {r.dc.success ? "success" : "fail"}</div>}
      {r.detail.includes("other") && <small className="muted">{r.detail.replace(/^.*, /, "")}</small>}
      {r.notes?.map((n, i) => <small key={i} className="roll-note">{n}</small>)}
    </div>
  );
}

export function DicePanel() {
  const [open, setOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [expr, setExpr] = useState("");
  const [history, setHistory] = useState<RollResult[]>([]);
  const m = useRollMode();
  const push = (r: RollResult) => setHistory((h) => [r, ...h].slice(0, 30));
  const roll = (e: string, label = "", opts: RollOptions = {}) => {
    const clean = e.replace(/\s+/g, "");
    const isD20 = /^1d20([+-]\d+)*$/i.test(clean);
    const fx = isD20 && opts.kind ? effectsFor(opts.kind, opts.ability, rollContext.conditions, rollContext.exhaustion) : null;
    const expression = fx && fx.penalty ? `${clean}${fx.penalty}` : e;
    const notes = fx ? [...fx.notes] : [];
    // The switch on the sheet and the conditions together decide advantage: any of each cancel out.
    const finalMode = isD20 ? combine((mode === "adv" ? 1 : 0) + (fx?.mode === "adv" ? 1 : 0), (mode === "dis" ? 1 : 0) + (fx?.mode === "dis" ? 1 : 0)) : "none";
    const r = rollExpression(expression, label);
    if (!r) return null;
    let out: RollResult = r;
    if (isD20 && finalMode !== "none") {
      const r2 = rollExpression(expression, label);
      if (r2) {
        const keep = finalMode === "adv" ? (r2.total > r.total ? r2 : r) : (r2.total < r.total ? r2 : r);
        out = { ...keep, label: `${label ? label + " " : ""}(${finalMode === "adv" ? "advantage" : "disadvantage"})`, detail: `${keep.detail}, other ${keep === r ? r2.total : r.total}` };
      }
    }
    if (fx?.autoFail) {
      notes.unshift(fx.autoFail);
      out = { ...out, dc: opts.dc !== undefined ? { value: opts.dc, success: false } : undefined };
    } else if (opts.dc !== undefined) out = { ...out, dc: { value: opts.dc, success: out.total >= opts.dc } };
    if (notes.length) out = { ...out, notes };
    push(out);
    return out;
  };
  useEffect(() => {
    const on = (ev: Event) => {
      const d = (ev as CustomEvent<{ label: string; expr: string; done?: (r: RollResult) => void; opts?: RollOptions }>).detail;
      const res = roll(d.expr, d.label, d.opts);
      if (res) d.done?.(res);
      setOpen(true);
    };
    window.addEventListener("cf-roll", on);
    return () => window.removeEventListener("cf-roll", on);
  }, []);
  const close = () => {
    setOpen(false);
    setHistory([]);
    setLogOpen(false);
  };
  const last = history[0];
  return (
    <div className="dice noprint">
      {open && (
        <div className="dice-panel">
          <div className="dice-result" aria-live="polite">
            {last ? <RollCard r={last} /> : <span className="muted">Click dice to add them, then Roll. Or click a bonus on the sheet.</span>}
          </div>
          <div className="dice-shapes">
            {[4, 6, 8, 10, 12, 20, 100].map((n) => {
              const c = diceCount(expr, n);
              return (
                <button
                  key={n}
                  className={c ? "die-btn has" : "die-btn"}
                  title={`Add a d${n}. Right-click or Shift-click removes one.`}
                  onClick={(e) => setExpr((x) => changePool(x, n, e.shiftKey ? -1 : 1))}
                  onContextMenu={(e) => { e.preventDefault(); setExpr((x) => changePool(x, n, -1)); }}
                >
                  <DieIcon sides={n} label={n === 100 ? "%" : String(n)} />
                  {c > 0 && <span className="die-count">{c}</span>}
                </button>
              );
            })}
          </div>
          <form className="row dice-form" onSubmit={(e) => { e.preventDefault(); if (expr.trim()) roll(expr); }}>
            <button type="button" title="Subtract 1" onClick={() => setExpr((x) => changePool(x, 0, -1))}>−1</button>
            <button type="button" title="Add 1" onClick={() => setExpr((x) => changePool(x, 0, 1))}>+1</button>
            <input value={expr} onChange={(e) => setExpr(e.target.value)} placeholder="Click dice, or type 2d6+3" aria-label="Dice to roll" />
            <button type="button" onClick={() => setExpr("")} disabled={!expr}>Clear</button>
            <button className="primary" type="submit" disabled={!expr.trim()}>Roll</button>
          </form>
          {m !== "normal" && <small className="muted">d20 rolls use {m === "adv" ? "advantage" : "disadvantage"}</small>}
          <button className="log-toggle" aria-expanded={logOpen} onClick={() => setLogOpen(!logOpen)}>
            {logOpen ? "▾" : "▸"} Roll log ({history.length})
          </button>
          {logOpen && (
            <ul className="history">
              {history.map((h, i) => (
                <li key={i}><b>{h.total}</b> <span className="muted">{h.label ? `${h.label} ` : ""}{h.expr} {h.detail}</span></li>
              ))}
              {!history.length && <li className="muted">No rolls yet.</li>}
            </ul>
          )}
        </div>
      )}
      <button className="primary dice-toggle" onClick={() => (open ? close() : setOpen(true))}>
        {open ? "Close dice" : "Dice"}
      </button>
    </div>
  );
}
