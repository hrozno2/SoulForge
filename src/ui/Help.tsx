import { useEffect, useState, type ReactNode } from "react";

const TIPS: Record<string, { title: string; items: string[] }> = {
  start: {
    title: "Home",
    items: [
      "Add content first: the Content tab takes the AuroraLegacy link and keeps it updated.",
      "Random character builds a full level 1 character you can edit.",
      "Characters save by themselves. Export gives you a .json file you can back up or share.",
    ],
  },
  build: {
    title: "Build",
    items: [
      "The number on a tab is how many choices are left. Hover it to see which ones.",
      "Every list has Filters, a sort (including newest first) and Badges or List view.",
      "Several books with the same option are grouped. Pick the book from the chips on the card.",
      "Under Ability Scores, the Custom column takes your own modifiers.",
    ],
  },
  magic: { title: "Magic", items: ["Spells filter by level, school, class, components, concentration and ritual.", "Prepared and known spells show on the Play tab by level."] },
  equipment: { title: "Equipment", items: ["Starting equipment buttons add the class, background and pack gear in one click.", "Equip and attune from the list; armor class updates by itself."] },
  manage: { title: "Manage", items: ["Level, hit points, details, custom bonuses and companions live here.", "Custom bonuses add to any stat without editing content."] },
  play: {
    title: "Play",
    items: [
      "Click a modifier to roll it. The Disadvantage, Normal and Advantage switch applies to d20 rolls.",
      "Pips on a feature are uses left. Clicking one spends or restores a use. Rests reset them.",
      "Heal, Damage and Temp take the number in the box beside them.",
    ],
  },
  sheet: {
    title: "Sheet",
    items: [
      "Export PDF fills the official 2024 sheet if you loaded it, and can add spell cards, item cards and play tips.",
      "Load your own sheet PDF once. It stays on this computer.",
    ],
  },
  content: {
    title: "Content",
    items: [
      "Content links update by themselves. Check for updates is the manual button.",
      "To bring in 5e.tools or Plutonium material, paste its links or search under 5etools data.",
    ],
  },
};

/** A small "?" in the top bar. Opens a short list for the current tab. It never opens by itself. */
export function HelpButton({ tab }: { tab: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open]);
  const t = TIPS[tab] ?? TIPS.start;
  return (
    <span className="help noprint">
      <button className="help-btn" aria-label="Tips for this tab" aria-expanded={open} title="Tips for this tab" onClick={() => setOpen(!open)}>?</button>
      {open && (
        <div className="help-pop" role="note">
          <b>{t.title}</b>
          <ul>{t.items.map((i) => <li key={i}>{i}</li>)}</ul>
          <small className="muted">Full guide: docs/guide.md in the repository.</small>
        </div>
      )}
    </span>
  );
}

/** A quiet one-line hint that can be dismissed for good. */
export function Hint({ id, children }: { id: string; children: ReactNode }) {
  const k = `charforge.hint.${id}`;
  const [gone, setGone] = useState(() => {
    try {
      return localStorage.getItem(k) === "1";
    } catch {
      return false;
    }
  });
  if (gone) return null;
  return (
    <p className="hint noprint">
      <span>{children}</span>
      <button aria-label="Dismiss tip" title="Dismiss" onClick={() => { setGone(true); try { localStorage.setItem(k, "1"); } catch { /* ignore */ } }}>×</button>
    </p>
  );
}
