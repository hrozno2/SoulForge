/**
 * The official SRD PDFs read as structure (Stage D2/D3): pdftohtml's XML keeps each line's font and position, so headings,
 * spell stat lines, paragraphs and tables can be told apart. The bundle follows what this finds: an SRD entry says what the
 * SRD says, whatever 5e.tools' copy of the book says. Build time only; the PDFs are not shipped.
 */
export interface SrdSection {
  name: string;
  /** The heading's font size: a section ends at the next heading of the same size or larger. */
  size: number;
  /** Headings above this one, outermost first. */
  path: string[];
  /** An italic line right under the heading: a spell's level and school, an item's type and rarity. */
  sub?: string;
  /** "Casting Time" and so on, for a spell. */
  facts: Record<string, string>;
  /** Text with the sections under it (they are smaller headings). */
  html: string;
}

interface Run { top: number; left: number; width: number; size: number; family: string; color: string; html: string; text: string; page: number; lead: boolean }

const clean = (s: string) => s
  .replace(/[\s ]+/g, " ")
  .replace(/-[­‐‑-]+|­[‐‑-]*|[‐‑]/g, "-")
  .replace(/&#34;|&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/<\/b>\s*<b>|<\/i>\s*<i>/g, " ");
const plain = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#160;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function runsOf(xml: string): Run[] {
  const fonts = new Map<string, { size: number; family: string; color: string }>();
  const runs: Run[] = [];
  let page = 0;
  let height = 1188;
  const re = /<fontspec id="(\d+)" size="(\d+)" family="[^+"]*\+?([^"]*)" color="([^"]+)"\/>|<page number="(\d+)"[^>]*height="(\d+)"|<text top="(-?\d+)" left="(-?\d+)" width="(\d+)" height="\d+" font="(\d+)">([\s\S]*?)<\/text>/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    if (m[1] !== undefined) { fonts.set(m[1], { size: Number(m[2]), family: m[3], color: m[4] }); continue; }
    if (m[5] !== undefined) { page = Number(m[5]); height = Number(m[6]); continue; }
    const f = fonts.get(m[10])!;
    const top = Number(m[7]);
    const html = clean(m[11]);
    const text = plain(html).trim();
    if (!text) continue;
    // Running footers and page numbers.
    if (top > height - 90 && /^(?:\d+|System Reference Document.*)$/i.test(text)) continue;
    if (/^System Reference Document 5\.\d/i.test(text) || (/^\d{1,3}$/.test(text) && f.size === (/GillSans/.test(f.family) ? (f.color === "#7b7879" ? 17 : 16) : -1))) continue;
    runs.push({ top, left: Number(m[8]), width: Number(m[9]), size: f.size, family: f.family, color: f.color, html: html.trim(), text, page, lead: /^(?:<[^>]+>)*\s/.test(html) });
  }
  return runs;
}

const isRed = (r: Run) => /^#(943634|88191f)$/i.test(r.color);
/** One 5.2.1 heading ("Acid Splash") is set in small capitals, in pieces of two sizes. */
const isSmallCaps = (r: Run) => isRed(r) && /GillSans-SemiBold-SC700$/.test(r.family);
const isHeading = (r: Run) => (isRed(r) && r.size >= 18 && /GillSans-SemiBold$/.test(r.family) && /^<b>/.test(r.html)) || isSmallCaps(r);
const isBody = (r: Run) => /Cambria/.test(r.family);
/** A small black title over a table or a block: "Barbarian Features", "Rage Damage". */
const isTitle = (r: Run) => !isRed(r) && r.size >= 16 && /^<b>/.test(r.html) && !isBody(r) && /GillSans-SemiBold|Calibri/.test(r.family);
const CLASS_TABLE = /(?:\bFeatures|Spell Slots(?: per Spell Level)?|Warlock Features|^The [A-Z]\w+)$/;

