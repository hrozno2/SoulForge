import { updateSettings, useSettings } from "./Settings";

/**
 * Whole spellbook or prepared only, for printed sheets and spell cards alike (C6.5, Chris 2026-10-28: one selector by
 * the spellbook, not one per export). The one setting is `allSpells`; spell cards follow it through `spellScopeOf`.
 */
export function SpellScope() {
  const all = useSettings().allSpells;
  return (
    <span className="spell-scope" role="group" aria-label="Spells on sheets and cards" title="What printed sheets and spell cards list: every spell you can prepare (blank boxes to mark each day), or only today's prepared ones">
      <small className="muted">Print</small>
      <button className={all ? "pill active" : "pill"} aria-pressed={all} onClick={() => updateSettings({ allSpells: true })}>Whole spellbook</button>
      <button className={!all ? "pill active" : "pill"} aria-pressed={!all} onClick={() => updateSettings({ allSpells: false })}>Prepared only</button>
    </span>
  );
}

/** The spell cards' scope from the one setting. */
export const spellScopeOf = (allSpells: boolean): "all" | "prepared" => (allSpells ? "all" : "prepared");
