import type { AElement } from "./types";

type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type IdFn = (kind: string, name: string, source: string, extra?: string) => string;
type HtmlFn = (entries: J) => string;
const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");

/**
 * 5e.tools keeps the lore (what 5e.tools shows on an entry's Info tab) apart from the rules, in "fluff" files:
 * raceFluff, classFluff, backgroundFluff... one entry per thing, named and sourced like the thing itself. Each one is
 * matched to its converted element by the converter's own id rules and kept as the element's lore.
 */
export function applyLore(lists: Map<string, J[]>, out: AElement[], ftId: IdFn, html: HtmlFn): { applied: number; unmatched: string[] } {
  const byId = new Map(out.map((e) => [e.id, e]));
  const targets = (kind: string, f: J): string[] => {
    const src = String(f.source ?? "PHB");
    switch (kind) {
      case "raceFluff": {
        const v = /^(.+?) \((.+)\)$/.exec(f.name);
        return v
          ? [ftId("RACEVERSION", `${v[1]} ${v[2]}`, src), ftId("SUBRACE", `${v[1]} ${v[2]}`, src), ftId("SUBRACE", `${v[2]} ${v[1]}`, src), ftId("RACE", f.name, src)]
          : [ftId("RACE", f.name, src)];
      }
      case "classFluff": return [ftId("CLASS", f.name, src)];
      case "subclassFluff": {
        const cs = String(f.classSource ?? "PHB");
        return [ftId("SUBCLASS", `${f.className} ${f.shortName ?? f.name}`, src, cs !== src ? `for ${cs}` : "")];
      }
      case "backgroundFluff": return [ftId("BG", f.name, src)];
      case "featFluff": return [ftId("FEAT", f.name, src)];
      case "itemFluff": return [ftId("ITEM", f.name, src)];
      case "spellFluff": return [ftId("SPELL", f.name, src)];
      case "optionalfeatureFluff": return [ftId("OPT", f.name, src)];
      case "languageFluff": return [`ID_5ET_LANGUAGE_${slug(f.name)}`];
      default: return [];
    }
  };
  let applied = 0;
  const unmatched: string[] = [];
  for (const [kind, list] of lists) {
    for (const f of list) {
      if (!f?.entries?.length) continue;
      const el = targets(kind, f).map((id) => byId.get(id)).find(Boolean);
      if (!el) { unmatched.push(`${kind}: ${f.name} (${f.source})`); continue; }
      const text = html(f.entries);
      if (!text.trim()) continue;
      el.lore = text;
      applied++;
    }
  }
  return { applied, unmatched };
}
