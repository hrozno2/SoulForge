/**
 * Converts Aurora Builder XML elements (as in github.com/AuroraLegacy/elements)
 * into CharForge elements. Aurora's rules language is much larger than ours, so
 * the importer converts what maps cleanly and counts what it skips. Nothing from
 * Aurora ships with CharForge: users download the content themselves and import it.
 */
import { ABILITIES, type Ability, type Element as CfElement, type ElementType, type Pack, type Rule } from "./types";
import { collectVars, parseFormula } from "./formula";
import { FORMULA_VARS } from "./registry";

export interface AuroraFile {
  path: string;
  xml: string;
}

export interface ImportReport {
  files: number;
  elements: number;
  rulesConverted: number;
  rulesSkipped: number;
  /** Selection rules (select) that need manual handling in this version. */
  selectionsSkipped: number;
  warnings: string[];
}

type XmlParserCtor = new () => { parseFromString(source: string, mime: string): Document };

const TYPE_MAP: Record<string, ElementType> = {
  race: "species",
  class: "class",
  background: "background",
  feat: "feat",
  archetype: "subclass",
  spell: "spell",
  item: "item",
  weapon: "item",
  armor: "item",
  "magic item": "item",
};

const ABILITY_BY_NAME: Record<string, Ability> = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
};

const ABILITY_SHORT = new Set<string>(ABILITIES);

function kids(el: Element, tag: string): Element[] {
  const out: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && (n as Element).tagName === tag) out.push(n as Element);
  }
  return out;
}

