import { useEffect, useMemo, useState } from "react";
import type { AElement } from "../aurora/types";
import { formatRelease, groupVariants, sortGroups, type Group, type SortMode, type Variant } from "../aurora/books";
import { applyFacets, facetCounts, facetsFor, type Selected } from "../aurora/facets";
import { stripHtml } from "../aurora/sheet";
import { shortRange, shortTime } from "../sheets/data";
import { hueOf } from "./PickCards";
import { useUi } from "./Learn";

function useStored<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const full = `charforge.browse.${key}`;
  const [v, setV] = useState<T>(() => {
    try {
      return (localStorage.getItem(full) as T | null) ?? initial;
    } catch {
      return initial;
    }
  });
  const set = (n: T) => {
    setV(n);
    try {
      localStorage.setItem(full, n);
    } catch {
      /* storage can be unavailable */
    }
  };
  return [v, set];
}

const blurb = (html: string, max = 170) => {
  const m = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const t = stripHtml(m ? m[1] : html).replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max).replace(/\s+\S*$/, "")}...` : t;
};

const SORTS: [SortMode, string][] = [["az", "A to Z"], ["recommended", "Recommended"], ["newest", "Newest"]];

function VariantChips({ g, activeId, chosen, onActive, short }: { g: Group; activeId: string; chosen: Set<string>; onActive: (id: string) => void; short?: boolean }) {
  const when = (r?: number) => (short ? (r ? String(Math.floor(r / 10000)) : "") : formatRelease(r));
  if (g.variants.length < 2) {
    const v = g.variants[0];
    return <span className="vchips"><span className="vchip static">{v.book.abbr ?? v.el.source}{v.book.release ? ` · ${when(v.book.release)}` : ""}</span></span>;
  }
  return (
    <span className="vchips" role="group" aria-label="Versions from different books">
      {g.variants.map((v) => (
        <button key={v.el.id} className={`vchip ${v.el.id === activeId ? "on" : ""} ${chosen.has(v.el.id) ? "chosen" : ""}`} title={`${v.el.source}${v.book.release ? `, ${formatRelease(v.book.release)}` : ""}`} onClick={(e) => { e.stopPropagation(); onActive(v.el.id); }}>
          {v.book.abbr ?? v.el.source}
          {v.book.release ? <small> {when(v.book.release)}</small> : null}
          {v === g.newest && g.variants.length > 1 && v.book.release ? <em className="newest">newest</em> : null}
          {v.book.playtest ? <em className="ua">playtest</em> : null}
        </button>
      ))}
    </span>
  );
}

function SpellCells({ el }: { el: AElement }) {
  const s = el.setters;
  const comps = [s.hasVerbalComponent?.value === "true" && "V", s.hasSomaticComponent?.value === "true" && "S", s.hasMaterialComponent?.value === "true" && "M"].filter(Boolean).join(" ");
  return (
    <>
      <span className="c-school">{(s.school?.value ?? "").slice(0, 4)}</span>
      <span className="c-time">{shortTime(s.time?.value ?? "")}</span>
      <span className="c-range">{shortRange(s.range?.value ?? "")}</span>
      <span className="c-comp" title={s.materialComponent?.value}>{comps}</span>
      <span className="c-flags">
        {s.isConcentration?.value === "true" && <b title="Concentration">C</b>}
        {s.isRitual?.value === "true" && <b title="Ritual">R</b>}
      </span>
    </>
  );
}

export interface BrowseProps {
  items: AElement[];
  type: string;
  chosen: string[];
  onPick: (el: AElement) => void;
  disabledReason?: (el: AElement) => string | undefined;
  defaultView?: "cards" | "list";
  /** Cards need a bit of room, so small pickers only offer the list. */
  allowCards?: boolean;
  hero?: { kicker: string; title: string };
  onHover?: (el: AElement) => void;
  pickLabel?: (el: AElement) => string;
  perPage?: number;
  /** The recommended sort is the default for named choices; spells default to level. */
  defaultSort?: SortMode;
}

export function Browse({ items, type, chosen, onPick, disabledReason, defaultView = "list", allowCards = true, hero, onHover, pickLabel, perPage = 48, defaultSort }: BrowseProps) {
  const { books, learn } = useUi();
  const [view, setView] = useStored<"cards" | "list">(`view.${type}`, defaultView);
  const [sort, setSort] = useStored<SortMode>(`sort.${type}`, defaultSort ?? (type === "Spell" ? "level" : "recommended"));
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Selected>({});
  const [shown, setShown] = useState(perPage);
  const [active, setActive] = useState<Record<string, string>>({});
  const chosenSet = useMemo(() => new Set(chosen), [chosen]);

  const defs = useMemo(() => facetsFor(type), [type]);
  const counts = useMemo(() => defs.map((d) => ({ def: d, values: facetCounts(items, d, books) })).filter((x) => x.values.length > 1), [defs, items, books]);
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    const byText = n ? items.filter((e) => e.name.toLowerCase().includes(n)) : items;
    return applyFacets(byText, defs, sel, books);
  }, [items, q, sel, defs, books]);
  const groups = useMemo(() => sortGroups(groupVariants(filtered, books), type === "Spell" || sort !== "level" ? sort : "az"), [filtered, books, sort, type]);
  useEffect(() => setShown(perPage), [q, sel, sort, view, perPage]);

  const activeCount = Object.values(sel).reduce((n, s) => n + s.size, 0);
  const toggle = (id: string, v: string) =>
    setSel((s) => {
      const next = { ...s, [id]: new Set(s[id] ?? []) };
      if (next[id].has(v)) next[id].delete(v);
      else next[id].add(v);
      return next;
    });
  const sorts: [SortMode, string][] = type === "Spell" ? [["level", "Level"], ...SORTS] : SORTS;
  const useCards = allowCards && view === "cards";

  const activeOf = (g: Group): Variant => g.variants.find((v) => v.el.id === active[g.key]) ?? g.variants.find((v) => chosenSet.has(v.el.id)) ?? g.best;

  return (
    <div className={`browse ${useCards ? "as-cards" : "as-list"}`}>
      {hero && (
        <div className="choice-head">
          <div className="kicker">{hero.kicker}</div>
          <h2>{hero.title}</h2>
        </div>
      )}
      <div className="browse-bar">
        <input type="search" placeholder={`Search ${items.length} options`} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={open || activeCount ? "pill active" : "pill"} onClick={() => setOpen(!open)}>Filters{activeCount ? ` (${activeCount})` : ""}</button>
        <label className="sort-select">Sort <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>{sorts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        {allowCards && (
          <span className="view-toggle" role="group" aria-label="View">
            <button className={view === "cards" ? "pill active" : "pill"} onClick={() => setView("cards")}>Badges</button>
            <button className={view === "list" ? "pill active" : "pill"} onClick={() => setView("list")}>List</button>
          </span>
        )}
        <span className="muted count">{groups.length} shown{filtered.length !== groups.length ? `, ${filtered.length} versions` : ""}</span>
      </div>
      {open && (
        <div className="filters">
          {counts.map(({ def, values }) => (
            <div key={def.id} className="filter-group">
              <b>{def.label}</b>
              <div className={`chips ${values.length > 14 ? "scroll" : ""}`}>
                {values.map(([v, n]) => (
                  <button key={v} className={sel[def.id]?.has(v) ? "pill active" : "pill"} onClick={() => toggle(def.id, v)}>{v} <small>{n}</small></button>
                ))}
              </div>
            </div>
          ))}
          {activeCount > 0 && <button className="more" onClick={() => setSel({})}>Clear filters</button>}
        </div>
      )}

      {groups.length === 0 && <p className="muted pad">Nothing matches. Try clearing a filter.</p>}

      {useCards ? (
        <div className="card-grid">
          {groups.slice(0, shown).map((g) => {
            const v = activeOf(g);
            const e = v.el;
            const hue = hueOf(e.name);
            const why = disabledReason?.(e);
            const picked = g.variants.some((x) => chosenSet.has(x.el.id));
            return (
              <div key={g.key} className={`pick-card ${picked ? "picked" : ""} ${why ? "dim" : ""}`} style={{ ["--hue" as string]: hue }} data-glyph={e.name.charAt(0)} onMouseEnter={() => onHover?.(e)}>
                <div className="ribbon">{e.name.charAt(0)}</div>
                <h3>{e.name}</h3>
                <VariantChips g={g} activeId={e.id} chosen={chosenSet} onActive={(id) => setActive((a) => ({ ...a, [g.key]: id }))} />
                <p className="pick-blurb">{blurb(e.description) || "No description in the content file."}</p>
                <div className="pick-actions">
                  <button className="ghost" onClick={() => learn(e)}>Learn more</button>
                  <button className="primary" disabled={!!why} title={why} onClick={() => onPick(e)}>{chosenSet.has(e.id) ? "Selected" : (pickLabel?.(e) ?? "Select")}</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={`rows ${type === "Spell" ? "spell-rows" : ""}`}>
          {type === "Spell" && groups.length > 0 && (
            <div className="row-head"><span>Lv</span><span>Name</span><span>School</span><span>Time</span><span>Range</span><span>Comp</span><span /><span>Book</span></div>
          )}
          {groups.slice(0, shown).map((g) => {
            const v = activeOf(g);
            const e = v.el;
            const why = disabledReason?.(e);
            const picked = g.variants.some((x) => chosenSet.has(x.el.id));
            return (
              <div key={g.key} className={`opt-row ${picked ? "picked" : ""} ${why ? "dim" : ""}`} onMouseEnter={() => onHover?.(e)}>
                {type === "Spell" && <span className={`lvl ${e.setters.level?.value === "0" ? "cantrip" : ""}`}>{e.setters.level?.value === "0" ? "C" : e.setters.level?.value ?? "?"}</span>}
                <button className="opt-main" disabled={false} title={why} onClick={() => onPick(e)}>
                  <span className="tick">{chosenSet.has(e.id) ? "✓" : ""}</span>
                  <span className="opt-name">{e.name}</span>
                </button>
                {type === "Spell" ? <SpellCells el={e} /> : <span className="opt-blurb">{blurb(e.description, 110)}</span>}
                {why && <small className="why">{why}</small>}
                <VariantChips short g={g} activeId={e.id} chosen={chosenSet} onActive={(id) => setActive((a) => ({ ...a, [g.key]: id }))} />
                <button className="learn" onClick={() => learn(e)} title="Read the full description">i</button>
              </div>
            );
          })}
        </div>
      )}
      {groups.length > shown && <button className="more" onClick={() => setShown(shown + perPage * 2)}>Show more ({groups.length - shown})</button>}
    </div>
  );
}
