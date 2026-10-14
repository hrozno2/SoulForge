/**
 * The feat prerequisite probe (test only): every feat of the 2014 and 2024 Player's Handbooks, Xanathar's and
 * Tasha's is asked about characters just above and just below each prerequisite 5e.tools gives it (level, ability
 * scores, armor training, spellcasting, species). The content's requirement must say yes and no in the same places.
 */
import type { ARegistry } from "./registry";
import { meets, type ReqCtx } from "./requirements";
import { isModern } from "./edition";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;
const AB: Record<string, string> = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" };
const ARMOR: Record<string, string> = { light: "ID_PROFICIENCY_ARMOR_PROFICIENCY_LIGHT_ARMOR", medium: "ID_PROFICIENCY_ARMOR_PROFICIENCY_MEDIUM_ARMOR", heavy: "ID_PROFICIENCY_ARMOR_PROFICIENCY_HEAVY_ARMOR", shield: "ID_PROFICIENCY_ARMOR_PROFICIENCY_SHIELDS" };
const CASTER = ["ID_INTERNAL_GRANTS_SPELLCASTING_FEATURE", "ID_INTERNAL_GRANTS_PACT_MAGIC_FEATURE", "ID_INTERNAL_GRANTS_SPELLCASTING"];
interface Probe { level: number; scores: Record<string, number>; ids: Set<string>; caster: boolean }
const ctx = (p: Probe): ReqCtx => ({
  level: p.level,
  hasId: (id) => p.ids.has(id) || (p.caster && (CASTER.includes(id) || /^ID_INTERNAL_GRANTS_(SPELLCASTING|PACT)/.test(id))),
  hasType: (t) => (p.caster && /spell/i.test(t)),
  stat: (n) => p.scores[n] ?? (p.caster && /spellcasting/.test(n) ? 1 : 0),
});
const full = (): Probe => ({ level: 20, scores: Object.fromEntries(Object.values(AB).map((a) => [a, 20])), ids: new Set(Object.values(ARMOR)), caster: true });
export function probeFeats(reg: ARegistry, feats: Json[]): { checked: number; findings: string[]; notProbed: string[] } {
  const BOOK: Record<string, RegExp> = { PHB: /^Player’s Handbook$/, XPHB: /^Player’s Handbook \(2024\)$/, XGE: /^Xanathar/, TCE: /^Tasha/ };
  const out: string[] = []; const skipped: string[] = []; let checked = 0;
  const norm = (x: string) => x.toLowerCase().replace(/[’']/g, "'");
  for (const f of feats.filter((x) => BOOK[x.source])) {
    const modern = f.source === "XPHB";
    const same = reg.ofType("Feat").filter((e) => norm(e.name) === norm(f.name) && isModern(e) === modern);
    const el = same.find((e) => BOOK[f.source].test(e.source)) ?? same[0];
    if (!el) { out.push(`${f.source} ${f.name}: not in the content`); continue; }
    const pre: Json[] = f.prerequisite ?? [];
    const kinds = new Set(pre.flatMap((p) => Object.keys(p)));
    const unknown = [...kinds].filter((k) => !["level", "ability", "proficiency", "spellcasting", "spellcasting2020", "spellcastingFeature", "race"].includes(k));
    if (unknown.length) { skipped.push(`${f.source} ${f.name} (${unknown.join(", ")})`); continue; }
    checked++;
    const req = el.requirements;
    const say = (what: string) => out.push(`${f.source} ${f.name}: ${what} [${req ?? "no requirement"}]`);
    // Everything met: allowed (species-gated feats are probed with the species below).
    if (!kinds.has("race") && !meets(req, ctx(full()))) say("not allowed even with every prerequisite met");
    if (!pre.length) {
      const weak: Probe = { level: 1, scores: Object.fromEntries(Object.values(AB).map((a) => [a, 8])), ids: new Set(), caster: false };
      if (!meets(req, ctx(weak))) say("5e.tools has no prerequisite, the content blocks a plain level 1 character");
      continue;
    }
    const lv = Math.min(...pre.map((p) => p.level ?? 0));
    if (lv > 1 && meets(req, ctx({ ...full(), level: lv - 1 }))) say(`allowed below level ${lv}`);
    if (lv > 1 && !meets(req, ctx({ ...full(), level: lv }))) say(`not allowed at level ${lv}`);
    if (kinds.has("ability")) {
      const low = { ...full(), scores: Object.fromEntries(Object.values(AB).map((a) => [a, 8])) };
      if (meets(req, ctx(low))) say("allowed with every ability at 8");
      for (const p of pre) for (const alt of (p.ability ?? []) as Json[]) {
        const scores = Object.fromEntries(Object.values(AB).map((a) => [a, 8]));
        for (const [k, v] of Object.entries(alt)) scores[AB[k]] = Number(v);
        if (!meets(req, ctx({ ...full(), scores }))) say(`not allowed with ${JSON.stringify(alt)}`);
      }
    }
    if (kinds.has("proficiency")) {
      for (const p of pre) for (const pr of (p.proficiency ?? []) as Json[]) if (pr.armor && ARMOR[pr.armor]) {
        const ids = new Set(full().ids); ids.delete(ARMOR[pr.armor]);
        if (meets(req, ctx({ ...full(), ids }))) say(`allowed without ${pr.armor} armor training`);
      }
    }
    if (kinds.has("race")) {
      // Allowed with the species (any version of it), not without.
      const races: Json[] = pre.flatMap((p) => p.race ?? []);
      if (meets(req, ctx(full()))) say("allowed without the species");
      for (const rc of races) {
        // 5e.tools says "drow" where the content says "Dark Elf"; a "small race" is any Small species (size marker).
        const name = ({ drow: "dark elf" } as Record<string, string>)[String(rc.name).toLowerCase()] ?? String(rc.name).toLowerCase();
        if (name === "small race") continue;
        const sub = rc.subrace ? (({ drow: "dark" } as Record<string, string>)[String(rc.subrace).toLowerCase()] ?? String(rc.subrace).toLowerCase()) : "";
        const ids = new Set(full().ids);
        for (const e of reg.all()) if (/^(Race|Sub Race|Race Variant)$/.test(e.type) && e.name.toLowerCase().includes(name) && (!sub || e.name.toLowerCase().includes(sub))) ids.add(e.id);
        if (!meets(req, ctx({ ...full(), ids }))) say(`not allowed for ${sub ? `${sub} ` : ""}${name}`);
      }
    }
    if (kinds.has("spellcasting") || kinds.has("spellcasting2020") || kinds.has("spellcastingFeature")) {
      if (meets(req, ctx({ ...full(), caster: false }))) say("allowed without spellcasting");
    }
  }
  return { checked, findings: out, notProbed: skipped };
}
