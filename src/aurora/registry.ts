import type { AAppend, AElement, ParsedFile } from "./types";

/** A `supports` filter: `A,B` is AND, `A||B` is OR, `A|B` is any of these ids, parentheses group. */
type SNode = { t: "and" | "or"; a: SNode[] } | { t: "any"; words: string[] };

function tokenizeSupports(src: string): string[] {
  const out: string[] = [];
  let i = 0;
  let word = "";
  const flush = () => {
    if (word.trim()) out.push(word.trim());
    word = "";
  };
  while (i < src.length) {
    const c = src[i];
    if (c === "|" && src[i + 1] === "|") {
      flush();
      out.push("||");
      i += 2;
    } else if (c === "," || c === "(" || c === ")") {
      flush();
      out.push(c);
      i++;
    } else {
      word += c;
      i++;
    }
  }
  flush();
  return out;
}

const supportsCache = new Map<string, SNode | null>();

function parseSupports(src: string): SNode | null {
  const hit = supportsCache.get(src);
  if (hit !== undefined) return hit;
  const toks = tokenizeSupports(src);
  let pos = 0;
  const parseOr = (): SNode => {
    const parts = [parseAnd()];
    while (toks[pos] === "||") {
      pos++;
      parts.push(parseAnd());
    }
    return parts.length === 1 ? parts[0] : { t: "or", a: parts };
  };
  const parseAnd = (): SNode => {
    const parts = [parseAtom()];
    while (toks[pos] === ",") {
      pos++;
      parts.push(parseAtom());
    }
    return parts.length === 1 ? parts[0] : { t: "and", a: parts };
  };
  const parseAtom = (): SNode => {
    const t = toks[pos++];
    if (t === "(") {
      const n = parseOr();
      if (toks[pos] === ")") pos++;
      return n;
    }
    return { t: "any", words: (t ?? "").split("|").map((w) => w.trim().toLowerCase()).filter(Boolean) };
  };
  const node = toks.length ? parseOr() : null;
  supportsCache.set(src, node);
  return node;
}

/** The words an element offers to `supports` filters: its tags, its id, and for spells the level. */
function offered(el: AElement): Set<string> {
  const s = new Set<string>(el.supports.map((x) => x.toLowerCase()));
  s.add(el.id.toLowerCase());
  const lvl = el.setters.level?.value;
  if (el.type === "Spell" && lvl !== undefined) s.add(lvl.trim());
  // A spell's school works as a tag too, so "Evocation" in a filter finds evocation spells.
  if (el.type === "Spell" && el.setters.school?.value) s.add(el.setters.school.value.trim().toLowerCase());
  return s;
}

function matchNode(n: SNode, have: Set<string>): boolean {
  if (n.t === "any") return n.words.some((w) => have.has(w));
  if (n.t === "and") return n.a.every((x) => matchNode(x, have));
  return n.a.some((x) => matchNode(x, have));
}

export function matchesSupports(el: AElement, filter: string): boolean {
  const node = parseSupports(filter);
  return !node || matchNode(node, offered(el));
}

export class ARegistry {
  private byId = new Map<string, AElement>();
  private byType = new Map<string, AElement[]>();
  private appends: AAppend[] = [];
  private raw: AElement[] = [];
  private queryCache = new Map<string, AElement[]>();

  /** Later files override earlier elements with the same id. */
  addFile(file: ParsedFile): void {
    this.raw.push(...file.elements);
    this.appends.push(...file.appends);
  }

  addElements(elements: AElement[]): void {
    this.raw.push(...elements);
  }

  /** Call once after all files are added. Applies overrides and `append` patches. */
  build(): void {
    this.byId.clear();
    this.byType.clear();
    this.queryCache.clear();
    for (const el of this.raw) this.byId.set(el.id, { ...el, rules: [...el.rules] });
    for (const ap of this.appends) {
      const target = this.byId.get(ap.id);
      if (!target) continue;
      target.rules = [...target.rules, ...ap.rules];
      if (ap.supports.length) target.supports = [...target.supports, ...ap.supports];
    }
    for (const el of this.byId.values()) {
      const key = el.type.toLowerCase();
      (this.byType.get(key) ?? this.byType.set(key, []).get(key)!).push(el);
    }
  }

  get(id: string): AElement | undefined {
    return this.byId.get(id);
  }

  get size(): number {
    return this.byId.size;
  }

  all(): AElement[] {
    return [...this.byId.values()];
  }

  ofType(type: string): AElement[] {
    return this.byType.get(type.toLowerCase()) ?? [];
  }

  types(): string[] {
    return [...this.byType.keys()];
  }

  /** Elements of a type that satisfy a `supports` filter. */
  find(type: string, supports: string): AElement[] {
    const key = `${type}\u0000${supports}`;
    const hit = this.queryCache.get(key);
    if (hit) return hit;
    const list = this.ofType(type).filter((e) => !supports.trim() || matchesSupports(e, supports));
    this.queryCache.set(key, list);
    return list;
  }

  /** Name search across everything that shows in the compendium. */
  search(q: string, type?: string, limit = 60): AElement[] {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const pool = type ? this.ofType(type) : this.all();
    const out: AElement[] = [];
    for (const e of pool) {
      if (e.compendiumHidden) continue;
      if (e.name.toLowerCase().includes(needle)) out.push(e);
      if (out.length >= limit) break;
    }
    return out;
  }
}
