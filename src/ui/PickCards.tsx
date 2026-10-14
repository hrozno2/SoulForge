import type { AElement } from "../aurora/types";
import { Browse, blurb, featOf } from "./Browse";
import { CLASS_TAGS, ClassIcon, hasClassIcon } from "./classIcons";

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

export function PickCards({
  kicker, title, items, value, onPick, onDetail, disabledReason,
}: { kicker: string; title: string; items: AElement[]; value?: string; onPick: (id: string) => void; onDetail: (e: AElement) => void; perPage?: number; disabledReason?: (e: AElement) => string | undefined }) {
  const type = items[0]?.type ?? "Race";
  return (
    <div>
      {items.length === 0 && <p className="muted">Nothing is loaded for this yet. Add content on the Content tab.</p>}
      <Browse items={items} type={type} chosen={value ? [value] : []} onPick={(e) => onPick(e.id)} onSwap={(_, to) => onPick(to.id)} onHover={onDetail} defaultView="cards" hero={{ kicker, title }} disabledReason={disabledReason} />
    </div>
  );
}

/** The chosen species, class or background as a wide card, with its own buttons underneath the text. */
export function ChosenBanner({ el, label, onHover, children }: { el: AElement; label: React.ReactNode; onHover?: (e: AElement) => void; children?: React.ReactNode }) {
  const isClass = el.type === "Class";
  return (
    <div className={`pick-card chosen-banner ${isClass ? "is-class" : ""}`} style={{ ["--hue" as string]: hueOf(el.name) }} data-glyph={hasClassIcon(el.name) ? "" : el.name.charAt(0)} onMouseEnter={() => onHover?.(el)}>
      {hasClassIcon(el.name) && <ClassIcon name={el.name} size={240} className="pick-watermark" />}
      {isClass && <div className="ribbon">{hasClassIcon(el.name) ? <ClassIcon name={el.name} size={34} /> : el.name.charAt(0)}</div>}
      <div className="chosen-kicker">{label}</div>
      <h3>{el.name}</h3>
      {isClass && CLASS_TAGS[el.name] && <div className="pick-tags">{CLASS_TAGS[el.name].map((t) => <span key={t}>{t}</span>)}</div>}
      <p className="pick-blurb">{blurb(el.description)}</p>
      {featOf(el) && <p className="pick-feat"><b>Feat:</b> {featOf(el)}</p>}
      <div className="pick-foot">
        <span className="vchip static">{el.source}</span>
        <div className="pick-actions">{children}</div>
      </div>
    </div>
  );
}
