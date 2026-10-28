import { companionBonuses } from "../aurora/companion";
import { TextArea, TextInput } from "./TextField";
import { useMemo, useState } from "react";
import type { Resolved } from "../aurora/engine";
import { buildSheet, headerInfo, type CastingLine, type FeatureLine, type SheetData } from "../aurora/sheet";
import { ABILITY_LABEL, ABILITY_SHORT, XP_TABLE, itemLabel, uid, xpToLevel, type AbilityId, type Character, type Resource } from "../aurora/character";
import type { AElement } from "../aurora/types";
import { Html } from "./Html";
import { requestRoll, RollModeSwitch, type RollOptions } from "./Dice";
import { ConditionsPanel } from "./ConditionsPanel";
import { applyDamage, applyHealing } from "./hpModel";
import { FormsPanel } from "./FormsPanel";
import { HpRollsDialog } from "./HpRolls";
import { insertAt, moveTo } from "./favOrder";
import { Journal } from "./Journal";
import { SchoolIcon } from "./schoolIcons";
import { ConditionIcon } from "./conditionIcons";
import { toggleEquip } from "../aurora/hands";
import { shortRange } from "../sheets/data";
import { t } from "../i18n";
import { CONDITION_TEXT, speedAfterExhaustion } from "./conditions";
import { Hint } from "./Help";
import { RollChips, spellRolls } from "./RollChips";
import type { DcContext } from "./rollInfo";
import { isAvailable, usedAfterClick } from "./pips";
import { CompanionCard } from "./ManageTab";
import type { SetCharacter } from "./Slots";

const sign = (n: number) => (n >= 0 ? `+${n}` : String(n));
const skillLabel = (id: string) => id.replace(/\b\w/g, (c) => c.toUpperCase());
/** Numbers a description can refer to when it names a DC. */
const dcContext = (sheet: SheetData, spellDc?: number): DcContext => ({
  spellDc: spellDc ?? sheet.casting[0]?.dc,
  proficiency: sheet.proficiency,
  mods: Object.fromEntries(sheet.abilities.map((a) => [ABILITY_LABEL[a.id].toLowerCase(), a.mod])),
});
const roll = (label: string, bonus: number, opts?: RollOptions) => requestRoll(label, `1d20${bonus >= 0 ? "+" : ""}${bonus}`, undefined, opts);


// ---------------------------------------------------------------- favorites

type FavKind = NonNullable<Character["favorites"]>[number]["kind"];
const FAV_MIME = "application/x-soulforge-favorite";
const FAV_TEXT = "soulforge-favorite:";
/** What was dragged, from either the custom type or the plain text copy. */
/** `uid`: a favorite dragged within the row (a move, not an add). */
const readFav = (dt: DataTransfer): { kind: FavKind; ref: string; uid?: string } | undefined => {
  try {
    const own = dt.getData(FAV_MIME);
    if (own) return JSON.parse(own);
    const text = dt.getData("text/plain");
    if (text.startsWith(FAV_TEXT)) return JSON.parse(text.slice(FAV_TEXT.length));
  } catch {
    /* something else was dropped */
  }
  return undefined;
};

/**
 * Props that make a row draggable into the favorites row. With `uid` (a favorite already there, to move it) the tile
 * takes the drag in the capture phase, before the weapon, spell or feature row inside it starts an "add" drag.
 */
const favDrag = (kind: FavKind, ref: string, uid?: string) => ({
  draggable: true,
  onDragStart: (e: React.DragEvent) => {
    e.stopPropagation();
    const data = JSON.stringify(uid ? { kind, ref, uid } : { kind, ref });
    e.dataTransfer.setData(FAV_MIME, data);
    // The desktop app's web view only passes plain text along, so the favourite rides in it too.
    e.dataTransfer.setData("text/plain", `${FAV_TEXT}${data}`);
    e.dataTransfer.effectAllowed = uid ? "move" : "copy";
  },
});

const isFav = (ch: Character, kind: FavKind, ref: string) => (ch.favorites ?? []).some((f) => f.kind === kind && f.ref === ref);

const toggleFav = (set: SetCharacter, kind: FavKind, ref: string) =>
  set((c) => {
    const list = c.favorites ?? [];
    return { ...c, favorites: list.some((f) => f.kind === kind && f.ref === ref) ? list.filter((f) => !(f.kind === kind && f.ref === ref)) : [...list, { uid: uid(), kind, ref }] };
  });

