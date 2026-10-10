import { useMemo, useState } from "react";
import type { AElement } from "../aurora/types";
import { stripHtml } from "../aurora/sheet";

const CLASS_HUE: Record<string, number> = {
  barbarian: 22, bard: 305, cleric: 44, druid: 112, fighter: 8, monk: 190, paladin: 52, ranger: 135, rogue: 232, sorcerer: 352, warlock: 278, wizard: 214, artificer: 28,
};

export function hueOf(name: string): number {
  const k = name.toLowerCase();
  if (k in CLASS_HUE) return CLASS_HUE[k];
  let h = 0;
  for (const c of k) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

const firstParagraph = (html: string, max = 190): string => {
  const m = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const t = stripHtml(m ? m[1] : html).replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max).replace(/\s+\S*$/, "")}...` : t;
};

function tagsOf(el: AElement): string[] {
  const tags: string[] = [];
  const short = el.setters.short?.value;
  if (short) tags.push(short.replace(/^(A|An|The)\s+/i, "").split(/\s+/).slice(0, 3).join(" "));
  const prim = el.description.match(/<b>\s*Primary Ability\s*<\/b>\s*<\/td>\s*<td[^>]*>([^<]+)/i);
  if (prim) tags.push(prim[1].trim());
  if (el.type === "Background") {
    const sk = el.description.match(/Skill Proficiencies?:<\/strong>\s*([^<]+)/i);
    if (sk) tags.push(sk[1].trim().split(/,| and /)[0]);
  }
  if (el.type === "Race") {
    const sp = el.rules.find((r) => r.kind === "stat" && r.name === "innate speed");
    if (sp && sp.kind === "stat") tags.push(`${sp.value} ft`);
  }
  return tags.slice(0, 2);
}

const ruleset = (src: string): "2024" | "legacy" => (/2024|2025|\(24\)/.test(src) ? "2024" : "legacy");

export function PickCards({
  kicker, title, items, value, onPick, onDetail, perPage = 12,
}: { kicker: string; title: string; items: AElement[]; value?: string; onPick: (id: string) => void; onDetail: (e: AElement) => void; perPage?: number }) {
  const [rules, setRules] = useState<"all" | "2024" | "legacy">("all");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(perPage);
  const sources = useMemo(() => [...new Set(items.map((i) => i.source).filter(Boolean))].sort(), [items]);
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return items
      .filter((e) => !e.compendiumHidden && (rules === "all" || ruleset(e.source) === rules) && (!source || e.source === source) && (!n || e.name.toLowerCase().includes(n)))
      .sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source));
  }, [items, rules, source, q]);
  const has2024 = items.some((i) => ruleset(i.source) === "2024");

  return (
    <div>
      <div className="choice-head">
        <div className="kicker">{kicker}</div>
        <h2>{title}</h2>
      </div>
      <div className="filter-row">
        {has2024 && (
          <span className="row">
            <label>Rule set</label>
            {(["all", "2024", "legacy"] as const).map((r) => <button key={r} className={rules === r ? "pill active" : "pill"} onClick={() => { setRules(r); setShown(perPage); }}>{r === "all" ? "All" : r === "2024" ? "2024" : "Legacy"}</button>)}
          </span>
        )}
        <span className="row">
          <label>Source</label>
          <select value={source} onChange={(e) => { setSource(e.target.value); setShown(perPage); }}>
            <option value="">Every book</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </span>
        <input placeholder="Search" value={q} onChange={(e) => { setQ(e.target.value); setShown(perPage); }} />
        <span className="muted">{list.length} shown</span>
      </div>
      {items.length === 0 && <p className="muted">Nothing is loaded for this yet. Add content on the Content tab.</p>}
      <div className="card-grid">
        {list.slice(0, shown).map((e) => {
          const hue = hueOf(e.name);
          return (
            <div key={e.id} className={`pick-card ${e.id === value ? "picked" : ""}`} style={{ ["--hue" as string]: hue }} data-glyph={e.name.charAt(0)} onMouseEnter={() => onDetail(e)}>
              <div className="ribbon">{e.name.charAt(0)}</div>
              <h3>{e.name}</h3>
              <div className="pick-tags">{tagsOf(e).map((t) => <span key={t}>{t}</span>)}<span>{e.source.replace(/Player’s Handbook/, "PHB")}</span></div>
              <p className="pick-blurb">{firstParagraph(e.description) || "No description in the content file."}</p>
              <div className="pick-actions">
                <button className="ghost" onClick={() => onDetail(e)}>Learn more</button>
                <button className="primary" onClick={() => onPick(e.id)}>{e.id === value ? "Selected" : "Select"}</button>
              </div>
            </div>
          );
        })}
      </div>
      {list.length > shown && <button className="more" onClick={() => setShown(shown + perPage * 3)}>Show more ({list.length - shown})</button>}
    </div>
  );
}
