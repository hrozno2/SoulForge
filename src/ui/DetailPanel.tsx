import type { AElement } from "../aurora/types";
import { Html } from "./Html";
import { openExternal } from "../store";

export function DetailPanel({ el }: { el: AElement | null }) {
  if (!el) return <aside className="detail"><p className="muted">Hover or select an option to read about it here.</p></aside>;
  const s = el.setters;
  const rows: [string, string | undefined][] = [
    ["Level", el.type === "Spell" ? (s.level?.value === "0" ? "Cantrip" : s.level?.value) : undefined],
    ["School", s.school?.value],
    ["Casting time", s.time?.value],
    ["Range", s.range?.value],
    ["Duration", s.duration?.value],
    ["Components", el.type === "Spell" ? [s.hasVerbalComponent?.value === "true" ? "V" : "", s.hasSomaticComponent?.value === "true" ? "S" : "", s.hasMaterialComponent?.value === "true" ? `M (${s.materialComponent?.value ?? ""})` : ""].filter(Boolean).join(", ") : undefined],
    ["Damage", s.damage ? `${s.damage.value} ${s.damage.attrs.type ?? ""}` : undefined],
    ["Armor class", s.armorClass?.value],
    ["Weight", s.weight?.value],
    ["Cost", s.cost ? `${s.cost.value} ${s.cost.attrs.currency ?? ""}` : undefined],
  ];
  return (
    <aside className="detail">
      <h2>{el.name}</h2>
      <p className="muted">{el.type}{el.source ? ` · ${el.source}` : ""}</p>
      {rows.filter(([, v]) => v).length > 0 && (
        <dl className="facts">
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      )}
      <Html cap html={el.description || "<p>No description in the content file.</p>"} />
      {el.source && (
        <p className="muted">
          Source: <a href="#" onClick={(e) => { e.preventDefault(); openExternal(`https://www.google.com/search?q=${encodeURIComponent(`${el.source} ${el.name}`)}`); }}>{el.source}</a>
        </p>
      )}
    </aside>
  );
}
