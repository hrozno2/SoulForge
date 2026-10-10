import { useMemo, useState } from "react";
import type { ARegistry } from "../aurora/registry";
import { resolve } from "../aurora/engine";
import { buildSheet } from "../aurora/sheet";
import type { CharacterRecord } from "../aurora/storage";

const KEY = "charforge.party";
const load = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
};
const sign = (n: number) => (n >= 0 ? `+${n}` : String(n));

interface Row {
  id: string;
  name: string;
  summary: string;
  hp: number;
  max: number;
  temp: number;
  ac: number;
  initiative: number;
  perception: number;
  speed: number;
  conditions: string[];
  slots: string;
  concentration?: string;
}

/** One table for the whole table: who is hurt, who is concentrating, what slots are left. */
export function PartyView({ list, reg, onOpen }: { list: CharacterRecord[]; reg: ARegistry; onOpen: (c: CharacterRecord) => void }) {
  const [members, setMembers] = useState<string[]>(load);
  const [order, setOrder] = useState<{ id: string; roll: number }[] | null>(null);
  const toggle = (id: string) => {
    const next = members.includes(id) ? members.filter((x) => x !== id) : [...members, id];
    setMembers(next);
    setOrder(null);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* the choice just is not remembered */
    }
  };
  const rows = useMemo<Row[]>(() => {
    return list.filter((c) => members.includes(c.id)).map((c) => {
      const sheet = buildSheet(resolve(c.data, reg));
      const play = c.data.play;
      const casting = sheet.casting.flatMap((x) => x.slots);
      const slots = casting.filter((s) => s.total > 0).map((s) => `${s.level}: ${s.total - s.used}/${s.total}`).join("  ");
      return {
        id: c.id, name: c.name || "Unnamed", summary: c.summary, hp: play.hp ?? sheet.hp, max: sheet.hp, temp: play.tempHp, ac: sheet.ac.value,
        initiative: sheet.initiative, perception: sheet.passivePerception, speed: sheet.speed, conditions: play.conditions, slots, concentration: play.concentration,
      };
    });
  }, [list, members, reg]);
  const rollInitiative = () => setOrder(rows.map((r) => ({ id: r.id, roll: 1 + Math.floor(Math.random() * 20) + r.initiative })).sort((a, b) => b.roll - a.roll));
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  return (
    <section className="card party">
      <h2>Party</h2>
      <p className="muted">Pick the characters in your group to see them side by side.</p>
      <div className="party-pick">
        {list.map((c) => (
          <label key={c.id}><input type="checkbox" checked={members.includes(c.id)} onChange={() => toggle(c.id)} /> {c.name || "Unnamed"}</label>
        ))}
        {!list.length && <span className="muted">No saved characters yet.</span>}
      </div>
      {rows.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="party-table">
              <thead><tr><th>Character</th><th>HP</th><th>AC</th><th>Init</th><th>Passive Perception</th><th>Speed</th><th>Slots left</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={r.max && r.hp / r.max < 0.25 ? "low" : ""}>
                    <td><button className="link" onClick={() => onOpen(list.find((c) => c.id === r.id)!)}>{r.name}</button><br /><small className="muted">{r.summary}</small></td>
                    <td>{r.hp} / {r.max}{r.temp > 0 ? ` (+${r.temp})` : ""}</td>
                    <td>{r.ac}</td>
                    <td>{sign(r.initiative)}</td>
                    <td>{r.perception}</td>
                    <td>{r.speed} ft.</td>
                    <td>{r.slots || "none"}</td>
                    <td>{[...r.conditions, r.concentration ? `Concentrating: ${r.concentration}` : ""].filter(Boolean).join(", ") || "fine"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button onClick={rollInitiative}>Roll initiative for everyone</button>
            {order && <ol className="initiative-order">{order.map((o) => <li key={o.id}>{byId[o.id].name}: {o.roll}</li>)}</ol>}
          </div>
        </>
      )}
    </section>
  );
}
