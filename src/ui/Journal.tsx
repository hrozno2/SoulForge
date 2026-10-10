import { useState } from "react";
import { uid, type Character, type JournalEntry } from "../aurora/character";

type SetCharacter = (fn: (c: Character) => Character) => void;

const today = () => new Date().toISOString().slice(0, 10);

/** General notes plus a session log. Entries are kept newest first by date. */
export function Journal({ ch, set }: { ch: Character; set: SetCharacter }) {
  const [filter, setFilter] = useState("");
  const entries = [...(ch.journal ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const q = filter.trim().toLowerCase();
  const shown = q ? entries.filter((e) => `${e.title} ${e.text}`.toLowerCase().includes(q)) : entries;
  const edit = (id: string, p: Partial<JournalEntry>) => set((c) => ({ ...c, journal: (c.journal ?? []).map((e) => (e.uid === id ? { ...e, ...p } : e)) }));
  return (
    <>
      <label className="field"><span>Notes</span><textarea rows={8} value={ch.notes} onChange={(e) => set((c) => ({ ...c, notes: e.target.value }))} /></label>
      <section className="block journal">
        <h3>Session log</h3>
        <div className="row">
          <button className="primary" onClick={() => set((c) => ({ ...c, journal: [...(c.journal ?? []), { uid: uid(), date: today(), title: "", text: "" }] }))}>New entry</button>
          {entries.length > 3 && <input type="search" aria-label="Search the session log" placeholder="Search" value={filter} onChange={(e) => setFilter(e.target.value)} />}
        </div>
        {entries.length === 0 && <p className="muted">Nothing yet. Add an entry after a session to keep track of what happened.</p>}
        {shown.map((e) => (
          <div key={e.uid} className="card sub journal-entry">
            <div className="row">
              <input type="date" aria-label="Session date" value={e.date} onChange={(ev) => edit(e.uid, { date: ev.target.value })} />
              <input aria-label="Entry title" placeholder="Title" value={e.title} onChange={(ev) => edit(e.uid, { title: ev.target.value })} />
              <button onClick={() => { if (!e.text.trim() || confirm("Delete this entry?")) set((c) => ({ ...c, journal: (c.journal ?? []).filter((x) => x.uid !== e.uid) })); }}>Delete</button>
            </div>
            <textarea rows={5} aria-label="Entry text" value={e.text} onChange={(ev) => edit(e.uid, { text: ev.target.value })} />
          </div>
        ))}
      </section>
    </>
  );
}