/** A small star that pins or unpins something. Dragging works too; the star is for keyboards and touch. */
function FavStar({ ch, set, kind, refId }: { ch: Character; set: SetCharacter; kind: FavKind; refId: string }) {
  const on = isFav(ch, kind, refId);
  return (
    <button type="button" className={on ? "fav-star on" : "fav-star"} aria-pressed={on} title={on ? "Remove from favorites" : "Add to favorites"} aria-label={on ? "Remove from favorites" : "Add to favorites"} onClick={(e) => { e.stopPropagation(); toggleFav(set, kind, refId); }}>{on ? "★" : "☆"}</button>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`play-panel ${className}`}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- header and vitals

function AbilityBox({ id, a }: { id: AbilityId; a: SheetData["abilities"][number] }) {
  return (
    <div className="ab-col">
      <button className="ab-box" title={`Roll ${ABILITY_LABEL[id]} check`} onClick={() => roll(`${ABILITY_LABEL[id]} check`, a.mod, { kind: "check", ability: id })}>
        <small>{ABILITY_SHORT[id]}</small>
        <b>{sign(a.mod)}</b>
        <span className="ab-score">{a.score}</span>
      </button>
      <button className={a.saveProficient ? "ab-save on" : "ab-save"} title={`Roll ${ABILITY_LABEL[id]} saving throw${a.saveProficient ? " (proficient)" : ""}`} onClick={() => roll(`${ABILITY_LABEL[id]} save`, a.save, { kind: "save", ability: id })}>
        {sign(a.save)}<SaveMark on={a.saveProficient} />
      </button>
    </div>
  );
}

function SaveMark({ on }: { on: boolean }) {
  return <svg className="save-mark" viewBox="0 0 16 18" width="12" height="13" aria-hidden="true"><path d="M8 1 15 3.5v5.5c0 4.2-3 6.8-7 8-4-1.2-7-3.8-7-8V3.5z" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" /></svg>;
}

/** Small line icons for the header buttons. */
function HeadIcon({ name }: { name: "star" | "starOn" | "up" | "meal" | "tent" | "heart" }) {
  const p: Record<string, React.ReactNode> = {
    star: <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
    starOn: <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" fill="currentColor" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
    up: <><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M12 17V8m-4 4 4-4 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></>,
    meal: <path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 1-3 4-3 7h3v11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
    tent: <path d="M3 20h18M12 4 4 20M12 4l8 16M12 4v16m-3 0 3-6 3 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
    heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  };
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">{p[name]}</svg>;
}

function Vitals({ ch, sheet, set }: { ch: Character; sheet: SheetData; set: SetCharacter }) {
  const hp = ch.play.hp ?? sheet.hp;
  const [amount, setAmount] = useState("");
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  const patch = (p: Partial<Character["play"]>) => set((c) => ({ ...c, play: { ...c.play, ...p } }));
  const [conc, setConc] = useState<{ dc: number } | null>(null);
  const conSave = sheet.abilities.find((a) => a.id === "constitution")?.save ?? 0;
  const damage = () => {
    if (!n) return;
    const next = applyDamage({ hp, tempHp: ch.play.tempHp, wildShape: ch.play.wildShape }, n);
    const real = hp - next.hp + (ch.play.tempHp - next.tempHp);
    // Dropping to 0 ends concentration. Any other hit asks for a Constitution save.
    const endedPoly = ch.play.wildShape && !next.wildShape && (ch.play.wildShape.kind === "polymorph" || ch.play.wildShape.kind === "truepoly");
    patch({ tempHp: next.tempHp, hp: next.hp, wildShape: next.wildShape, ...(next.hp === 0 || endedPoly ? { concentration: undefined } : {}) });
    if (ch.play.concentration && next.hp > 0 && (real > 0 || next.wildShape?.hp !== ch.play.wildShape?.hp)) setConc({ dc: Math.max(10, Math.floor(n / 2)) });
    else setConc(null);
    setAmount("");
  };
  const heal = () => {
    if (!n) return;
    const next = applyHealing({ hp, tempHp: ch.play.tempHp, wildShape: ch.play.wildShape }, n, sheet.hp);
    patch({ hp: next.hp, wildShape: next.wildShape, ...(ch.play.wildShape ? {} : { deathSaves: { success: 0, fail: 0 } }) });
    setAmount("");
  };
  const temp = () => {
    if (!n) return;
    patch({ tempHp: Math.max(ch.play.tempHp, n) });
    setAmount("");
  };
  const pct = sheet.hp ? Math.max(0, Math.min(100, (hp / sheet.hp) * 100)) : 0;
  // Temporary hit points sit after the real ones in blue. If together they pass the maximum, the bar rescales.
  const room = Math.max(sheet.hp, hp + ch.play.tempHp) || 1;
  const hpPart = (hp / room) * 100;
  const tempPart = Math.min(100 - hpPart, (ch.play.tempHp / room) * 100);
  return (
    <div className="vitals">
      <div className="hp-main">
        <small>{t("Hit Points")}</small>
        <div className={pct < 25 ? "hp-bar big low" : "hp-bar big"}><div style={{ width: `${hpPart}%` }} />{ch.play.tempHp > 0 && <div className="temp-fill" style={{ left: `${hpPart}%`, width: `${tempPart}%` }} />}<span>{hp} / {sheet.hp}</span></div>
        {ch.play.tempHp > 0 && (
          <div className="temp-line" title="Temporary hit points are lost first and do not stack">
            <span className="temp-pill">+{ch.play.tempHp} temp</span>
            <button className="tiny" aria-label="Clear temporary hit points" onClick={() => patch({ tempHp: 0 })}>×</button>
          </div>
        )}
        {ch.play.wildShape && !ch.play.wildShape.ownHp && <div className="hp-bar wild" title={`Wild Shape: ${ch.play.wildShape.name}`}><div style={{ width: `${Math.max(0, Math.min(100, (ch.play.wildShape.hp / (ch.play.wildShape.maxHp || 1)) * 100))}%` }} /><span>{ch.play.wildShape.name}: {ch.play.wildShape.hp} / {ch.play.wildShape.maxHp}</span></div>}
      </div>
      <output className="sr-only" aria-live="polite">{`${t("Hit Points")}: ${hp} / ${sheet.hp}${ch.play.tempHp ? `, +${ch.play.tempHp}` : ""}${ch.play.wildShape ? `, ${ch.play.wildShape.name} ${ch.play.wildShape.hp} / ${ch.play.wildShape.maxHp}` : ""}`}</output>
      <div className="hp-manage">
        <input type="number" min={0} placeholder="HP" title={t("Amount")} aria-label={t("Amount")} value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && damage()} />
        <button onClick={heal}>{t("Heal")}</button>
        <button onClick={damage}>{t("Damage")}</button>
        <button onClick={temp}>{t("Temp")}</button>
      </div>
      {conc && ch.play.concentration && (
        <div className="conc-check" role="alert">
          <b>Concentration on {ch.play.concentration}:</b> Constitution save, DC {conc.dc}.
          <button onClick={() => requestRoll("Concentration", `1d20${conSave >= 0 ? "+" : ""}${conSave}`, (res) => { if (res.dc?.success) setConc(null); }, { kind: "save", ability: "constitution", dc: conc.dc })}>Roll the save</button>
          <button onClick={() => { patch({ concentration: undefined }); setConc(null); }}>Lose it</button>
          <button onClick={() => setConc(null)} aria-label="Dismiss">Keep it</button>
        </div>
      )}
      {hp === 0 && (
        <div className="death">
          <small>Death saves</small>
          <span>Success {[0, 1, 2].map((i) => <input key={i} aria-label={`Death save success ${i + 1}`} type="checkbox" checked={i < ch.play.deathSaves.success} onChange={() => patch({ deathSaves: { ...ch.play.deathSaves, success: ch.play.deathSaves.success === i + 1 ? i : i + 1 } })} />)}</span>
          <span>Failure {[0, 1, 2].map((i) => <input key={i} aria-label={`Death save failure ${i + 1}`} type="checkbox" checked={i < ch.play.deathSaves.fail} onChange={() => patch({ deathSaves: { ...ch.play.deathSaves, fail: ch.play.deathSaves.fail === i + 1 ? i : i + 1 } })} />)}</span>
          <button onClick={() => requestRoll("Death save", "1d20")}>Roll</button>
        </div>
      )}
    </div>
  );
}

