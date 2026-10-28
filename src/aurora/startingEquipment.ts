/**
 * Starting equipment for a character: what the class and background offer, equipment packs, and common gear.
 * Content files describe equipment as text ("Choose A or B: (A) 2 Daggers, Robe and 5 GP; or (B) 55 GP" for the
 * 2024 rules, or lists of "(a) X or (b) Y" for older classes). This reads that text and matches it to items.
 */
import type { GenericKind } from "./character";
import { isModern } from "./edition";
import { TOOL_KINDS } from "./fivetools";
import type { AElement } from "./types";
import { buildSheet } from "./sheet";
import { resolve } from "./engine";
import type { ARegistry } from "./registry";
import { uid, type Character, type InvItem } from "./character";
import { HANDS, handsFor, handsUsed } from "./hands";

export interface ItemRef {
  text: string;
  qty: number;
}

export interface EquipVariant {
  label: string;
  fixed: ItemRef[];
  gp: number;
  /** Older classes: pick one option in each group. */
  choices: { options: ItemRef[][] }[];
  /** A ready-made pack that holds exactly this variant's items, when the content has one. */
  packId?: string;
  /** The 2014 alternative: roll for gold instead of the gear ("5d4", times `times` gp). */
  goldRoll?: { dice: string; times: number };
}

/**
 * The 2014 Player's Handbook's starting wealth by class (a rules table), for 2014 classes whose content does not carry
 * the roll itself; 5e.tools classes carry it ("starting gold", from `goldAlternative`), as Plutonium reads it.
 */
const WEALTH_2014: Record<string, string> = {
  barbarian: "2d4 × 10", bard: "5d4 × 10", cleric: "5d4 × 10", druid: "2d4 × 10", fighter: "5d4 × 10", monk: "5d4",
  paladin: "5d4 × 10", ranger: "5d4 × 10", rogue: "4d4 × 10", sorcerer: "3d4 × 10", warlock: "4d4 × 10", wizard: "4d4 × 10",
  artificer: "5d4 × 10",
};

/** "5d4 × 10" as the dice and the multiplier. */
export function parseGoldRoll(text: string | undefined): EquipVariant["goldRoll"] {
  const m = /^\s*(\d+d\d+)\s*(?:[×x*]\s*(\d+))?\s*$/i.exec(text ?? "");
  return m ? { dice: m[1], times: Number(m[2] ?? 1) } : undefined;
}

export interface EquipPlan {
  title: string;
  kind: "class" | "background";
  source: string;
  variants: EquipVariant[];
}

export interface ResolvedItem {
  el?: AElement;
  /** Names only a kind of item that nothing settled: the player picks one later. */
  pending?: GenericKind;
  name: string;
  qty: number;
  /** The full wording from the rulebook, kept on custom items. */
  note?: string;
}

// ---------------------------------------------------------------- text helpers

const stripTags = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/** Split at commas and the words "and"/"or" that are not inside parentheses. */
export function splitTop(text: string, words: string[] = ["and"]): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  const re = new RegExp(`^\\s+(?:${words.join("|")})\\s+`, "i");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(") depth++;
    if (c === ")") depth = Math.max(0, depth - 1);
    if (depth === 0) {
      if (c === ",") {
        out.push(cur);
        cur = "";
        continue;
      }
      const m = text.slice(i).match(re);
      if (m) {
        out.push(cur);
        cur = "";
        i += m[0].length - 1;
        continue;
      }
    }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.replace(/^\s*(and|or)\s+/i, "").trim()).filter(Boolean);
}

const NUM_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** "2 daggers", "an explorer's pack", "20 arrows" into text and quantity. */
function toRef(raw: string): ItemRef | undefined {
  let t = raw.replace(/\((if|only if)[^)]*\)/gi, "").replace(/\s+/g, " ").trim().replace(/[.;]$/, "");
  if (!t) return undefined;
  let qty = 1;
  const m = t.match(/^(\d+)\s+(.*)$/);
  if (m) {
    qty = parseInt(m[1], 10);
    t = m[2];
  } else {
    const w = t.match(/^(a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+(.*)$/i);
    if (w) {
      qty = NUM_WORDS[w[1].toLowerCase()];
      t = w[2];
    }
  }
  return { text: t.replace(/^(the|your)\s+/i, ""), qty };
}

