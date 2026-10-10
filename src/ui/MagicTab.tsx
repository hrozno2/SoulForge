import { useMemo, useState } from "react";
import type { AElement } from "../aurora/types";
import type { Resolved } from "../aurora/engine";
import { buildSheet, type CastingLine } from "../aurora/sheet";
import type { Character } from "../aurora/character";
import { SlotList, tabOfSlot, metaLine, type SetCharacter } from "./Slots";

const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));

function SlotTracker({ line, set }: { line: CastingLine; set: SetCharacter }) {
  const toggle = (level: number, index: number, total: number) =>
    set((c) => {
      const used = c.play.slotsUsed[String(level)] ?? 0;
      // Clicking box i marks slots up to i spent, or frees them when it is already the last spent one.
      const next = used === index + 1 ? index : index + 1;
      return { ...c, play: { ...c.play, slotsUsed: { ...c.play.slotsUsed, [String(level)]: Math.min(next, total) } } };
    });
  if (!line.slots.length) return <p className="muted">No spell slots at this level.</p>;
  return (
    <div className="slot-tracker">
      {line.slots.map((s) => (
        <div key={s.level} className="slot-level">
          <small>{line.pactLevel ? `Pact (level ${s.level})` : `Level ${s.level}`}</small>
          <div className="pips">
            {Array.from({ length: s.total }, (_, i) => (
              <button key={i} className={i < s.used ? "pip spent" : "pip"} title={i < s.used ? "Spent" : "Available"} onClick={() => toggle(s.level, i, s.total)} />
            ))}
          </div>
        </div>
      ))}
      <button className="more" onClick={() => set((c) => ({ ...c, play: { ...c.play, slotsUsed: {} } }))}>Long rest: restore slots</button>
    </div>
  );
}

function Prepared({ line, r, ch, set, onDetail }: { line: CastingLine; r: Resolved; ch: Character; set: SetCharacter; onDetail: (e: AElement) => void }) {
  const entry = r.spellcasting.get(line.name.toLowerCase());
  const pool = useMemo<AElement[]>(() => {
    if (!entry) return [];
    const known = line.spells.map((p) => r.reg.get(p.id)).filter((e): e is AElement => !!e);
    if (known.length) return known;
    // Casters like Clerics prepare from their whole class list, from the book of their class when it has one.
    const levels = Array.from({ length: Math.max(1, line.maxSpellLevel) }, (_, i) => i + 1).join("||");
    const all = r.reg.find("Spell", `(${entry.lists.join("||")}),(${levels})`);
    const book = r.reg.get(entry.owner)?.source;
    const same = all.filter((s) => s.source === book);
    return same.length ? same : all;
  }, [entry, line.spells, line.maxSpellLevel, r.reg]);
  const chosen = ch.prepared[line.name] ?? [];
  const valid = chosen.filter((id) => pool.some((p) => p.id === id));
  const toggle = (id: string) =>
    set((c) => {
      const cur = c.prepared[line.name] ?? [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { ...c, prepared: { ...c.prepared, [line.name]: next } };
    });
  const [q, setQ] = useState("");
  const shown = pool.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => Number(a.setters.level?.value ?? 0) - Number(b.setters.level?.value ?? 0) || a.name.localeCompare(b.name));
  return (
    <>
      <h3>Prepared spells <span className={valid.length > line.prepareMax ? "warn" : "muted"}>{valid.length} / {line.prepareMax}</span></h3>
      <input className="slot-search" placeholder={`Search ${pool.length} spells`} value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="options boxed">
        {shown.slice(0, 150).map((o) => {
          const on = valid.includes(o.id);
          return (
            <li key={o.id} className={on ? "picked" : ""}>
              <button onClick={() => toggle(o.id)} onMouseEnter={() => onDetail(o)}>
                <span className="tick">{on ? "✓" : ""}</span>
                <span className="opt-name">{o.name}</span>
                <span className="opt-meta">{metaLine(o)}</span>
                <span className="opt-src">{o.source}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function MagicTab({ r, ch, set, onDetail }: { r: Resolved; ch: Character; set: SetCharacter; onDetail: (e: AElement) => void }) {
  const sheet = useMemo(() => buildSheet(r), [r]);
  const spellSlots = r.slots.filter((s) => tabOfSlot(s) === "magic");
  const other = spellSlots.filter((s) => !s.rule.spellcasting || !sheet.casting.some((c) => c.name.toLowerCase() === s.rule.spellcasting!.toLowerCase()));
  const nm = (id: string) => r.reg.get(id);
  if (!sheet.casting.length && !spellSlots.length) {
    return <p className="muted">This character does not cast spells yet. Spellcasting appears when a class or feature grants it.</p>;
  }
  return (
    <div>
      {sheet.casting.map((line) => {
        const mine = spellSlots.filter((s) => s.rule.spellcasting?.toLowerCase() === line.name.toLowerCase());
        return (
          <section key={line.name} className="card casting">
            <h2>{line.name} <small className="muted">{line.ability ? `${line.ability} based` : ""}</small></h2>
            <div className="combat small">
              <div className="box"><small>Save DC</small><b>{line.dc}</b></div>
              <div className="box"><small>Spell attack</small><b>{signed(line.attack)}</b></div>
              {line.prepare && <div className="box"><small>Prepared</small><b>{line.prepareMax}</b></div>}
            </div>
            <SlotTracker line={line} set={set} />
            <h3>Spells and cantrips to learn</h3>
            <SlotList slots={mine} r={r} set={set} onDetail={onDetail} empty="No spells to choose at this level." />
            {line.prepare && <Prepared line={line} r={r} ch={ch} set={set} onDetail={onDetail} />}
            {line.granted.length > 0 && (
              <>
                <h3>Always prepared</h3>
                <div className="chips">{line.granted.map((p) => <span key={p.id} className="chip" onMouseEnter={() => nm(p.id) && onDetail(nm(p.id)!)}>{nm(p.id)?.name ?? p.id}</span>)}</div>
              </>
            )}
          </section>
        );
      })}
      {other.length > 0 && (
        <section className="card">
          <h2>Other spell choices</h2>
          <SlotList slots={other} r={r} set={set} onDetail={onDetail} />
        </section>
      )}
    </div>
  );
}
