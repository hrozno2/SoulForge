import type {
  AAppend,
  AElement,
  ARule,
  MulticlassInfo,
  ParsedFile,
  ParsedIndex,
  SetterValue,
  SheetInfo,
  SpellcastingInfo,
} from "./types";

/** Anything with the DOM parser API: the browser's DOMParser, or xmldom's in tests. */
export interface XmlApi {
  parse(text: string): Document;
  serialize(node: Node): string;
}

export function browserXml(): XmlApi {
  return {
    parse: (t) => new DOMParser().parseFromString(t, "text/xml"),
    serialize: (n) => new XMLSerializer().serializeToString(n),
  };
}

const kids = (el: Element, tag?: string): Element[] =>
  Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1 && (!tag || (n as Element).nodeName === tag));

const attr = (el: Element, name: string): string | undefined => {
  const v = el.getAttribute(name);
  return v === null || v === "" ? undefined : v;
};
const bool = (v: string | undefined): boolean | undefined => (v === undefined ? undefined : v.toLowerCase() === "true");
const int = (v: string | undefined): number | undefined => {
  if (v === undefined) return undefined;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? undefined : n;
};
const text = (el: Element): string => (el.textContent ?? "").trim();

function inner(el: Element, xml: XmlApi): string {
  return Array.from(el.childNodes)
    .map((n) => xml.serialize(n))
    .join("")
    .replace(/\s+xmlns="[^"]*"/g, "")
    .trim();
}

function parseRules(rulesEl: Element | undefined): ARule[] {
  if (!rulesEl) return [];
  const out: ARule[] = [];
  for (const r of kids(rulesEl)) {
    const name = r.nodeName;
    if (name === "grant") {
      // Some content writes the ID in the name attribute (Githyanki Psionics: name="ID_PHB_SPELL_MAGE_HAND").
      const nameAttr = attr(r, "name");
      const id = attr(r, "id") ?? (nameAttr && /^ID_[A-Z0-9_]+$/.test(nameAttr.trim()) ? nameAttr.trim() : undefined);
      if (!id && !nameAttr) continue;
      out.push({
        kind: "grant",
        type: attr(r, "type") ?? "",
        id: id ?? "",
        level: int(attr(r, "level")),
        requirements: attr(r, "requirements"),
        spellcasting: attr(r, "spellcasting"),
        prepared: bool(attr(r, "prepared")),
        allowReplace: bool(attr(r, "allowReplace")),
        name: attr(r, "name"),
      });
    } else if (name === "select") {
      out.push({
        kind: "select",
        type: attr(r, "type") ?? "",
        name: attr(r, "name") ?? "",
        supports: attr(r, "supports") ?? "",
        level: int(attr(r, "level")),
        requirements: attr(r, "requirements"),
        number: int(attr(r, "number")) ?? 1,
        default: attr(r, "default"),
        optional: bool(attr(r, "optional")),
        spellcasting: attr(r, "spellcasting"),
        allowReplace: bool(attr(r, "allowReplace")),
        items: kids(r, "item").length ? kids(r, "item").map((i, n) => ({ id: attr(i, "id") ?? String(n + 1), text: text(i) })) : undefined,
      });
    } else if (name === "stat") {
      const n = attr(r, "name");
      if (!n) continue;
      out.push({
        kind: "stat",
        name: n.toLowerCase(),
        value: attr(r, "value") ?? "0",
        bonus: attr(r, "bonus"),
        equipped: attr(r, "equipped"),
        level: int(attr(r, "level")),
        requirements: attr(r, "requirements"),
        inline: bool(attr(r, "inline")),
        alt: attr(r, "alt"),
      });
    }
  }
  return out;
}

function parseSetters(el: Element | undefined): Record<string, SetterValue> {
  const out: Record<string, SetterValue> = {};
  if (!el) return out;
  for (const s of kids(el, "set")) {
    const name = s.getAttribute("name");
    if (!name) continue;
    const attrs: Record<string, string> = {};
    for (const a of Array.from(s.attributes)) if (a.name !== "name") attrs[a.name] = a.value;
    const value = text(s);
    // Repeated names (for example several `names`) are joined so nothing is lost.
    out[name] = out[name] ? { value: `${out[name].value}, ${value}`, attrs: { ...out[name].attrs, ...attrs } } : { value, attrs };
  }
  return out;
}

function parseSheet(el: Element | undefined, xml: XmlApi): SheetInfo | undefined {
  if (!el) return undefined;
  const descriptions = kids(el, "description").map((d) => ({
    level: int(attr(d, "level")),
    text: inner(d, xml),
    action: attr(d, "action"),
    usage: attr(d, "usage"),
  }));
  if (!descriptions.length && text(el)) descriptions.push({ level: undefined, text: inner(el, xml), action: undefined, usage: undefined });
  return {
    display: bool(attr(el, "display")) ?? true,
    alt: attr(el, "alt"),
    action: attr(el, "action"),
    usage: attr(el, "usage"),
    descriptions,
  };
}

