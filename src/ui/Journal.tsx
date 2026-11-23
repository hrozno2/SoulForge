import { useState } from "react";
import { TextArea } from "./TextField";
import { askConfirm } from "./Confirm";
import { uid, type Character, type JournalEntry } from "../aurora/character";

type SetCharacter = (fn: (c: Character) => Character) => void;

const today = () => new Date().toISOString().slice(0, 10);

/**
 * The Journal: the one home for a character's notes (Chris 2026-11-23). General notes on top, then dated entries:
 * sessions the player writes up, and what the app adds on request (import notes, a repair report, the changes of
 * "Make it legal"). Entries are kept newest first by date. The same Journal shows in Play and in the character's
 * details; `showLatest` opens the entry added last (the "Open journal" button after adding a report).
 */
export function Journal({ ch, set, showLatest }: { ch: Character; set: SetCharacter; showLatest?: boolean }) {
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<string[]>(() => {
    const last = showLatest ? (ch.journal ?? []).at(-1) : undefined;
    return last ? [last.uid] : [];
  });
  const toggle = (id: string) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  const entries = [...(ch.journal ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const q = filter.trim().toLowerCase();
  const shown = q ? entries.filter((e) => `${e.title} ${e.text}`.toLowerCase().includes(q)) : entries;
  const edit = (id: string, p: Partial<JournalEntry>) =>
    set((c) => ({ ...c, journal: (c.journal ?? []).map((e) => (e.uid === id ? { ...e, ...p } : e)) }));
  return (
    <>
      <label className="field">
        <span>Notes</span>
        <TextArea id="character-notes" rows={6} value={ch.notes} onCommit={(v) => set((c) => ({ ...c, notes: v }))} />
      </label>
      <section className="block journal">
        <h3 id="character-journal">Journal</h3>
        <div className="row">
          <button
            className="primary"
            onClick={() => {
              const id = uid();
              set((c) => ({ ...c, journal: [...(c.journal ?? []), { uid: id, date: today(), title: "", text: "" }] }));
              setOpen((o) => [...o, id]);
            }}
          >
            New entry
          </button>
          {entries.length > 3 && (
            <input
              type="search"
              aria-label="Search the journal"
              placeholder="Search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          )}
        </div>
        {entries.length === 0 && (
          <p className="muted">
            Nothing yet. Add an entry after a session to keep track of what happened. Import notes and rules changes you keep land here too.
          </p>
        )}
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
                    <input type="date" aria-label="Entry date" value={e.date} onChange={(ev) => edit(e.uid, { date: ev.target.value })} />
                    <input
                      aria-label="Entry title"
                      placeholder="Title"
                      value={e.title}
                      onChange={(ev) => edit(e.uid, { title: ev.target.value })}
                    />
                    <button
                      onClick={async () => {
                        if (
                          !e.text.trim() ||
                          (await askConfirm({ title: "Delete this journal entry?", message: "This cannot be undone." }))
                        )
                          set((c) => ({ ...c, journal: (c.journal ?? []).filter((x) => x.uid !== e.uid) }));
                      }}
                    >
                      Delete
                    </button>
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
