/** Hit point arithmetic shared by the vitals bar, wild shape and companion trackers. */

export interface WildShape {
  name: string;
  hp: number;
  maxHp: number;
  kind?: "wildshape" | "polymorph" | "truepoly" | "other";
  creatureId?: string;
  /** 2024 Wild Shape: the character keeps their own hit points (and gains temporary ones); the form has no pool. */
  ownHp?: boolean;
}

export const FORM_KINDS: { kind: NonNullable<WildShape["kind"]>; label: string; hint: string; concentration?: string }[] = [
  { kind: "wildshape", label: "Wild Shape", hint: "A beast form. When its hit points run out you return to your own and keep the damage left over." },
  { kind: "polymorph", label: "Polymorph", hint: "The spell: the form has its own hit points, and you keep your mind. It lasts while you concentrate.", concentration: "Polymorph" },
  { kind: "truepoly", label: "True Polymorph", hint: "The spell, with a longer duration. Concentration for up to an hour.", concentration: "True Polymorph" },
  { kind: "other", label: "Other form", hint: "Anything else that swaps your hit points for a creature's." },
];

export interface HpState {
  hp: number;
  tempHp: number;
  wildShape?: WildShape;
}

/** Damage lands on a wild shape form first. What is left over carries to the character, after temporary hit points. */
export function applyDamage(s: HpState, amount: number): HpState {
  let n = Math.max(0, Math.floor(amount));
  let ws = s.wildShape;
  if (ws && !ws.ownHp && n > 0) {
    const taken = Math.min(ws.hp, n);
    n -= taken;
    ws = taken >= ws.hp ? undefined : { ...ws, hp: ws.hp - taken };
  }
  const absorbed = Math.min(s.tempHp, n);
  return { hp: Math.max(0, s.hp - (n - absorbed)), tempHp: s.tempHp - absorbed, wildShape: ws };
}

/** Healing goes to the form while one is active, otherwise to the character up to their maximum. */
export function applyHealing(s: HpState, amount: number, maxHp: number): HpState {
  const n = Math.max(0, Math.floor(amount));
  if (s.wildShape && !s.wildShape.ownHp) return { ...s, wildShape: { ...s.wildShape, hp: Math.min(s.wildShape.maxHp, s.wildShape.hp + n) } };
  return { ...s, hp: Math.min(maxHp, s.hp + n) };
}

/** The first whole number in a stat block's hit points, such as "11 (2d8 + 2)". */
export function statBlockHp(text: string | undefined): number {
  const m = String(text ?? "").match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

/** Current hit points of something tracked by key, defaulting to full. */
export function trackedHp(tracked: Record<string, number> | undefined, key: string, max: number): number {
  const v = tracked?.[key];
  return v === undefined ? max : Math.max(0, Math.min(max, v));
}