/** "2 Daggers, Robe and 5 GP" into item references and gold. */
export function parseItems(text: string): { refs: ItemRef[]; gp: number } {
  let gp = 0;
  const refs: ItemRef[] = [];
  for (const part of splitTop(text, ["and"])) {
    const g = part.match(/^(\d[\d,]*)\s*(gp|sp|cp|pp)\b/i);
    if (g) {
      const n = parseInt(g[1].replace(/,/g, ""), 10);
      gp += g[2].toLowerCase() === "gp" ? n : g[2].toLowerCase() === "pp" ? n * 10 : g[2].toLowerCase() === "sp" ? n / 10 : n / 100;
      continue;
    }
    const contain = part.match(/^(.*?)\s+containing\s+(\d[\d,]*)\s*gp$/i);
    if (contain) {
      gp += parseInt(contain[2].replace(/,/g, ""), 10);
      const r = toRef(contain[1]);
      if (r) refs.push(r);
      continue;
    }
    const r = toRef(part);
    if (r) refs.push(r);
  }
  return { refs, gp };
}

// ---------------------------------------------------------------- reading the content

/** The "Equipment" text of an element: a list item, a table row, or an "Equipment" heading with a list. */
export function equipmentText(html: string): { kind: "letters" | "groups" | "plain"; text: string; items?: string[] } | undefined {
  const row = html.match(/<b>\s*Starting Equipment\s*<\/b>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
  if (row) return { kind: "letters", text: stripTags(row[1]) };
  const li = html.match(/<strong>\s*Equipment:?\s*<\/strong>\s*([\s\S]*?)<\/li>/i);
  if (li) {
    const t = stripTags(li[1]);
    return { kind: /\(A\)/.test(t) ? "letters" : "plain", text: t };
  }
  const head = html.match(/<h5[^>]*>\s*EQUIPMENT\s*<\/h5>([\s\S]*?)(?:<h5|<table|<h4|$)/i);
  if (head) {
    const items = [...head[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1]);
    if (items.length) return { kind: "groups", text: "", items };
  }
  return undefined;
}

function lettersVariants(text: string): { label: string; refs: ItemRef[]; gp: number }[] {
  const body = text.replace(/^.*?(?=\(A\))/i, "");
  const parts = body.split(/\(([A-Z])\)\s*/).slice(1);
  const out: { label: string; refs: ItemRef[]; gp: number }[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const clean = parts[i + 1].replace(/[;]?\s*(or|and)?\s*$/i, "").replace(/;\s*$/, "").trim();
    const parsed = parseItems(clean);
    out.push({ label: parts[i], ...parsed });
  }
  return out;
}

function groupVariant(items: string[]): EquipVariant {
  const v: EquipVariant = { label: "Starting equipment", fixed: [], gp: 0, choices: [] };
  for (const li of items) {
    // Options are marked "(a)", "(b)": in italics in most books, as plain text in some (the 2014 Wizard and Druid).
    const marked = li.replace(/(?:<i>\s*)?\(([a-c])\)(?:\s*<\/i>)?/gi, "\u0001$1\u0002");
    if (marked.includes("\u0001")) {
      const opts = marked.split(/\u0001[a-z]\u0002/).map((s) => stripTags(s).replace(/,?\s*(or)?\s*$/i, "").trim()).filter(Boolean);
      v.choices.push({ options: opts.map((o) => parseItems(o).refs) });
    } else {
      const p = parseItems(stripTags(li));
      v.fixed.push(...p.refs);
      v.gp += p.gp;
    }
  }
  return v;
}

/** What a class or background element offers as starting equipment, from its description. */
export function planFor(el: AElement, kind: "class" | "background", reg: ARegistry): EquipPlan | undefined {
  const found = equipmentText(el.description);
  if (!found) return undefined;
  const plan: EquipPlan = { title: el.name, kind, source: el.source, variants: [] };
  if (found.kind === "letters") {
    const prefix = kind === "class" ? "Class Equipment Pack" : "Background Equipment Pack";
    const packFor = (label: string) => {
      // Some classes have a pack per option ("Fighter, Option A"); others have one pack for option A.
      const names = [`${prefix} (${el.name}, Option ${label})`, ...(label === "A" ? [`${prefix} (${el.name})`] : [])];
      for (const n of names) {
        const hit = reg.all().find((e) => e.name === n && e.source === el.source) ?? reg.all().find((e) => e.name === n);
        if (hit) return hit.id;
      }
      return undefined;
    };
    for (const v of lettersVariants(found.text)) {
      plan.variants.push({ label: `Option ${v.label}`, fixed: v.refs, gp: v.gp, choices: [], packId: packFor(v.label) });
    }
  } else if (found.kind === "groups") {
    plan.variants.push(groupVariant(found.items ?? []));
  } else {
    const p = parseItems(found.text);
    plan.variants.push({ label: "Starting equipment", fixed: p.refs, gp: p.gp, choices: [] });
  }
  // A 2014 class can take rolled gold instead of the gear (2024 classes have it as an option of their own).
  if (kind === "class" && plan.variants.length && !isModern(el)) {
    const roll = parseGoldRoll(el.setters["starting gold"]?.value ?? WEALTH_2014[el.name.toLowerCase()]);
    if (roll) plan.variants.push({ label: "Starting gold instead", fixed: [], gp: 0, choices: [], goldRoll: roll });
  }
  return plan.variants.length ? plan : undefined;
}

/** Plans for the character's first class and their background. */
export function startingPlans(ch: Character, reg: ARegistry): EquipPlan[] {
  const out: EquipPlan[] = [];
  const cls = ch.classes[0] ? reg.get(ch.classes[0].classId) : undefined;
  if (cls) {
    const p = planFor(cls, "class", reg);
    if (p) out.push(p);
  }
  const bg = ch.background ? reg.get(ch.background) : undefined;
  if (bg) {
    const p = planFor(bg, "background", reg);
    if (p) out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------- matching names to items

const ITEM_TYPES = ["Item", "Weapon", "Armor", "Magic Item"];
const norm = (s: string) => s.toLowerCase().replace(/[’`]/g, "'").replace(/\(.*?\)/g, " ").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
const normKeep = (s: string) => s.toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9'() ]+/g, " ").replace(/\s+/g, " ").trim();
const singular = (s: string) => s.split(" ").map((w) => w.replace(/ies$/, "y").replace(/(ch|sh|x|ss)es$/, "$1").replace(/([^s'])s$/, "$1")).join(" ");

const SYNONYMS: Record<string, string[]> = {
  "holy symbol": ["Amulet", "Emblem", "Reliquary", "Holy Symbol"],
  "arcane focus": ["Arcane Focus", "Crystal", "Orb", "Rod", "Staff", "Wand"],
  "druidic focus": ["Druidic Focus", "Sprig of Mistletoe", "Totem", "Wooden Staff", "Yew Wand"],
  "spellbook": ["Spellbook", "Book (spellbook)"],
  "component pouch": ["Component Pouch"],
  "belt pouch": ["Pouch"],
  "common clothes": ["Clothes, Common", "Common Clothes"],
  "traveler's clothes": ["Clothes, Traveler's", "Traveler's Clothes"],
  "fine clothes": ["Clothes, Fine", "Fine Clothes"],
  "set of common clothes": ["Clothes, Common"],
  "set of fine clothes": ["Clothes, Fine"],
  "set of traveler's clothes": ["Clothes, Traveler's"],
  "rations": ["Rations (1 day)", "Rations"],
  "hempen rope": ["Rope, Hempen (50 feet)", "Rope"],
  "50 feet of hempen rope": ["Rope, Hempen (50 feet)"],
  "rope": ["Rope, Hempen (50 feet)", "Rope"],
  "torch": ["Torch"],
  "bolts": ["Crossbow Bolts (20)", "Bolts (20)", "Crossbow Bolts"],
  "arrows": ["Arrows (20)", "Arrows"],
  "quiver": ["Quiver"],
  "thieves' tools": ["Thieves' Tools", "Thieves' tools"],
  "healer's kit": ["Healer's Kit"],
  "potion of healing": ["Potion of Healing"],
  "chess set": ["Dragonchess Set", "Dragonchess set"],
  // Renamed in the 2024 Dungeon Master's Guide.
  "efficient quiver": ["Quiver of Ehlonna"],
  "iron bands": ["Iron Bands of Bilarro"],
  "robes": ["Robes"],
  "book": ["Book"],
};

export class ItemIndex {
  private byName = new Map<string, AElement[]>();
  private byKeep = new Map<string, AElement[]>();
  constructor(private reg: ARegistry) {
    for (const t of ITEM_TYPES) {
      for (const e of reg.ofType(t)) {
        if (e.compendiumHidden && !/pack|clothes|pouch/i.test(e.name)) continue;
        for (const [map, key] of [[this.byName, norm(e.name)], [this.byName, singular(norm(e.name))], [this.byKeep, normKeep(e.name)]] as const) {
          (map.get(key) ?? map.set(key, []).get(key)!).push(e);
        }
      }
    }
  }

  private pick(list: AElement[] | undefined, prefer: string): AElement | undefined {
    if (!list?.length) return undefined;
    const rank = (e: AElement) => (e.source === prefer ? 0 : 2) + (e.type === "Magic Item" ? 3 : 0) + (/^Background Equipment|^Class Equipment/.test(e.name) ? 5 : 0);
    return [...list].sort((a, b) => rank(a) - rank(b))[0];
  }

  /** Find an item by the words a rulebook uses for it. */
  find(text: string, prefer = ""): AElement | undefined {
    const keep = normKeep(text);
    const n = norm(text);
    const tries: (AElement | undefined)[] = [this.pick(this.byKeep.get(keep), prefer), this.pick(this.byName.get(n), prefer), this.pick(this.byName.get(singular(n)), prefer)];
    // Older books name armor "Leather" where the class list says "leather armor".
    if (/ armor$/.test(n)) tries.push(this.pick(this.byName.get(n.replace(/ armor$/, "")), prefer));
    for (const syn of SYNONYMS[n] ?? SYNONYMS[singular(n)] ?? []) tries.push(this.pick(this.byKeep.get(normKeep(syn)), prefer), this.pick(this.byName.get(norm(syn)), prefer));
    return tries.find(Boolean);
  }

  get registry() {
    return this.reg;
  }
}

/** "any simple weapon", "any martial melee weapon": which kind of weapon the player may pick. */
export function anyWeaponKind(text: string): { category: "simple" | "martial"; reach?: "melee" | "ranged" } | undefined {
  // "any martial weapon", "a martial weapon", "two martial weapons", "a simple melee weapon"
  const m = text.toLowerCase().replace(/^(any|a|an|one|two)\s+/, "").match(/^(simple|martial)( melee| ranged)? weapons?\b/);
  return m ? { category: m[1] as "simple" | "martial", reach: m[2] ? (m[2].trim() as "melee" | "ranged") : undefined } : undefined;
}

/** Weapons of a kind, for the player to pick from. */
export function weaponChoices(reg: ARegistry, kind: { category: "simple" | "martial"; reach?: "melee" | "ranged" }): AElement[] {
  const seen = new Map<string, AElement>();
  for (const w of reg.ofType("Weapon")) {
    const tags = `${w.supports.join(" ")} ${w.setters.proficiency?.value ?? ""}`.toLowerCase();
    if (!tags.includes(kind.category)) continue;
    const ranged = /ranged/.test(tags);
    if (kind.reach === "ranged" && !ranged) continue;
    if (kind.reach === "melee" && ranged) continue;
    const key = w.name.toLowerCase();
    if (!seen.has(key)) seen.set(key, w);
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Turn a reference into an item plus a quantity, using bundle sizes like "Arrows (20)". */
export function resolveRef(ref: ItemRef, idx: ItemIndex, prefer: string, picked?: string): ResolvedItem {
  const kind = anyWeaponKind(ref.text);
  if (kind) {
    const list = weaponChoices(idx.registry, kind);
    const el = (picked ? idx.registry.get(picked) : undefined) ?? list.find((w) => w.source === prefer) ?? list[0];
    if (el) return { el, name: el.name, qty: ref.qty };
  }
  // "wooden shield", "a worn holy symbol": the item is the last words without the description in front.
  const el = idx.find(ref.text, prefer) ?? (/^(wooden|worn|small|simple|common|fine)\s+/i.test(ref.text) ? idx.find(ref.text.replace(/^\S+\s+/, ""), prefer) : undefined);
  if (!el) {
    // Keep names short; the long form ("a trophy (a dagger, a broken blade...)") goes in the note.
    const short = ref.text.replace(/\s*\(.*$/, "").trim() || ref.text;
    return { name: short.replace(/^./, (c) => c.toUpperCase()), qty: ref.qty, note: ref.text !== short ? ref.text : undefined };
  }
  const bundle = el.name.match(/\((\d+)\)\s*$/);
  if (bundle && ref.qty >= parseInt(bundle[1], 10) && ref.qty % parseInt(bundle[1], 10) === 0 && !/^\d+$/.test(ref.text)) return { el, name: el.name, qty: ref.qty / parseInt(bundle[1], 10) };
  return { el, name: el.name, qty: ref.qty };
}

/** Contents of a pack (and packs inside it), as items. */
export function expandPack(el: AElement, reg: ARegistry, qty = 1, depth = 0): ResolvedItem[] {
  const out: ResolvedItem[] = [];
  for (const x of el.extract ?? []) {
    const inner = reg.get(x.id);
    if (!inner) {
      out.push({ name: x.id, qty: x.amount * qty });
      continue;
    }
    if (inner.extract?.length && depth < 3) out.push(...expandPack(inner, reg, x.amount * qty, depth + 1));
    else out.push({ el: inner, name: inner.name, qty: x.amount * qty });
  }
  return out;
}

/** All items a variant gives, with chosen options for older style groups. */
export function variantItems(v: EquipVariant, picks: number[], idx: ItemIndex, prefer: string, openPacks: boolean, weaponPicks: Record<string, string> = {}): ResolvedItem[] {
  const out: ResolvedItem[] = [];
  const reg = idx.registry;
  const add = (r: ResolvedItem) => {
    if (openPacks && r.el?.extract?.length) out.push(...expandPack(r.el, reg, r.qty));
    else out.push(r);
  };
  if (v.packId && reg.get(v.packId)) {
    out.push(...expandPack(reg.get(v.packId)!, reg));
    // The ready-made pack can leave something out (armor, for one); anything the text lists that it lacks is added.
    // The same item from another book ("Clothes, Traveler's" in the pack, "Traveler's Clothes" from 5e.tools) counts
    // as the one in the pack: by id, or by its words in any order.
    const words = (n: string) => norm(n).split(/[\s,]+/).filter(Boolean).sort().join(" ");
    const have = new Set(out.flatMap((i) => (i.el ? [i.el.id, words(i.el.name)] : [words(i.name)])));
    const isIn = (x: ResolvedItem) => !!x.el && (have.has(x.el.id) || have.has(words(x.el.name)));
    for (const ref of v.fixed) {
      const r = resolveRef(ref, idx, prefer);
      const inside = r.el?.extract?.length ? expandPack(r.el, reg, r.qty).every(isIn) : isIn(r);
      if (!inside) add(r);
    }
  } else for (const ref of v.fixed) add(resolveRef(ref, idx, prefer));
  v.choices.forEach((g, i) => {
    const oi = Math.min(picks[i] ?? 0, g.options.length - 1);
    (g.options[oi] ?? []).forEach((ref, ri) => add(resolveRef(ref, idx, prefer, weaponPicks[`${i}:${oi}:${ri}`])));
  });
  return out;
}

// ---------------------------------------------------------------- applying to the character

export function addToInventory(ch: Character, items: ResolvedItem[], gp = 0): Character {
  const inv: InvItem[] = [...ch.inventory];
  for (const it of items) {
    // Same item again adds to the quantity, worn or not, and in the open before a container.
    const same = (i: InvItem) => (it.el ? i.id === it.el.id && !i.custom : !i.id && i.custom?.name === it.name);
    const stack = inv.find((i) => same(i) && !i.container) ?? inv.find(same);
    if (stack) {
      stack.qty += it.qty;
      continue;
    }
    inv.push({ uid: uid(), id: it.el?.id ?? "", qty: it.qty, equipped: false, attuned: false, custom: it.el ? undefined : { name: it.name, description: it.note }, ...(it.pending && !it.el ? { pending: it.pending } : {}) });
  }
  return { ...ch, inventory: inv, coins: { ...ch.coins, gp: ch.coins.gp + gp } };
}

/** What an add put in, so it can be taken back out when another option replaces it. */
export function ledgerOf(items: ResolvedItem[], gp: number): { items: { id: string; name: string; qty: number }[]; gp: number } {
  return { items: items.map((i) => ({ id: i.el?.id ?? "", name: i.name, qty: i.qty })), gp };
}

/** Takes back what the given labels added: the item counts and the gold. Items that were used up or sold are left alone. */
export function removeAdded(ch: Character, labels: string[]): Character {
  let inv: InvItem[] = ch.inventory.map((i) => ({ ...i }));
  let gp = ch.coins.gp;
  for (const l of labels) {
    const entry = ch.equipmentLedger?.[l];
    if (!entry) continue;
    gp -= entry.gp;
    for (const it of entry.items) {
      let left = it.qty;
      for (const i of inv) {
        if (left <= 0) break;
        const match = it.id ? i.id === it.id : !i.id && i.custom?.name === it.name;
        if (!match) continue;
        const take = Math.min(i.qty, left);
        i.qty -= take;
        left -= take;
      }
      inv = inv.filter((i) => i.qty > 0);
    }
  }
  const ledger = { ...(ch.equipmentLedger ?? {}) };
  for (const l of labels) delete ledger[l];
  return { ...ch, inventory: inv, coins: { ...ch.coins, gp: Math.max(0, gp) }, equipmentLedger: ledger, equipmentAdded: (ch.equipmentAdded ?? []).filter((x) => !labels.includes(x)) };
}

/** Wear the first armor and shield, and wield weapons while there are hands free, when nothing is equipped yet. */
export function autoEquip(ch: Character, reg: ARegistry): Character {
  const inv = ch.inventory.map((i) => ({ ...i }));
  const isShield = (e: AElement) => e.setters.armor?.value.toLowerCase() === "shield" || /shield/i.test(e.name);
  let armor = inv.some((i) => i.equipped && i.id && reg.get(i.id)?.type === "Armor" && !isShield(reg.get(i.id)!));
  let shield = inv.some((i) => i.equipped && i.id && reg.get(i.id)?.type === "Armor" && isShield(reg.get(i.id)!));
  let hands = handsUsed(inv, reg);
  // Only armor the character is trained in is put on: untrained armor gives disadvantage and stops spellcasting.
  // (Older class gear reads "chain mail (if proficient)" for this reason.)
  const trained = buildSheet(resolve(ch, reg)).proficiencies.armor.join(" ").toLowerCase();
  const canWear = (e: AElement) => {
    if (isShield(e)) return /shield/.test(trained);
    const kind = (e.setters.armor?.value ?? "").toLowerCase();
    return !kind || trained.includes(kind) || trained.includes("all armor");
  };
  for (const i of inv) {
    const e = i.id ? reg.get(i.id) : undefined;
    if (!e || i.equipped) continue;
    if (e.type === "Armor" && !canWear(e)) continue;
    if (e.type === "Armor" && isShield(e) && !shield && hands + 1 <= HANDS) {
      i.equipped = true;
      shield = true;
      hands++;
    } else if (e.type === "Armor" && !isShield(e) && !armor) {
      i.equipped = true;
      armor = true;
    } else if (e.type === "Weapon" && e.setters.damage && hands + handsFor(i, e) <= HANDS) {
      i.equipped = true;
      hands += handsFor(i, e);
    }
  }
  return { ...ch, inventory: inv };
}

// ---------------------------------------------------------------- packs and common gear

/** Adventuring packs such as the Explorer's Pack, as items that open into their contents. */
export function adventuringPacks(reg: ARegistry, prefer: string): AElement[] {
  const seen = new Map<string, AElement>();
  for (const e of reg.ofType("Item")) {
    if (!e.extract?.length || /^(Background|Class) Equipment Pack/.test(e.name)) continue;
    const key = norm(e.name);
    const have = seen.get(key);
    if (!have || (e.source === prefer && have.source !== prefer)) seen.set(key, e);
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const COMMON = [
  "Backpack", "Bedroll", "Blanket", "Candle", "Crowbar", "Grappling Hook", "Hammer", "Healer's Kit", "Lantern, Hooded", "Mess Kit", "Oil (flask)", "Pouch", "Rations (1 day)",
  "Rope, Hempen (50 feet)", "Tinderbox", "Torch", "Waterskin", "Potion of Healing", "Thieves' Tools", "Component Pouch", "Arcane Focus", "Holy Symbol", "Spellbook", "Shield",
  "Light Crossbow", "Crossbow Bolts (20)", "Arrows (20)", "Quiver", "Quarterstaff", "Dagger", "Shortsword", "Longsword", "Shortbow", "Handaxe", "Javelin", "Leather Armor", "Chain Mail",
];

/** The usual odds and ends a player adds, limited to what the loaded content has. */
export function commonGear(reg: ARegistry, prefer: string): AElement[] {
  const idx = new ItemIndex(reg);
  const out: AElement[] = [];
  const seen = new Set<string>();
  for (const name of COMMON) {
    const el = idx.find(name, prefer);
    if (el && !seen.has(el.id)) {
      seen.add(el.id);
      out.push(el);
    }
  }
  return out;
}

/** What a spellcasting focus item is for, so "Crystal" or "Amulet" reads as gear and not a mystery. Only the specific kinds, not the group name itself. */
export function focusNote(name: string): string | undefined {
  const n = name.trim().toLowerCase();
  for (const [group, kinds] of Object.entries(SYNONYMS)) {
    if (!/focus|symbol/.test(group)) continue;
    if (kinds.slice(1).some((k) => k.toLowerCase() === n)) return group;
  }
  return undefined;
}

/**
 * The items a player can pick for gear that names only a kind: the standard tools of that kind (TOOL_KINDS), plus
 * any item of the content filed as a musical instrument, as items of the content, one per name.
 */
export function genericOptions(reg: ARegistry, kind: GenericKind, prefer = ""): AElement[] {
  const idx = new ItemIndex(reg);
  const out = new Map<string, AElement>();
  for (const n of TOOL_KINDS[kind] ?? []) { const el = idx.find(n, prefer); if (el) out.set(el.name.toLowerCase(), el); }
  if (kind === "instrument") for (const el of reg.ofType("Item")) if (/musical instrument/i.test(el.setters.category?.value ?? "") && !el.compendiumHidden && !out.has(el.name.toLowerCase())) out.set(el.name.toLowerCase(), el);
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * "Gaming Set (same as above)", "Musical Instrument (one of your choice)" and "Artisan's Tools (same as above)":
 * the item the character chose a proficiency in, when the starting gear names only the kind.
 */
export function resolveChosenTools(items: ResolvedItem[], activeIds: Iterable<string>, reg: ARegistry, prefer = ""): ResolvedItem[] {
  const idx = new ItemIndex(reg);
  const chosen: Record<string, string[]> = { gaming: [], instrument: [], artisan: [] };
  for (const id of activeIds) {
    const el = reg.get(id);
    if (!el || el.type !== "Proficiency") continue;
    const inner = /\((.*)\)\s*$/.exec(el.name)?.[1];
    if (!inner) continue;
    if (/GAMING/.test(id)) chosen.gaming.push(inner);
    else if (/INSTRUMENT/.test(id)) chosen.instrument.push(inner);
    else if (/ARTISAN/.test(id)) chosen.artisan.push(inner);
  }
  const used: Record<string, number> = {};
  return items.map((it) => {
    if (it.el) return it;
    // "Tool you choose for this background's tool proficiency" (Inheritor): whichever tool was chosen.
    const kind = /gaming set/i.test(it.name) ? "gaming" : /musical instrument/i.test(it.name) ? "instrument" : /artisan/i.test(it.name) ? "artisan" : /\btools?\b.*\b(choose|choice)\b.*\bproficien/i.test(it.name) ? "any" : undefined;
    if (kind === "any") chosen.any = [...chosen.gaming, ...chosen.instrument, ...chosen.artisan];
    const pick = kind ? chosen[kind][used[kind] ?? 0] : undefined;
    // Nothing the character took settles it: an open choice of that kind, not the words as an item.
    if (kind && kind !== "any" && !pick) return { ...it, pending: kind };
    if (!kind || !pick) return it;
    const el = idx.find(pick, prefer);
    if (!el) return it;
    used[kind] = (used[kind] ?? 0) + 1;
    return { ...it, el, name: el.name };
  });
}
