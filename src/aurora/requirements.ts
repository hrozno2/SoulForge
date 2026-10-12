/**
 * Requirement strings from the Aurora format, for example
 * `([str:13]||[dex:13]),(ID_CLASS_FIGHTER||ID_CLASS_RANGER)` or `!ID_SOMETHING`.
 * `,` and `&&` mean AND, `||` means OR, `!` negates, parentheses group.
 */

export interface ReqCtx {
  hasId(id: string): boolean;
  hasType(type: string): boolean;
  /** Character level (or the level of the class the rule belongs to). */
  level: number;
  /** Read a statistic by name, for example "strength" or "strength:max:extra". */
  stat(name: string): number;
  /** Equipment checks such as [armor:heavy] or [shield:any]. Only used by `equipped` attributes. */
  equipped?(kind: string, value: string): boolean;
}

type Node =
  | { t: "and" | "or"; a: Node[] }
  | { t: "not"; n: Node }
  | { t: "id"; id: string }
  | { t: "pair"; key: string; value: string };

const ABILITY_ALIAS: Record<string, string> = {
  str: "strength",
  dex: "dexterity",
  con: "constitution",
  int: "intelligence",
  wis: "wisdom",
  cha: "charisma",
};

function tokenize(src: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) i++;
    else if (c === "[") {
      const j = src.indexOf("]", i);
      const end = j === -1 ? src.length : j;
      out.push(src.slice(i, end + 1));
      i = end + 1;
    } else if (c === "&" && src[i + 1] === "&") {
      out.push(",");
      i += 2;
    } else if (c === "|" && src[i + 1] === "|") {
      out.push("||");
      i += 2;
    } else if ("(),!".includes(c)) {
      out.push(c);
      i++;
    } else {
      let j = i;
      while (j < src.length && !/[\s(),!\[\]&|]/.test(src[j])) j++;
      if (j === i) j = i + 1;
      out.push(src.slice(i, j));
      i = j;
    }
  }
  return out;
}

const cache = new Map<string, Node | null>();

function parse(src: string): Node | null {
  const hit = cache.get(src);
  if (hit !== undefined) return hit;
  const toks = tokenize(src);
  let pos = 0;
  const parseOr = (): Node => {
    const parts = [parseAnd()];
    while (toks[pos] === "||") {
      pos++;
      parts.push(parseAnd());
    }
    return parts.length === 1 ? parts[0] : { t: "or", a: parts };
  };
  const parseAnd = (): Node => {
    const parts = [parseUnary()];
    while (toks[pos] === ",") {
      pos++;
      parts.push(parseUnary());
    }
    return parts.length === 1 ? parts[0] : { t: "and", a: parts };
  };
  const parseUnary = (): Node => {
    const t = toks[pos++];
    if (t === "!") return { t: "not", n: parseUnary() };
    if (t === "(") {
      const n = parseOr();
      if (toks[pos] === ")") pos++;
      return n;
    }
    if (t && t.startsWith("[")) {
      const body = t.replace(/^\[|\]$/g, "");
      const k = body.lastIndexOf(":");
      return k === -1 ? { t: "pair", key: body, value: "" } : { t: "pair", key: body.slice(0, k), value: body.slice(k + 1) };
    }
    return { t: "id", id: t ?? "" };
  };
  let node: Node | null = null;
  try {
    node = toks.length ? parseOr() : null;
  } catch {
    node = null;
  }
  cache.set(src, node);
  return node;
}

function evalNode(n: Node, ctx: ReqCtx, equipment: boolean): boolean {
  switch (n.t) {
    case "and":
      return n.a.every((x) => evalNode(x, ctx, equipment));
    case "or":
      return n.a.some((x) => evalNode(x, ctx, equipment));
    case "not":
      return !evalNode(n.n, ctx, equipment);
    case "id":
      return ctx.hasId(n.id);
    case "pair": {
      const key = n.key.toLowerCase();
      if (key === "type") return ctx.hasType(n.value);
      if (key === "id") return ctx.hasId(n.value);
      if (key === "level" || key === "character") return ctx.level >= (parseInt(n.value, 10) || 0);
      if (equipment || key === "armor" || key === "shield" || key === "weapon") {
        if (ctx.equipped && (equipment || ["armor", "shield", "weapon"].includes(key))) return ctx.equipped(key, n.value);
      }
      const stat = ABILITY_ALIAS[key] ?? key;
      const want = parseFloat(n.value);
      return Number.isNaN(want) ? false : ctx.stat(stat) >= want;
    }
  }
}

/** An empty or missing requirement is always met. */
export function meets(req: string | undefined, ctx: ReqCtx, equipment = false): boolean {
  if (!req || !req.trim()) return true;
  const node = parse(req);
  return node ? evalNode(node, ctx, equipment) : true;
}

const ABILITY_NAME: Record<string, string> = { strength: "Strength", dexterity: "Dexterity", constitution: "Constitution", intelligence: "Intelligence", wisdom: "Wisdom", charisma: "Charisma" };

/** A readable name for an element id when no registry is at hand: ID_WOTC_PHB_CLASS_FIGHTER becomes "Fighter". */
const prettyId = (id: string) => {
  const tail = id.replace(/^ID_/, "").split("_").slice(-2).join(" ").toLowerCase();
  return tail.replace(/\b\w/g, (c) => c.toUpperCase());
};

/**
 * What a character is missing for a requirement, in words: "Strength 13 or Dexterity 13" or "Level 4".
 * Only the parts that fail are named. Returns undefined when the requirement is met.
 */
export function explainUnmet(req: string | undefined, ctx: ReqCtx, nameOf: (id: string) => string | undefined = () => undefined): string | undefined {
  if (meets(req, ctx)) return undefined;
  const node = parse(req!);
  if (!node) return undefined;
  const name = (id: string) => nameOf(id) ?? prettyId(id);
  const say = (n: Node): string => {
    switch (n.t) {
      case "and":
        return n.a.filter((x) => !evalNode(x, ctx, false)).map(say).join(" and ");
      case "or":
        return n.a.map(say).join(" or ");
      case "not":
        return n.n.t === "id" ? `not having ${name(n.n.id)}` : `not ${say(n.n)}`;
      case "id":
        return name(n.id);
      case "pair": {
        const key = n.key.toLowerCase();
        if (key === "type") return n.value;
        if (key === "id") return name(n.value);
        if (key === "level" || key === "character") return `level ${n.value}`;
        const stat = ABILITY_ALIAS[key] ?? key;
        return `${ABILITY_NAME[stat] ?? stat} ${n.value}`;
      }
    }
  };
  const text = say(node).trim();
  return text ? `Needs ${text}` : "Requirements not met";
}
