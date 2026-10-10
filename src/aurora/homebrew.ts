/**
 * The homebrew builder: forms for items, spells, feats and features that turn into Aurora element XML.
 * The entries are kept as plain data so they can be edited again later; the XML is made from them each time.
 */

export type HbKind = "weapon" | "armor" | "item" | "magic" | "spell" | "feat" | "feature";

export const HB_KINDS: { kind: HbKind; label: string; hint: string }[] = [
  { kind: "weapon", label: "Weapon", hint: "A sword, bow or anything that attacks." },
  { kind: "armor", label: "Armor or shield", hint: "Sets armor class when worn." },
  { kind: "item", label: "Item", hint: "Gear, tools, trinkets." },
  { kind: "magic", label: "Magic item", hint: "Rarity, attunement and bonuses while worn." },
  { kind: "spell", label: "Spell", hint: "Appears on the lists of the classes you name." },
  { kind: "feat", label: "Feat", hint: "Can be taken wherever a feat is chosen." },
  { kind: "feature", label: "Feature or trait", hint: "Add it to a character on Manage > Manual additions." },
];

export type EffectKind = "ability" | "skill" | "save" | "ac" | "speed" | "hp" | "initiative" | "attack" | "damage";

export const EFFECTS: { kind: EffectKind; label: string; needsTarget?: "ability" | "skill" }[] = [
  { kind: "ability", label: "Ability score", needsTarget: "ability" },
  { kind: "save", label: "Saving throw", needsTarget: "ability" },
  { kind: "skill", label: "Skill bonus", needsTarget: "skill" },
  { kind: "ac", label: "Armor class" },
  { kind: "speed", label: "Speed (feet)" },
  { kind: "hp", label: "Hit points" },
  { kind: "initiative", label: "Initiative" },
  { kind: "attack", label: "All attack rolls" },
  { kind: "damage", label: "All damage rolls" },
];

export const ABILITY_NAMES = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
export const SKILL_NAMES = ["acrobatics", "animal handling", "arcana", "athletics", "deception", "history", "insight", "intimidation", "investigation", "medicine", "nature", "perception", "performance", "persuasion", "religion", "sleight of hand", "stealth", "survival"];
export const SCHOOLS = ["Abjuration", "Conjuration", "Divination", "Enchantment", "Evocation", "Illusion", "Necromancy", "Transmutation"];
export const DAMAGE_TYPES = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];
export const WEAPON_PROPERTIES = ["finesse", "light", "heavy", "two-handed", "thrown", "reach", "ammunition", "loading"];

export interface HbEffect {
  kind: EffectKind;
  target?: string;
  value: number;
}

export interface HbEntry {
  id: string;
  kind: HbKind;
  name: string;
  description: string;
  /** Kind-specific values, all stored as text or booleans so forms stay simple. */
  data: Record<string, string | boolean>;
  effects: HbEffect[];
}