function Shield({ value }: { value: number }) {
  return (
    <div className="stat-shield" role="img" aria-label={`Armor class ${value}`}>
      <svg viewBox="0 0 100 116">
        <path d="M50 3 94 18v36c0 30-20 49-44 59C26 103 6 84 6 54V18z" fill="var(--panel2)" stroke="var(--accent)" strokeWidth="3" />
        <path d="M50 11 86 23v31c0 25-16 41-36 50C30 95 14 79 14 54V23z" fill="none" stroke="var(--gold)" strokeWidth="1" opacity=".6" />
        <text x="50" y="62" textAnchor="middle" className="ac-num">{value}</text>
        <text x="50" y="82" textAnchor="middle" className="ac-label">ARMOR</text>
        <text x="50" y="93" textAnchor="middle" className="ac-label">CLASS</text>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------- rests

function useRests(r: Resolved, ch: Character, sheet: SheetData, set: SetCharacter) {
  const features = sheet.features;
  const dieSize = Math.max(0, ...sheet.hitDice.map((h) => h.die));
  const conMod = sheet.abilities.find((a) => a.id === "constitution")!.mod;
  const total = sheet.level;
  const left = Math.max(0, total - ch.play.hitDiceUsed);
  const hp = ch.play.hp ?? sheet.hp;
  void r;
  const spendHitDie = () => {
    if (!left || !dieSize) return;
    // The tray makes the roll, and the same result is what heals, so the two always agree.
    requestRoll("Hit die", `1d${dieSize}${conMod >= 0 ? "+" : ""}${conMod}`, (res) => {
      const gain = Math.max(1, res.total);
      set((c) => ({ ...c, play: { ...c.play, hp: Math.min(sheet.hp, (c.play.hp ?? sheet.hp) + gain), hitDiceUsed: c.play.hitDiceUsed + 1 } }));
    });
  };
  const shortRest = () =>
    set((c) => {
      const uses = { ...c.play.featureUses };
      for (const f of features) if (/short rest/i.test(f.usage ?? "")) delete uses[f.id];
      // Pact Magic slots come back on a short rest.
      const slots = { ...c.play.slotsUsed };
      for (const line of sheet.casting) if (line.pactLevel) for (const sl of line.slots) delete slots[String(sl.level)];
      return { ...c, resources: (c.resources ?? []).map((x) => (x.refresh === "short" ? { ...x, current: x.max } : x)), play: { ...c.play, featureUses: uses, slotsUsed: slots } };
    });
  const longRest = () =>
    set((c) => ({
      ...c,
      resources: (c.resources ?? []).map((x) => (x.refresh === "none" ? x : { ...x, current: x.max })),
      play: {
        ...c.play, hp: sheet.hp, tempHp: 0, wildShape: undefined, companionHp: undefined, slotsUsed: {}, featureUses: {}, hitDiceUsed: Math.max(0, c.play.hitDiceUsed - Math.max(1, Math.floor(total / 2))),
        deathSaves: { success: 0, fail: 0 }, exhaustion: Math.max(0, (c.play.exhaustion ?? 0) - 1), concentration: undefined,
      },
    }));
  return { spendHitDie, shortRest, longRest, left, dieSize, hp };
}

// ---------------------------------------------------------------- tabs

const AMMO_WORDS = /arrow|bolt|bullet|needle|dart|pellet|stone|shot|quiver/i;

/** A weapon with the ammunition property: choose which stack it draws from. Each attack uses one. */
function Ammo({ a, r, ch, set }: { a: SheetData["attacks"][number]; r: Resolved; ch: Character; set: SetCharacter }) {
  if (!a.auto || !a.id || !/ammunition/i.test(a.properties)) return null;
  const name = (i: Character["inventory"][number]) => itemLabel(i, i.id ? r.reg.get(i.id)?.name : undefined);
  const options = ch.inventory.filter((i) => AMMO_WORDS.test(name(i)));
  const pick = ch.attackEdits?.[a.id]?.ammoUid;
  const stack = ch.inventory.find((i) => i.uid === pick);
  return (
    <small className="ammo">
      <select aria-label={`Ammunition for ${a.name}`} value={pick ?? ""} onChange={(e) => set((c) => ({ ...c, attackEdits: { ...(c.attackEdits ?? {}), [a.id!]: { ...(c.attackEdits?.[a.id!] ?? {}), ammoUid: e.target.value || undefined } } }))}>
        <option value="">Ammunition...</option>
        {options.map((i) => <option key={i.uid} value={i.uid}>{name(i)} ({i.qty})</option>)}
      </select>
      {stack && <span className={stack.qty === 0 ? "out" : ""}> {stack.qty === 0 ? "out of ammunition" : `${stack.qty} left`}</span>}
    </small>
  );
}

/** A group of the Actions tab: a red bar with the count and column names, then rows. */
function ActGroup({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="act-group">
      <button className="act-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="chev">{open ? "▾" : "▸"}</span><b>{title}</b><em>{count}</em>
        <span>Uses</span><span>Roll</span><span>Formula</span><span>Range</span><span>Target</span>
      </button>
      {open && children}
    </section>
  );
}

/** A feature as a row of the actions table; its text opens below it. */
function ActFeature({ f, ch, set, sheet }: { f: FeatureLine; ch: Character; set: SetCharacter; sheet: SheetData }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="act-row feature" {...favDrag("feature", f.id)}>
      <span className="act-name">
        <FavStar ch={ch} set={set} kind="feature" refId={f.id} />
        <button className="act-title" onClick={() => setOpen(!open)} aria-expanded={open}><b>{f.name}</b><small>{f.source}</small></button>
      </span>
      <span className="act-uses"><Uses f={f} ch={ch} set={set} /></span>
      <span className="act-roll" />
      <span className="act-formula"><RollChips name={f.name} html={f.text} ctx={dcContext(sheet)} attackBonus={sheet.casting[0]?.attack} /></span>
      <span>–</span>
      <span>–</span>
      {open && <p className="feature-text act-text">{f.text || "No description."}</p>}
    </div>
  );
}

function Actions({ r, ch, sheet, set }: { r: Resolved; ch: Character; sheet: SheetData; set: SetCharacter }) {
  const kinds: [string, (f: FeatureLine) => boolean][] = [
    ["Action", (f) => /^action$/i.test(f.action ?? "") || /^1 ?action/i.test(f.action ?? "")],
    ["Bonus Action", (f) => /bonus/i.test(f.action ?? "")],
    ["Reaction", (f) => /reaction/i.test(f.action ?? "")],
    // Features you track uses of, without an action type: Channel Divinity, Lay On Hands pools and the like.
    ["Special", (f) => !!f.usage],
  ];
  const used = new Set<string>();
  const byKind = kinds.map(([title, test]) => {
    const list = sheet.features.filter((f) => test(f) && !used.has(f.id));
    list.forEach((f) => used.add(f.id));
    return [title, list] as const;
  });
  /** Taking a shot uses one piece of the ammunition chosen for that weapon. */
  const spendAmmo = (id?: string) => {
    const uid = id ? ch.attackEdits?.[id]?.ammoUid : undefined;
    if (uid) set((c) => ({ ...c, inventory: c.inventory.map((i) => (i.uid === uid ? { ...i, qty: Math.max(0, i.qty - 1) } : i)) }));
  };
  const cantrips = sheet.casting.flatMap((c) => c.cantripsKnown.map((p) => r.reg.get(p.id)).filter((e): e is AElement => !!e));
  const castTime = (e: AElement) => (e.setters.time?.value ?? "").toLowerCase();
  const rangeOf = (a: SheetData["attacks"][number]) => {
    const el = a.elId ? r.reg.get(a.elId) : undefined;
    const rg = el?.setters.range?.value;
    if (rg) return rg.replace(/\s*feet|\s*ft\.?/gi, "").trim() + " ft";
    return /reach/i.test(a.properties) ? "10 ft" : "5 ft";
  };
  const spellRow = (e: AElement) => (
    <div key={e.id} className="act-row spell" {...favDrag("spell", e.id)}>
      <span className="act-name"><FavStar ch={ch} set={set} kind="spell" refId={e.id} /><span className="act-title"><b>{e.name}</b><small>Cantrip · {e.setters.school?.value ?? ""}</small></span></span>
      <span className="act-uses">–</span>
      <span className="act-roll" />
      <span className="act-formula"><RollChips name={e.name} html={e.description} ctx={dcContext(sheet)} attackBonus={sheet.casting[0]?.attack} /></span>
      <span>{e.setters.range?.value ? shortRange(e.setters.range.value) : "–"}</span>
      <span>–</span>
    </div>
  );
  const actionCantrips = cantrips.filter((e) => /^(1 )?action/.test(castTime(e)));
  const bonusCantrips = cantrips.filter((e) => /bonus/.test(castTime(e)));
  return (
    <>
      <ActGroup title="Action" count={sheet.attacks.length + byKind[0][1].length + actionCantrips.length}>
        {sheet.attacks.length === 0 && <p className="muted act-empty">No weapon equipped. Equip one on the Equipment tab.</p>}
        {sheet.attacks.map((a, i) => (
          <div key={i} className="act-row weapon" {...favDrag("weapon", a.id ?? a.name)}>
            <span className="act-name">
              <FavStar ch={ch} set={set} kind="weapon" refId={a.id ?? a.name} />
              <span className="act-title"><b>{a.name}</b><small>{[a.properties, a.notes].filter(Boolean).join("; ") || "Weapon attack"}</small></span>
              <Ammo a={a} r={r} ch={ch} set={set} />
            </span>
            <span className="act-uses">–</span>
            <span className="act-roll"><button className="roll-btn" title="Roll to hit" onClick={() => { roll(`${a.name} attack`, a.bonus, { kind: "attack" }); spendAmmo(a.id); }}>{sign(a.bonus)}</button></span>
            <span className="act-formula"><button className="roll-btn" title="Roll damage" onClick={() => a.damage && requestRoll(`${a.name} damage`, a.damage.replace(/\s+/g, ""))}>{a.damage}</button> <small>{a.damageType}</small></span>
            <span>{rangeOf(a)}</span>
            <span>1 creature</span>
          </div>
        ))}
        {byKind[0][1].map((f) => <ActFeature key={f.id} f={f} ch={ch} set={set} sheet={sheet} />)}
        {actionCantrips.map(spellRow)}
      </ActGroup>
      {byKind.slice(1).map(([title, list]) => {
        const extra = title === "Bonus Action" ? bonusCantrips : [];
        if (!list.length && !extra.length) return null;
        return (
          <ActGroup key={title} title={title} count={list.length + extra.length}>
            {list.map((f) => <ActFeature key={f.id} f={f} ch={ch} set={set} sheet={sheet} />)}
            {extra.map(spellRow)}
          </ActGroup>
        );
      })}
    </>
  );
}

const RESET: Record<string, string> = { "long rest": "long rest", "short rest": "short rest", "short or long rest": "short or long rest", "dawn": "dawn", "day": "day" };

/** Pips show uses left (filled = available). The text says how many are left and when they come back. */
function Uses({ f, ch, set }: { f: FeatureLine; ch: Character; set: SetCharacter }) {
  const m = f.usage?.match(/^(\d+)\s*\/\s*(.*)$/);
  const n = m ? parseInt(m[1], 10) : 0;
  if (!n || n > 12) return f.usage ? <small className="muted">{f.usage}</small> : null;
  const used = Math.min(n, ch.play.featureUses[f.id] ?? 0);
  const left = n - used;
  const when = (m?.[2] ?? "").trim().toLowerCase();
  const toggle = (i: number) => set((c) => ({ ...c, play: { ...c.play, featureUses: { ...c.play.featureUses, [f.id]: usedAfterClick(n, used, i) } } }));
  return (
    <span className="uses" title="Click a pip to spend or restore a use">
      <span className="uses-pips">
        {Array.from({ length: n }, (_, i) => (
          <button key={i} aria-label={`Use ${i + 1}`} className={i < left ? "pip small" : "pip spent small"} onClick={() => toggle(i)} />
        ))}
      </span>
      <small className={left === 0 ? "uses-text out" : "uses-text"}>{left} of {n} left{when ? ` · back after ${RESET[when] ?? when}` : ""}</small>
    </span>
  );
}

/**
 * "Use" on a feature that spends another's uses (Turn Undead spends a Channel Divinity; 5e.tools' "consumes", as
 * Plutonium links an activity to its resource): one click takes the uses from the pool feature's pips.
 */
function Spends({ f, ch, set, sheet }: { f: FeatureLine; ch: Character; set: SetCharacter; sheet: SheetData }) {
  const c = f.consumes;
  const pool = c ? sheet.features.find((p) => p.id === c.id) : undefined;
  const n = Number(/^(\d+)\s*\//.exec(pool?.usage ?? "")?.[1]) || 0;
  if (!c || !pool || !n) return null;
  const used = Math.min(n, ch.play.featureUses[pool.id] ?? 0);
  const left = n - used;
  return (
    <button className="spend" disabled={left < c.amount} title={`Spends ${c.amount} ${c.name}: ${left} of ${n} left`}
      onClick={() => set((x) => ({ ...x, play: { ...x.play, featureUses: { ...x.play.featureUses, [pool.id]: Math.min(n, (x.play.featureUses[pool.id] ?? 0) + c.amount) } } }))}>
      Use <small>({left} {c.name} left)</small>
    </button>
  );
}

function FeatureRow({ f, ch, set, sheet }: { f: FeatureLine; ch: Character; set: SetCharacter; sheet: SheetData }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="feature-row" {...favDrag("feature", f.id)}>
      <button className="feature-head" onClick={() => setOpen(!open)}>
        <b>{f.name}</b>
        <small className="muted">{f.source}</small>
        <span className="chev">{open ? "▾" : "▸"}</span>
      </button>
      <FavStar ch={ch} set={set} kind="feature" refId={f.id} />
      <Uses f={f} ch={ch} set={set} />
      <Spends f={f} ch={ch} set={set} sheet={sheet} />
      <RollChips name={f.name} html={f.text} ctx={dcContext(sheet)} attackBonus={sheet.casting[0]?.attack} />
      {open && <p className="feature-text">{f.text || "No description."}</p>}
    </div>
  );
}

function Features({ ch, sheet, set }: { ch: Character; sheet: SheetData; set: SetCharacter }) {
  const groups: [string, string[]][] = [
    ["Class features", ["Class Feature"]], ["Subclass features", ["Archetype Feature"]], ["Species traits", ["Racial Trait"]], ["Feats", ["Feat", "Feat Feature"]], ["Background", ["Background Feature"]],
  ];
  return (
    <>
      {groups.map(([title, types]) => {
        const list = sheet.features.filter((f) => types.includes(f.type));
        if (!list.length) return null;
        return <Panel key={title} title={title}>{list.map((f) => <FeatureRow key={f.id} f={f} ch={ch} set={set} sheet={sheet} />)}</Panel>;
      })}
    </>
  );
}

function SpellRow({ id, r, casting, set, level, sheet }: { id: string; r: Resolved; casting: CastingLine; set: SetCharacter; level: number; sheet: SheetData }) {
  const el = r.reg.get(id);
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState(0);
  if (!el) return null;
  const s = el.setters;
  const comps = [s.hasVerbalComponent?.value === "true" && "V", s.hasSomaticComponent?.value === "true" && "S", s.hasMaterialComponent?.value === "true" && "M"].filter(Boolean).join("");
  const options = casting.slots.filter((x) => x.level >= level && x.used < x.total);
  const chosen = options.find((o) => o.level === slot) ?? options[0];
  const concentrates = s.isConcentration?.value === "true";
  const dc = dcContext(sheet, casting.dc);
  const spellCtx = { level, castLevel: chosen?.level ?? level, characterLevel: sheet.level };
  const rolls = spellRolls(el.name, el.description, dc, casting.attack, spellCtx);
  const canCast = level === 0 ? concentrates || rolls.length > 0 : true;
  const cast = () => {
    if (level > 0 && !chosen) return;
    set((c) => ({
      ...c,
      play: {
        ...c.play,
        slotsUsed: level > 0 ? { ...c.play.slotsUsed, [String(chosen!.level)]: (c.play.slotsUsed[String(chosen!.level)] ?? 0) + 1 } : c.play.slotsUsed,
        // A new concentration spell ends the old one.
        concentration: concentrates ? el.name : c.play.concentration,
      },
    }));
    // Casting rolls whatever the spell asks for: the attack, then the damage or healing at the slot level used.
    for (const x of rolls) requestRoll(x.label, x.expr, undefined, x.opts);
  };
  return (
    <div className="spell-row compact" {...favDrag("spell", id)}>
      <span className="spell-lead"><SchoolIcon school={s.school?.value} size={22} /><FavStar ch={r.character} set={set} kind="spell" refId={id} /></span>
      <button className="feature-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <b>{el.name}</b>
        <small className="muted">{[s.time?.value, s.range?.value, comps + (concentrates ? " · C" : "") + (s.isRitual?.value === "true" ? " · R" : "")].filter(Boolean).join(" · ")}</small>
        <span className="chev">{open ? "▾" : "▸"}</span>
      </button>
      <RollChips name={el.name} html={el.description} ctx={dc} attackBonus={casting.attack} spell={spellCtx} />
      {canCast ? (
        <span className="cast">
          {level > 0 && options.length > 1 && <select aria-label="Slot level" value={chosen?.level ?? ""} onChange={(e) => setSlot(Number(e.target.value))}>{options.map((o) => <option key={o.level} value={o.level}>Lv {o.level}</option>)}</select>}
          <button className="primary" disabled={level > 0 && !chosen} title={rolls.length ? "Spends the slot and rolls the spell's dice" : level > 0 ? "Spends the slot" : "Concentrate on this spell"} onClick={cast}>{level > 0 && !chosen ? "No slots" : "Cast"}</button>
        </span>
      ) : <span />}
      {open && <div className="spell-desc"><Html html={el.description} /></div>}
    </div>
  );
}

function Spells({ r, sheet, set }: { r: Resolved; sheet: SheetData; set: SetCharacter }) {
  if (!sheet.casting.length) return <p className="muted">This character does not cast spells.</p>;
  return (
    <>
      {sheet.casting.map((c) => {
        const levelOf = (id: string) => Number(r.reg.get(id)?.setters.level?.value ?? 0);
        const list = [...new Map([...c.cantripsKnown, ...c.granted, ...(c.prepare ? c.spells.filter((s) => s.prepared) : c.spells)].map((p) => [p.id, p])).values()];
        const levels = [...new Set(list.map((p) => levelOf(p.id)))].sort((a, b) => a - b);
        return (
          <div key={c.name}>
            <div className="spell-head">
              <div><small>Spellcasting</small><b>{c.name}</b></div>
              <div><small>Save DC</small><b>{c.dc}</b></div>
              <div><small>Spell attack</small><button className="roll-btn big" onClick={() => roll(`${c.name} spell attack`, c.attack, { kind: "attack" })}>{sign(c.attack)}</button></div>
              {c.prepare && <div><small>Prepared</small><b>{c.spells.filter((s) => s.prepared).length}/{c.prepareMax}</b></div>}
            </div>
            <div className="slot-tracker">
              {c.slots.map((s) => (
                <div key={s.level} className="slot-level">
                  <small>{c.pactLevel ? `Pact ${s.level}` : `Level ${s.level}`}</small>
                  <div className="pips">
                    {Array.from({ length: s.total }, (_, i) => (
                      <button key={i} className={isAvailable(s.total, s.used, i) ? "pip" : "pip spent"} onClick={() => set((x) => { const used = x.play.slotsUsed[String(s.level)] ?? 0; return { ...x, play: { ...x.play, slotsUsed: { ...x.play.slotsUsed, [String(s.level)]: usedAfterClick(s.total, used, i) } } }; })} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {levels.map((lv) => (
              <Panel key={lv} title={lv === 0 ? "Cantrips" : `Level ${lv}`}>
                {list.filter((p) => levelOf(p.id) === lv).map((p) => <SpellRow key={p.id} id={p.id} r={r} casting={c} set={set} level={lv} sheet={sheet} />)}
              </Panel>
            ))}
          </div>
        );
      })}
    </>
  );
}

function Inventory({ r, ch, sheet, set }: { r: Resolved; ch: Character; sheet: SheetData; set: SetCharacter }) {
  const toggle = (uid: string) => set((c) => ({ ...c, inventory: toggleEquip(c.inventory, uid, r.reg).inventory }));
  const equipped = ch.inventory.filter((i) => i.equipped);
  const rest = ch.inventory.filter((i) => !i.equipped);
  const row = (i: Character["inventory"][number]) => {
    const el = i.id ? r.reg.get(i.id) : undefined;
    return (
      <div key={i.uid} className="inv-row" {...favDrag("item", i.uid)}>
        <FavStar ch={ch} set={set} kind="item" refId={i.uid} />
        <label className="check"><input type="checkbox" checked={i.equipped} onChange={() => toggle(i.uid)} /> <b>{i.qty > 1 ? `${i.qty} × ` : ""}{itemLabel(i, el?.name)}</b></label>
        <small className="muted">{el?.type}{i.attuned ? " · attuned" : ""}</small>
        {el?.description && <RollChips name={el.name} html={el.description} ctx={dcContext(sheet)} attackBonus={sheet.casting[0]?.attack} />}
      </div>
    );
  };
  return (
    <>
      <div className="spell-head">
        <div><small>Weight carried</small><b>{sheet.weight.carried} / {sheet.weight.capacity} lb</b></div>
        <div><small>Attuned</small><b>{sheet.attunement.current} / {sheet.attunement.max}</b></div>
        {(["pp", "gp", "ep", "sp", "cp"] as const).map((k) => (
          <div key={k}><small>{k.toUpperCase()}</small><input className="coin-in" type="number" min={0} value={ch.coins[k]} onChange={(e) => set((c) => ({ ...c, coins: { ...c.coins, [k]: Math.max(0, Number(e.target.value) || 0) } }))} /></div>
        ))}
      </div>
      <Panel title="Equipped">{equipped.length ? equipped.map(row) : <p className="muted">Nothing equipped.</p>}</Panel>
      <Panel title="Carried">{rest.length ? rest.map(row) : <p className="muted">Nothing else. Add gear on the Equipment tab.</p>}</Panel>
    </>
  );
}

function Description({ ch, sheet, set }: { ch: Character; sheet: SheetData; set: SetCharacter }) {
  const info = ch.info;
  const bits: [string, string][] = [["Alignment", info.alignment], ["Deity", info.deity], ["Appearance", [info.age, info.height, info.weight, info.eyes, info.hair, info.skin].filter(Boolean).join(", ")], ["Personality traits", info.traits], ["Ideals", info.ideals], ["Bonds", info.bonds], ["Flaws", info.flaws], ["Allies", info.allies]];
  return (
    <>
      <Panel title="Details">
        {bits.filter(([, v]) => v).map(([k, v]) => <p key={k}><b>{k}.</b> {v}</p>)}
        {sheet.lists.map((l) => <p key={l.name}><b>{l.name}.</b> {l.texts.join(" ")}</p>)}
        {!bits.some(([, v]) => v) && !sheet.lists.length && <p className="muted">No details written yet.</p>}
        <p><button onClick={() => window.dispatchEvent(new CustomEvent("cf-details"))}>Edit details</button></p>
      </Panel>
      {info.backstory && <Panel title="Backstory"><p>{info.backstory}</p></Panel>}
      <label className="field"><span>Edit backstory</span><TextArea rows={5} value={info.backstory} onCommit={(v) => set((c) => ({ ...c, info: { ...c.info, backstory: v } }))} /></label>
    </>
  );
}

function Resources({ ch, set }: { ch: Character; set: SetCharacter }) {
  const list = ch.resources ?? [];
  const patch = (id: string, p: Partial<Resource>) => set((c) => ({ ...c, resources: (c.resources ?? []).map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  const add = () => set((c) => ({ ...c, resources: [...(c.resources ?? []), { id: uid(), name: "", current: 1, max: 1, refresh: "long" as const }] }));
  return (
    <>
      <p className="muted">Track anything that has a number: ki points, rage uses, a wand's charges, a pet's hit points. Short and long rests refill them for you.</p>
      {list.map((x) => (
        <div key={x.id} className="resource-row">
          <TextInput className="res-name" value={x.name} placeholder="Name" aria-label="Resource name" onCommit={(v) => patch(x.id, { name: v })} />
          <span className="res-pips">
            {x.max <= 12
              ? Array.from({ length: x.max }, (_, i) => (
                  <button key={i} aria-label={`Use ${i + 1}`} className={i < x.current ? "pip" : "pip spent"} onClick={() => patch(x.id, { current: i < x.current ? i : i + 1 })} />
                ))
              : null}
          </span>
          <span className="stepper">
            <button aria-label="Spend one" onClick={() => patch(x.id, { current: Math.max(0, x.current - 1) })}>−</button>
            <input type="number" min={0} value={x.current} aria-label="Current" onChange={(e) => patch(x.id, { current: Math.max(0, Math.min(x.max, Number(e.target.value) || 0)) })} />
            <span className="muted">/</span>
            <input type="number" min={1} value={x.max} aria-label="Maximum" onChange={(e) => { const max = Math.max(1, Number(e.target.value) || 1); patch(x.id, { max, current: Math.min(x.current, max) }); }} />
            <button aria-label="Restore one" onClick={() => patch(x.id, { current: Math.min(x.max, x.current + 1) })}>+</button>
          </span>
          <select value={x.refresh} aria-label="Refreshes" onChange={(e) => patch(x.id, { refresh: e.target.value as Resource["refresh"] })}>
            <option value="short">Short rest</option>
            <option value="long">Long rest</option>
            <option value="none">Does not refresh</option>
          </select>
          <button aria-label="Delete" title="Delete" onClick={() => set((c) => ({ ...c, resources: (c.resources ?? []).filter((y) => y.id !== x.id) }))}>×</button>
        </div>
      ))}
      <button className="primary" onClick={add}>Add resource</button>
    </>
  );
}

// ---------------------------------------------------------------- page

type Tab = "actions" | "spells" | "inventory" | "resources" | "features" | "description" | "notes" | "conditions" | "extras";


/** The row above the play sheet: resources always, plus whatever was pinned or dragged in. Only the player hides it. */
/** Resources (ki, rage, a wand's charges): always in view above the tabs, spent and restored with a click. */
function ResourceStrip({ ch, set }: { ch: Character; set: SetCharacter }) {
  const resources = ch.resources ?? [];
  if (!resources.length) return null;
  const patchRes = (id: string, p: Partial<Resource>) => set((c) => ({ ...c, resources: (c.resources ?? []).map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  return (
    <div className="res-strip" aria-label="Resources">
        {resources.map((x) => (
          <div key={x.id} className="res-chip">
            <b>{x.name || "Resource"}</b>
            <span className="res-pips">
              {x.max <= 12 ? Array.from({ length: x.max }, (_, i) => <button key={i} aria-label={`Use ${i + 1}`} className={i < x.current ? "pip small" : "pip spent small"} onClick={() => patchRes(x.id, { current: i < x.current ? i : i + 1 })} />) : null}
            </span>
            <span className="stepper">
              <button aria-label="Spend one" onClick={() => patchRes(x.id, { current: Math.max(0, x.current - 1) })}>−</button>
              <span>{x.current} / {x.max}</span>
              <button aria-label="Restore one" onClick={() => patchRes(x.id, { current: Math.min(x.max, x.current + 1) })}>+</button>
            </span>
          </div>
        ))}
    </div>
  );
}

function Favorites({ r, ch, sheet, set }: { r: Resolved; ch: Character; sheet: SheetData; set: SetCharacter }) {
  const [over, setOver] = useState(false);
  // The gap a drop would land in (C2): before the favorite of this index, or the list's length for the end.
  const [gap, setGap] = useState<number | null>(null);
  const favs = ch.favorites ?? [];
  const setHidden = (v: boolean) => set((c) => ({ ...c, favoritesHidden: v }));
  if (ch.favoritesHidden) {
    return <div className="fav-bar collapsed"><button onClick={() => setHidden(false)}>☆ Show favorites{favs.length ? ` (${favs.length})` : ""}</button></div>;
  }
  const drop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    const d = readFav(e.dataTransfer);
    const at = gap ?? favs.length;
    setGap(null);
    if (!d?.kind || !d.ref) return;
    if (d.uid && favs.some((f) => f.uid === d.uid)) set((c) => ({ ...c, favorites: moveTo(c.favorites ?? [], d.uid!, at) }));
    else if (!isFav(ch, d.kind, d.ref)) set((c) => ({ ...c, favorites: insertAt(c.favorites ?? [], { uid: uid(), kind: d.kind, ref: d.ref }, at) }));
  };
  const move = (uidv: string, by: -1 | 1) => set((c) => {
    const list = c.favorites ?? [];
    const i = list.findIndex((f) => f.uid === uidv);
    return { ...c, favorites: moveTo(list, uidv, by < 0 ? i - 1 : i + 2) };
  });
  // Over a tile: the gap before it, or after it past its middle.
  const overTile = (e: React.DragEvent, i: number) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setGap(e.clientX > r.left + r.width / 2 ? i + 1 : i);
  };
  const castingOf = (id: string) => sheet.casting.find((c) => [...c.cantripsKnown, ...c.spells, ...c.granted].some((p) => p.id === id));
  const remove = (uidv: string) => set((c) => ({ ...c, favorites: (c.favorites ?? []).filter((f) => f.uid !== uidv) }));
  const tile = (f: NonNullable<Character["favorites"]>[number], i: number) => {
    let body: React.ReactNode = null;
    if (f.kind === "weapon") {
      const a = sheet.attacks.find((x) => (x.id ?? x.name) === f.ref);
      body = a ? (
        <div className="fav-weapon">
          <b>{a.name}</b>
          <button className="roll-btn" title="Roll to hit" onClick={() => roll(`${a.name} attack`, a.bonus, { kind: "attack" })}>{sign(a.bonus)}</button>
          <button className="roll-btn" title="Roll damage" onClick={() => a.damage && requestRoll(`${a.name} damage`, a.damage.replace(/\s+/g, ""))}>{a.damage}</button>
          <small className="muted">{a.damageType}</small>
        </div>
      ) : <span className="muted">A weapon that is not equipped right now</span>;
    } else if (f.kind === "spell") {
      const el = r.reg.get(f.ref);
      const line = castingOf(f.ref);
      body = el && line ? <SpellRow id={f.ref} r={r} casting={line} set={set} level={Number(el.setters.level?.value) || 0} sheet={sheet} /> : <span className="muted">A spell you no longer have</span>;
    } else if (f.kind === "feature") {
      const ft = sheet.features.find((x) => x.id === f.ref);
      body = ft ? <FeatureRow f={ft} ch={ch} set={set} sheet={sheet} /> : <span className="muted">A feature you no longer have</span>;
    } else {
      const it = ch.inventory.find((x) => x.uid === f.ref);
      const el = it?.id ? r.reg.get(it.id) : undefined;
      body = it ? (
        <div className="fav-weapon">
          <b>{itemLabel(it, el?.name)}</b>
          <span className="stepper">
            <button aria-label="One fewer" onClick={() => set((c) => ({ ...c, inventory: c.inventory.map((x) => (x.uid === it.uid ? { ...x, qty: Math.max(0, x.qty - 1) } : x)) }))}>−</button>
            <span>{it.qty}</span>
            <button aria-label="One more" onClick={() => set((c) => ({ ...c, inventory: c.inventory.map((x) => (x.uid === it.uid ? { ...x, qty: x.qty + 1 } : x)) }))}>+</button>
          </span>
        </div>
      ) : <span className="muted">An item you no longer have</span>;
    }
    return (
      <div key={f.uid} className={`fav-tile ${f.kind}${gap === i ? " drop-before" : ""}${gap === i + 1 && i === favs.length - 1 ? " drop-after" : ""}`} draggable onDragStartCapture={favDrag(f.kind, f.ref, f.uid).onDragStart} onDragOver={(e) => overTile(e, i)}>
        <button className="fav-remove" title="Remove from favorites" aria-label="Remove from favorites" onClick={() => remove(f.uid)}>×</button>
        <span className="fav-move">
          <button disabled={i === 0} title="Move earlier" aria-label="Move earlier" onClick={() => move(f.uid, -1)}>◂</button>
          <button disabled={i === favs.length - 1} title="Move later" aria-label="Move later" onClick={() => move(f.uid, 1)}>▸</button>
        </span>
        {body}
      </div>
    );
  };
  return (
    <section className={over ? "fav-bar over" : "fav-bar"} aria-label="Favorites" onDragOver={(e) => { const t = Array.from(e.dataTransfer.types); if (t.includes(FAV_MIME) || t.includes("text/plain")) { e.preventDefault(); e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === "move" ? "move" : "copy"; setOver(true); if (!(e.target as HTMLElement).closest(".fav-tile")) setGap(favs.length); } }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setOver(false); setGap(null); } }} onDrop={drop}>
      <header>
        <h3>Favorites</h3>
        <small className="muted">Drag weapons, spells, features and items here, or click their ☆. Resources stay here too.</small>
        <button onClick={() => setHidden(true)}>Hide</button>
      </header>
      <div className="fav-tiles">
        {favs.map((f, i) => tile(f, i))}
        {favs.length === 0 && <p className="muted fav-empty">Nothing pinned yet. Drag a weapon, spell, feature or item here, or click its ☆.</p>}
        {/* The drop area stays big after the first favorite, so the next one has somewhere to land. */}
        {favs.length > 0 && <p className="muted fav-drop" aria-hidden="true">Drop here to add</p>}
      </div>
    </section>
  );
}

export function PlayTab({ r, ch, set }: { r: Resolved; ch: Character; set: SetCharacter }) {
  const sheet = useMemo(() => buildSheet(r), [r]);
  const head = headerInfo(r);
  const [tab, setTab] = useState<Tab>("actions");
  const [side, setSide] = useState<"favorites" | "skills">("favorites");
  const [xpOpen, setXpOpen] = useState(false);
  const [xpAdd, setXpAdd] = useState("");
  const [hpOpen, setHpOpen] = useState(false);
  const rests = useRests(r, ch, sheet, set);
  const hasSpells = sheet.casting.length > 0;
  const nextXp = XP_TABLE[Math.min(19, sheet.level)] ?? 0;
  const prevXp = XP_TABLE[Math.max(0, sheet.level - 1)] ?? 0;
  const xpPct = nextXp > prevXp ? Math.max(0, Math.min(100, ((ch.xp - prevXp) / (nextXp - prevXp)) * 100)) : 100;
  const tabs: [Tab, string, boolean][] = [["actions", "Sheet", true], ["spells", "Spells", hasSpells], ["inventory", "Inventory", true], ["resources", "Resources", true], ["features", "Features & Traits", true], ["description", "Description", true], ["notes", "Notes", true], ["conditions", "Conditions", true], ["extras", "Extras", sheet.features.length >= 0]];
  const companions = [...r.active.filter((a) => a.el.type === "Companion").map((a) => ({ el: a.el, name: a.el.name })), ...ch.companions.map((c) => ({ el: r.reg.get(c.id), name: c.name }))];

  return (
    <div className="play">
      <header className="play-head hero">
        <div className="hero-left">
          {ch.portrait ? <img className="portrait-lg" src={ch.portrait} alt="" /> : <div className="portrait-lg ph">{(ch.name || "?").charAt(0)}</div>}
          <Vitals ch={ch} sheet={sheet} set={set} />
          <div className="hd-row">
            <div className="hd-bar" title={`Hit dice: ${sheet.hitDice.map((h) => `${h.count}d${h.die}`).join(" + ")}`}><div style={{ width: `${sheet.level ? (rests.left / sheet.level) * 100 : 0}%` }} /><span>{rests.left} / {sheet.level} HD · {sheet.hitDice.map((h) => `${h.count}d${h.die}`).join(" + ")}</span></div>
            <button className="icon-btn" title="Spend a hit die" aria-label="Spend a hit die" disabled={!rests.left || rests.hp >= sheet.hp} onClick={rests.spendHitDie}>+</button>
          </div>
        </div>
        <div className="hero-mid play-id">
          <h1>{ch.name || "Unnamed character"}</h1>
          <p className="hero-sub">
            {[`Walk ${speedAfterExhaustion(sheet.speed, ch.play.exhaustion ?? 0)} ft`, ...sheet.otherSpeeds.map((x) => `${x.kind} ${x.value} ft`), head.size, head.species, head.alignment !== "-" ? head.alignment : "", head.classLine + (head.subclass !== "-" ? ` (${head.subclass})` : ""), head.background !== "-" ? head.background : "", ...sheet.casting.map((c) => `${ABILITY_SHORT[c.ability as AbilityId] ?? c.name} DC ${c.dc}`)].filter(Boolean).map((x, i) => <span key={i}>{x}</span>)}
          </p>
          <div className="hero-stats">
            <Shield value={sheet.ac.value} />
            <div className="ab-row">{sheet.abilities.map((a) => <AbilityBox key={a.id} id={a.id} a={a} />)}</div>
            <div className="ab-col">
              <button className="ab-box init" onClick={() => roll("Initiative", sheet.initiative, { kind: "check", ability: "dexterity" })} title="Roll initiative"><small>Init</small><b>{sign(sheet.initiative)}</b><span className="ab-score">PB {sign(sheet.proficiency)}</span></button>
              <span className="ab-save static">Saves</span>
            </div>
          </div>
        </div>
        <div className="hero-right">
          <div className="hero-icons">
            <button className={ch.play.inspiration ? "icon-btn on" : "icon-btn"} title={ch.play.inspiration ? "Heroic Inspiration: you have it" : "Heroic Inspiration"} aria-label="Inspiration" aria-pressed={ch.play.inspiration} onClick={() => set((c) => ({ ...c, play: { ...c.play, inspiration: !c.play.inspiration } }))}><HeadIcon name={ch.play.inspiration ? "starOn" : "star"} /></button>
            {sheet.level < 20 && ch.classes.length > 0 && <button className="icon-btn" title="Level up" aria-label="Level up" onClick={() => window.dispatchEvent(new Event("cf-levelup"))}><HeadIcon name="up" /></button>}
            {ch.classes.length > 0 && <button className="icon-btn" title="Hit points: fixed or rolled, each level's roll" aria-label="Hit point rolls" onClick={() => setHpOpen(true)}><HeadIcon name="heart" /></button>}
            <button className="icon-btn" title={t("Short rest")} aria-label={t("Short rest")} onClick={rests.shortRest}><HeadIcon name="meal" /></button>
            <button className="icon-btn" title={t("Long rest")} aria-label={t("Long rest")} onClick={rests.longRest}><HeadIcon name="tent" /></button>
          </div>
          <div className="level-medal" title={`Level ${sheet.level}`}><b>{sheet.level}</b><small>Level</small></div>
          <button className="xp" title="Change experience points" aria-label={`Change experience points: ${ch.xp} of ${nextXp || "max"}`} aria-expanded={xpOpen} onClick={() => setXpOpen(!xpOpen)}><div style={{ width: `${xpPct}%` }} /><span>{ch.xp} / {nextXp || "max"} XP</span></button>
        </div>
      </header>
      {/* Experience and hit points (moved here from Manage, C2): XP set or added, and the hit point dialog. */}
      {xpOpen && (
        <div className="row xp-edit">
          <label className="field"><span>Experience points</span>
            <input type="number" min={0} value={ch.xp} onChange={(e) => set((c) => ({ ...c, xp: Math.max(0, Number(e.target.value) || 0) }))} />
          </label>
          <label className="field"><span>Add</span>
            <input type="number" min={0} placeholder="XP" value={xpAdd} onChange={(e) => setXpAdd(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && Number(xpAdd) > 0) { set((c) => ({ ...c, xp: c.xp + Math.floor(Number(xpAdd)) })); setXpAdd(""); } }} />
          </label>
          <button disabled={!(Number(xpAdd) > 0)} onClick={() => { set((c) => ({ ...c, xp: c.xp + Math.floor(Number(xpAdd)) })); setXpAdd(""); }}>Add XP</button>
          <span className="muted">XP says level {xpToLevel(ch.xp)}; your classes total {sheet.level}. Next level at {XP_TABLE[Math.min(19, sheet.level)] ?? "-"} XP.</span>
        </div>
      )}
      {hpOpen && <HpRollsDialog r={r} ch={ch} set={set} onClose={() => setHpOpen(false)} />}

      {xpToLevel(ch.xp) > sheet.level && sheet.level < 20 && (
        <p className="notice levelup-banner">You have enough experience for level {xpToLevel(ch.xp)}. <button className="primary" onClick={() => window.dispatchEvent(new Event("cf-levelup"))}>Level up</button></p>
      )}
      <div className="play-tools">
        <div className="rollmode-row"><small>d20 rolls</small><RollModeSwitch /></div>
        <Hint id="play-1">Click any modifier to roll it. Click a pip on a feature to spend a use.</Hint>
      </div>
      {(ch.play.conditions.length > 0 || (ch.play.exhaustion ?? 0) > 0) && (
        <div className="condition-strip" aria-label="Active conditions">
          {ch.play.conditions.map((c) => (
            <span key={c} className="cond-chip" tabIndex={0} aria-describedby={`strip-${c}`}>
              <ConditionIcon name={c} size={20} />
              <span>{c}</span>
              <span id={`strip-${c}`} role="tooltip" className="cond-tip"><b>{c}</b>{CONDITION_TEXT[c]}</span>
            </span>
          ))}
          {(ch.play.exhaustion ?? 0) > 0 && (
            <span className="cond-chip" tabIndex={0} aria-describedby="strip-exh">
              <ConditionIcon name="Exhaustion" size={20} />
              <span>Exhaustion {ch.play.exhaustion}</span>
              <span id="strip-exh" role="tooltip" className="cond-tip"><b>Exhaustion {ch.play.exhaustion}</b>Each level takes 2 off d20 tests and 5 feet off speed. This level: −{2 * (ch.play.exhaustion ?? 0)} on d20 tests, −{5 * (ch.play.exhaustion ?? 0)} feet of speed.</span>
            </span>
          )}
        </div>
      )}
      {ch.play.concentration && (
        <p className="concentration-strip">Concentrating on <b>{ch.play.concentration}</b> <button onClick={() => set((c) => ({ ...c, play: { ...c.play, concentration: undefined } }))}>End</button></p>
      )}
      <div className="play-grid">
        <aside className="play-side">
          <div className="side-switch" role="tablist" aria-label="Sidebar">
            <button role="tab" aria-selected={side === "favorites"} className={side === "favorites" ? "on" : ""} onClick={() => setSide("favorites")}>★ Favorites</button>
            <button role="tab" aria-selected={side === "skills"} className={side === "skills" ? "on" : ""} onClick={() => setSide("skills")}>Skills</button>
          </div>
          {side === "favorites" && <Favorites r={r} ch={ch} sheet={sheet} set={set} />}
          {side === "skills" && (
            <>
              <Panel title="Skills">
                <div className="skill-head"><span /><span>Mod</span><span>Skill</span><span>Bonus</span><span>Passive</span></div>
                {sheet.skills.map((s) => (
                  <button key={s.name} className="skill-line" onClick={() => roll(skillLabel(s.name), s.bonus, { kind: "check", ability: s.ability })}>
                    <i className={s.level === "none" ? "dot" : s.level === "expertise" ? "dot on x2" : "dot on"} />
                    <small>{ABILITY_SHORT[s.ability]}</small><span>{skillLabel(s.name)}</span><b>{sign(s.bonus)}</b><em>{s.passive}</em>
                  </button>
                ))}
              </Panel>
              <Panel title="Senses">
                <div className="line"><span /><span>Passive Perception</span><b>{sheet.passivePerception}</b></div>
                <div className="line"><span /><span>Passive Investigation</span><b>{sheet.skills.find((x) => x.name === "investigation")?.passive}</b></div>
                <div className="line"><span /><span>Passive Insight</span><b>{sheet.skills.find((x) => x.name === "insight")?.passive}</b></div>
                {sheet.vision.length > 0 && <p className="muted small-text">{sheet.vision.join(", ")}</p>}
              </Panel>
              <Panel title="Training">
                {([["Armor", sheet.proficiencies.armor], ["Weapons", sheet.proficiencies.weapons], ["Tools", sheet.proficiencies.tools], ["Languages", sheet.proficiencies.languages]] as [string, string[]][])
                  .filter(([, v]) => v.length)
                  .map(([k, v]) => (
                    <div key={k} className="train-group"><small>{k}</small><div className="train-tags">{v.map((x) => <span key={x}>{x.replace(/^(Armor|Weapon|Tool) Proficiency \((.*)\)$/, "$2")}</span>)}</div></div>
                  ))}
              </Panel>
            </>
          )}
        </aside>

        <div className="play-main">
          <ResourceStrip ch={ch} set={set} />
          <nav className="play-tabs">
            {tabs.filter(([, , show]) => show).map(([k, label]) => <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{label}</button>)}
          </nav>
          <div className="play-body">
            {tab === "actions" && <Actions r={r} ch={ch} sheet={sheet} set={set} />}
            {tab === "spells" && <Spells r={r} sheet={sheet} set={set} />}
            {tab === "inventory" && <Inventory r={r} ch={ch} sheet={sheet} set={set} />}
            {tab === "resources" && <Resources ch={ch} set={set} />}
            {tab === "features" && <Features ch={ch} sheet={sheet} set={set} />}
            {tab === "description" && <Description ch={ch} sheet={sheet} set={set} />}
            {tab === "notes" && <Journal ch={ch} set={set} />}
            {tab === "conditions" && <ConditionsPanel ch={ch} set={set} />}
            {tab === "extras" && (
              <>
                {companions.length === 0 && <p className="muted">No companions. Add them on the Manage tab.</p>}
                <FormsPanel r={r} reg={r.reg} ch={ch} set={set} companions={companions.map((c, i) => ({ key: ch.companions[i - (companions.length - ch.companions.length)]?.uid ?? c.el?.id ?? String(i), name: c.name, el: c.el }))} />
                {companionBonuses(r.stats).length > 0 && companions.length > 0 && <p className="muted">From your features: {companionBonuses(r.stats).join(", ")}</p>}
                {companions.map((c, i) => (c.el ? <div key={i}><h3>{c.name}</h3><CompanionCard el={c.el} /></div> : null))}
              </>
            )}
          </div>
        </div>
      </div>
      {r.warnings.length > 0 && <details className="muted"><summary>{r.warnings.length} content notes</summary>{r.warnings.slice(0, 8).map((w, i) => <p key={i}>{w}</p>)}</details>}
    </div>
  );
}
