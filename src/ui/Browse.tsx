import { useEffect, useMemo, useState } from "react";
import type { AElement } from "../aurora/types";
import { BOOK_KIND_LABEL, bookKind, formatRelease, groupVariants, hasRecommendation, hiddenBy, sortGroups, type Group, type SortMode, type Variant } from "../aurora/books";
import { applyFacets, facetCounts, facetsFor, type Selected } from "../aurora/facets";
import { stripHtml } from "../aurora/sheet";
import { shortRange, shortTime } from "../sheets/data";
import { Emblem, hueOf } from "./PickCards";
import { useUi } from "./Learn";
import { SchoolIcon } from "./schoolIcons";
import { CLASS_TAGS, ClassIcon, hasClassIcon } from "./classIcons";
import { Pack, Shield, Sword, Wand } from "./icons";

const SCHOOLS = new Set(["abjuration", "conjuration", "divination", "enchantment", "evocation", "illusion", "necromancy", "transmutation"]);
import { updateSettings, useSettings } from "./Settings";

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

export const blurb = (html: string, max = 170) => {
  const m = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const t = stripHtml(m ? m[1] : html).replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max).replace(/\s+\S*$/, "")}...` : t;
};

/** The feat a background gives, when its rules name one. */
export const featOf = (e: AElement): string | undefined => {
  if (e.type !== "Background") return undefined;
  const g = e.rules.find((r) => r.kind === "grant" && r.type === "Feat") as { name?: string; id: string } | undefined;
  if (!g) return undefined;
  if (g.name) return g.name;
  const m = g.id.match(/FEAT_(.+)$/i);
  return m ? m[1].toLowerCase().split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : undefined;
};

const SORTS: [SortMode, string][] = [["az", "A to Z"], ["recommended", "Recommended"], ["newest", "Newest"]];

/** The books an option comes from, as chips; a click switches to that version. */
/** A source's kind as a small marker: Official, Setting, UA or Other. */
export function KindTag({ v }: { v: Variant }) {
  const k = bookKind(v.book, v.el.source);
  const soon = v.el.comingSoon ? <em className="soon-tag" title="Playtest content Soul Forge does not support yet: it cannot be picked">Coming soon</em> : null;
  if (!k) return soon;
  return <>{soon}<em className={`kind kind-${k}`} title={k === "playtest" ? "Unearthed Arcana: playtest material" : k === "setting" ? "An official setting or adventure book" : k === "official" ? "An official core book or supplement" : "Not an official book (third-party or homebrew)"}>{BOOK_KIND_LABEL[k]}</em></>;
}

export function VariantChips({ g, activeId, chosen, onActive, short, onSwitch, onPickVersion }: { g: Group; activeId: string; chosen: Set<string>; onActive: (id: string) => void; short?: boolean; onSwitch?: (from: AElement, to: AElement) => void; onPickVersion?: (el: AElement) => void }) {
  const when = (r?: number) => (short ? (r ? String(Math.floor(r / 10000)) : "") : formatRelease(r));
  if (g.variants.length < 2) {
    const v = g.variants[0];
    return <span className="vchips"><span className="vchip static" tabIndex={0} title={`${v.book.name || v.el.source}${v.book.release ? `, ${formatRelease(v.book.release)}` : ""}`}>{v.book.abbr ?? v.el.source}{v.book.release ? ` · ${when(v.book.release)}` : ""}<KindTag v={v} /></span></span>;
  }
  return (
    <span className="vchips" role="group" aria-label="Versions from different books">
      {g.variants.map((v) => (
        <button key={v.el.id} className={`vchip ${v.el.id === activeId ? "on" : ""} ${chosen.has(v.el.id) ? "chosen" : ""}`} title={`${v.book.name || v.el.source}${v.book.release ? `, ${formatRelease(v.book.release)}` : ""}`} onClick={(e) => {
          e.stopPropagation();
          onActive(v.el.id);
          // In the list a version you click replaces the one you already picked from this group.
          const have = g.variants.find((x) => chosen.has(x.el.id));
          if (onSwitch && have && have.el.id !== v.el.id) onSwitch(have.el, v.el);
          // Nothing from this group picked yet: in the list a click on a version picks it.
          else if (!have && onPickVersion) onPickVersion(v.el);
        }}>
          {v.book.abbr ?? v.el.source}
          {v.book.release ? <small> {when(v.book.release)}</small> : null}
          {v === g.newest && g.variants.length > 1 && v.book.release ? <em className="newest">newest</em> : null}
          <KindTag v={v} />
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
      <span className="c-school" title={s.school?.value}>{SCHOOLS.has((s.school?.value ?? "").toLowerCase()) ? <SchoolIcon school={s.school?.value} size={20} /> : (s.school?.value ?? "").slice(0, 4)}</span>
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

export function LockIcon() {
  return <svg className="lock-ico" viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3h1.5A1.5 1.5 0 0 1 20 11.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 20.5v-9A1.5 1.5 0 0 1 5.5 10H7zm2 0h6V7a3 3 0 0 0-6 0v3z" fill="currentColor" /></svg>;
}

export interface BrowseProps {
  items: AElement[];
  type: string;
  chosen: string[];
  onPick: (el: AElement) => void;
  /** Called when a version chip in the list is clicked while another version of the same option is picked. */
  onSwap?: (from: AElement, to: AElement) => void;
  disabledReason?: (el: AElement) => string | undefined;
  /** Says what already gives the character this option. Such options show a locked check mark and cannot be picked here. */
  ownedBy?: (el: AElement) => string | undefined;
  defaultView?: "cards" | "list";
  /** Cards need a bit of room, so small pickers only offer the list. */
  allowCards?: boolean;
  hero?: { kicker: string; title: string };
  onHover?: (el: AElement) => void;
  pickLabel?: (el: AElement) => string;
  perPage?: number;
  /** The recommended sort is the default for named choices; spells default to level. */
  defaultSort?: SortMode;
  /** Options can be dragged (onto the build board); the drag carries the element id under dragMime(type). */
  draggable?: boolean;
  /** Extra controls under the sort and search bar (the build board's class list puts its mode switch here). */
  barExtra?: React.ReactNode;
  /** The card view as small cards in two columns (the build board's lists) instead of the large cards. */
  mini?: boolean;
  /** Where the Cards/List choice is remembered, when a list should keep it apart from the same type elsewhere. */
  viewKey?: string;
  /** Ignore the global content filters (2024 only, playtest, other worlds): the override of a choice that came up empty. */
  showAll?: boolean;
  /** How many picks the choice takes: the content filters never hide options it needs to be completed. */
  need?: number;
}

/** An item's category as a short badge (Weapon, Armor, Gear, Tool, Pack, Focus...), or its rarity for a magic item. */
const CATEGORY: Record<string, string> = { weapons: "Weapon", armor: "Armor", "adventuring gear": "Gear", tools: "Tool", "equipment packs": "Pack", "spellcasting focus": "Focus", "musical instruments": "Instrument", ammunition: "Ammo", "mounts & vehicles": "Mount", trinkets: "Trinket", trinket: "Trinket", poisons: "Poison", potions: "Potion" };
function itemBadge(e: AElement): string {
  if (!["Item", "Weapon", "Armor", "Magic Item"].includes(e.type)) return "";
  const cat = (e.setters.category?.value ?? "").toLowerCase().trim();
  if (e.type === "Magic Item") return (e.setters.rarity?.value ?? "Magic").replace(/\s*\(.*$/, "").replace(/^\w/, (c) => c.toUpperCase());
  return CATEGORY[cat] ?? (cat ? cat.replace(/s$/, "").replace(/^\w/, (c) => c.toUpperCase()) : e.type === "Item" ? "Gear" : e.type);
}

const ITEM_ICON: Record<string, (p: { size?: number }) => React.ReactNode> = { Weapon: Sword, Armor: Shield, "Magic Item": Wand, Item: Pack };

/** The drag data type for an element type, so a drop target can tell what is over it before the drop. */
export const dragMime = (type: string) => `application/x-sf-${type.toLowerCase().replace(/[^a-z]/g, "")}`;

export function Browse({ items: allItems, type, chosen, onPick: pickProp, onSwap: swapProp, disabledReason: reasonProp, ownedBy, defaultView = "list", allowCards = true, hero, onHover, pickLabel, perPage = 48, defaultSort, draggable, barExtra, mini, viewKey, showAll, need }: BrowseProps) {
  const { books, learn } = useUi();
  const [view, setView] = useStored<"cards" | "list">(viewKey ?? `view.${type}`, defaultView);
  const [sort, setSort] = useStored<SortMode>(`sort.${type}`, defaultSort ?? (type === "Spell" ? "level" : "recommended"));
  const [lockMode, setLockMode] = useStored<"show" | "hide">(`locked.${type}`, "show");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Selected>({});
  const [shown, setShown] = useState(perPage);
  const [active, setActive] = useState<Record<string, string>>({});
  const chosenSet = useMemo(() => new Set(chosen), [chosen]);
  // Playtest content not supported yet shows with a "Coming soon" lock and can never be picked (comingSoon.ts).
  const disabledReason = useMemo(() => {
    const anySoon = allItems.some((e) => e.comingSoon);
    if (!anySoon) return reasonProp;
    return (e: AElement) => (e.comingSoon ? "Coming soon" : reasonProp?.(e));
  }, [allItems, reasonProp]);
  const onPick = (e: AElement) => { if (!e.comingSoon) pickProp(e); };
  const onSwap = swapProp && ((from: AElement, to: AElement) => { if (!to.comingSoon) swapProp(from, to); });
  const prefs = useSettings();
  // The global content filters. Whatever is already picked stays visible.
  const items = useMemo(() => {
    if (showAll) return allItems;
    const kept = allItems.filter((e) => chosenSet.has(e.id) || !hiddenBy(books.info(e.source), e.source, { legacy: prefs.showLegacy, playtest: prefs.showPlaytest, unusual: prefs.showUnusual, scifi: prefs.showSciFi, modern: prefs.showModern }, e.type, e.supports));
    // The content filters never leave a choice unable to be completed: when fewer options the character can take
    // remain than picks still to make, every option shows.
    const takeable = (list: typeof allItems) => list.filter((e) => !chosenSet.has(e.id) && !disabledReason?.(e)).length;
    const toPick = Math.max(0, (need ?? 1) - chosen.length);
    return kept.length && takeable(kept) >= Math.min(toPick, takeable(allItems)) ? kept : allItems;
  }, [allItems, books, chosenSet, chosen, need, disabledReason, prefs.showLegacy, prefs.showPlaytest, prefs.showUnusual, prefs.showSciFi, prefs.showModern, showAll]);
  const hidden = allItems.length - items.length;

  const defs = useMemo(() => facetsFor(type), [type]);
  const counts = useMemo(() => defs.map((d) => ({ def: d, values: facetCounts(items, d, books) })).filter((x) => x.values.length > 1), [defs, items, books]);
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    const byText = n ? items.filter((e) => e.name.toLowerCase().includes(n)) : items;
    const visible = lockMode === "hide" && disabledReason ? byText.filter((e) => chosenSet.has(e.id) || !disabledReason(e)) : byText;
    return applyFacets(visible, defs, sel, books);
  }, [items, q, sel, defs, books, lockMode, disabledReason, chosenSet]);
  const lockedCount = useMemo(() => (disabledReason ? items.filter((e) => !chosenSet.has(e.id) && disabledReason(e)).length : 0), [items, disabledReason, chosenSet]);
  // Recommended only means something where there is a popularity order or the books differ in standing. Elsewhere it would just be A to Z.
  const recommends = useMemo(() => hasRecommendation(type, groupVariants(items, books)), [items, books, type]);
  const effSort: SortMode = sort === "recommended" && !recommends ? "az" : sort;
  const groups = useMemo(() => {
    const sorted = sortGroups(groupVariants(filtered, books), type === "Spell" || effSort !== "level" ? effSort : "az");
    // Options that can be taken come first; locked ones follow, in the same order.
    if (!disabledReason) return sorted;
    const locked = (g: Group) => g.variants.every((v) => !chosenSet.has(v.el.id) && !!disabledReason(v.el));
    return [...sorted.filter((g) => !locked(g)), ...sorted.filter(locked)];
  }, [filtered, books, effSort, type, disabledReason, chosenSet]);
  useEffect(() => setShown(perPage), [q, sel, sort, view, perPage]);

  // The Filters button counts what is set behind it; a switch on the bar shows its own state.
  const activeCount = defs.filter((d) => !d.inline).reduce((n, d) => n + (sel[d.id]?.size ?? 0), 0);
  const toggle = (id: string, v: string) =>
    setSel((s) => {
      const next = { ...s, [id]: new Set(s[id] ?? []) };
      if (next[id].has(v)) next[id].delete(v);
      else next[id].add(v);
      return next;
    });
  const base = recommends ? SORTS : SORTS.filter(([k]) => k !== "recommended");
  const sorts: [SortMode, string][] = type === "Spell" ? [["level", "Level"], ...base] : base;
  const useCards = allowCards && view === "cards";

  const drag = (e: AElement, why?: string, owner?: string) => (draggable && !why && !owner ? {
    draggable: true,
    onDragStart: (ev: React.DragEvent) => { ev.dataTransfer.setData(dragMime(e.type), e.id); ev.dataTransfer.effectAllowed = "copy"; document.body.dataset.dragging = dragMime(e.type); },
    onDragEnd: () => { delete document.body.dataset.dragging; },
  } : {});
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
        {hero && (
          <div className="seg-group">
            <span className="seg-label">Rules</span>
            <span className="seg" role="group" aria-label="Rules">
              <button className={!prefs.showLegacy ? "on" : ""} onClick={() => updateSettings({ showLegacy: false })} title="Only the 2024 books, plus what you already picked">2024</button>
              <button className={prefs.showLegacy ? "on" : ""} onClick={() => updateSettings({ showLegacy: true })} title="The 2024 and the 2014 books">All</button>
            </span>
          </div>
        )}
        <div className="seg-group">
          <span className="seg-label">Sort</span>
          <span className="seg" role="group" aria-label="Sort">
            {sorts.map(([k, l]) => <button key={k} className={effSort === k ? "on" : ""} onClick={() => setSort(k)}>{l}</button>)}
          </span>
        </div>
        {allowCards && (
          <div className="seg-group">
            <span className="seg-label">View</span>
            <span className="seg" role="group" aria-label="View">
              <button className={view === "cards" ? "on" : ""} onClick={() => setView("cards")}>Cards</button>
              <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>List</button>
            </span>
          </div>
        )}
        {/* A mixed choice (skills, tools, weapons... in one): its kinds as one switch on the bar (C1.3). */}
        {counts.filter((c) => c.def.inline).map(({ def, values }) => (
          <div key={def.id} className="seg-group">
            <span className="seg-label">{def.label}</span>
            <span className="seg" role="group" aria-label={def.label}>
              <button className={!sel[def.id]?.size ? "on" : ""} onClick={() => setSel((s) => ({ ...s, [def.id]: new Set() }))}>All</button>
              {values.map(([v, n]) => <button key={v} className={sel[def.id]?.has(v) ? "on" : ""} title={`${n} ${v.toLowerCase()}`} onClick={() => setSel((s) => ({ ...s, [def.id]: new Set([v]) }))}>{v}</button>)}
            </span>
          </div>
        ))}
        {lockedCount > 0 && (
          <div className="seg-group">
            <span className="seg-label">Locked ({lockedCount})</span>
            <span className="seg" role="group" aria-label="Locked options">
              <button className={lockMode === "show" ? "on" : ""} onClick={() => setLockMode("show")} title="Show options you cannot take yet, grayed out with the reason">Show</button>
              <button className={lockMode === "hide" ? "on" : ""} onClick={() => setLockMode("hide")}>Hide</button>
            </span>
          </div>
        )}
        <div className="seg-group grow">
          <span className="seg-label">&nbsp;</span>
          <span className="search-row">
            <span className="search-box">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="M15.5 15.5 21 21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
              <input type="search" placeholder={`Search ${items.length} options`} value={q} onChange={(e) => setQ(e.target.value)} />
            </span>
            <button className={`filters-btn ${open || activeCount ? "on" : ""}`} onClick={() => setOpen(!open)}>Filters{activeCount ? ` (${activeCount})` : ""}</button>
          </span>
        </div>
      </div>
      {barExtra}
      <p className="muted count">{groups.length} shown{filtered.length !== groups.length ? `, ${filtered.length} versions` : ""}{hidden > 0 ? `, ${hidden} hidden by your content filters (Menu, Settings)` : ""}</p>
      {open && (
        <div className="filters">
          {counts.filter((c) => !c.def.inline).map(({ def, values }) => (
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

      {useCards && (mini || type === "Spell") ? (
        // Small cards for the board's lists, and spell scrolls (under level headings) for spells.
        <div className={type === "Spell" ? "scroll-grid" : "mini-grid"}>
          {groups.slice(0, shown).map((g, idx, all) => {
            const v = activeOf(g);
            const e = v.el;
            const why = disabledReason?.(e);
            const owner = g.variants.map((x) => ownedBy?.(x.el)).find(Boolean);
            const picked = g.variants.some((x) => chosenSet.has(x.el.id));
            const level = e.setters.level?.value ?? "";
            const prevLevel = idx > 0 ? activeOf(all[idx - 1]).el.setters.level?.value ?? "" : null;
            const heading = type === "Spell" && effSort === "level" && level !== prevLevel ? <h4 key={`h${level}`} className="scroll-level">{level === "0" ? "Cantrips" : `Level ${level}`}</h4> : null;
            if (type === "Spell") {
              const s = e.setters;
              const conc = s.isConcentration?.value === "true" || /concentration/i.test(s.duration?.value ?? "");
              return [heading,
                <div key={g.key} className={`scroll-card ${picked ? "picked" : ""} ${why ? "dim" : ""} ${owner ? "owned" : ""}`} title={owner ?? why} onMouseEnter={() => onHover?.(e)} {...drag(e, why, owner)}>
                  <button className="scroll-main" onClick={() => !owner && onPick(e)} aria-pressed={picked}>
                    <span className="scroll-top"><span className="scroll-lvl">{level === "0" ? "Cantrip" : level ? `Level ${level}` : "Spell"}</span><SchoolIcon school={s.school?.value} size={16} /><span className="scroll-tick">{picked || owner ? "✓" : ""}</span></span>
                    <b className="scroll-name">{e.name}</b>
                    <small className="scroll-meta">{[shortTime(s.time?.value ?? ""), shortRange(s.range?.value ?? "")].filter(Boolean).join(" · ")}{conc ? " · C" : ""}{s.isRitual?.value === "true" ? " · R" : ""}</small>
                    {why && !owner && <small className="scroll-why">{why}</small>}
                  </button>
                  <button className="board-ico scroll-learn" title="Learn more" aria-label={`Learn more about ${e.name}`} onClick={() => learn(e)}>i</button>
                </div>];
            }
            return (
              <div key={g.key} className={`mini-card ${picked ? "picked" : ""} ${why ? "dim" : ""} ${owner ? "owned" : ""}`} style={{ ["--hue" as string]: hueOf(e.name) }} title={owner ?? why} onMouseEnter={() => onHover?.(e)} {...drag(e, why, owner)}>
                <button className="mini-main" onClick={() => !owner && onPick(e)} aria-pressed={picked}>
                  <span className="mini-icon"><Emblem el={e} size={24} /></span>
                  {itemBadge(e) && <span className="mini-badge">{itemBadge(e)}</span>}
                  <b className="mini-name">{e.name}</b>
                  <small className="mini-blurb">{CLASS_TAGS[e.name]?.[0] ?? blurb(e.description, 54)}</small>
                  {why && !owner && <small className="mini-why"><LockIcon />{why}</small>}
                  {picked && <span className="mini-tick">✓</span>}
                </button>
                <button className="board-ico mini-learn" title="Learn more" aria-label={`Learn more about ${e.name}`} onClick={() => learn(e)}>i</button>
              </div>
            );
          })}
        </div>
      ) : useCards ? (
        <div className="card-grid">
          {groups.slice(0, shown).map((g) => {
            const v = activeOf(g);
            const e = v.el;
            const hue = hueOf(e.name);
            const why = disabledReason?.(e);
            const owner = g.variants.map((x) => ownedBy?.(x.el)).find(Boolean);
            const picked = g.variants.some((x) => chosenSet.has(x.el.id));
            return (
              <div key={g.key} title={owner} className={`pick-card ${type === "Class" ? "is-class" : ""} ${picked ? "picked" : ""} ${why ? "dim" : ""} ${owner ? "owned" : ""}`} style={{ ["--hue" as string]: hue }} data-glyph={hasClassIcon(e.name) ? "" : e.name.charAt(0)} onMouseEnter={() => onHover?.(e)} {...drag(e, why, owner)}>
                {hasClassIcon(e.name) && <ClassIcon name={e.name} size={260} className="pick-watermark" />}
                {why && !owner && <div className="lock-note" role="note"><LockIcon />{why}</div>}
                {type === "Class" && <div className="ribbon">{hasClassIcon(e.name) ? <ClassIcon name={e.name} size={34} /> : e.name.charAt(0)}</div>}
                <h3>{e.name}</h3>
                {CLASS_TAGS[e.name] && type === "Class" && <div className="pick-tags">{CLASS_TAGS[e.name].map((t) => <span key={t}>{t}</span>)}</div>}
                <p className="pick-blurb">{blurb(e.description) || "No description in the content file."}</p>
                {featOf(e) && <p className="pick-feat"><b>Feat:</b> {featOf(e)}</p>}
                <div className="pick-foot">
                  <VariantChips g={g} activeId={e.id} chosen={chosenSet} onActive={(id) => setActive((a) => ({ ...a, [g.key]: id }))} />
                  <div className="pick-actions">
                    <button className="ghost" onClick={() => learn(e)}>Learn more</button>
                    <button className={`pick-select ${picked ? "is-on" : ""}`} disabled={!!why || !!owner} title={owner ?? why} onClick={() => onPick(e)}>{owner ? "✓ Already have" : chosenSet.has(e.id) ? "Selected" : (pickLabel?.(e) ?? "Select")}</button>
                  </div>
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
            const owner = g.variants.map((x) => ownedBy?.(x.el)).find(Boolean);
            const picked = g.variants.some((x) => chosenSet.has(x.el.id));
            return (
              <div key={g.key} className={`opt-row ${picked ? "picked" : ""} ${why ? "dim" : ""} ${owner ? "owned" : ""}`} title={owner ?? why} onMouseEnter={() => onHover?.(e)} {...drag(e, why, owner)}>
                {type === "Spell" && <span className={`lvl ${e.setters.level?.value === "0" ? "cantrip" : ""}`}>{e.setters.level?.value === "0" ? "C" : e.setters.level?.value ?? "?"}</span>}
                <button className="opt-main" disabled={false} title={owner ?? why} aria-disabled={owner ? true : undefined} onClick={() => !owner && onPick(e)}>
                  <span className="tick">{chosenSet.has(e.id) || owner ? "✓" : ""}</span>
                  {type === "Item" && ITEM_ICON[e.type] && <span className="opt-type-ico" title={e.type}>{ITEM_ICON[e.type]({ size: 15 })}</span>}
                  <span className="opt-name">{e.name}</span>
                </button>
                {type === "Spell" ? <SpellCells el={e} /> : <span className="opt-blurb">{blurb(e.description, 110)}</span>}
                {why && !owner && <small className="why"><LockIcon />{why}</small>}
                <VariantChips short g={g} activeId={e.id} chosen={chosenSet} onActive={(id) => setActive((a) => ({ ...a, [g.key]: id }))} onSwitch={onSwap} onPickVersion={owner || why ? undefined : onPick} />
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
