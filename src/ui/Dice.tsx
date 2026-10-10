import { useEffect, useState } from "react";

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

/** Ask the dice panel to roll something, for example from a bonus on the sheet. */
export function requestRoll(label: string, expr: string): void {
  window.dispatchEvent(new CustomEvent("cf-roll", { detail: { label, expr } }));
}

export function DicePanel() {
  const [open, setOpen] = useState(false);
  const [expr, setExpr] = useState("1d20");
  const [history, setHistory] = useState<RollResult[]>([]);
  const roll = (e: string, label = "") => {
    const r = rollExpression(e, label);
    if (r) setHistory((h) => [r, ...h].slice(0, 14));
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
  const adv = (mode: "adv" | "dis") => {
    const a = rollExpression("1d20");
    const b = rollExpression("1d20");
    if (!a || !b) return;
    const pick = mode === "adv" ? Math.max(a.total, b.total) : Math.min(a.total, b.total);
    setHistory((h) => [{ label: mode === "adv" ? "Advantage" : "Disadvantage", expr: "2d20", rolls: [a.total, b.total], total: pick, detail: `[${a.total}, ${b.total}]` }, ...h].slice(0, 14));
  };
  return (
    <div className="dice noprint">
      {open && (
        <div className="dice-panel">
          <div className="row">
            {[4, 6, 8, 10, 12, 20, 100].map((n) => <button key={n} onClick={() => roll(`1d${n}`)}>d{n}</button>)}
          </div>
          <div className="row">
            <button onClick={() => adv("adv")}>Advantage</button>
            <button onClick={() => adv("dis")}>Disadvantage</button>
          </div>
          <form className="row" onSubmit={(e) => { e.preventDefault(); roll(expr); }}>
            <input value={expr} onChange={(e) => setExpr(e.target.value)} placeholder="2d6+3" style={{ width: 120 }} />
            <button className="primary" type="submit">Roll</button>
          </form>
          <ul className="history">
            {history.map((h, i) => (
              <li key={i}><b>{h.total}</b> <span className="muted">{h.label ? `${h.label} ` : ""}{h.expr} {h.detail}</span></li>
            ))}
            {!history.length && <li className="muted">Click a bonus on the character sheet to roll it.</li>}
          </ul>
        </div>
      )}
      <button className="primary dice-toggle" onClick={() => setOpen(!open)}>{open ? "Close dice" : history[0] ? `Dice: ${history[0].total}` : "Dice"}</button>
    </div>
  );
}
