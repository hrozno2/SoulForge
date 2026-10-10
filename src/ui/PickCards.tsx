import type { AElement } from "../aurora/types";
import { Browse } from "./Browse";

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
  kicker, title, items, value, onPick, onDetail,
}: { kicker: string; title: string; items: AElement[]; value?: string; onPick: (id: string) => void; onDetail: (e: AElement) => void; perPage?: number }) {
  const type = items[0]?.type ?? "Race";
  return (
    <div>
      {items.length === 0 && <p className="muted">Nothing is loaded for this yet. Add content on the Content tab.</p>}
      <Browse items={items} type={type} chosen={value ? [value] : []} onPick={(e) => onPick(e.id)} onSwap={(_, to) => onPick(to.id)} onHover={onDetail} defaultView="cards" hero={{ kicker, title }} />
    </div>
  );
}
