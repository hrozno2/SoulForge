import { useMemo } from "react";
import { requestRoll } from "./Dice";
import { parseRollInfo, scaleDamage, type DcContext } from "./rollInfo";

const sign = (n: number) => (n >= 0 ? `+${n}` : String(n));
const SHORT: Record<string, string> = { Strength: "STR", Dexterity: "DEX", Constitution: "CON", Intelligence: "INT", Wisdom: "WIS", Charisma: "CHA" };

type SpellCtx = { level: number; castLevel: number; characterLevel: number };

/** The dice a spell asks for when it is cast, ready to roll: the attack, then damage and healing, scaled to the slot used. */
export function spellRolls(name: string, html: string, ctx: DcContext, attackBonus: number | undefined, spell: SpellCtx): { label: string; expr: string; opts?: { kind: "attack" } }[] {
  const info = parseRollInfo(html, ctx);
  const out: { label: string; expr: string; opts?: { kind: "attack" } }[] = [];
  if (info.attack === "spell" && attackBonus !== undefined) out.push({ label: `${name} attack`, expr: `1d20${attackBonus >= 0 ? "+" : ""}${attackBonus}`, opts: { kind: "attack" } });
  for (const d of info.damage) out.push({ label: `${name} ${d.type || "damage"}`, expr: scaleDamage(d.expr, { cantrip: spell.level === 0, cantripScaling: info.cantripScaling, characterLevel: spell.characterLevel, castLevel: spell.castLevel, spellLevel: spell.level, upcast: info.upcast }) });
  for (const h of info.healing) out.push({ label: `${name} healing`, expr: h });
  return out;
}

/**
 * The rolls a spell, feature or item calls for: attack, damage or healing dice, saving throws with their DC.
 * Everything is read from the description, so it shows only what the text names.
 */
export function RollChips({ name, html, ctx, attackBonus, spell }: {
  name: string;
  html: string;
  ctx: DcContext;
  /** To-hit bonus for text that names a spell attack. */
  attackBonus?: number;
  spell?: { level: number; castLevel: number; characterLevel: number };
}) {
  const info = useMemo(() => parseRollInfo(html, ctx), [html, ctx]);
  const attack = info.attack === "spell" && attackBonus !== undefined ? attackBonus : undefined;
  const dmg = info.damage.map((d) => ({
    ...d,
    expr: spell ? scaleDamage(d.expr, { cantrip: spell.level === 0, cantripScaling: info.cantripScaling, characterLevel: spell.characterLevel, castLevel: spell.castLevel, spellLevel: spell.level, upcast: info.upcast }) : d.expr,
  }));
  if (attack === undefined && !dmg.length && !info.healing.length && !info.saves.length) return null;
  return (
    <div className="roll-chips-row">
      {attack !== undefined && <button className="roll-chip atk" onClick={() => requestRoll(`${name} attack`, `1d20${attack >= 0 ? "+" : ""}${attack}`, undefined, { kind: "attack" })}>Attack {sign(attack)}</button>}
      {dmg.map((d, i) => <button key={i} className="roll-chip dmg" onClick={() => requestRoll(`${name} ${d.type || "damage"}`, d.expr)}>{d.expr}{d.type ? ` ${d.type}` : " damage"}</button>)}
      {info.healing.map((h, i) => <button key={`h${i}`} className="roll-chip heal" onClick={() => requestRoll(`${name} healing`, h)}>Heal {h}</button>)}
      {info.saves.map((s) => <span key={s.ability} className="roll-chip save" title={`${s.ability} saving throw`}>{s.dc !== undefined ? `DC ${s.dc} ` : ""}{SHORT[s.ability]} save</span>)}
    </div>
  );
}
