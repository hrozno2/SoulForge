/**
 * Descriptions for the SRD bundle (Stage D2): only words the official SRD itself contains. A 5e.tools entry marked as
 * SRD can still carry the book's wording ("Strahd" in Divine Sense), so each sentence of a description is looked up in
 * the text of the SRD PDF. A sentence found there is the SRD's own; one that is not is dropped. Capitals, punctuation
 * and line breaks do not count as differences: the PDF's layout breaks them anyway. A long sentence may differ by a
 * word or two (the SRD's PDF and 5e.tools' copy are edited apart), so one with nearly all its word runs in the SRD
 * counts; a name the SRD does not license is still caught by NOT_IN_SRD in srdBundle.ts.
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
const RUN = 4;
const NEARLY = 0.8;
const MIN_WORDS_FOR_NEARLY = 10;
const inSrd = (text: string, corpus: string) => {
  const q = squash(text);
  if (!q || corpus.includes(q)) return true;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < MIN_WORDS_FOR_NEARLY) return false;
  let hit = 0;
  for (let i = 0; i + RUN <= words.length; i++) if (corpus.includes(squash(words.slice(i, i + RUN).join(" ")))) hit++;
  return hit / (words.length - RUN + 1) >= NEARLY;
};
/** What the converter itself writes rather than copies: facts in the app's own words. */
const OWN_WORDS = /^(?:Spells?: |Equipment: |Hit die |\(a\) |\([ab]\) |You can use the \w+ mastery property of |You have a \+\d bonus to |While holding this shield, you have a \+\d bonus |You have resistance to \w+ damage while |When you drink this potion, you have resistance to \w+ damage )|, from (?:PHB|XPHB)\.$/i;

/**
 * The description with only what the SRD says. A block whose sentences are all there stays as it was, with its
 * emphasis; otherwise it keeps the sentences that are, as plain text. A table cell or heading of a few words names a
 * thing rather than words it (a level, a cost, "Damage Resistance"), and goes the same way as the sentence around it:
 * a heading with nothing kept under it, and a table with no row kept, leave too.
 */
export function srdDescription(html: string, corpus: string, forbidden?: RegExp): SrdCheck {
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
      if (bad.length) { dropped.push(...bad); continue; }
      kept += long.length;
      // A row naming what the SRD does not license goes alone; the table stays.
      out.push(forbidden ? part.replace(/<tr[^>]*>[\s\S]*?<\/tr>/gi, (row) => { if (!forbidden.test(plainOf(row))) return row; dropped.push(plainOf(row)); return ""; }) : part);
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
    const good = all.filter((s) => !forbidden?.test(s) && (OWN_WORDS.test(s) || inSrd(s, corpus)));
    kept += good.length;
    for (const s of all) if (!good.includes(s)) dropped.push(s);
    if (good.length === all.length) out.push(part);
    else if (good.length) out.push(`<${block?.[1] ?? "p"}>${good.join(" ")}</${block?.[1] ?? "p"}>`);
  }
  // A heading left with nothing under it.
  const joined = out.join("").replace(/<h\d[^>]*>[\s\S]*?<\/h\d>(?=\s*(?:<h\d|$))/gi, "").replace(/<(ul|ol)[^>]*>\s*<\/\1>/gi, "");
  return { html: joined, kept, dropped };
}

/** Element types whose text the app writes itself ("Psychic damage resistance."), so there is nothing to look up. */
export const OWN_TEXT_TYPES = new Set(["Information", "Condition", "Spellcasting Ability", "Spell Set", "Proficiency", "Vision", "Size", "Ability Score Improvement", "Grants", "Training Option"]);
