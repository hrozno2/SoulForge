/**
 * Tiny safe expression evaluator for modifier formulas.
 * Supports numbers, + - * / %, parentheses, unary minus, named variables
 * and the functions floor, ceil, round, min, max, abs. No eval, no globals.
 */

type Node =
  | { t: "num"; v: number }
  | { t: "var"; name: string }
  | { t: "neg"; a: Node }
  | { t: "bin"; op: string; a: Node; b: Node }
  | { t: "call"; fn: string; args: Node[] };

const FUNCS: Record<string, (...a: number[]) => number> = {
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
};

function tokenize(src: string): string[] {
  const tokens: string[] = [];
  const re = /\s*(\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|[-+*/%(),])/y;
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) throw new Error(`Unexpected character "${src[pos]}" in formula "${src}"`);
    tokens.push(m[1]);
    pos = re.lastIndex;
  }
  return tokens;
}

export function parseFormula(src: string): Node {
  const tokens = tokenize(src);
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];

  function expr(): Node {
    let left = term();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      left = { t: "bin", op, a: left, b: term() };
    }
    return left;
  }
  function term(): Node {
    let left = unary();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = next();
      left = { t: "bin", op, a: left, b: unary() };
    }
    return left;
  }
  function unary(): Node {
    if (peek() === "-") {
      next();
      return { t: "neg", a: unary() };
    }
    if (peek() === "+") {
      next();
      return unary();
    }
    return atom();
  }
  function atom(): Node {
    const tok = next();
    if (tok === undefined) throw new Error(`Formula ended early: "${src}"`);
    if (tok === "(") {
      const e = expr();
      if (next() !== ")") throw new Error(`Missing ")" in formula "${src}"`);
      return e;
    }
    if (/^\d/.test(tok)) return { t: "num", v: parseFloat(tok) };
    if (/^[A-Za-z_]/.test(tok)) {
      if (peek() === "(") {
        next();
        const args: Node[] = [];
        if (peek() !== ")") {
          args.push(expr());
          while (peek() === ",") {
            next();
            args.push(expr());
          }
        }
        if (next() !== ")") throw new Error(`Missing ")" in formula "${src}"`);
        if (!(tok in FUNCS)) throw new Error(`Unknown function "${tok}" in formula "${src}"`);
        return { t: "call", fn: tok, args };
      }
      return { t: "var", name: tok };
    }
    throw new Error(`Unexpected "${tok}" in formula "${src}"`);
  }

  const tree = expr();
  if (i < tokens.length) throw new Error(`Unexpected "${tokens[i]}" in formula "${src}"`);
  return tree;
}

export function collectVars(node: Node, out: Set<string> = new Set()): Set<string> {
  switch (node.t) {
    case "var":
      out.add(node.name);
      break;
    case "neg":
      collectVars(node.a, out);
      break;
    case "bin":
      collectVars(node.a, out);
      collectVars(node.b, out);
      break;
    case "call":
      node.args.forEach((a) => collectVars(a, out));
      break;
  }
  return out;
}

function run(node: Node, ctx: Record<string, number>): number {
  switch (node.t) {
    case "num":
      return node.v;
    case "var":
      if (!(node.name in ctx)) throw new Error(`Unknown variable "${node.name}"`);
      return ctx[node.name];
    case "neg":
      return -run(node.a, ctx);
    case "bin": {
      const a = run(node.a, ctx);
      const b = run(node.b, ctx);
      switch (node.op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return b === 0 ? 0 : a / b;
        default: return b === 0 ? 0 : a % b;
      }
    }
    case "call":
      return FUNCS[node.fn](...node.args.map((a) => run(a, ctx)));
  }
}

export function evaluate(value: number | string, ctx: Record<string, number>): number {
  if (typeof value === "number") return value;
  return run(parseFormula(value), ctx);
}
