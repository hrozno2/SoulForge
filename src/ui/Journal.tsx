import { useState } from "react";
import { TextArea } from "./TextField";
import { askConfirm } from "./Confirm";
import { uid, type Character, type JournalEntry } from "../aurora/character";

type SetCharacter = (fn: (c: Character) => Character) => void;

const today = () => new Date().toISOString().slice(0, 10);

/** General notes plus a session log. Entries are kept newest first by date. */
export function Journal({ ch, set }: { ch: Character; set: SetCharacter }) {
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<string[]>([]);
  const toggle = (id: string) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  const entries = [...(ch.journal ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const q = filter.trim().toLowerCase();
  const shown = q ? entries.filter((e) => `${e.title} ${e.text}`.toLowerCase().includes(q)) : entries;
  const edit = (id: string, p: Partial<JournalEntry>) => set((c) => ({ ...c, journal: (c.journal ?? []).map((e) => (e.uid === id ? { ...e, ...p } : e)) }));
  return (
    <>
      <label className="field"><span>Notes</span><TextArea rows={8} value={ch.notes} onCommit={(v) => set((c) => ({ ...c, notes: v }))} /></label>
      <section className="block journal">
        <h3>Session log</h3>
        <div className="row">
          <button className="primary" onClick={() => { const id = uid(); set((c) => ({ ...c, journal: [...(c.journal ?? []), { uid: id, date: today(), title: "", text: "" }] })); setOpen((o) => [...o, id]); }}>New entry</button>
          {entries.length > 3 && <input type="search" aria-label="Search the session log" placeholder="Search" value={filter} onChange={(e) => setFilter(e.target.value)} />}
        </div>
        {entries.length === 0 && <p className="muted">Nothing yet. Add an entry after a session to keep track of what happened.</p>}
        {shown.map((e) => {
          const isOpen = open.includes(e.uid);
          const preview = e.text.replace(/\s+/g, " ").trim();
          return (
            <div key={e.uid} className={isOpen ? "journal-entry open" : "journal-entry"}>
              <button className="journal-line" aria-expanded={isOpen} onClick={() => toggle(e.uid)}>
                <span className="chev">{isOpen ? "▾" : "▸"}</span>
                <time>{e.date}</time>
                <b>{e.title || "Untitled"}</b>
                {!isOpen && <span className="muted journal-preview">{preview}</span>}
              </button>
              {isOpen && (
                <div className="journal-body">
                  <div className="row">
                    <input type="date" aria-label="Session date" value={e.date} onChange={(ev) => edit(e.uid, { date: ev.target.value })} />
                    <input aria-label="Entry title" placeholder="Title" value={e.title} onChange={(ev) => edit(e.uid, { title: ev.target.value })} />
                    <button onClick={async () => { if (!e.text.trim() || (await askConfirm({ title: "Delete this journal entry?", message: "This cannot be undone." }))) set((c) => ({ ...c, journal: (c.journal ?? []).filter((x) => x.uid !== e.uid) })); }}>Delete</button>
                  </div>
                  <textarea rows={8} aria-label="Entry text" value={e.text} onChange={(ev) => edit(e.uid, { text: ev.target.value })} />
                </div>
              )}
            </div>
          );
        })}
      </section>
    </>
  );
}
