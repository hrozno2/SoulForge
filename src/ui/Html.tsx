import { useMemo } from "react";

const ALLOWED = new Set(["P", "DIV", "SPAN", "B", "I", "EM", "STRONG", "U", "UL", "OL", "LI", "H1", "H2", "H3", "H4", "H5", "BR", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "CENTER", "SUP", "SUB", "A"]);

const DROP_WITH_CONTENT = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "HEAD", "TITLE"]);
const KEEP_ATTRS = new Set(["class", "colspan", "rowspan"]);

/**
 * Content files carry basic HTML. This builds a fresh tree from the allowed tags only, so nothing that can run
 * survives: unknown tags are replaced by their cleaned children, and risky ones are dropped with their content.
 */
export function sanitize(html: string): string {
  const src = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const out = src.implementation.createHTMLDocument("");
  const copy = (from: Node, into: Node) => {
    for (const node of Array.from(from.childNodes)) {
      if (node.nodeType === 3) {
        into.appendChild(out.createTextNode(node.textContent ?? ""));
      } else if (node.nodeType === 1) {
        const el = node as Element;
        const tag = el.tagName.toUpperCase();
        if (DROP_WITH_CONTENT.has(tag)) continue;
        if (ALLOWED.has(tag)) {
          const clone = out.createElement(tag.toLowerCase());
          for (const a of Array.from(el.attributes)) if (KEEP_ATTRS.has(a.name)) clone.setAttribute(a.name, a.value);
          copy(el, clone);
          into.appendChild(clone);
        } else {
          copy(el, into);
        }
      }
    }
  };
  copy(src.body, out.body);
  // Placeholder blocks like <div element="ID_..."/> have no content of their own.
  out.body.querySelectorAll("div:empty").forEach((d) => d.remove());
  return out.body.innerHTML;
}

/** `cap` gives the first paragraph a drop cap, as in the books. */
export function Html({ html, className, cap }: { html: string; className?: string; cap?: boolean }) {
  const clean = useMemo(() => sanitize(html), [html]);
  return <div className={`rich ${cap ? "cap" : ""} ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: clean }} />;
}