/** A word split at a line's end is rejoined; a real hyphen seen elsewhere in the PDF stays. */
function vocabulary(runs: Run[]): Set<string> {
  const v = new Set<string>();
  for (const r of runs) for (const w of r.text.split(/[^A-Za-z-]+/)) if (w.includes("-")) v.add(w.toLowerCase());
  return v;
}
function joinLine(a: string, b: string, vocab: Set<string>): string {
  const head = a.replace(/\s+$/, "");
  if (!head.endsWith("-")) return `${head} ${b.replace(/^\s+/, "")}`;
  const before = /([A-Za-z-]+)-$/.exec(plain(head))?.[1] ?? "";
  const after = /^(?:<[^>]+>)*([A-Za-z-]+)/.exec(b)?.[1] ?? "";
  const keep = !after || /^[A-Z]/.test(after) || /-|\d/.test(before) || vocab.has(`${before}-${after}`.toLowerCase());
  return keep ? `${head}${b.replace(/^\s+/, "")}` : `${head.slice(0, -1)}${b.replace(/^\s+/, "")}`;
}
const balance = (s: string) => {
  let out = s;
  for (const tag of ["b", "i"]) {
    const open = (out.match(new RegExp(`<${tag}>`, "g")) ?? []).length;
    const close = (out.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
    if (open > close) out += `</${tag}>`.repeat(open - close);
    else if (close > open) out = `<${tag}>`.repeat(close - open) + out;
  }
  return out.replace(/<i>\s*<\/i>|<b>\s*<\/b>/g, "").replace(/<\/i>\s+<i>/g, " ").replace(/\s{2,}/g, " ").replace(/(<\/[bi]>)\s+([,.;:)])/g, "$1$2").replace(/^((?:<[^>]+>)*)\s+/, "$1").trim();
};