const BLOCK_TAGS = new Set(["p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "div", "tr", "br"]);

/** Plain text with one line per paragraph, so cards and sheets keep paragraph breaks. */
function paragraphText(el: Element | undefined): string {
  if (!el) return "";
  const walk = (n: Node): string => {
    if (n.nodeType === 3) return n.nodeValue ?? "";
    if (n.nodeType !== 1) return "";
    const e = n as Element;
    let text = "";
    for (let c = e.firstChild; c; c = c.nextSibling) text += walk(c);
    return BLOCK_TAGS.has(e.tagName.toLowerCase()) ? `${text}\n` : text;
  };
  return walk(el)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** Aurora templates like {{level:fighter}} become readable words. */
function tidyTemplates(text: string): string {
  return text
    .replace(/\{\{level:[^}]*\}\}/g, "your level")
    .replace(/\{\{proficiency\}\}/g, "your proficiency bonus")
    .replace(/\{\{([a-z]+):modifier\}\}/gi, "your $1 modifier")
    .replace(/\{\{([^}]*)\}\}/g, "$1");
}

function readSetters(node: Element): Record<string, string> | undefined {
  const meta: Record<string, string> = {};
  for (const setters of kids(node, "setters")) {
    for (const set of kids(setters, "set")) {
      const key = set.getAttribute("name");
      let value = cleanText(set);
      if (!key || !value) continue;
      const dmgType = set.getAttribute("type");
      if (key === "damage" && dmgType) value = `${value} ${dmgType}`;
      const currency = set.getAttribute("currency");
      if (key === "cost" && currency) value = `${value} ${currency}`;
      meta[key] = value;
    }
  }
  return Object.keys(meta).length ? meta : undefined;
}

function cleanText(el: Element | undefined): string {
  if (!el) return "";
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Aurora formula to CharForge formula, or undefined when it cannot be mapped. */
function convertValue(raw: string | null): number | string | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const text = raw.trim();
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  let f = text;
  for (const [name, short] of Object.entries(ABILITY_BY_NAME)) {
    f = f.replace(new RegExp(`${name}:modifier`, "g"), `${short}Mod`).replace(new RegExp(`\\b${name}\\b`, "g"), short);
  }
  f = f.replace(/\{\{proficiency\}\}/g, "prof").replace(/\bproficiency\b/g, "prof");
  try {
    const vars = collectVars(parseFormula(f));
    for (const v of vars) if (!FORMULA_VARS.has(v)) return undefined;
    return f;
  } catch {
    return undefined;
  }
}

function skillFromProficiencyId(id: string): string | undefined {
  const m = /^ID_PROFICIENCY_SKILL_(.+)$/.exec(id);
  return m ? m[1].toLowerCase().replace(/_/g, "-") : undefined;
}

function saveFromProficiencyId(id: string): Ability | undefined {
  const m = /^ID_PROFICIENCY_SAVING_?THROW_(.+)$/.exec(id);
  if (!m) return undefined;
  return ABILITY_BY_NAME[m[1].toLowerCase()];
}

function asiFromGrantId(id: string): Ability[] | undefined {
  const m = /ABILITY_SCORE_IMPROVEMENT_COMBINATION_([A-Z_]+)$/.exec(id);
  if (!m) return undefined;
  const parts = m[1].toLowerCase().split("_");
  return parts.every((p) => ABILITY_SHORT.has(p)) ? (parts as Ability[]) : undefined;
}

/** True when every requirement is a negation, meaning "unless a replacement is active". */
function requirementsAllowDefault(req: string | null): boolean {
  if (!req || !req.trim()) return true;
  return req
    .split(/[,&|]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .every((s) => s.startsWith("!"));
}

function convertRule(node: Element, report: ImportReport): Rule | undefined {
  const rule = convertRuleCore(node, report);
  const lvl = Number(node.getAttribute("level"));
  if (rule && Number.isFinite(lvl) && lvl > 1) rule.minLevel = lvl;
  return rule;
}

function convertRuleCore(node: Element, report: ImportReport): Rule | undefined {
  if (!requirementsAllowDefault(node.getAttribute("requirements"))) {
    report.rulesSkipped++;
    return undefined;
  }
  const tag = node.tagName;

  if (tag === "grant") {
    const id = node.getAttribute("id");
    if (!id) return void report.rulesSkipped++;
    const skill = skillFromProficiencyId(id);
    if (skill) return report.rulesConverted++, { kind: "proficiency", target: `skill:${skill}` };
    const save = saveFromProficiencyId(id);
    if (save) return report.rulesConverted++, { kind: "proficiency", target: `save:${save}` };
    const asi = asiFromGrantId(id);
    if (asi) return report.rulesConverted++, { kind: "asi", options: asi };
    report.rulesConverted++;
    return { kind: "grant", ids: [id] };
  }

  if (tag === "stat") {
    const name = (node.getAttribute("name") ?? "").trim().toLowerCase();
    const value = convertValue(node.getAttribute("value"));
    if (!name || value === undefined) return void report.rulesSkipped++;
    const isBase = node.getAttribute("bonus") === "base";
    let stat: string = ABILITY_BY_NAME[name] ?? name;
    let op: "add" | "set" = "add";
    if (name === "innate speed") {
      stat = "speed";
      op = "set";
    } else if (name === "hp") {
      stat = "hp";
    } else if (isBase) {
      op = "set";
    }
    report.rulesConverted++;
    return { kind: "stat", stat, op, value };
  }

  if (tag === "select") {
    report.selectionsSkipped++;
    return undefined;
  }

  report.rulesSkipped++;
  return undefined;
}

export function convertAuroraXml(
  files: AuroraFile[],
  Parser: XmlParserCtor = (globalThis as unknown as { DOMParser: XmlParserCtor }).DOMParser,
  packName = "Aurora import",
): { pack: Pack; report: ImportReport } {
  const report: ImportReport = {
    files: files.length,
    elements: 0,
    rulesConverted: 0,
    rulesSkipped: 0,
    selectionsSkipped: 0,
    warnings: [],
  };
  const out: CfElement[] = [];
  const parser = new Parser();

  for (const file of files) {
    let doc: Document;
    try {
      doc = parser.parseFromString(file.xml, "text/xml");
    } catch (e) {
      report.warnings.push(`${file.path}: ${(e as Error).message}`);
      continue;
    }
    const root = doc.documentElement;
    if (!root || root.tagName !== "elements") {
      report.warnings.push(`${file.path}: not an Aurora elements file`);
      continue;
    }
    for (const node of kids(root, "element")) {
      const id = node.getAttribute("id");
      const name = node.getAttribute("name");
      if (!id || !name) continue;
      const auroraType = (node.getAttribute("type") ?? "").toLowerCase();
      const type: ElementType = TYPE_MAP[auroraType] ?? "feature";

      const rules: Rule[] = [];
      for (const rulesNode of kids(node, "rules")) {
        for (let c = rulesNode.firstChild; c; c = c.nextSibling) {
          if (c.nodeType !== 1) continue;
          const rule = convertRule(c as Element, report);
          if (rule) rules.push(rule);
        }
      }

      const el: CfElement = { id, type, name };
      // Sheet descriptions can vary by level; keep the base (lowest level) one.
      const sheetNode = kids(node, "sheet")[0];
      const sheetDescs = sheetNode ? kids(sheetNode, "description") : [];
      const baseSheet = sheetDescs.slice().sort((x, y) => Number(x.getAttribute("level") ?? 0) - Number(y.getAttribute("level") ?? 0))[0];
      const sheetDesc = paragraphText(baseSheet);
      const desc = paragraphText(kids(node, "description")[0]);
      const meta = readSetters(node);
      // Spells and items keep their full rules text for cards. Classes, species and backgrounds
      // are long lore, so only their short summary is kept.
      const full = type === "spell" || type === "item";
      const lore = type === "class" || type === "species" || type === "background";
      let description = lore ? meta?.short ?? "" : full ? desc || sheetDesc : sheetDesc || desc;
      description = tidyTemplates(description);
      const limit = full ? 3000 : 1500;
      if (description) el.description = description.length > limit ? `${description.slice(0, limit - 3)}...` : description;
      const hd = /d(\d+)/i.exec(meta?.hd ?? "");
      if (type === "class" && hd) el.hitDie = Number(hd[1]);
      const merged = { ...(meta ?? {}) };
      if (sheetNode?.getAttribute("display") === "false") merged.hidden = "true";
      if (Object.keys(merged).length) el.meta = merged;
      if (rules.length) el.rules = rules;
      out.push(el);
    }
  }

  report.elements = out.length;
  return { pack: { id: "aurora-import", name: packName, elements: out }, report };
}