const splitList = (s: string): string[] =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

function parseSpellcasting(el: Element | undefined): SpellcastingInfo | undefined {
  if (!el) return undefined;
  return {
    name: attr(el, "name") ?? "",
    ability: attr(el, "ability"),
    prepare: bool(attr(el, "prepare")),
    extend: bool(attr(el, "extend")),
    list: kids(el, "list").map(text).filter(Boolean),
    extendLists: kids(el, "extend").map(text).filter(Boolean),
  };
}

function parseMulticlass(el: Element | undefined): MulticlassInfo | undefined {
  if (!el) return undefined;
  const id = attr(el, "id");
  if (!id) return undefined;
  const req = kids(el, "requirements")[0];
  const pre = kids(el, "prerequisite")[0];
  return {
    id,
    prerequisite: pre ? text(pre) : undefined,
    requirements: req ? text(req) : undefined,
    setters: parseSetters(kids(el, "setters")[0]),
    rules: parseRules(kids(el, "rules")[0]),
  };
}

export function parseElementsXml(xmlText: string, xml: XmlApi, origin?: string): ParsedFile {
  const doc = xml.parse(xmlText);
  const root = doc.documentElement;
  const out: ParsedFile = { elements: [], appends: [] };
  if (!root || root.nodeName === "parsererror" || doc.getElementsByTagName("parsererror").length) {
    throw new Error("Not valid XML");
  }
  const info = kids(root, "info")[0];
  if (info) {
    const upd = kids(info, "update")[0];
    out.version = upd ? attr(upd, "version") : undefined;
    const nm = kids(info, "name")[0];
    out.name = nm ? text(nm) : undefined;
  }

  for (const el of kids(root)) {
    if (el.nodeName === "element") {
      const id = attr(el, "id");
      const type = attr(el, "type");
      if (!id || !type) continue;
      const comp = kids(el, "compendium")[0];
      const sup = kids(el, "supports")[0];
      const req = kids(el, "requirements")[0];
      const desc = kids(el, "description")[0];
      const extractEl = kids(el, "extract")[0];
      out.elements.push({
        id,
        name: attr(el, "name") ?? id,
        type,
        source: attr(el, "source") ?? "",
        supports: sup ? splitList(text(sup)) : [],
        requirements: req ? text(req) : undefined,
        description: desc ? inner(desc, xml) : "",
        compendiumHidden: comp ? bool(attr(comp, "display")) === false : false,
        sheet: parseSheet(kids(el, "sheet")[0], xml),
        setters: parseSetters(kids(el, "setters")[0]),
        rules: parseRules(kids(el, "rules")[0]),
        spellcasting: parseSpellcasting(kids(el, "spellcasting")[0]),
        multiclass: parseMulticlass(kids(el, "multiclass")[0]),
        extract: extractEl
          ? kids(extractEl, "item").map((i) => ({ id: text(i), amount: int(attr(i, "amount")) ?? 1 }))
          : undefined,
        origin,
      } satisfies AElement);
    } else if (el.nodeName === "append") {
      const id = attr(el, "id");
      if (!id) continue;
      const sup = kids(el, "supports")[0];
      out.appends.push({ id, rules: parseRules(kids(el, "rules")[0]), supports: sup ? splitList(text(sup)) : [] } satisfies AAppend);
    }
  }
  return out;
}

export function parseIndexXml(xmlText: string, xml: XmlApi): ParsedIndex {
  const doc = xml.parse(xmlText);
  const root = doc.documentElement;
  if (!root || doc.getElementsByTagName("parsererror").length || root.nodeName !== "index") {
    throw new Error("Not an Aurora index file");
  }
  const info = kids(root, "info")[0];
  const upd = info ? kids(info, "update")[0] : undefined;
  const filesEl = kids(root, "files")[0];
  return {
    name: info && kids(info, "name")[0] ? text(kids(info, "name")[0]) : "",
    description: info && kids(info, "description")[0] ? text(kids(info, "description")[0]) : "",
    version: upd ? (attr(upd, "version") ?? "0") : "0",
    // <obsolete> entries are old files the maintainers want gone, so only <file> counts.
    files: filesEl
      ? kids(filesEl, "file")
          .map((f) => ({ name: attr(f, "name") ?? "", url: attr(f, "url") ?? "" }))
          .filter((f) => f.url)
      : [],
  };
}
