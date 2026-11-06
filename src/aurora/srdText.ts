/**
 * Descriptions for the SRD bundle (Stage D2): only words the official SRD itself contains. A 5e.tools entry marked as
 * SRD can still carry the book's wording ("Strahd" in Divine Sense), so each sentence of a description is looked up in
 * the text of the SRD PDF. A sentence found there is the SRD's own; one that is not is dropped. Spelling, capitals,
 * punctuation and line breaks do not count as differences: the PDF's layout breaks them anyway.
 */
export const squash = (s: string) => s.toLowerCase().replace(/&[a-z]+;/g, " ").replace(/[^a-z0-9]+/g, "");

/** The PDF's text (pdftotext) as one searchable string: running footers out, words split at a line end rejoined. */
export function srdCorpus(pdfText: string): string {
  // The 5.1 PDF puts a tab, a line break and a no-break space between words, so spaces are made plain first.
  return squash(pdfText.replace(/[\s\u00a0]+/g, " ").replace(/(?:\b\d+ )?System Reference Document 5\.\d(?:\.\d)?(?: \d+)?/gi, " "));
}

const SHORT = 4;
/** Sentences of a run of plain text. Abbreviations that end in a period do not split one. */
export function sentencesOf(text: string): string[] {
  const safe = text.replace(/\b(ft|lb|gp|sp|cp|ep|pp|e\.g|i\.e|vs|St|Mr|Dr)\./g, "$1\u0001");
  return (safe.match(/[^.!?]+(?:[.!?]+["”’)]*|$)/g) ?? []).map((x) => x.replace(/\u0001/g, ".").trim()).filter(Boolean);
}

export interface SrdCheck { html: string; kept: number; dropped: string[] }

const plainOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const inSrd = (text: string, corpus: string) => { const q = squash(text); return !q || corpus.includes(q); };

/**
 * The description with only what the SRD says. A block whose sentences are all there stays as it was, with its
 * emphasis; otherwise it keeps the sentences that are, as plain text. A table cell or heading of a few words names a
 * thing rather than words it (a level, a cost, "Damage Resistance"), and goes the same way as the sentence around it:
 * a heading with nothing kept under it, and a table with no row kept, leave too.
 */
export function srdDescription(html: string, corpus: string): SrdCheck {
  const dropped: string[] = [];
  let kept = 0;
  const parts = html.split(/(<table[\s\S]*?<\/table>|<h\d[^>]*>[\s\S]*?<\/h\d>|<li[^>]*>[\s\S]*?<\/li>|<p[^>]*>[\s\S]*?<\/p>)/i);
  const out: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (/^<table/i.test(part)) {
      const cells = [...part.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => plainOf(m[1]));
      const long = cells.filter((c) => c.split(" ").length > SHORT);
      const bad = long.filter((c) => !sentencesOf(c).every((s) => inSrd(s, corpus)));
      if (bad.length) dropped.push(...bad); else { kept += long.length; out.push(part); }
      continue;
    }
    if (/^<h\d/i.test(part)) { out.push(part); continue; }
    const block = /^<(p|li)[^>]*>/i.exec(part);
    const text = plainOf(part);
    if (!text) { out.push(part); continue; }
    if (!block) {
      // Markup between blocks (a list's own tags) stays; loose text is checked like a paragraph.
      if (!/[a-z]{3}/i.test(text)) { out.push(part); continue; }
    }
    const all = sentencesOf(text);
    const good = all.filter((s) => s.split(" ").length <= SHORT ? inSrd(s, corpus) : inSrd(s, corpus));
    kept += good.length;
    for (const s of all) if (!good.includes(s)) dropped.push(s);
    if (good.length === all.length) out.push(part);
    else if (good.length) out.push(`<${block?.[1] ?? "p"}>${good.join(" ")}</${block?.[1] ?? "p"}>`);
  }
  // A heading left with nothing under it.
  const joined = out.join("").replace(/<h\d[^>]*>[\s\S]*?<\/h\d>(?=\s*(?:<h\d|$))/gi, "").replace(/<(ul|ol)[^>]*>\s*<\/\1>/gi, "");
  return { html: joined, kept, dropped };
}
