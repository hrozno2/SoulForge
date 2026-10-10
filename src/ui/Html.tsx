import { useMemo } from "react";

const ALLOWED = new Set(["P", "DIV", "SPAN", "B", "I", "EM", "STRONG", "U", "UL", "OL", "LI", "H1", "H2", "H3", "H4", "H5", "BR", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "CENTER", "SUP", "SUB", "A"]);

/** Content files carry basic HTML. Keep structure and class names, drop anything that can run. */
export function sanitize(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (!ALLOWED.has(child.tagName)) {
        child.replaceWith(...Array.from(child.childNodes));
        continue;
      }
      for (const a of Array.from(child.attributes)) {
        if (a.name !== "class" && a.name !== "colspan" && a.name !== "rowspan") child.removeAttribute(a.name);
      }
      walk(child);
    }
  };
  walk(doc.body);
  // Placeholder blocks like <div element="ID_..."/> have no content of their own.
  doc.body.querySelectorAll("div:empty").forEach((d) => d.remove());
  return doc.body.innerHTML;
}

/** `cap` gives the first paragraph a drop cap, as in the books. */
export function Html({ html, className, cap }: { html: string; className?: string; cap?: boolean }) {
  const clean = useMemo(() => sanitize(html), [html]);
  return <div className={`rich ${cap ? "cap" : ""} ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: clean }} />;
}
