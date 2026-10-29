import { updateSettings, useSettings } from "./Settings";

/**
 * "Print the entire spellbook", in the export settings (C7.9, Chris 2026-10-29): ticked, sheets and spell cards list
 * every spell the character can prepare, the prepare boxes blank to mark each day and the sheet saying how many to
 * prepare; unticked, only the prepared spells. One setting, `allSpells`; spell cards follow it through `spellScopeOf`.
 */
export function SpellScope() {
  const all = useSettings().allSpells;
  return (
    <label className="check spell-scope" title="Ticked: every spell you can prepare, with blank boxes to mark each day and how many you prepare. Unticked: only today's prepared spells. For sheets and spell cards alike.">
      <input type="checkbox" checked={all} onChange={(e) => updateSettings({ allSpells: e.target.checked })} /> Print the entire spellbook
    </label>
  );
}

/** The spell cards' scope from the one setting. */
export const spellScopeOf = (allSpells: boolean): "all" | "prepared" => (allSpells ? "all" : "prepared");
