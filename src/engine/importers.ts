/**
 * Character importers for Foundry VTT (dnd5e system actor JSON) and Roll20
 * (D&D 5e OGL sheet attributes as JSON). Both are best effort: the formats
 * change between versions, so the importer reads what it recognises, matches
 * names against loaded content, and keeps everything else as plain elements
 * so nothing from the source character is lost.
 */
import { newCharacter } from "./compute";
import type { Registry } from "./registry";
import { ABILITIES, SKILLS, type Ability, type Character, type Element, type ElementType, type Rule } from "./types";

export interface CharacterImport {
  character: Character;
  /** Elements created for things the loaded content did not contain. */
  elements: Element[];
  report: { format: string; matched: string[]; created: string[]; warnings: string[] };
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function detectCharacterFormat(data: unknown): "foundry" | "roll20" | "charforge" | "unknown" {
  const d = data as Json;
  if (!d || typeof d !== "object") return "unknown";
  if (d.abilityBase && d.extras) return "charforge";
  if (d.system && Array.isArray(d.items)) return "foundry";
  if (Array.isArray(d.attribs) || Array.isArray(d.character?.attribs) || Array.isArray(d.attributes)) return "roll20";
  return "unknown";
}

// ---------- shared helpers ----------

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function htmlToText(html: unknown): string {
  if (typeof html !== "string") return "";
  return html
    .replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1")
    .replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1")
    .replace(/\[\[\/?\w*\s*([^\]]*?)\]\]\{([^}]*)\}/g, "$2")
    .replace(/\[\[\/?\w*\s*([^\]]*?)\]\]/g, "$1")
    .replace(/&Reference\[([^\]]*)\]/g, "$1")
    .replace(/<\/(p|li|h\d|div|tr)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function findByName(reg: Registry, type: ElementType | ElementType[], name: string): Element | undefined {
  const want = normalize(name);
  if (!want) return undefined;
  const types = Array.isArray(type) ? type : [type];
  const hits = reg.all().filter((e) => types.includes(e.type) && normalize(e.name) === want);
  // Prefer 2024 content when both editions are loaded.
  return hits.find((e) => /24|2024/.test(e.id)) ?? hits[hits.length - 1];
}

class Builder {
  character: Character = newCharacter();
  elements: Element[] = [];
  matched: string[] = [];
  created: string[] = [];
  warnings: string[] = [];
  private seen = new Set<string>();

  constructor(private reg: Registry, private format: string) {
    // Imported scores already include any background increase.
    this.character.backgroundAsi = { mode: "included" };
  }

  /** Match by name or create a plain element; returns the id to use. */
  resolve(type: ElementType, name: string, fallback: Partial<Element> = {}, alsoTypes: ElementType[] = []): string {
    const found = findByName(this.reg, [type, ...alsoTypes], name);
    if (found) {
      this.matched.push(`${found.name} (${found.type})`);
      return found.id;
    }
    const id = `imported-${type}-${slug(name)}`;
    if (!this.seen.has(id)) {
      this.seen.add(id);
      this.elements.push({ id, type, name, ...fallback });
      this.created.push(`${name} (${type})`);
    }
    return id;
  }

  addExtra(id: string): void {
    if (!this.character.extras.includes(id)) this.character.extras.push(id);
  }

  finish(): CharacterImport {
    return {
      character: this.character,
      elements: this.elements,
      report: { format: this.format, matched: this.matched, created: this.created, warnings: this.warnings },
    };
  }
}

function proficiencyElement(b: Builder, name: string, rules: Rule[]): void {
  if (rules.length === 0) return;
  const id = b.resolve("custom", `Imported proficiencies (${name})`, {
    description: "Proficiencies carried over from the imported character.",
    rules,
  });
  b.addExtra(id);
}

// ---------- Foundry VTT ----------

const FOUNDRY_SKILLS: Record<string, string> = {
  acr: "acrobatics", ani: "animal-handling", arc: "arcana", ath: "athletics", dec: "deception",
  his: "history", ins: "insight", itm: "intimidation", inv: "investigation", med: "medicine",
  nat: "nature", prc: "perception", prf: "performance", per: "persuasion", rel: "religion",
  slt: "sleight-of-hand", ste: "stealth", sur: "survival",
};

const SCHOOLS: Record<string, string> = {
  abj: "Abjuration", con: "Conjuration", div: "Divination", enc: "Enchantment",
  evo: "Evocation", ill: "Illusion", nec: "Necromancy", trs: "Transmutation",
};

const cap = (s: unknown) => (typeof s === "string" && s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

function foundryActivation(sys: Json): string {
  const a = sys.activation ?? sys.activities?.[Object.keys(sys.activities ?? {})[0]]?.activation;
  if (!a?.type) return "";
  return `${a.value ?? a.cost ?? ""} ${cap(a.type)}`.trim();
}

function foundrySpellMeta(sys: Json): Record<string, string> {
  const meta: Record<string, string> = { level: String(sys.level ?? 0) };
  const school = SCHOOLS[sys.school] ?? cap(sys.school);
  if (school) meta.school = school;
  const time = foundryActivation(sys);
  if (time) meta.time = time;
  const r = sys.range;
  if (r && (r.value || r.units)) meta.range = `${r.value ?? ""} ${r.units ?? ""}`.trim().replace(/^self$/i, "Self");
  const d = sys.duration;
  if (d && d.units) meta.duration = d.units === "inst" ? "Instantaneous" : `${d.value ?? ""} ${d.units}`.trim();
  const props: string[] = Array.isArray(sys.properties) ? sys.properties : sys.properties ? Object.keys(sys.properties) : [];
  const comps = sys.components ?? {};
  if (props.includes("vocal") || comps.vocal) meta.hasVerbalComponent = "true";
  if (props.includes("somatic") || comps.somatic) meta.hasSomaticComponent = "true";
  if (props.includes("material") || comps.material) meta.hasMaterialComponent = "true";
  const mat = sys.materials?.value;
  if (mat) meta.materialComponent = String(mat);
  if (props.includes("concentration") || comps.concentration || d?.concentration) meta.isConcentration = "true";
  if (props.includes("ritual") || comps.ritual) meta.isRitual = "true";
  return meta;
}

function foundryItemMeta(sys: Json): Record<string, string> {
  const meta: Record<string, string> = {};
  const parts = sys.damage?.parts;
  if (Array.isArray(parts) && parts[0]?.[0]) meta.damage = `${parts[0][0]} ${parts[0][1] ?? ""}`.trim();
  const base = sys.damage?.base;
  if (base?.denomination) {
    meta.damage = `${base.number ?? 1}d${base.denomination} ${(base.types ?? []).join("/")}`.trim();
  }
  const w = sys.weight?.value ?? sys.weight;
  if (typeof w === "number" && w > 0) meta.weight = `${w} lb.`;
  if (sys.price?.value) meta.cost = `${sys.price.value} ${sys.price.denomination ?? "gp"}`;
  if (sys.quantity && sys.quantity > 1) meta.quantity = String(sys.quantity);
  const ac = sys.armor?.value;
  if (typeof ac === "number" && ac > 0) meta.armor = `AC ${ac}`;
  return meta;
}

export function importFoundry(data: Json, reg: Registry): CharacterImport {
  const b = new Builder(reg, "Foundry VTT (dnd5e)");
  const sys: Json = data.system ?? {};
  const ch = b.character;
  ch.name = String(data.name ?? "");

  for (const a of ABILITIES) {
    const v = Number(sys.abilities?.[a]?.value);
    if (Number.isFinite(v)) ch.abilityBase[a] = v;
  }

  const items: Json[] = Array.isArray(data.items) ? data.items : [];
  let level = 0;
  for (const it of items) {
    const type = it.type as string;
    const name = String(it.name ?? "");
    const isys: Json = it.system ?? {};
    const description = htmlToText(isys.description?.value);
    if (!name) continue;
    switch (type) {
      case "class": {
        level += Number(isys.levels) || 0;
        const hitDie = Number(String(isys.hitDice ?? isys.hd?.denomination ?? "").replace(/\D/g, "")) || undefined;
        if (!ch.class) {
          // The first class listed is treated as the main class.
          ch.class = b.resolve("class", name, { description, hitDie });
        } else {
          b.warnings.push(`Multiclass "${name}" is not supported yet; it was kept as a feature.`);
          b.addExtra(b.resolve("feature", `${name} (multiclass, level ${isys.levels ?? "?"})`, { description }));
        }
        break;
      }
      case "subclass":
        b.addExtra(b.resolve("subclass", name, { description }));
        break;
      case "race":
        ch.species = b.resolve("species", name, { description });
        break;
      case "background":
        ch.background = b.resolve("background", name, { description });
        break;
      case "feat":
        b.addExtra(b.resolve(isys.type?.value === "class" || isys.type?.value === "race" ? "feature" : "feat", name, { description }, ["feat", "feature"]));
        break;
      case "spell":
        b.addExtra(b.resolve("spell", name, { description, meta: foundrySpellMeta(isys) }));
        break;
      case "weapon":
      case "equipment":
      case "consumable":
      case "tool":
      case "loot":
      case "container":
        b.addExtra(b.resolve("item", name, { description, meta: foundryItemMeta(isys) }));
        break;
      default:
        b.warnings.push(`Skipped "${name}" (${type})`);
    }
  }

  ch.level = Math.min(20, Math.max(1, level || Number(sys.details?.level) || 1));
  if (!ch.class) b.warnings.push("No class found in the file.");

  const rules: Rule[] = [];
  for (const a of ABILITIES) if (sys.abilities?.[a]?.proficient) rules.push({ kind: "proficiency", target: `save:${a}` });
  for (const [key, id] of Object.entries(FOUNDRY_SKILLS)) {
    const v = Number(sys.skills?.[key]?.value);
    if (v >= 2) rules.push({ kind: "proficiency", target: `skill:${id}`, level: "expertise" });
    else if (v >= 1) rules.push({ kind: "proficiency", target: `skill:${id}` });
  }
  proficiencyElement(b, ch.name || "character", rules);

  const bio = htmlToText(sys.details?.biography?.value);
  if (bio) ch.notes = bio.slice(0, 1500);
  return b.finish();
}

// ---------- Roll20 ----------

interface Attrib { name: string; current?: unknown; max?: unknown }

function roll20Attribs(data: Json): Attrib[] {
  const raw = data.attribs ?? data.character?.attribs ?? data.attributes;
  if (Array.isArray(raw)) return raw as Attrib[];
  return [];
}

const R20_ABILITY: Record<Ability, string> = {
  str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma",
};

export function importRoll20(data: Json, reg: Registry): CharacterImport {
  const b = new Builder(reg, "Roll20 (D&D 5e OGL sheet)");
  const ch = b.character;
  const attribs = roll20Attribs(data);
  const flat = new Map<string, Attrib>();
  const rows = new Map<string, Map<string, Record<string, string>>>(); // section -> rowId -> fields
  const rowRe = /^repeating_([a-z0-9-]+?)_(-[A-Za-z0-9_-]{19})_(.+)$/;
  const rowFallback = /^repeating_([a-z0-9-]+?)_(-[^_]+)_(.+)$/;

  for (const a of attribs) {
    if (!a || typeof a.name !== "string") continue;
    const m = rowRe.exec(a.name) ?? rowFallback.exec(a.name);
    if (m) {
      const [, section, id, field] = m;
      const sec = rows.get(section) ?? rows.set(section, new Map()).get(section)!;
      const row = sec.get(id) ?? sec.set(id, {}).get(id)!;
      row[field] = String(a.current ?? "");
    } else {
      flat.set(a.name, a);
    }
  }
  const val = (name: string) => String(flat.get(name)?.current ?? "").trim();

  ch.name = String(data.name ?? data.character?.name ?? val("character_name") ?? "");
  for (const a of ABILITIES) {
    const n = Number(val(R20_ABILITY[a]));
    if (Number.isFinite(n) && n > 0) ch.abilityBase[a] = n;
  }

  const classText = val("class");
  const lvl = Number(val("base_level") || val("level")) || 1;
  ch.level = Math.min(20, Math.max(1, lvl));
  if (classText) ch.class = b.resolve("class", classText.replace(/\d+/g, "").trim());
  else b.warnings.push("No class found in the file.");
  const race = val("race");
  if (race) ch.species = b.resolve("species", race);
  const bg = val("background");
  if (bg) ch.background = b.resolve("background", bg);

  const rules: Rule[] = [];
  for (const a of ABILITIES) if (val(`${R20_ABILITY[a]}_save_prof`)) rules.push({ kind: "proficiency", target: `save:${a}` });
  for (const skill of Object.keys(SKILLS)) {
    const key = skill.replace(/-/g, "_");
    if (!val(`${key}_prof`)) continue;
    const expertise = val(`${key}_type`) === "2" || /\*\s*2/.test(val(`${key}_prof`));
    rules.push({ kind: "proficiency", target: `skill:${skill}`, ...(expertise ? { level: "expertise" as const } : {}) });
  }
  proficiencyElement(b, ch.name || "character", rules);

  for (const [section, byId] of rows) {
    for (const f of byId.values()) {
      if (section.startsWith("spell-")) {
        const name = f.spellname;
        if (!name) continue;
        const sl = section === "spell-cantrip" ? "0" : section.replace("spell-", "");
        const meta: Record<string, string> = { level: sl };
        if (f.spellschool) meta.school = cap(f.spellschool);
        if (f.spellcastingtime) meta.time = f.spellcastingtime;
        if (f.spellrange) meta.range = f.spellrange;
        if (f.spellduration) meta.duration = f.spellduration;
        const comp = f.spellcomp ?? "";
        if (/V/.test(comp)) meta.hasVerbalComponent = "true";
        if (/S/.test(comp)) meta.hasSomaticComponent = "true";
        if (/M/.test(comp)) meta.hasMaterialComponent = "true";
        const mat = /M\s*\(([^)]*)\)/.exec(comp);
        if (mat) meta.materialComponent = mat[1];
        if (f.spellconcentration) meta.isConcentration = "true";
        if (f.spellritual) meta.isRitual = "true";
        b.addExtra(b.resolve("spell", name, { description: htmlToText(f.spelldescription ?? f.spellhldice ?? ""), meta }));
      } else if (section === "inventory") {
        const name = f.itemname;
        if (!name) continue;
        const meta: Record<string, string> = {};
        if (f.itemcount && f.itemcount !== "1") meta.quantity = f.itemcount;
        if (f.itemweight) meta.weight = `${f.itemweight} lb.`;
        b.addExtra(b.resolve("item", name, { description: htmlToText(f.itemcontent ?? ""), meta }));
      } else if (section === "traits") {
        const name = f.name;
        if (!name) continue;
        b.addExtra(b.resolve("feature", name, { description: htmlToText(f.description ?? "") }, ["feat"]));
      }
    }
  }
  return b.finish();
}

export function importCharacterFile(data: unknown, reg: Registry): CharacterImport | { error: string } {
  switch (detectCharacterFormat(data)) {
    case "foundry":
      return importFoundry(data as Json, reg);
    case "roll20":
      return importRoll20(data as Json, reg);
    default:
      return { error: "Not a recognised Foundry or Roll20 character file." };
  }
}
