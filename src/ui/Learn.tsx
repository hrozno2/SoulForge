import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { AElement } from "../aurora/types";
import type { ARegistry } from "../aurora/registry";
import { BookIndex, formatRelease } from "../aurora/books";
import { Html } from "./Html";

interface Ui {
  books: BookIndex;
  learn: (el: AElement) => void;
}

const Ctx = createContext<Ui | null>(null);

export function UiProvider({ reg, children }: { reg: ARegistry; children: ReactNode }) {
  const books = useMemo(() => new BookIndex(reg), [reg]);
  const [el, setEl] = useState<AElement | null>(null);
  const value = useMemo(() => ({ books, learn: setEl }), [books]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {el && <LearnModal el={el} books={books} onClose={() => setEl(null)} />}
    </Ctx.Provider>
  );
}

export function useUi(): Ui {
  const v = useContext(Ctx);
  if (!v) throw new Error("UiProvider is missing");
  return v;
}

function LearnModal({ el, books, onClose }: { el: AElement; books: BookIndex; onClose: () => void }) {
  const b = books.info(el.source);
  const s = el.setters;
  return (
    <div className="modal-back" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-page" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <h2>{el.name}</h2>
        <p className="muted">{el.type} · {el.source}{b.release ? ` · ${formatRelease(b.release)}` : ""}{b.playtest ? " · playtest" : ""}</p>
        {el.type === "Spell" && (
          <dl className="facts">
            {[["Level", s.level?.value === "0" ? "Cantrip" : s.level?.value], ["School", s.school?.value], ["Casting time", s.time?.value], ["Range", s.range?.value], ["Duration", s.duration?.value]]
              .filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        )}
        <Html cap html={el.description || "<p>No description in the content file.</p>"} />
      </div>
    </div>
  );
}