export function newEntry(kind: HbKind): HbEntry {
  const defaults: Record<HbKind, Record<string, string | boolean>> = {
    weapon: { category: "martial", range: "melee", damage: "1d8", damageType: "slashing", versatile: "", properties: "", magic: "0", weight: "3", cost: "15" },
    armor: { armor: "medium", ac: "14", stealth: false, strength: "", magic: "0", weight: "20", cost: "50" },
    item: { weight: "1", cost: "1", category: "Adventuring Gear" },
    magic: { rarity: "Uncommon", attunement: false, weight: "1", slot: "" },
    spell: { level: "1", school: "Evocation", time: "1 action", range: "60 feet", duration: "Instantaneous", v: true, s: true, m: false, material: "", concentration: false, ritual: false, classes: "", higher: "" },
    feat: { prerequisite: "", level: "", origin: false, usage: "", action: "" },
    feature: { usage: "", action: "" },
  };
  return { id: `ID_HB_${kind.toUpperCase()}_${Math.random().toString(36).slice(2, 9).toUpperCase()}`, kind, name: "", description: "", data: defaults[kind], effects: [] };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const paras = (t: string) => t.trim().split(/\n{2,}|\n/).filter(Boolean).map((p) => `<p>${esc(p.trim())}</p>`).join("") || "<p></p>";
const num = (v: unknown) => (Number.isFinite(Number(v)) && String(v).trim() !== "" ? Number(v) : 0);
const bool = (v: unknown) => v === true || v === "true";
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Problems that would make the element useless. Empty when the entry is fine. */
export function validate(e: HbEntry): string[] {
  const out: string[] = [];
  if (!e.name.trim()) out.push("Give it a name.");
  if (e.kind === "weapon" && !/^\d+d\d+([+-]\d+)?$/.test(str(e.data.damage).replace(/\s+/g, ""))) out.push("Damage should look like 1d8.");
  if (e.kind === "weapon" && str(e.data.versatile) && !/^\d+d\d+$/.test(str(e.data.versatile))) out.push("Versatile damage should look like 1d10.");
  if (e.kind === "armor" && !(num(e.data.ac) > 0)) out.push("Armor class must be a number above 0.");
  if (e.kind === "spell" && !(num(e.data.level) >= 0 && num(e.data.level) <= 9)) out.push("Spell level is 0 to 9.");
  if (e.kind === "spell" && !str(e.data.classes)) out.push("Name at least one class so the spell shows up on a list.");
  for (const f of e.effects) if (!Number.isFinite(f.value)) out.push("An effect has no number.");
  return out;
}

function effectRules(effects: HbEffect[]): string[] {
  const rules: string[] = [];
  for (const f of effects) {
    if (!f.value) continue;
    const v = String(f.value);
    switch (f.kind) {
      case "ability": rules.push(`<stat name="${esc(f.target ?? "strength")}" value="${v}" />`); break;
      case "save": rules.push(`<stat name="${esc(f.target ?? "strength")}:save" value="${v}" />`); break;
      case "skill": rules.push(`<stat name="${esc(f.target ?? "athletics")}" value="${v}" />`); break;
      case "ac": rules.push(`<stat name="ac" value="${v}" />`); break;
      case "speed": rules.push(`<stat name="speed" value="${v}" />`); break;
      case "hp": rules.push(`<stat name="hp" value="${v}" />`); break;
      case "initiative": rules.push(`<stat name="initiative" value="${v}" />`); break;
      case "attack": rules.push(`<stat name="attack" value="${v}" />`); break;
      case "damage": rules.push(`<stat name="damage" value="${v}" />`); break;
    }
  }
  return rules;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function usageSheet(desc: string, usage: string, action: string): string {
  if (!usage && !action) return "";
  const attrs = [`display="true"`, usage ? `usage="${esc(usage)}"` : "", action ? `action="${esc(action)}"` : ""].filter(Boolean).join(" ");
  return `\n\t\t<sheet ${attrs}><description>${esc(desc.replace(/\s+/g, " ").trim())}</description></sheet>`;
}

export function entryXml(e: HbEntry, source: string): string {
  const d = e.data;
  const head = (type: string) => `\t<element name="${esc(e.name.trim())}" type="${type}" source="${esc(source)}" id="${esc(e.id)}">`;
  const setter = (name: string, value: string, attrs = "") => `<set name="${name}"${attrs ? " " + attrs : ""}>${esc(value)}</set>`;
  const rules = effectRules(e.effects);
  const rulesXml = (extra: string[] = []) => {
    const all = [...extra, ...rules];
    return all.length ? `\n\t\t<rules>\n${all.map((r) => `\t\t\t${r}`).join("\n")}\n\t\t</rules>` : "";
  };

  switch (e.kind) {
    case "weapon": {
      const props = str(d.properties).split(",").map((p) => p.trim()).filter(Boolean);
      const tags = [
        `ID_INTERNAL_WEAPON_CATEGORY_${str(d.category) === "simple" ? "SIMPLE" : "MARTIAL"}_${str(d.range) === "ranged" ? "RANGED" : "MELEE"}`,
        ...props.map((p) => `ID_INTERNAL_WEAPON_PROPERTY_${p.toUpperCase().replace(/[^A-Z]+/g, "_")}`),
        str(d.damageType) ? `ID_INTERNAL_DAMAGE_TYPE_${str(d.damageType).toUpperCase()}` : "",
      ].filter(Boolean);
      const magic = num(d.magic);
      const set = [
        setter("category", "Weapons"),
        setter("cost", String(num(d.cost)), `currency="gp"`),
        setter("weight", `${num(d.weight)} lb.`, `lb="${num(d.weight)}"`),
        setter("slot", props.includes("two-handed") ? "twohand" : "onehand"),
        setter("damage", str(d.damage).replace(/\s+/g, ""), `type="${esc(str(d.damageType) || "slashing")}"`),
        str(d.versatile) ? setter("versatile", str(d.versatile)) : "",
        setter("proficiency", str(d.category) === "simple" ? "ID_PROFICIENCY_WEAPON_PROFICIENCY_SIMPLE_WEAPONS" : "ID_PROFICIENCY_WEAPON_PROFICIENCY_MARTIAL_WEAPONS"),
        magic ? setter("attackBonus", String(magic)) : "",
        magic ? setter("damageBonus", String(magic)) : "",
      ].filter(Boolean);
      return `${head("Weapon")}\n\t\t<supports>${tags.join(", ")}</supports>\n\t\t<description>${paras(e.description)}</description>\n\t\t<setters>${set.join("")}</setters>${rulesXml()}\n\t</element>`;
    }
    case "armor": {
      const kind = str(d.armor) || "medium";
      const magic = num(d.magic);
      const ac = num(d.ac) + magic;
      const set = [
        setter("category", "Armor"),
        setter("cost", String(num(d.cost)), `currency="gp"`),
        setter("weight", `${num(d.weight)} lb.`, `lb="${num(d.weight)}"`),
        setter("slot", kind === "shield" ? "offhand" : "body"),
        setter("armor", kind.charAt(0).toUpperCase() + kind.slice(1)),
        setter("armorClass", String(ac)),
        kind === "heavy" || bool(d.stealth) ? setter("stealth", "Disadvantage") : "",
        str(d.strength) ? setter("strength", str(d.strength)) : "",
        setter("proficiency", kind === "shield" ? "ID_PROFICIENCY_ARMOR_PROFICIENCY_SHIELDS" : `ID_PROFICIENCY_ARMOR_PROFICIENCY_${kind.toUpperCase()}_ARMOR`),
      ].filter(Boolean);
      const base = kind === "shield" ? `<stat name="ac:shield" value="${ac}" bonus="shield" />` : `<stat name="ac:armored:armor" value="${ac}" />`;
      return `${head("Armor")}\n\t\t<supports>ID_INTERNAL_ARMOR_GROUP_${kind.toUpperCase()}</supports>\n\t\t<description>${paras(e.description)}</description>\n\t\t<setters>${set.join("")}</setters>${rulesXml([base])}\n\t</element>`;
    }
    case "item":
    case "magic": {
      const set = [
        setter("category", e.kind === "magic" ? "Wondrous Item" : str(d.category) || "Adventuring Gear"),
        e.kind === "magic" ? setter("rarity", str(d.rarity) || "Uncommon") : setter("cost", String(num(d.cost)), `currency="gp"`),
        e.kind === "magic" && bool(d.attunement) ? setter("attunement", "true") : "",
        e.kind === "magic" && str(d.slot) ? setter("slot", str(d.slot)) : "",
        setter("weight", `${num(d.weight)} lb.`, `lb="${num(d.weight)}"`),
      ].filter(Boolean);
      return `${head(e.kind === "magic" ? "Magic Item" : "Item")}\n\t\t<description>${paras(e.description)}</description>\n\t\t<setters>${set.join("")}</setters>${rulesXml()}\n\t</element>`;
    }
    case "spell": {
      const comps = [bool(d.v), bool(d.s), bool(d.m)];
      const set = [
        setter("level", String(num(d.level))),
        setter("school", str(d.school) || "Evocation"),
        setter("time", str(d.time) || "1 action"),
        setter("duration", str(d.duration) || "Instantaneous"),
        setter("range", str(d.range) || "Self"),
        setter("hasVerbalComponent", String(comps[0])),
        setter("hasSomaticComponent", String(comps[1])),
        setter("hasMaterialComponent", String(comps[2])),
        comps[2] && str(d.material) ? setter("materialComponent", str(d.material)) : "",
        setter("isConcentration", String(bool(d.concentration))),
        setter("isRitual", String(bool(d.ritual))),
      ].filter(Boolean);
      const higher = str(d.higher);
      const supports = str(d.classes).split(",").map((c) => c.trim()).filter(Boolean).join(", ");
      return `${head("Spell")}\n\t\t<supports>${esc(supports)}</supports>\n\t\t<description>${paras(e.description)}${higher ? paras(`At higher levels. ${higher}`) : ""}</description>\n\t\t<setters>${set.join("")}</setters>\n\t</element>`;
    }
    case "feat": {
      const reqs = [num(d.level) > 0 ? `[level:${num(d.level)}]` : "", str(d.requirements)].filter(Boolean).join(",");
      const pre = str(d.prerequisite);
      return `${head("Feat")}\n\t\t<supports>${bool(d.origin) ? "Origin" : "General"}</supports>${reqs ? `\n\t\t<requirements>${esc(reqs)}</requirements>` : ""}${pre ? `\n\t\t<prerequisite>${esc(pre)}</prerequisite>` : ""}\n\t\t<description>${paras(e.description)}</description>${usageSheet(e.description, str(d.usage), str(d.action))}${rulesXml()}\n\t</element>`;
    }
    case "feature":
      return `${head("Class Feature")}\n\t\t<description>${paras(e.description)}</description>${usageSheet(e.description, str(d.usage), str(d.action)) || `\n\t\t<sheet display="true"><description>${esc(e.description.replace(/\s+/g, " ").trim())}</description></sheet>`}${rulesXml()}\n\t</element>`;
  }
}

export function toXml(entries: HbEntry[], source = "Homebrew"): string {
  const ok = entries.filter((e) => e.name.trim());
  return `<?xml version="1.0" encoding="utf-8"?>\n<elements>\n${ok.map((e) => entryXml(e, source)).join("\n")}\n</elements>\n`;
}

export { slug };
