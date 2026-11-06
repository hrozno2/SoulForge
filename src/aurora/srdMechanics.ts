/**
 * The bundle's mechanics against the SRD's words, at every build (Stage D3). What a class, species, background or feat
 * gives is compared with what the PDF states. A difference is a line of the report; srdBundle.test.ts lets none through
 * except those it names with why.
 */
import { squash } from "./srdText";
import { srdCoreTraits, type SrdSection } from "./srdPdf";
import type { AElement, ARule } from "./types";

const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
const SKILLS = ["Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception", "History", "Insight", "Intimidation", "Investigation", "Medicine", "Nature", "Perception", "Performance", "Persuasion", "Religion", "Sleight of Hand", "Stealth", "Survival"];
const ABILITIES = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];

export function compareMechanics(elements: AElement[], sections: SrdSection[], xml: string, edition: "5.1" | "5.2"): string[] {
  const lines: string[] = [];
  const byId = new Map(elements.map((e) => [e.id, e]));
  const nm = (id?: string) => byId.get(id ?? "")?.name ?? id ?? "";
  const level1 = (e: AElement) => e.rules.filter((r) => ((r as { level?: number }).level ?? 1) === 1);
  const grants = (rules: ARule[]) => rules.filter((r): r is Extract<ARule, { kind: "grant" }> => r.kind === "grant").map((r) => nm(r.id));
  const selects = (rules: ARule[], type = "Proficiency") => rules.filter((r): r is Extract<ARule, { kind: "select" }> => r.kind === "select" && r.type === type);
  const has = (names: string[], re: RegExp) => names.some((n) => re.test(n));
  const say = (what: string, srd: unknown, here: unknown) => { if (String(srd) !== String(here)) lines.push(`${what}: SRD ${srd}; here ${here}`); };
  const core = edition === "5.2" ? srdCoreTraits(xml) : new Map<string, Record<string, string>>();

  for (const c of elements.filter((e) => e.type === "Class")) {
    let armor = ""; let weapons = ""; let saves = ""; let skills = ""; let tools = ""; let die = "";
    if (edition === "5.2") {
      const t = core.get(c.name);
      if (!t) { lines.push(`${c.name}: no Core Traits table read`); continue; }
      armor = t["Armor Training"] ?? ""; weapons = t["Weapon Proficiencies"] ?? ""; saves = t["Saving Throw Proficiencies"] ?? ""; skills = t["Skill Proficiencies"] ?? ""; tools = t["Tool Proficiencies"] ?? ""; die = t["Hit Point Die"] ?? "";
    } else {
      const s = sections.find((x) => x.name === c.name && x.size >= 27);
      const m = s && /Hit Dice: *(\S+).*?Armor: *(.*?) *Weapons: *(.*?) *Tools: *(.*?) *Saving Throws: *(.*?) *Skills: *(.*?)(?: *Equipment\b|$)/.exec(plain(s.html));
      if (!m) { lines.push(`${c.name}: no proficiency lines read`); continue; }
      [, die, armor, weapons, tools, saves, skills] = m;
    }
    const r1 = level1(c);
    const given = grants(r1);
    say(`${c.name} hit die`, /d(\d+)/i.exec(die)?.[1], String(c.setters.hd?.value).replace(/^d/, ""));
    for (const a of ABILITIES) say(`${c.name} save ${a}`, new RegExp(a).test(saves), has(given, new RegExp(`Saving throw proficiency \\(${a}\\)`)));
    for (const [word, re] of [["light", /\(Light Armor\)/], ["medium", /\(Medium Armor\)/], ["heavy", /\(Heavy Armor\)/], ["shield", /\(Shields?\)/]] as const) say(`${c.name} armor ${word}`, (word !== "shield" && /\ball armor\b/i.test(armor)) || new RegExp(`\\b${word}`, "i").test(armor), has(given, re));
    say(`${c.name} simple weapons`, /\bsimple\b/i.test(weapons), has(given, /\(Simple Weapons\)/));
    // "Martial weapons that have..." is a filtered list, which the converter names one by one.
    say(`${c.name} all martial weapons`, /\bmartial\b/i.test(weapons) && !/that have/i.test(weapons), has(given, /\(Martial Weapons\)/));
    const skillPick = selects(r1).find((x) => /skill/i.test(x.name ?? ""));
    const count = /choose (any )?(\w+)/i.exec(skills)?.[2]?.toLowerCase() ?? "";
    say(`${c.name} skill count`, Number(count) || WORDS[count], skillPick?.number);
    if (!/any/i.test(skills.slice(0, 14)) && skillPick) {
      const here = String(skillPick.supports).split("|").map(nm);
      for (const k of SKILLS) say(`${c.name} skill ${k}`, squash(skills).includes(squash(k)), here.some((h) => squash(h) === squash(k)));
    }
    const toolPicks = selects(r1).filter((x) => !/skill/i.test(x.name ?? "")).reduce((n, x) => n + (x.number ?? 1), 0);
    const toolGrants = given.filter((g) => /^Tool Proficiency/.test(g)).length;
    const wants = /none/i.test(tools) || !tools ? 0 : Number(/(\w+)\s+(?:musical|type|kinds?)/i.exec(tools)?.[1]) || WORDS[(/\b(one|two|three)\b/i.exec(tools)?.[1] ?? "").toLowerCase()] || 1;
    // The 2024 Monk's "Choose one" is two lists to pick from, one in all.
    if (!/or\b/i.test(tools)) say(`${c.name} tools`, wants, toolPicks + toolGrants);
  }

  for (const b of elements.filter((e) => e.type === "Background")) {
    const text = plain(b.description ?? "");
    const given = grants(b.rules);
    const named = /Skill Proficiencies: *(.*?) *(?:Tool Proficienc|Languages|Equipment|$)/.exec(text)?.[1] ?? "";
    for (const k of SKILLS) say(`${b.name} skill ${k}`, new RegExp(k, "i").test(named), given.some((g) => squash(g) === squash(k)));
    if (edition === "5.2") {
      const feat = /Feat: *(.*?) *\(see/.exec(text)?.[1] ?? "";
      say(`${b.name} feat`, feat, given.find((g) => squash(g) === squash(feat)) ?? given.join("/"));
    }
  }

  for (const r of elements.filter((e) => e.type === "Race")) {
    const s = sections.find((x) => x.name === r.name && (edition === "5.1" ? x.size >= 21 : x.path.includes("Species Descriptions")));
    if (!s) { lines.push(`${r.name}: no section read`); continue; }
    const text = plain(s.html);
    const speed = /Speed[.:]? *(?:Your base walking speed is )?(\d+) feet/.exec(text)?.[1];
    const mine = r.rules.find((x) => x.kind === "stat" && x.name === "innate speed") as { value: string } | undefined;
    say(`${r.name} speed`, speed, mine?.value);
    const given = grants(level1(r));
    const dark = /Darkvision[.:]? .*?(\d+) feet/.exec(text)?.[1];
    const darkHere = /Darkvision \((\d+)/.exec(given.join(";"))?.[1];
    // Some species' Darkvision comes with a lineage, not the species.
    if (darkHere || edition === "5.1") say(`${r.name} darkvision`, dark, darkHere);
  }

  for (const f of elements.filter((e) => e.type === "Feat" && e.name !== "Ability Score Improvement")) {
    const s = sections.find((x) => x.name === f.name);
    if (!s) continue;
    const pre = /Prerequisite: *([^)]*)\)?/.exec(s.sub ?? "")?.[1] ?? /Prerequisite: *(.*?)(?: You|$)/.exec(plain(s.html))?.[1] ?? "";
    const req = f.requirements ?? "";
    const level = /Level (\d+)\+/.exec(pre)?.[1];
    say(`${f.name} level`, level, /\[level:(\d+)\]/.exec(req)?.[1]);
    for (const a of ABILITIES) say(`${f.name} needs ${a}`, new RegExp(a).test(pre), new RegExp(`\\[${a.slice(0, 3).toLowerCase()}:`).test(req));
    if (/Fighting Style Feature/.test(pre)) say(`${f.name} needs a Fighting Style`, true, /FIGHTING_STYLE/.test(req));
    if (/Spellcasting Feature/.test(pre)) say(`${f.name} needs casting`, true, /SPELLCASTING/.test(req));
  }
  return lines;
}
