import { useEffect, useState, useSyncExternalStore } from "react";

export interface RollResult {
  label: string;
  expr: string;
  rolls: number[];
  total: number;
  detail: string;
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
  for (const t of parsed.terms) {
    if (t.count > 0) {
      if (t.count > 200 || t.sides > 1000) return null;
      const r = Array.from({ length: t.count }, () => 1 + Math.floor(rng() * t.sides));
      rolls.push(...r);
      total += t.sign * r.reduce((a, b) => a + b, 0);
      bits.push(`${t.sign < 0 ? "-" : ""}[${r.join(",")}]`);
    } else {
      total += t.sign * t.flat;
      bits.push(`${t.sign < 0 ? "-" : "+"}${t.flat}`);
    }
  }
  return { label, expr, rolls, total, detail: bits.join(" ").replace(/ \+/g, " + ").replace(/ -/g, " - ") };
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
export function requestRoll(label: string, expr: string): void {
  window.dispatchEvent(new CustomEvent("cf-roll", { detail: { label, expr } }));
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

export function DicePanel() {
  const [open, setOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [expr, setExpr] = useState("1d20");
  const [history, setHistory] = useState<RollResult[]>([]);
  const m = useRollMode();
  const push = (r: RollResult) => setHistory((h) => [r, ...h].slice(0, 30));
  const roll = (e: string, label = "") => {
    const r = rollExpression(e, label);
    if (!r) return null;
    if (mode !== "normal" && /^1d20([+-]\d+)?$/i.test(e.replace(/\s+/g, ""))) {
      const r2 = rollExpression(e, label);
      if (r2) {
        const keep = mode === "adv" ? (r2.total > r.total ? r2 : r) : (r2.total < r.total ? r2 : r);
        push({ ...keep, label: `${label ? label + " " : ""}(${mode === "adv" ? "advantage" : "disadvantage"})`, detail: `${keep.detail}, other ${keep === r ? r2.total : r.total}` });
        return keep;
      }
    }
    push(r);
    return r;
  };
  useEffect(() => {
    const on = (ev: Event) => {
      const d = (ev as CustomEvent<{ label: string; expr: string }>).detail;
      roll(d.expr, d.label);
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
            {last ? (
              <>
                <b>{last.total}</b>
                <span className="muted">{last.label ? `${last.label} · ` : ""}{last.expr} {last.detail}</span>
              </>
            ) : <span className="muted">Pick a die, or click a bonus on the sheet.</span>}
          </div>
          <div className="dice-shapes">
            {[4, 6, 8, 10, 12, 20, 100].map((n) => (
              <button key={n} className="die-btn" title={`Roll d${n}`} onClick={() => roll(`1d${n}`)}>
                <DieIcon sides={n} label={n === 100 ? "%" : String(n)} />
              </button>
            ))}
          </div>
          <form className="row" onSubmit={(e) => { e.preventDefault(); roll(expr); }}>
            <input value={expr} onChange={(e) => setExpr(e.target.value)} placeholder="2d6+3" style={{ width: 120 }} />
            <button className="primary" type="submit">Roll</button>
            {m !== "normal" && <small className="muted">d20 rolls use {m === "adv" ? "advantage" : "disadvantage"}</small>}
          </form>
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
