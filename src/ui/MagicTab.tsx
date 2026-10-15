import { isAvailable, usedAfterClick } from "./pips";
import { useMemo } from "react";
import type { AElement } from "../aurora/types";
import type { Resolved } from "../aurora/engine";
import { buildSheet, preparePool, type CastingLine } from "../aurora/sheet";
import type { Character } from "../aurora/character";
import { SlotList, tabOfSlot, type SetCharacter } from "./Slots";
import { Browse } from "./Browse";

const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));

function SlotTracker({ line, set }: { line: CastingLine; set: SetCharacter }) {
  const toggle = (level: number, index: number, total: number) =>
    set((c) => {
      const used = c.play.slotsUsed[String(level)] ?? 0;
      return { ...c, play: { ...c.play, slotsUsed: { ...c.play.slotsUsed, [String(level)]: usedAfterClick(total, used, index) } } };
    });
  if (!line.slots.length) return <p className="muted">No spell slots at this level.</p>;
  return (
    <div className="slot-tracker">
      {line.slots.map((s) => (
        <div key={s.level} className="slot-level">
          <small>{line.pactLevel ? `Pact (level ${s.level})` : `Level ${s.level}`}</small>
          <div className="pips">
            {Array.from({ length: s.total }, (_, i) => (
              <button key={i} className={isAvailable(s.total, s.used, i) ? "pip" : "pip spent"} title={isAvailable(s.total, s.used, i) ? "Available" : "Spent"} onClick={() => toggle(s.level, i, s.total)} />
            ))}
          </div>
        </div>
      ))}
      <button className="more" onClick={() => set((c) => ({ ...c, play: { ...c.play, slotsUsed: {} } }))}>Long rest: restore slots</button>
    </div>
  );
}

function Prepared({ line, r, ch, set, onDetail }: { line: CastingLine; r: Resolved; ch: Character; set: SetCharacter; onDetail: (e: AElement) => void }) {
  const pool = useMemo<AElement[]>(() => preparePool(r, line), [r, line]);
  const chosen = ch.prepared[line.name] ?? [];
  const valid = chosen.filter((id) => pool.some((p) => p.id === id));
  const toggle = (id: string) =>
    set((c) => {
      const cur = c.prepared[line.name] ?? [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { ...c, prepared: { ...c.prepared, [line.name]: next } };
    });
  return (
    <>
      <h3>Prepared spells <span className={valid.length > line.prepareMax ? "warn" : "muted"}>{valid.length} / {line.prepareMax}</span></h3>
      <Browse items={pool} type="Spell" chosen={valid} onPick={(e) => toggle(e.id)} onHover={onDetail} defaultView="cards" perPage={60} />
    </>
  );
}

/** `prepareElsewhere`: the build board prepares spells on the spellbook's back, so the prepared list here is left out. */
export function MagicTab({ r, ch, set, onDetail, prepareElsewhere = false }: { r: Resolved; ch: Character; set: SetCharacter; onDetail: (e: AElement) => void; prepareElsewhere?: boolean }) {
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
            {line.prepare && !prepareElsewhere && <Prepared line={line} r={r} ch={ch} set={set} onDetail={onDetail} />}
            {line.prepare && prepareElsewhere && <p className="muted">Prepare today's spells on the spellbook: click its card.</p>}
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
