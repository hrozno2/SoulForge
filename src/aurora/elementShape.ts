/**
 * The door for content (hardening, 2026-11-23). Every element the registry takes passes here once, whatever made
 * it: Aurora's XML, the 5e.tools converter, the bundled rules, a homebrew file, converted elements kept in the
 * cache. An element of the right shape is passed through untouched (the usual case, and no copy is made). One with
 * a field of the wrong kind is repaired to the nearest harmless shape; one with no id or no type cannot be anything
 * and is left out. The rest of the engine may then rely on the shape the types state: `rules` is a list of rules,
 * `supports` a list of text, `setters` text values, `description` text.
 *
 * What content MEANS (a grant of itself, a choice of a million picks) is not judged here; the engine survives those
 * on its own (src/engine/contentFuzz.test.ts).
 */
import type { AElement, ARule, SetterValue } from "./types";

const isText = (v: unknown): v is string => typeof v === "string";
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const optionalText = (v: unknown) => v === undefined || isText(v);
const optionalNumber = (v: unknown) => v === undefined || typeof v === "number";

function ruleOk(r: unknown): r is ARule {
  if (!isObject(r) || !optionalText(r.requirements) || !optionalNumber(r.level)) return false;
  if (r.kind === "grant") return isText(r.type) && isText(r.id);
  if (r.kind === "select")
    return (
      isText(r.type) &&
      isText(r.name) &&
      isText(r.supports) &&
      typeof r.number === "number" &&
      (r.items === undefined || Array.isArray(r.items))
    );
  if (r.kind === "stat") return isText(r.name) && isText(r.value) && optionalText(r.bonus) && optionalText(r.equipped);
  return false;
}

const setterOk = (s: unknown): s is SetterValue => isObject(s) && isText(s.value) && isObject(s.attrs);

/** True when the element has the shape the types state: the engine can take it as it is. */
function shapeOk(e: AElement): boolean {
  if (!isText(e.name) || !isText(e.source) || !isText(e.description)) return false;
  if (!Array.isArray(e.supports) || !e.supports.every(isText)) return false;
  if (!Array.isArray(e.rules) || !e.rules.every(ruleOk)) return false;
  if (!isObject(e.setters)) return false;
  for (const k in e.setters) if (!setterOk(e.setters[k])) return false;
  if (
    e.sheet !== undefined &&
    (!isObject(e.sheet) || !Array.isArray(e.sheet.descriptions) || !e.sheet.descriptions.every((d) => isObject(d) && isText(d.text)))
  )
    return false;
  if (e.requirements !== undefined && !isText(e.requirements)) return false;
  if (e.multiclass !== undefined && (!isObject(e.multiclass) || !Array.isArray(e.multiclass.rules) || !isObject(e.multiclass.setters)))
    return false;
  if (
    e.spellcasting !== undefined &&
    (!isObject(e.spellcasting) || !Array.isArray(e.spellcasting.list) || !Array.isArray(e.spellcasting.extendLists))
  )
    return false;
  return true;
}

/** A rule repaired where a harmless reading exists (a level given as text), else undefined. */
function repairRule(r: unknown): ARule | undefined {
  if (!isObject(r)) return undefined;
  const fixed: Record<string, unknown> = { ...r };
  if (!optionalText(fixed.requirements)) delete fixed.requirements;
  if (!optionalNumber(fixed.level)) {
    const n = Number(fixed.level);
    if (Number.isFinite(n)) fixed.level = n;
    else delete fixed.level;
  }
  if (fixed.kind === "select" && typeof fixed.number !== "number")
    fixed.number = Number.isFinite(Number(fixed.number)) ? Number(fixed.number) : 1;
  if (fixed.kind === "select" && fixed.items !== undefined && !Array.isArray(fixed.items)) delete fixed.items;
  if (fixed.kind === "stat") for (const k of ["bonus", "equipped"]) if (!optionalText(fixed[k])) delete fixed[k];
  return ruleOk(fixed) ? fixed : undefined;
}

/**
 * The element as the engine may take it: itself when its shape is right, a repaired copy when a field is of the
 * wrong kind, undefined when it has no id or type to be known by.
 */
export function soundElement(raw: unknown): AElement | undefined {
  if (!isObject(raw) || !isText(raw.id) || !raw.id || !isText(raw.type) || !raw.type) return undefined;
  const e = raw as unknown as AElement;
  if (shapeOk(e)) return e;
  const setters: Record<string, SetterValue> = {};
  if (isObject(e.setters))
    for (const k in e.setters) {
      const s = e.setters[k] as unknown;
      if (setterOk(s)) setters[k] = s;
      else if (isObject(s) && (isText(s.value) || typeof s.value === "number"))
        setters[k] = { value: String(s.value), attrs: isObject(s.attrs) ? (s.attrs as Record<string, string>) : {} };
    }
  const out: AElement = {
    ...e,
    name: isText(e.name) && e.name ? e.name : e.id,
    source: isText(e.source) ? e.source : "",
    description: isText(e.description) ? e.description : "",
    supports: Array.isArray(e.supports) ? e.supports.filter(isText) : isText(e.supports) ? [e.supports] : [],
    rules: Array.isArray(e.rules) ? e.rules.map(repairRule).filter((r): r is ARule => !!r) : [],
    setters,
  };
  if (!isText(out.requirements)) delete out.requirements;
  if (out.sheet !== undefined) {
    const sh = out.sheet as unknown;
    if (isObject(sh))
      out.sheet = {
        ...(sh as unknown as NonNullable<AElement["sheet"]>),
        descriptions: Array.isArray(sh.descriptions) ? sh.descriptions.filter((d) => isObject(d) && isText(d.text)) : [],
      };
    else delete out.sheet;
  }
  if (out.multiclass !== undefined) {
    const mc = out.multiclass as unknown;
    if (isObject(mc) && isText(mc.id))
      out.multiclass = {
        ...(mc as unknown as NonNullable<AElement["multiclass"]>),
        rules: Array.isArray(mc.rules) ? mc.rules.map(repairRule).filter((r): r is ARule => !!r) : [],
        setters: isObject(mc.setters) ? (mc.setters as Record<string, SetterValue>) : {},
      };
    else delete out.multiclass;
  }
  if (out.spellcasting !== undefined) {
    const sc = out.spellcasting as unknown;
    if (isObject(sc) && isText(sc.name))
      out.spellcasting = {
        ...(sc as unknown as NonNullable<AElement["spellcasting"]>),
        list: Array.isArray(sc.list) ? sc.list.filter(isText) : [],
        extendLists: Array.isArray(sc.extendLists) ? sc.extendLists.filter(isText) : [],
      };
    else delete out.spellcasting;
  }
  return out;
}

/** The sound elements of a list, in their order; `dropped` counts those that could not be anything. */
export function soundElements(list: readonly unknown[]): { elements: AElement[]; repaired: number; dropped: number } {
  const elements: AElement[] = [];
  let repaired = 0;
  let dropped = 0;
  for (const raw of list) {
    const e = soundElement(raw);
    if (!e) dropped++;
    else {
      if (e !== raw) repaired++;
      elements.push(e);
    }
  }
  return { elements, repaired, dropped };
}