function tableHtml(rows: Run[][]): string {
  // A row of cells; a lone line under a row continues the nearest cell above.
  const multi = rows.filter((r) => r.length > 1);
  // Lines with no columns are text in the sans font (a background's lines): a bold start opens a new one.
  if (!multi.length) {
    const paras: string[] = [];
    for (const r of rows) { const t = r.map((c) => c.html).join(" "); if (/^<b>/.test(t) || !paras.length) paras.push(t); else paras[paras.length - 1] += ` ${t}`; }
    return paras.map((t) => `<p>${balance(t)}</p>`).join("");
  }
  const columns = (multi.find((r) => r.every((c) => /^<b>/.test(c.html))) ?? multi.reduce((a, b) => (b.length > a.length ? b : a))).map((c) => c.left);
  const nearest = (left: number) => columns.reduce((best, c, i) => (Math.abs(c - left) < Math.abs(columns[best] - left) ? i : best), 0);
  const grid: { head: boolean; cells: string[] }[] = [];
  for (const row of rows) {
    // SRD 5.1 prints a dice table's row as one run: "01–04 Dragonborn".
    const dice = row.length === 1 && columns.length === 2 ? /^([\d–-]+) (.+)$/.exec(plain(row[0].html).trim()) : null;
    if (dice) { grid.push({ head: false, cells: [dice[1], dice[2]] }); continue; }
    if (row.length === 1 && grid.length) { const g = grid[grid.length - 1]; const i = nearest(row[0].left); g.cells[i] = `${g.cells[i] ?? ""} ${plain(row[0].html).trim()}`.trim(); continue; }
    const cells: string[] = Array(columns.length).fill("");
    for (const c of row) { const i = nearest(c.left); cells[i] = `${cells[i]} ${plain(c.html).trim()}`.trim(); }
    grid.push({ head: row.every((c) => /^<b>/.test(c.html)), cells });
  }
  const head = grid[0]?.head ? grid.shift()! : undefined;
  return `<table>${head ? `<thead><tr>${head.cells.map((c) => `<th>${c}</th>`).join("")}</tr></thead>` : ""}<tbody>${grid.map((g) => `<tr>${g.cells.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

const FACT = /^(Casting Time|Range|Components?|Duration):\s*$|^(Casting Time|Range|Components?|Duration):/;
const SPELL_SUB = /^(?:Level \d+ \w+|\w+ Cantrip)\s*\(|^(?:\d(?:st|nd|rd|th)-level \w+|\w+ cantrip)/;

/** The PDF as sections, in reading order. */
export function srdSections(xml: string): SrdSection[] {
  const runs = runsOf(xml);
  const vocab = vocabulary(runs);
  interface Raw { name: string; size: number; path: string[]; sub?: string; facts: Record<string, string>; own: string }
  const raws: Raw[] = [];
  let cur: Raw | undefined;
  let para: { text: string; li: boolean } | undefined;
  let table: Run[][] = [];
  let lastTop = 0;
  let lastPage = 0;
  let columnLeft = 0;
  let bulletNext = false;
  const flushPara = () => { if (para && cur) cur.own += para.li ? `<ul><li>${balance(para.text)}</li></ul>` : `<p>${balance(para.text)}</p>`; para = undefined; };
  const flushTable = () => { if (table.length && cur) cur.own += tableHtml(table); table = []; };
  const stack: { name: string; size: number }[] = [];
  let i = 0;
  while (i < runs.length) {
    const r = runs[i];
    if (isHeading(r)) {
      flushPara(); flushTable();
      let name = r.text;
      let j = i + 1;
      if (isSmallCaps(r)) {
        while (j < runs.length && isSmallCaps(runs[j]) && Math.abs(runs[j].top - r.top) <= 6) { name += plain(runs[j].html); j++; }
        name = name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
      }
      // A long heading wraps to the next line, in the same font, right under it.
      while (j < runs.length && isHeading(runs[j]) && runs[j].size === r.size && runs[j].page === r.page && runs[j].left === r.left && runs[j].top - runs[j - 1].top < r.size * 1.35) { name += ` ${runs[j].text}`; j++; }
      while (stack.length && stack[stack.length - 1].size <= Math.max(r.size, 18)) stack.pop();
      cur = { name: name.replace(/\s+/g, " ").trim(), size: Math.max(r.size, 18),  path: stack.map((s) => s.name), facts: {}, own: "" };
      raws.push(cur);
      stack.push({ name: cur.name, size: cur.size });
      columnLeft = r.left; lastTop = runs[j - 1].top; lastPage = r.page;
      i = j;
      // An italic line right under the heading: a spell's level and school, an item's type and rarity.
      if (i < runs.length && /^<i>/.test(runs[i].html) && !isHeading(runs[i]) && runs[i].top - lastTop < 30) {
        let sub = runs[i].text; lastTop = runs[i].top; i++;
        while (i < runs.length && /^<i>/.test(runs[i].html) && isBody(runs[i]) && runs[i].top - lastTop < 22 && (sub.match(/\(/g) ?? []).length > (sub.match(/\)/g) ?? []).length) { sub += ` ${runs[i].text}`; lastTop = runs[i].top; i++; }
        cur.sub = sub.replace(/\s+/g, " ").trim();
      }
      continue;
    }
    if (!cur) { i++; continue; }
    // A spell's stat lines.
    const fact = FACT.exec(r.text);
    if (fact && cur.sub && SPELL_SUB.test(cur.sub) && !cur.own) {
      const label = (fact[1] ?? fact[2]).replace(/^Component$/, "Components");
      let value = r.text.slice(fact[0].length).trim();
      let j = i + 1;
      // The value, and any lines it wraps to (over a page break too), up to the next stat line or the text.
      const next = (x: Run) => !FACT.test(x.text) && !isHeading(x) && !/^<b>/.test(x.html);
      const open = () => (value.match(/\(/g) ?? []).length > (value.match(/\)/g) ?? []).length;
      let top = r.top;
      while (j < runs.length && next(runs[j]) && (Math.abs(runs[j].top - top) <= 3 || !value || open() || (runs[j].top - top < 22 && runs[j].top > top && (!isBody(runs[j]) || /^[a-z]/.test(runs[j].text))))) {
        value = value ? joinLine(value, runs[j].text, vocab) : runs[j].text; top = runs[j].top; j++;
      }
      lastTop = top; lastPage = runs[j - 1].page; columnLeft = runs[j - 1].left;
      cur.facts[label] = value;
      i = j;
      continue;
    }
    // A bullet set apart from its text, at a slightly different height.
    if (/^[•\uf0b7]$/.test(r.text)) { flushPara(); flushTable(); bulletNext = true; lastTop = r.top; lastPage = r.page; if (Math.abs(r.left - columnLeft) > 200 || r.page !== lastPage) columnLeft = r.left; i++; continue; }
    // Lines at one height: inline runs, or cells when there is a gap.
    const line: Run[] = [r];
    let j = i + 1;
    while (j < runs.length && runs[j].page === r.page && Math.abs(runs[j].top - r.top) <= 3 && !isHeading(runs[j]) && runs[j].left > line[line.length - 1].left) { line.push(runs[j]); j++; }
    const cells: Run[] = [];
    for (const c of line) {
      const p = cells[cells.length - 1];
      if (p && c.left - (p.left + p.width) < 12) { cells[cells.length - 1] = { ...p, width: c.left + c.width - p.left, html: `${p.html}${/\s$/.test(p.html) ? "" : " "}${c.html}`.replace(/<\/b> <b>|<\/i> <i>/g, " "), text: `${p.text} ${c.text}` }; }
      else cells.push(c);
    }
    i = j;
    const gap = r.page === lastPage ? r.top - lastTop : 0;
    const body = cells.length === 1 && isBody(cells[0]);
    if (!body) {
      if (isTitle(r) && cells.length === 1) {
        flushPara(); flushTable();
        // A class's table floats into whichever feature sits there; it is not part of that feature.
        if (CLASS_TABLE.test(r.text)) {
          let k = i;
          while (k < runs.length && !isBody(runs[k]) && !isHeading(runs[k])) k++;
          i = k;
        } else cur.own += `<h5>${r.text}</h5>`;
        lastTop = r.top; lastPage = r.page;
        continue;
      }
      flushPara();
      table.push(cells);
      lastTop = r.top; lastPage = r.page;
      continue;
    }
    flushTable();
    const c = cells[0];
    const text = c.html;
    const bullet = bulletNext || /^(?:<[^>]+>)*[•\uf0b7]/.test(text);
    bulletNext = false;
    const hanging = c.left - columnLeft > 8 && c.left - columnLeft < 40;
    const backOut = !!para?.li && !hanging && Math.abs(c.left - columnLeft) <= 200;
    const runIn = /^<b>/.test(text) || /^<i><b>/.test(text) || /^<b><i>/.test(text);
    // A column or page break moves "left": a new column keeps the paragraph going.
    if (Math.abs(c.left - columnLeft) > 200 || r.page !== lastPage) columnLeft = c.left;
    const leadSpace = gap > 26;
    const stripped = text.replace(/^((?:<[^>]+>)*)[•]\s*/, "$1");
    if (!para || bullet || runIn || leadSpace || c.lead || backOut) {
      flushPara();
      para = { text: stripped, li: bullet };
    } else para.text = joinLine(para.text, stripped, vocab);
    lastTop = r.top; lastPage = r.page;
  }
  flushPara(); flushTable();
  const merged = (html: string) => html.replace(/<\/ul><ul>/g, "").replace(/\s+<\/p>/g, "</p>");
  return raws.map((s, n) => {
    let html = s.own;
    for (let k = n + 1; k < raws.length && raws[k].size < s.size; k++) html += `<h5>${raws[k].name}</h5>${raws[k].own}`;
    return { name: s.name, size: s.size, path: s.path, ...(s.sub ? { sub: s.sub } : {}), facts: s.facts, html: merged(html) };
  });
}

export const isSpellSection = (s: SrdSection) => !!s.sub && SPELL_SUB.test(s.sub);

export interface SrdSpell { name: string; level: number; school: string; classes: string[]; ritual: boolean; time: string; range: string; components: string; duration: string; html: string }

export function srdSpell(s: SrdSection): SrdSpell | undefined {
  if (!isSpellSection(s)) return undefined;
  const sub = s.sub!;
  const m52 = /^Level (\d+) (\w+) \(([^)]*)\)/.exec(sub);
  const c52 = /^(\w+) Cantrip \(([^)]*)\)/.exec(sub);
  const m51 = /^(\d)(?:st|nd|rd|th)-level (\w+)/.exec(sub);
  const c51 = /^(\w+) cantrip/.exec(sub);
  const level = m52 ? Number(m52[1]) : m51 ? Number(m51[1]) : 0;
  const school = (m52?.[2] ?? c52?.[1] ?? m51?.[2] ?? c51?.[1] ?? "");
  const classes = (m52?.[3] ?? c52?.[2] ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  const time = s.facts["Casting Time"] ?? "";
  return { name: s.name, level, school: school[0].toUpperCase() + school.slice(1).toLowerCase(), classes, ritual: /\britual\b/i.test(sub) || /\britual\b/i.test(time), time, range: s.facts.Range ?? "", components: s.facts.Components ?? "", duration: s.facts.Duration ?? "", html: s.html };
}

/** SRD 5.1 keeps its class lists apart from the spells: "Bard Spells" and so on, name lines under level headings. */
export function srdSpellLists(sections: SrdSection[], names: string[]): Map<string, string[]> {
  const byName = new Map<string, string>(names.map((n) => [n.toLowerCase().replace(/[^a-z0-9]+/g, ""), n]));
  const out = new Map<string, string[]>();
  for (const s of sections) {
    const m = /^(Bard|Cleric|Druid|Paladin|Ranger|Sorcerer|Warlock|Wizard) Spells$/.exec(s.name);
    if (!m) continue;
    for (const raw of s.html.replace(/<\/(?:p|li|td|h5)>/g, "\n").replace(/<[^>]+>/g, " ").split("\n")) {
      // A paragraph of names runs them together, so longest names are tried from each word.
      const words = raw.replace(/\s+/g, " ").trim().split(" ");
      for (let i = 0; i < words.length;) {
        let hit = 0;
        for (let n = Math.min(words.length - i, 6); n >= 1; n--) {
          const name = byName.get(words.slice(i, i + n).join(" ").toLowerCase().replace(/[^a-z0-9]+/g, ""));
          if (name) { if (!out.has(name)) out.set(name, []); if (!out.get(name)!.includes(m[1])) out.get(name)!.push(m[1]); hit = n; break; }
        }
        i += hit || 1;
      }
    }
  }
  return out;
}

/**
 * The bold run-ins of a section as sections of their own: a species' traits and the gear's entries are not headings
 * ("Breath Weapon. When you take...", "Acid (25 GP). As a Utilize action..."). Each runs to the next run-in or heading.
 */
export function srdRunIns(s: SrdSection): SrdSection[] {
  const out: SrdSection[] = [];
  const re = /<p>(?:<i>)?<b>(?:<i>)?([^<]{2,60}?)\.?(?:<\/i>)?<\/b>(?:<\/i>)?\.?\s*/g;
  const marks = [...s.html.matchAll(re)];
  marks.forEach((m, n) => {
    const end = n + 1 < marks.length ? marks[n + 1].index : s.html.length;
    const body = s.html.slice(m.index, end).replace(/<h5>[\s\S]*$/, "");
    const html = `<p>${body.slice(m[0].length)}`;
    out.push({ name: m[1].replace(/:$/, "").trim(), size: 0, path: [...s.path, s.name], facts: {}, html });
  });
  return out;
}

/** Every table row of the PDF as plain text, cells in order: the gear tables are read from these. */
export function srdTableRows(xml: string): string[] {
  const runs = runsOf(xml);
  const rows: string[] = [];
  for (let i = 0; i < runs.length;) {
    const r = runs[i];
    let j = i + 1;
    const cells = [r.text];
    while (j < runs.length && runs[j].page === r.page && Math.abs(runs[j].top - r.top) <= 3 && runs[j].left > runs[j - 1].left) { cells.push(runs[j].text); j++; }
    if (!isBody(r) || /Calibri/.test(r.family) || cells.length > 1) rows.push(cells.join(" ").replace(/\s+/g, " ").trim());
    i = j;
  }
  return rows;
}

export interface SrdClassRow { level: number; text: string }
/** A class's table: "Barbarian Features" (5.2.1), "The Barbarian" (5.1). A row's text runs to the next level (a cell may wrap). */
export function srdClassTables(xml: string): Map<string, SrdClassRow[]> {
  const runs = runsOf(xml);
  const out = new Map<string, SrdClassRow[]>();
  for (let i = 0; i < runs.length; i++) {
    const m = /^(?:The )?(Barbarian|Bard|Cleric|Druid|Fighter|Monk|Paladin|Ranger|Rogue|Sorcerer|Warlock|Wizard)(?: Features)?$/.exec(runs[i].text);
    if (!m || !isTitle(runs[i]) || out.has(m[1])) continue;
    const rows: SrdClassRow[] = [];
    let firstLeft: number | undefined;
    let lastTop = runs[i].top;
    for (let j = i + 1; j < runs.length && !isHeading(runs[j]); j++) {
      const r = runs[j];
      // The table is over once its last row is followed by a gap or a new page.
      if (rows.length === 20 && (r.page !== runs[j - 1].page || r.top - lastTop > 40)) break;
      lastTop = r.top;
      const level = /^<b>/.test(r.html) ? null : /^(\d+)(?:st|nd|rd|th)$/.exec(r.text) ?? (/^\d+$/.test(r.text) && (firstLeft === undefined ? r.text === "1" : Math.abs(r.left - firstLeft) < 8) ? [r.text, r.text] : null);
      if (level && Number(level[1]) === rows.length + 1 && rows.length < 20) {
        if (firstLeft === undefined) firstLeft = r.left;
        rows.push({ level: Number(level[1]), text: "" });
      } else if (rows.length) rows[rows.length - 1].text += ` ${r.text}`;
    }
    if (rows.length === 20) out.set(m[1], rows);
  }
  return out;
}

/** "Core Bard Traits" (5.2.1): bold labels on the left, values beside them, as label to value. */
export function srdCoreTraits(xml: string): Map<string, Record<string, string>> {
  const runs = runsOf(xml);
  const out = new Map<string, Record<string, string>>();
  for (let i = 0; i < runs.length; i++) {
    const m = /^Core (\w+) Traits$/.exec(runs[i].text);
    if (!m) continue;
    const t: Record<string, string> = {};
    let label = "";
    let inLabel = false;
    for (let j = i + 1; j < runs.length && !isHeading(runs[j]) && !isBody(runs[j]) && !/Features$/.test(runs[j].text); j++) {
      const r = runs[j];
      if (/^<b>/.test(r.html)) { label = inLabel ? `${label} ${r.text}` : r.text; inLabel = true; t[label] = ""; continue; }
      if (inLabel) { const v = t[label]; delete t[label]; label = label.replace(/\s+/g, " ").trim(); t[label] = v; }
      inLabel = false;
      if (label) t[label] = `${t[label] ?? ""} ${r.text}`.trim();
    }
    out.set(m[1], t);
  }
  return out;
}
